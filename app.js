const cfg = window.SUPABASE_CONFIG || {};
const configured = cfg.url && !cfg.url.includes("PASTE_") && cfg.anonKey && !cfg.anonKey.includes("PASTE_");
const sb = configured ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;

const $ = (id) => document.getElementById(id);
const state = {
  loginRole: "student",
  profile: null,
  page: null,
  adminTab: "students",
  selectedClass: null,
  classes: [],
  students: [],
  teachers: [],
  resetStudentId: null
};

function toast(message, type="info") {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => el.className = "toast", 3200);
}
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
function today() { return new Date().toISOString().slice(0,10); }
function dateText(v) { return v ? new Date(v + "T00:00:00").toLocaleDateString() : "-"; }
function roleName(r) { return r === "admin" ? "Admin" : r === "teacher" ? "Teacher" : "Student"; }

function togglePassword(id, button) {
  const input = $(id);
  if (!input) return;
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  button.textContent = showing ? "👁️" : "🙈";
  button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
}

function openModal(id) { $(id)?.classList.remove("hidden"); }
function closeModal(id) { $(id)?.classList.add("hidden"); }

async function sendPasswordReset(email) {
  const clean = String(email || "").trim().toLowerCase();
  if (!clean) throw new Error("Please enter your email address.");
  const { error } = await sb.auth.resetPasswordForEmail(clean, {
    redirectTo: window.location.href.split("#")[0]
  });
  if (error) throw error;
}


function setLoginRole(role) {
  state.loginRole = role;
  document.querySelectorAll(".role-tab").forEach(b => b.classList.toggle("active", b.dataset.loginRole === role));
  $("identifierLabel").textContent = role === "student" ? "USN" : "Email";
  $("identifier").placeholder = role === "student" ? "Enter your USN" : "Enter your email";
}

function showPage(id, title, subtitle="College attendance & support") {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active-page"));
  $(id).classList.add("active-page");
  $("pageTitle").textContent = title;
  $("pageSubtitle").textContent = subtitle;
  document.querySelector(".sidebar").classList.remove("open");
  state.page = id;
}

function buildNav(role) {
  const items = role === "student"
    ? [["studentDashboard","🏠 Dashboard"],["aboutPage","ℹ️ About"]]
    : role === "teacher"
    ? [["teacherDashboard","📝 Attendance"],["aboutPage","ℹ️ About"]]
    : [["adminDashboard","🛡️ Admin"],["aboutPage","ℹ️ About"]];
  $("nav").innerHTML = items.map(([id,label]) => `<button class="nav ${id===state.page?'active':''}" data-page="${id}">${label}</button>`).join("");
  document.querySelectorAll(".nav").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.page;
    const title = id === "studentDashboard" ? "Student Dashboard" : id === "teacherDashboard" ? "Teacher Dashboard" : id === "adminDashboard" ? "Admin Dashboard" : "About";
    showPage(id,title);
  }));
}

async function signIn(identifier, password) {
  if (!sb) throw new Error("Supabase is not configured.");
  const email = state.loginRole === "student"
    ? `${identifier.trim().toLowerCase()}@smartcampus.local`
    : identifier.trim().toLowerCase();

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await loadProfile(data.user.id);
}

async function loadProfile(userId) {
  const { data, error } = await sb.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  state.profile = data;

  if (state.loginRole !== data.role) {
    // Role tab is only a login hint; database role is authoritative.
    toast(`Logged in as ${roleName(data.role)}.`, "success");
  }

  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("userMini").innerHTML = `<b>${esc(data.full_name)}</b><span>${roleName(data.role)}${data.usn ? " · "+esc(data.usn) : ""}</span>`;
  buildNav(data.role);

  if (data.role === "student") {
    showPage("studentDashboard","Student Dashboard","Your attendance and notifications");
    await loadStudentDashboard();
  } else if (data.role === "teacher") {
    showPage("teacherDashboard","Teacher Dashboard","Your assigned classes");
    await loadTeacherDashboard();
  } else {
    showPage("adminDashboard","Admin Dashboard","Manage users, classes and attendance");
    await loadAdminDashboard();
  }
}

