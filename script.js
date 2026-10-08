const students=[
 {id:"STU001",name:"Aarav Sharma",dept:"CSE",attendance:91,assignments:5,pending:0},
 {id:"STU002",name:"Diya Rao",dept:"CSE",attendance:78,assignments:5,pending:1},
 {id:"STU003",name:"Rohan Kumar",dept:"ISE",attendance:69,assignments:4,pending:2},
 {id:"STU004",name:"Ananya Patil",dept:"ECE",attendance:84,assignments:5,pending:0},
 {id:"STU005",name:"Vikram Singh",dept:"CSE",attendance:63,assignments:3,pending:3},
 {id:"STU006",name:"Meera Nair",dept:"ISE",attendance:88,assignments:5,pending:0}
];
let alerts=[
 {student:"Rohan Kumar",type:"Low Attendance",message:"Attendance is 69%. Student needs attention."},
 {student:"Vikram Singh",type:"Low Attendance",message:"Attendance is 63%. Student needs urgent attention."},
 {student:"Rohan Kumar",type:"Assignment",message:"2 assignments are pending."},
 {student:"Vikram Singh",type:"Assignment",message:"3 assignments are pending."}
];

const $=id=>document.getElementById(id);
function render(){
 const low=students.filter(s=>s.attendance<75).length;
 const pending=students.reduce((a,s)=>a+s.pending,0);
 const avg=students.reduce((a,s)=>a+s.attendance,0)/students.length;
 $("totalStudents").textContent=students.length;
 $("lowAttendance").textContent=low;
 $("pendingAssignments").textContent=pending;
 $("avgAttendance").textContent=avg.toFixed(1)+"%";
 $("alertBadge").textContent=alerts.length;
 renderTable("studentTable",students);
 renderTable("attendanceTable",students);
 renderAssignments();
 renderAlerts();
 renderBars();
 const safe=students.filter(s=>s.attendance>=75).length;
 $("categoryChart").style.setProperty("--safe",(safe/students.length*100)+"%");
}
function renderTable(id,data){
 let html="<thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Attendance</th><th>Status</th></tr></thead><tbody>";
 data.forEach(s=>html+=`<tr><td>${s.id}</td><td>${s.name}</td><td>${s.dept}</td><td><b>${s.attendance}%</b></td><td class="${s.attendance<75?"status-risk":"status-safe"}">${s.attendance<75?"🔴 At Risk":"🟢 Safe"}</td></tr>`);
 $(id).innerHTML=html+"</tbody>";
}
function renderAssignments(){
 let html="<thead><tr><th>Student</th><th>Completed</th><th>Pending</th></tr></thead><tbody>";
 students.forEach(s=>html+=`<tr><td>${s.name}</td><td>${s.assignments-s.pending}</td><td>${s.pending}</td></tr>`);
 $("assignmentTable").innerHTML=html+"</tbody>";
}
function renderAlerts(){
 if(!alerts.length){$("alertsList").innerHTML='<div class="panel">✅ No active alerts.</div>';return}
 $("alertsList").innerHTML=alerts.map(a=>`<div class="alert ${a.type==="Assignment"?"assignment":""}"><b>${a.type==="Assignment"?"🟠":"🔴"} ${a.student} — ${a.type}</b><p>${a.message}</p></div>`).join("");
}
function renderBars(){
 $("bars").innerHTML=students.map(s=>`<div class="bar-wrap"><div class="bar-value">${s.attendance}%</div><div class="bar" style="height:${Math.max(3,s.attendance*2)}px"></div><div class="bar-label">${s.name.split(" ")[0]}</div></div>`).join("");
}
function populateSelect(){
 $("studentSelect").innerHTML=students.map((s,i)=>`<option value="${i}">${s.name}</option>`).join("");
 updateSlider();
}
function updateSlider(){
 const s=students[Number($("studentSelect").value)||0];
 $("attendanceSlider").value=s.attendance;
 $("attValue").textContent=s.attendance+"%";
}
function saveAttendance(){
 const i=Number($("studentSelect").value), s=students[i];
 const value=Number($("attendanceSlider").value);
 s.attendance=value;
 let msg="";
 if(value<75){
   if(!alerts.some(a=>a.student===s.name&&a.type==="Low Attendance"))
     alerts.push({student:s.name,type:"Low Attendance",message:`Attendance is ${value}%. Automatic warning recommended.`});
   msg=`<div class="warning-msg">⚡ Automation triggered: low-attendance alert created.</div>`;
 }else{
   msg='<div class="success-msg">✅ Attendance saved successfully.</div>';
 }
 $("saveMessage").innerHTML=msg;
 render();
 renderTable("attendanceTable",students);
}
function showPage(page){
 document.querySelectorAll(".page").forEach(p=>p.classList.remove("active-page"));
 $(page).classList.add("active-page");
 document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.page===page));
 const titles={dashboard:"Dashboard",attendance:"Attendance",alerts:"Alerts",analytics:"Analytics",about:"About LCNC"};
 $("pageTitle").textContent=titles[page];
 window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll(".nav").forEach(n=>n.addEventListener("click",()=>{showPage(n.dataset.page);document.querySelector(".sidebar").classList.remove("open")}));
$("studentSelect").addEventListener("change",updateSlider);
$("attendanceSlider").addEventListener("input",()=>{$("attValue").textContent=$("attendanceSlider").value+"%"});
function toggleSidebar(){document.querySelector(".sidebar").classList.toggle("open")}
populateSelect();render();
