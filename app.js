// Smart Campus Rescue - Supabase client
// Uses the browser-safe Supabase publishable key.
// IMPORTANT: never put an sb_secret_ key in this file.

const cfg = window.SUPABASE_CONFIG || {};
const supabaseUrl = String(cfg.url || "").trim();
const supabaseKey = String(cfg.anonKey || "").trim();

const configured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseKey) &&
  !supabaseUrl.includes("PASTE_") &&
  !supabaseKey.includes("PASTE_");

let sb = null;

if (configured && window.supabase?.createClient) {
  try {
    sb = window.supabase.createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
  } catch (e) {
    console.error("Supabase client initialization failed:", e);
  }
} else {
  console.error("Supabase JS library or configuration is missing.", {
    hasLibrary: Boolean(window.supabase?.createClient),
    hasUrl: Boolean(supabaseUrl),
    hasKey: Boolean(supabaseKey)
  });
}

function supabaseErrorMessage(error, fallback = "Request failed.") {
  if (!error) return fallback;

  console.error("Supabase error:", error);

  if (error.name === "TypeError" && /fetch/i.test(error.message || "")) {
    return "Cannot reach Supabase. Check your internet connection and Supabase project URL/key.";
  }

  return error.message || error.error_description || error.msg || fallback;
}

const $ = (id) => document.getElementById(id);
const state = {
  loginRole: "student",
  profile: null,
  page: null,
  adminTab: "students",
  selectedClass: null,
  classes: [],
  students: [],
  teachers: []
};

function toast(message, type = "info") {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => (el.className = "toast"), 3200);
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateText(v) {
  return v ? new Date(v + "T00:00:00").toLocaleDateString() : "-";
}

function roleName(r) {
  return r === "admin" ? "Admin" : r === "teacher" ? "Teacher" : "Student";
}

function setLoginRole(role) {
  state.loginRole = role;
  document.querySelectorAll(".role-tab").forEach((b) => b.classList.toggle("active", b.dataset.loginRole === role));
  $("identifierLabel").textContent = role === "student" ? "USN" : "Email";
  $("identifier").placeholder = role === "student" ? "Enter your USN" : "Enter your email";
}

function showPage(id, title, subtitle = "College attendance & support") {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active-page"));
  $(id).classList.add("active-page");
  $("pageTitle").textContent = title;
  $("pageSubtitle").textContent = subtitle;
  document.querySelector(".sidebar")?.classList.remove("open");
  state.page = id;
}

function buildNav(role) {
  const items =
    role === "student"
      ? [["studentDashboard", "🏠 Dashboard"], ["aboutPage", "ℹ️ About"]]
      : role === "teacher"
      ? [["teacherDashboard", "📝 Attendance"], ["aboutPage", "ℹ️ About"]]
      : [["adminDashboard", "🛡️ Admin"], ["aboutPage", "ℹ️ About"]];

  $("nav").innerHTML = items
    .map(([id, label]) => `<button class="nav ${id === state.page ? "active" : ""}" data-page="${id}">${label}</button>`)
    .join("");

  document.querySelectorAll(".nav").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.page;
      const title =
        id === "studentDashboard"
          ? "Student Dashboard"
          : id === "teacherDashboard"
          ? "Teacher Dashboard"
          : id === "adminDashboard"
          ? "Admin Dashboard"
          : "About";
      showPage(id, title);
    })
  );
}

async function invokeCreateUser(body) {
  const {
    data: { session },
    error: sessionError
  } = await sb.auth.getSession();

  if (sessionError) throw new Error(sessionError.message);
  if (!session?.access_token) throw new Error("Admin session expired. Please log in again.");

  const { data, error } = await sb.functions.invoke("admin-create-user", {
    body,
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return data;
}

async function signIn(identifier, password) {
  const cleanIdentifier = String(identifier || "").trim().toLowerCase();
  const cleanPassword = String(password || "");

  if (!cleanIdentifier || !cleanPassword) {
    throw new Error("Please enter both your login ID and password.");
  }

  const email =
    state.loginRole === "student" ? `${cleanIdentifier}@smartcampus.local` : cleanIdentifier;

  console.log("Attempting Supabase login:", { role: state.loginRole, email });

  try {
    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password: cleanPassword
    });

    if (error) throw error;
    if (!data?.user?.id) throw new Error("Supabase login succeeded but no user ID was returned.");

    await loadProfile(data.user.id);
  } catch (error) {
    throw new Error(supabaseErrorMessage(error, "Login failed."));
  }
}

async function loadProfile(userId) {
  const { data, error } = await sb.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  state.profile = data;

  if (state.loginRole !== data.role) {
    toast(`Logged in as ${roleName(data.role)}.`, "success");
  }

  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("userMini").innerHTML = `<b>${esc(data.full_name)}</b><span>${roleName(data.role)}${data.usn ? " · " + esc(data.usn) : ""}</span>`;
  buildNav(data.role);

  if (data.role === "student") {
    showPage("studentDashboard", "Student Dashboard", "Your attendance and notifications");
    await loadStudentDashboard();
  } else if (data.role === "teacher") {
    showPage("teacherDashboard", "Teacher Dashboard", "Your assigned classes");
    await loadTeacherDashboard();
  } else {
    showPage("adminDashboard", "Admin Dashboard", "Manage users, classes and attendance");
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