async function logout() {
  if (sb) await sb.auth.signOut();
  state.profile = null;
  $("appShell").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  $("password").value = "";
}

async function loadStudentDashboard() {
  const p = state.profile;
  $("studentWelcome").textContent = `Welcome, ${p.full_name}`;
  $("studentMeta").textContent = `${p.usn || ""} · ${p.department || ""} · Section ${p.section || "-"} · Semester ${p.semester || "-"}`;

  const { data: classes, error: ce } = await sb.from("classes").select("id,class_name,subject,section,semester,department").eq("section", p.section).eq("semester", p.semester).eq("department", p.department);
  if (ce) throw ce;

  const { data: records, error: ae } = await sb.from("attendance").select("id,class_id,attendance_date,status,classes(class_name,subject)").eq("student_id", p.id).order("attendance_date",{ascending:false});
  if (ae) throw ae;

  const total = records.length;
  const present = records.filter(x=>x.status==="present").length;
  const pct = total ? Math.round(present/total*100) : 0;
  $("studentKpis").innerHTML = `
    <div class="card"><span>📚</span><div><small>Classes Recorded</small><strong>${total}</strong></div></div>
    <div class="card success"><span>✅</span><div><small>Present</small><strong>${present}</strong></div></div>
    <div class="card danger"><span>❌</span><div><small>Absent</small><strong>${total-present}</strong></div></div>
    <div class="card warning"><span>📈</span><div><small>Overall Attendance</small><strong>${pct}%</strong></div></div>`;

  const byClass = {};
  records.forEach(r => {
    const key = r.class_id;
    if (!byClass[key]) byClass[key] = {name:r.classes?.class_name || "-", subject:r.classes?.subject || "-", total:0,present:0};
    byClass[key].total++;
    if (r.status==="present") byClass[key].present++;
  });
  $("studentAttendanceTable").innerHTML = `<thead><tr><th>Class</th><th>Subject</th><th>Present</th><th>Total</th><th>Attendance</th></tr></thead><tbody>${
    Object.values(byClass).map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.subject)}</td><td>${x.present}</td><td>${x.total}</td><td><b>${Math.round(x.present/x.total*100)}%</b></td></tr>`).join("") || `<tr><td colspan="5">No attendance records yet.</td></tr>`
  }</tbody>`;

  $("studentHistoryTable").innerHTML = `<thead><tr><th>Date</th><th>Class</th><th>Subject</th><th>Status</th></tr></thead><tbody>${
    records.slice(0,20).map(r => `<tr><td>${dateText(r.attendance_date)}</td><td>${esc(r.classes?.class_name)}</td><td>${esc(r.classes?.subject)}</td><td class="${r.status==="present"?"status-safe":"status-risk"}">${r.status==="present"?"✅ Present":"❌ Absent"}</td></tr>`).join("") || `<tr><td colspan="4">No attendance records yet.</td></tr>`
  }</tbody>`;

  const { data: notes, error: ne } = await sb.from("notifications").select("*").eq("student_id",p.id).order("created_at",{ascending:false}).limit(20);
  if (ne) throw ne;
  $("studentNotificationCount").textContent = `${notes.length} total`;
  $("studentNotifications").innerHTML = notes.map(n => `<div class="alert ${n.type==="absence"?"danger-alert":""}"><b>${n.type==="absence"?"🚨":"🔔"} ${esc(n.title)}</b><p>${esc(n.message)}</p><small>${new Date(n.created_at).toLocaleString()}</small></div>`).join("") || `<div class="muted">No notifications.</div>`;
}

async function loadTeacherDashboard() {
  const { data, error } = await sb.from("classes").select("id,class_name,section,semester,department,subject").eq("teacher_id", state.profile.id).order("class_name");
  if (error) throw error;
  state.classes = data || [];
  $("teacherClasses").innerHTML = state.classes.map(c => `
    <button class="class-card" data-class-id="${c.id}">
      <span>📘</span><b>${esc(c.class_name)}</b><strong>${esc(c.subject)}</strong><small>${esc(c.department)} · Sem ${c.semester}</small>
    </button>`).join("") || `<div class="panel">No classes have been assigned by Admin.</div>`;
  document.querySelectorAll(".class-card").forEach(b => b.addEventListener("click", () => openAttendance(b.dataset.classId)));
}

async function openAttendance(classId) {
  const cls = state.classes.find(c=>c.id===classId);
  state.selectedClass = cls;
  $("teacherAttendancePanel").classList.remove("hidden");
  $("teacherClassTitle").textContent = `${cls.class_name} — ${cls.subject}`;
  $("attendanceDate").value = today();
  $("attendanceSubject").value = cls.subject;
  await loadClassStudents();
}

async function loadClassStudents() {
  const c = state.selectedClass;
  const { data: students, error } = await sb.from("profiles").select("id,full_name,usn,section").eq("role","student").eq("section",c.section).eq("semester",c.semester).eq("department",c.department).order("usn");
  if (error) throw error;
  state.students = students || [];
  const date = $("attendanceDate").value;
  const { data: existing, error: ee } = await sb.from("attendance").select("student_id,status").eq("class_id",c.id).eq("attendance_date",date);
  if (ee) throw ee;
  const map = Object.fromEntries((existing||[]).map(x=>[x.student_id,x.status]));
  $("teacherStudentTable").innerHTML = `<thead><tr><th>#</th><th>USN</th><th>Student Name</th><th>Attendance</th></tr></thead><tbody>${
    state.students.map((s,i)=>`<tr><td>${i+1}</td><td>${esc(s.usn)}</td><td>${esc(s.full_name)}</td><td>
      <div class="attendance-toggle">
        <label><input type="radio" name="st_${s.id}" value="present" ${map[s.id] !== "absent" ? "checked":""}> Present</label>
        <label><input type="radio" name="st_${s.id}" value="absent" ${map[s.id] === "absent" ? "checked":""}> Absent</label>
      </div></td></tr>`).join("")
  }</tbody>`;
}

async function submitAttendance() {
  const c = state.selectedClass;
  if (!c) return;
  const date = $("attendanceDate").value;
  const rows = state.students.map(s => {
    const checked = document.querySelector(`input[name="st_${s.id}"]:checked`);
    return {class_id:c.id, student_id:s.id, attendance_date:date, status:checked?.value || "present", marked_by:state.profile.id};
  });
  if (!rows.length) return toast("No students in this class.", "error");

  const { error } = await sb.from("attendance").upsert(rows, {onConflict:"student_id,class_id,attendance_date"});
  if (error) return toast(error.message, "error");

  const absents = rows.filter(r=>r.status==="absent");
  if (absents.length) {
    const { data: attendanceRows, error: ae } = await sb
      .from("attendance")
      .select("id,student_id")
      .eq("class_id", c.id)
      .eq("attendance_date", date)
      .eq("status", "absent");
    if (ae) return toast(ae.message, "error");
    const notifications = (attendanceRows || []).map(r => ({
      student_id:r.student_id,
      attendance_id:r.id,
      type:"absence",
      title:`Absent — ${c.subject}`,
      message:`You were marked absent for ${c.subject} on ${dateText(date)} in ${c.class_name}.`
    }));
    if (notifications.length) {
      const { error: ne } = await sb.from("notifications").upsert(notifications, {onConflict:"attendance_id"});
      if (ne) return toast(ne.message, "error");
    }
  }
  $("attendanceResult").innerHTML = `<div class="success-msg">✅ Attendance submitted. ${absents.length} absence notification(s) created.</div>`;
  toast("Attendance saved.", "success");
  await loadClassStudents();
}
$("attendanceDate")?.addEventListener("change", ()=>{ if(state.selectedClass) loadClassStudents().catch(e=>toast(e.message,"error")); });

async function loadAdminDashboard() {
  const [{data:students, error:se},{data:teachers,error:te},{data:classes,error:ce}] = await Promise.all([
    sb.from("profiles").select("id,full_name,usn,department,semester,section").eq("role","student").order("usn"),
    sb.from("profiles").select("id,full_name,email,department").eq("role","teacher").order("full_name"),
    sb.from("classes").select("id,class_name,section,semester,department,subject,teacher_id,teacher:profiles!classes_teacher_id_fkey(full_name)")
  ]);
  if(se) throw se; if(te) throw te; if(ce) throw ce;
  state.students=students||[]; state.teachers=teachers||[];
  $("adminKpis").innerHTML=`
    <div class="card"><span>👨‍🎓</span><div><small>Students</small><strong>${state.students.length}</strong></div></div>
    <div class="card"><span>👨‍🏫</span><div><small>Teachers</small><strong>${state.teachers.length}</strong></div></div>
    <div class="card"><span>🏫</span><div><small>Classes</small><strong>${(classes||[]).length}</strong></div></div>
    <div class="card success"><span>🔐</span><div><small>Access</small><strong>Admin</strong></div></div>`;
  $("adminStudentTable").innerHTML=`<thead><tr><th>USN</th><th>Name</th><th>Dept</th><th>Sem</th><th>Section</th><th>Actions</th></tr></thead><tbody>${state.students.map(s=>`<tr><td>${esc(s.usn)}</td><td>${esc(s.full_name)}</td><td>${esc(s.department)}</td><td>${s.semester}</td><td>${esc(s.section)}</td><td class="action-group"><button type="button" class="small-action" data-reset-student="${s.id}" data-student-name="${esc(s.full_name)}">🔑 Password</button><button type="button" class="small-action danger-action" data-delete-student="${s.id}" data-student-name="${esc(s.full_name)}">🗑️ Delete</button></td></tr>`).join("")||`<tr><td colspan="6">No students.</td></tr>`}</tbody>`;
  $("adminTeacherTable").innerHTML=`<thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Actions</th></tr></thead><tbody>${state.teachers.map(t=>`<tr><td>${esc(t.full_name)}</td><td>${esc(t.email)}</td><td>${esc(t.department)}</td><td><button type="button" class="small-action danger-action" data-delete-teacher="${t.id}" data-teacher-name="${esc(t.full_name)}">🗑️ Delete</button></td></tr>`).join("")||`<tr><td colspan="4">No teachers.</td></tr>`}</tbody>`;
  $("classTeacherSelect").innerHTML=`<option value="">Select teacher</option>`+state.teachers.map(t=>`<option value="${t.id}">${esc(t.full_name)} — ${esc(t.department)}</option>`).join("");
  $("adminClassTable").innerHTML=`<thead><tr><th>Class</th><th>Subject</th><th>Dept</th><th>Sem</th><th>Teacher</th><th>Actions</th></tr></thead><tbody>${(classes||[]).map(c=>`<tr><td>${esc(c.class_name)}</td><td>${esc(c.subject)}</td><td>${esc(c.department)}</td><td>${c.semester}</td><td>${esc(c.teacher?.full_name||"Unassigned")}</td><td><button type="button" class="small-action danger-action" data-delete-class="${c.id}" data-class-name="${esc(c.class_name)}" data-subject="${esc(c.subject)}">🗑️ Delete</button></td></tr>`).join("")||`<tr><td colspan="6">No classes.</td></tr>`}</tbody>`;
}

async function resetStudentPassword(userId, newPassword) {
  if (!userId) throw new Error("Student account was not selected.");
  if (!newPassword || newPassword.length < 6) throw new Error("Password must be at least 6 characters.");
  return invokeCreateUser({ action: "reset-password", user_id: userId, password: newPassword });
}

async function invokeCreateUser(body) {
  const { data, error } = await sb.functions.invoke("admin-create-user", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

async function deleteUserAccount(userId, expectedRole) {
  if (!userId) throw new Error("Account was not selected.");
  return invokeCreateUser({ action: "delete-user", user_id: userId, expected_role: expectedRole });
}

async function deleteClass(classId) {
  if (!classId) throw new Error("Class was not selected.");
  const { error } = await sb.from("classes").delete().eq("id", classId);
  if (error) throw error;
}

document.querySelectorAll("[data-login-role]").forEach(b=>b.addEventListener("click",()=>setLoginRole(b.dataset.loginRole)));
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!sb) return toast("Configure Supabase first.", "error");
  const btn = e.submitter; btn.disabled=true; btn.textContent="Logging in...";
  try { await signIn($("identifier").value,$("password").value); }
  catch(err) { toast(err.message || "Login failed.","error"); }
  finally { btn.disabled=false; btn.textContent="Login"; }
});
$("logoutBtn").addEventListener("click",logout);
$("menuBtn").addEventListener("click",()=>document.querySelector(".sidebar").classList.toggle("open"));
$("closeAttendance").addEventListener("click",()=>{$("teacherAttendancePanel").classList.add("hidden");state.selectedClass=null;});
$("submitAttendance").addEventListener("click",submitAttendance);

document.querySelectorAll(".admin-tab").forEach(b=>b.addEventListener("click",()=>{
  state.adminTab=b.dataset.adminTab;
  document.querySelectorAll(".admin-tab").forEach(x=>x.classList.toggle("active",x===b));
  ["students","teachers","classes"].forEach(t=>$("admin"+t.charAt(0).toUpperCase()+t.slice(1)).classList.toggle("hidden",t!==state.adminTab));
}));

$("studentForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  try{
    await invokeCreateUser({
      role:"student", full_name:f.get("full_name"), usn:f.get("usn"), password:f.get("password"),
      department:f.get("department"), semester:Number(f.get("semester")), section:f.get("section")
    });
    e.target.reset(); toast("Student account created.","success"); await loadAdminDashboard();
  }catch(err){toast(err.message||"Could not create student.","error");}
});
$("teacherForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  try{
    await invokeCreateUser({
      role:"teacher", full_name:f.get("full_name"), email:f.get("email"), password:f.get("password"),
      department:f.get("department")
    });
    e.target.reset(); toast("Teacher account created.","success"); await loadAdminDashboard();
  }catch(err){toast(err.message||"Could not create teacher.","error");}
});
$("classForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  const payload={class_name:f.get("class_name"),section:f.get("section"),department:f.get("department"),semester:Number(f.get("semester")),subject:f.get("subject"),teacher_id:f.get("teacher_id"),created_by:state.profile.id};
  const {error}=await sb.from("classes").insert(payload);
  if(error) return toast(error.message,"error");
  e.target.reset(); toast("Class created and teacher assigned.","success"); await loadAdminDashboard();
});

// Password visibility
document.querySelectorAll("[data-password-toggle]").forEach(btn=>btn.addEventListener("click",()=>togglePassword(btn.dataset.passwordToggle,btn)));

// Forgot password: real-email accounts can receive a Supabase reset link. Students use Admin reset because their login is USN-based.
$("forgotPasswordBtn").addEventListener("click",()=>{
  const role=state.loginRole;
  $("forgotPasswordStudentHelp").classList.toggle("hidden",role!=="student");
  $("forgotPasswordForm").classList.toggle("hidden",role==="student");
  $("forgotPasswordMessage").textContent="";
  const identifier=String($("identifier").value||"").trim();
  $("forgotEmail").value=(role!=="student" && identifier.includes("@")) ? identifier : "";
  openModal("forgotPasswordModal");
});

$("forgotPasswordForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const btn=e.submitter; btn.disabled=true;
  try{
    await sendPasswordReset($("forgotEmail").value);
    $("forgotPasswordMessage").textContent="Reset link sent. Check your email.";
    toast("Password reset link sent.","success");
  }catch(err){
    $("forgotPasswordMessage").textContent=err.message||"Could not send reset link.";
    toast(err.message||"Could not send reset link.","error");
  }finally{btn.disabled=false;}
});

// Admin account deletion actions
document.addEventListener("click",async e=>{
  const studentBtn=e.target.closest("[data-delete-student]");
  const teacherBtn=e.target.closest("[data-delete-teacher]");
  const classBtn=e.target.closest("[data-delete-class]");
  if(!studentBtn && !teacherBtn && !classBtn) return;

  try {
    if(studentBtn){
      const name=studentBtn.dataset.studentName || "this student";
      if(!window.confirm(`Delete ${name}? This will permanently remove the student login, profile, attendance records and notifications.`)) return;
      studentBtn.disabled=true;
      await deleteUserAccount(studentBtn.dataset.deleteStudent,"student");
      toast("Student deleted successfully.","success");
    } else if(teacherBtn){
      const name=teacherBtn.dataset.teacherName || "this teacher";
      if(!window.confirm(`Delete ${name}? Their assigned classes will become Unassigned. Their teacher login will be permanently removed.`)) return;
      teacherBtn.disabled=true;
      await deleteUserAccount(teacherBtn.dataset.deleteTeacher,"teacher");
      toast("Teacher deleted successfully. Assigned classes are now unassigned.","success");
    } else {
      const label=`${classBtn.dataset.className || "this class"} — ${classBtn.dataset.subject || ""}`.replace(/\s+—\s*$/,"");
      if(!window.confirm(`Delete ${label}? This will permanently remove this class and its attendance records.`)) return;
      classBtn.disabled=true;
      await deleteClass(classBtn.dataset.deleteClass);
      toast("Class deleted successfully.","success");
    }
    await loadAdminDashboard();
  } catch(err) {
    toast(err.message || "Could not delete the selected item.","error");
  }
});

// Admin password reset for students
document.addEventListener("click",e=>{
  const btn=e.target.closest("[data-reset-student]");
  if(!btn) return;
  state.resetStudentId=btn.dataset.resetStudent;
  $("resetStudentName").textContent=`Student: ${btn.dataset.studentName}`;
  $("adminNewPassword").value="";
  $("adminConfirmPassword").value="";
  openModal("adminPasswordModal");
});

$("recoveryPasswordForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const password=$("recoveryNewPassword").value;
  const confirm=$("recoveryConfirmPassword").value;
  if(password!==confirm) return toast("Passwords do not match.","error");
  const btn=e.submitter; btn.disabled=true; btn.textContent="Saving...";
  try{
    const {error}=await sb.auth.updateUser({password});
    if(error) throw error;
    closeModal("recoveryPasswordModal");
    $("recoveryNewPassword").value="";
    $("recoveryConfirmPassword").value="";
    toast("Password updated successfully. Please log in again.","success");
    await sb.auth.signOut();
  }catch(err){toast(err.message||"Could not update password.","error");}
  finally{btn.disabled=false;btn.textContent="Save New Password";}
});

$("adminPasswordForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const password=$("adminNewPassword").value;
  const confirm=$("adminConfirmPassword").value;
  if(password!==confirm) return toast("Passwords do not match.","error");
  const btn=e.submitter; btn.disabled=true; btn.textContent="Changing...";
  try{
    await resetStudentPassword(state.resetStudentId,password);
    closeModal("adminPasswordModal");
    toast("Student password changed successfully.","success");
  }catch(err){toast(err.message||"Could not change password.","error");}
  finally{btn.disabled=false;btn.textContent="Change Password";}
});

document.querySelectorAll("[data-close-modal]").forEach(btn=>btn.addEventListener("click",()=>closeModal(btn.dataset.closeModal)));
document.querySelectorAll(".modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m) closeModal(m.id);}));

if(!configured) $("setupNotice").classList.remove("hidden");

(async function init(){
  if(!sb) return;
  const {data:{session}}=await sb.auth.getSession();
  if(session){
    try{await loadProfile(session.user.id);}catch(e){await sb.auth.signOut();toast("Profile setup is incomplete.","error");}
  }
  sb.auth.onAuthStateChange((event,session)=>{
    if(event==="PASSWORD_RECOVERY"){
      openModal("recoveryPasswordModal");
      return;
    }
    if(event==="SIGNED_OUT"){
      $("appShell").classList.add("hidden");
      $("loginScreen").classList.remove("hidden");
    }
  });
})();
