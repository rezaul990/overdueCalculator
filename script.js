// Firebase Configuration
// Remove console.log for production

const firebaseConfig = { 
  apiKey: "AIzaSyByQpaXsrop_9OKwLhomsi3_JiZnpMGHWk", 
  authDomain: "hobby-4494b.firebaseapp.com", 
  projectId: "hobby-4494b", 
  storageBucket: "hobby-4494b.firebasestorage.app", 
  messagingSenderId: "834452577245", 
  appId: "1:834452577245:web:4f0330bd6a43d99c38b434" 
};

// Note: If hosting on a custom domain, you may need to add your domain to Firebase authorized domains
// in the Firebase Console under Authentication > Sign-in method > Authorized domains

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// App Data
let summaryData = [];
let accountsData = [];
let currentUser = null;

setTimeout(() => {
  // DOM Elements (initialized inside DOMContentLoaded)
  let masterInput;
  let dailyInput;
  let compareBtn;
  let downloadBtn;
  // downloadAccountsBtn removed as it doesn't exist in HTML
  let screenshotBtn;
  let clearBtn;
  let resultDiv;
  let loadingDiv;
  let notificationBox;

  // Auth Elements (initialized inside DOMContentLoaded)
  let loginContainer;
  let googleSignInBtn;
  let userProfile;
  let userAvatar;
  let userName;
  let logoutBtn;

  // ---- Helper: Notifications
  function showNotification(msg,type){
    notificationBox.innerText=msg;
    notificationBox.className="notification "+type;
    notificationBox.style.display="block";
  }
  function hideNotification(){
  notificationBox.style.display="none";
}

// ---- Helper: force number
function forceToNumber(val) {
  if (!val) return 0;
  return Number(val.toString().replace(/,/g,"").trim()) || 0;
}

// ---- Detect header row + Normalize
function readExcel(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      let range = XLSX.utils.decode_range(sheet["!ref"]);
      let headerRowIndex = null;
      for (let R = range.s.r; R <= range.e.r; ++R) {
        let cellAddr = XLSX.utils.encode_cell({ r: R, c: 4 });
        let cell = sheet[cellAddr];
        if (cell && cell.v && cell.v.toString().trim() !== "") {
          headerRowIndex = R;
          break;
        }
      }

      if (headerRowIndex === null) {
        showNotification("⚠ Header row not found in Column E!", "error");
        resolve([]);
        return;
      }

      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval:"", raw:true, range: headerRowIndex });

      jsonData.forEach(row => {
        row.__id = null;
        row.__overdue = 0;
        row.__branch = null;
        row.__account = null;
        row.__customer = null;

        for (let key in row) {
          let normKey = key.trim().toLowerCase().replace(/_/g," ");
          if (normKey === "sale mst id") row.__id = forceToNumber(row[key]);
          if (normKey.includes("overdue") || normKey.includes("over due")) row.__overdue = forceToNumber(row[key]);
          if (normKey === "plaza") row.__branch = row[key] ? row[key].toString().trim().toUpperCase() : null;
          if (["account no","account number","account"].includes(normKey)) row.__account = row[key] ? row[key].toString().trim() : "";
          if (normKey.includes("customer")) row.__customer = row[key] ? row[key].toString().trim() : "";
        }
      });

      resolve(jsonData);
    };
    reader.readAsArrayBuffer(file);
  });
}

// ---- Compare Files
async function processFiles() {
  // Check if user is logged in
  if (!currentUser) {
    showNotification("⚠ Please sign in to use this feature!", "error");
    return;
  }
  
  if (!masterInput.files[0] || !dailyInput.files[0]) {
    showNotification("⚠ Please select/upload both files!", "error");
    return;
  }

  loadingDiv.style.display="block"; resultDiv.innerHTML=""; hideNotification();

  const masterData=await readExcel(masterInput.files[0]);
  const dailyData=await readExcel(dailyInput.files[0]);

  let dailyMap={};
  dailyData.forEach(r=>{
    if(r.__id) dailyMap[r.__id] = { overdue: r.__overdue, account: r.__account, customer: r.__customer };
  });

  let summary={}; accountsData=[];

  masterData.forEach(r=>{
    if(!r.__id || !r.__branch || r.__branch==="PLAZA") return;

    let m = r.__overdue || 0;
    let dailyEntry = dailyMap[r.__id];
    let d = dailyEntry ? dailyEntry.overdue : 0;
    let diff = d - m;

    if(!summary[r.__branch]) summary[r.__branch]={ "Branch Name":r.__branch, masterTotal:0,dailyTotal:0,change:0 };
    summary[r.__branch].masterTotal += m;
    summary[r.__branch].dailyTotal  += d;
    summary[r.__branch].change      += diff;

    accountsData.push({
      "Sale Mst ID": r.__id,
      "Branch Name": r.__branch,
      "Account Number": r.__account || (dailyEntry ? dailyEntry.account : ""),
      "Customer Name": r.__customer || (dailyEntry ? dailyEntry.customer : ""),
      "Overdue (Master)": m,
      "Overdue (Daily)": d,
      "Change (+/-)": diff
    });
  });

  summaryData=Object.values(summary).sort((a,b)=>a["Branch Name"].localeCompare(b["Branch Name"]));
  summaryData.push(summaryData.reduce((acc,r)=>{
    acc.masterTotal+=r.masterTotal;
    acc.dailyTotal +=r.dailyTotal;
    acc.change     +=r.change;
    return acc;
  }, { "Branch Name":"TOTAL", masterTotal:0,dailyTotal:0,change:0 }));

  renderTable(summaryData); 
  loadingDiv.style.display="none";
  showNotification("✅ Comparison complete!", "success");
}

// ---- Render summary table
function renderTable(data){
  let html = `<table id="summaryTable">
    <thead><tr>
      <th>Branch Name ⬍</th>
      <th>Overdue (Master)</th>
      <th>Overdue (Daily)</th>
      <th>Change (+/-)</th>
    </tr></thead><tbody>`;
  
  data.forEach(r=>{
    let cls="neutral";
    if(r["Branch Name"]!=="TOTAL") cls=r.change>0?"increase":r.change<0?"decrease":"neutral";
    html+=`<tr style="${r["Branch Name"]==="TOTAL"?"font-weight:bold;background:#f2f2f2":""}">
    <td>${r["Branch Name"]}</td>
    <td>${r.masterTotal.toLocaleString("en-IN")}</td>
    <td>${r.dailyTotal.toLocaleString("en-IN")}</td>
    <td class="${cls}">${r.change.toLocaleString("en-IN")}</td></tr>`;
  });
  html+="</tbody></table>"; 
  resultDiv.innerHTML=html;

  // Sort by clicking headers
  document.querySelectorAll("#summaryTable th").forEach((th,i)=>{
    th.addEventListener("click", ()=>sortTable(i));
  });
}

function sortTable(colIndex){
  const table = document.getElementById("summaryTable");
  let rows = Array.from(table.tBodies[0].rows);
  rows.pop(); // remove TOTAL
  let asc = table.dataset.sortCol==colIndex && table.dataset.sortDir==="asc" ? false : true;
  rows.sort((a,b)=>{
    let valA=a.cells[colIndex].innerText.replace(/,/g,'');
    let valB=b.cells[colIndex].innerText.replace(/,/g,'');
    let numA=Number(valA), numB=Number(valB);
    if(!isNaN(numA) && !isNaN(numB)) return asc ? numA-numB : numB-numA;
    return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
  });
  rows.forEach(r=>table.tBodies[0].appendChild(r));
  table.dataset.sortCol=colIndex;
  table.dataset.sortDir=asc?"asc":"desc";
}

// ---- Download both Summary + Accounts
function downloadCombined(){
  // Check if user is logged in
  if (!currentUser) {
    showNotification("⚠ Please sign in to use this feature!", "error");
    return;
  }
  
  if(!summaryData.length || !accountsData.length){ 
    showNotification("⚠ Run comparison first!","error"); 
    return; 
  }
  
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summaryData),"Summary");
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(accountsData),"AllAccounts");
  XLSX.writeFile(wb,"Overdue_Report.xlsx");
}

// ---- Screenshot
function takeScreenshot() {
  // Check if user is logged in
  if (!currentUser) {
    showNotification("⚠ Please sign in to use this feature!", "error");
    return;
  }
  
  if (!resultDiv.innerHTML.trim()) {
    showNotification("⚠ No results to capture!", "error");
    return;
  }
  
  html2canvas(resultDiv, { backgroundColor: "#ffffff", scale: 2 }).then(canvas => {
    const link = document.createElement("a");
    link.download = "Overdue_Report.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
}

// ---- Clear
function clearFiles(){
  // Check if user is logged in
  if (!currentUser) {
    showNotification("⚠ Please sign in to use this feature!", "error");
    return;
  }
  
  masterInput.value=""; dailyInput.value="";
  document.getElementById("masterFileName").innerText="No file chosen...";
  document.getElementById("dailyFileName").innerText="No file chosen...";
  resultDiv.innerHTML=""; summaryData=[]; accountsData=[];
  hideNotification();
}

// ---- Authentication Functions
function initAuth() {
  // Check if user is already signed in
  firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
      // User is signed in
      currentUser = user;
      showUserProfile(user);
      hideLoginContainer();
    } else {
      // No user is signed in
      showLoginContainer();
      hideUserProfile();
    }
  });
}

function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider)
    .then((result) => {
      // This gives you a Google Access Token
      const credential = result.credential;
      // The signed-in user info
      currentUser = result.user;
      showUserProfile(currentUser);
      hideLoginContainer();
      showNotification("✅ Successfully signed in!", "success");
    })
    .catch((error) => {
      console.error("Google Sign-In Error:", error);
      showNotification("⚠ Sign-in failed: " + error.message, "error");
    });
}

function signOut() {
  firebase.auth().signOut()
    .then(() => {
      currentUser = null;
      hideUserProfile();
      showLoginContainer();
      showNotification("You have been signed out", "success");
    })
    .catch((error) => {
      console.error("Sign-Out Error:", error);
      showNotification("⚠ Sign-out failed: " + error.message, "error");
    });
}

function showUserProfile(user) {
  userProfile.style.display = "flex";
  userAvatar.src = user.photoURL || "https://ui-avatars.com/api/?name=" + encodeURIComponent(user.displayName);
  userName.textContent = user.displayName || user.email;
}

function hideUserProfile() {
  userProfile.style.display = "none";
}

function showLoginContainer() {
  loginContainer.style.display = "flex";
}

function hideLoginContainer() {
  loginContainer.style.display = "none";
}

// ---- Event bindings
// Get DOM elements
masterInput = document.getElementById("masterFile");
dailyInput = document.getElementById("dailyFile");
compareBtn = document.getElementById("compareBtn");
downloadBtn = document.getElementById("downloadBtn");
// downloadAccountsBtn removed as it doesn't exist in HTML
screenshotBtn = document.getElementById("screenshotBtn");
clearBtn = document.getElementById("clearBtn");
resultDiv = document.getElementById("result");
loadingDiv = document.getElementById("loading");
notificationBox = document.getElementById("notificationBox");

loginContainer = document.getElementById("loginContainer");
googleSignInBtn = document.getElementById("googleSignInBtn");
userProfile = document.getElementById("userProfile");
userAvatar = document.getElementById("userAvatar");
userName = document.getElementById("userName");
logoutBtn = document.getElementById("logoutBtn");

// Event bindings with try-catch blocks to prevent errors
  console.log("compareBtn:", compareBtn);
  try {
    if (compareBtn) compareBtn.addEventListener("click", processFiles);
    else console.error("compareBtn is null");
  } catch (e) { console.error("Error with compareBtn:", e); }
  
  console.log("downloadBtn:", downloadBtn);
  try {
    if (downloadBtn) downloadBtn.addEventListener("click", downloadCombined);
    else console.error("downloadBtn is null");
  } catch (e) { console.error("Error with downloadBtn:", e); }
  
  // downloadAccountsBtn removed as it doesn't exist in HTML
  
  console.log("screenshotBtn:", screenshotBtn);
  try {
    if (screenshotBtn) screenshotBtn.addEventListener("click", takeScreenshot);
    else console.error("screenshotBtn is null");
  } catch (e) { console.error("Error with screenshotBtn:", e); }
  
  console.log("clearBtn:", clearBtn);
  try {
    if (clearBtn) clearBtn.addEventListener("click", clearFiles);
    else console.error("clearBtn is null");
  } catch (e) { console.error("Error with clearBtn:", e); }

  // Auth event bindings
  console.log("googleSignInBtn:", googleSignInBtn);
  try {
    if (googleSignInBtn) googleSignInBtn.addEventListener("click", signInWithGoogle);
    else console.error("googleSignInBtn is null");
  } catch (e) { console.error("Error with googleSignInBtn:", e); }
  
  console.log("logoutBtn:", logoutBtn);
  try {
    if (logoutBtn) logoutBtn.addEventListener("click", signOut);
    else console.error("logoutBtn is null");
  } catch (e) { console.error("Error with logoutBtn:", e); }

// Initialize authentication
initAuth();

// Setup Dropzones
function setupDropzone(dropEl, inputEl, fileNameEl) {
  dropEl.addEventListener("click", () => inputEl.click());
  dropEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropEl.classList.add("dragover");
  });
  dropEl.addEventListener("dragleave", () => dropEl.classList.remove("dragover"));
  dropEl.addEventListener("drop", (e) => {
    e.preventDefault();
    dropEl.classList.remove("dragover");
    if (e.dataTransfer.files.length) {
      inputEl.files = e.dataTransfer.files;
      fileNameEl.innerText = e.dataTransfer.files[0].name;
    }
  });
  inputEl.addEventListener("change", () => {
    fileNameEl.innerText = inputEl.files[0]?.name || "No file chosen...";
  });
}
setupDropzone(
  document.getElementById("dropMaster"),
  document.getElementById("masterFile"),
  document.getElementById("masterFileName")
);
  setupDropzone(
    document.getElementById("dropDaily"),
    document.getElementById("dailyFile"),
    document.getElementById("dailyFileName")
  );
}, 100);