// ================= Firebase Initialization =================
const firebaseConfig = { 
  apiKey: "AIzaSyByQpaXsrop_9OKwLhomsi3_JiZnpMGHWk", 
  authDomain: "hobby-4494b.firebaseapp.com", 
  projectId: "hobby-4494b", 
  storageBucket: "hobby-4494b.firebasestorage.app", 
  messagingSenderId: "834452577245", 
  appId: "1:834452577245:web:4f0330bd6a43d99c38b434" 
};

// Initialize Firebase with error handling
try {
firebase.initializeApp(firebaseConfig);
  console.log("Firebase initialized successfully");
} catch (error) {
  console.error("Firebase initialization failed:", error);
}

// Initialize Firestore
let db;
try {
  db = firebase.firestore();
} catch (error) {
  console.error("Firestore initialization failed:", error);
}

// User plan/credits state
let userPlan = "free";
let userCreditsCount = 0;

// ================= Google Drive Setup =================
const DRIVE_CLIENT_ID="754850424503-gj010h380qhlctrolg8rrjhd323101v5.apps.googleusercontent.com";
const DRIVE_API_KEY="AIzaSyDkQIFs7SLmQpbE7fqB2fRhfCDHxE7H9NE";
const DRIVE_SCOPES="https://www.googleapis.com/auth/drive.file";

let driveTokenClient, driveAccessToken=null;
let masterFileId=null, masterFolderId=null;
let isRequestingDriveToken = false;

// Init gapi with error handling
gapi.load("client", async ()=>{
  try {
    await gapi.client.init({ 
      apiKey: DRIVE_API_KEY, 
      discoveryDocs:["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"] 
    });
    console.log("Google Drive API initialized successfully");
  } catch (error) {
    console.error("Google Drive API initialization failed:", error);
  }
});

// Global state
let currentUser = null;
let summaryData = [], accountsData = [];

// Restore master folder/file IDs from localStorage if available
const savedFolderId = localStorage.getItem("masterFolderId");
if (savedFolderId) {
  masterFolderId = savedFolderId;
}
let savedMasterId = localStorage.getItem("masterFileId");
if (savedMasterId) {
  masterFileId = savedMasterId;
}

// DOM refs
let masterInput, dailyInput, compareBtn, downloadBtn, resultDiv, loadingDiv, notificationBox;
let loginContainer, googleSignInBtn, userProfile, userAvatar, userName, logoutBtn, appContainer;
let statusDiv;

// ================================= Helpers =======================
function showNotification(msg, type) {
  if (!notificationBox) {
    console.log(`Notification: ${msg} (${type})`);
    return;
  }
  notificationBox.innerText = msg;
  notificationBox.className = "status " + type;
  notificationBox.style.display = "block";
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    hideNotification();
  }, 5000);
}

function hideNotification() { 
  if (notificationBox) {
    notificationBox.style.display = "none"; 
  }
}

function setLoading(show) { 
  if (loadingDiv) {
    loadingDiv.style.display = show ? "block" : "none"; 
  }
}

function updateStatus() {
  if (!statusDiv) return;
  const driveConnected = !!driveAccessToken;
  const masterKnown = !!masterFileId || !!localStorage.getItem("masterFileId");
  if (driveConnected && masterKnown) {
    statusDiv.className = "status success";
    const name = localStorage.getItem("masterFileName") || "Master file";
    statusDiv.textContent = `Drive connected • ${name} ready`;
  } else if (driveConnected) {
    statusDiv.className = "status info";
    statusDiv.textContent = "Drive connected • No master file selected";
  } else if (masterKnown) {
    statusDiv.className = "status info";
    const name = localStorage.getItem("masterFileName") || "Saved Master";
    statusDiv.textContent = `Using saved ${name} • Connecting Drive…`;
    // if we have a saved master but no token yet, try silent connect in background
    autoConnectDriveIfPossible();
  } else {
    statusDiv.className = "status info";
    statusDiv.textContent = "Not connected to Drive (you can use a local Master file)";
  }
}

// Wait for gapi client + Drive discovery to be ready
async function waitForGapiReady(timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (typeof gapi !== 'undefined' && gapi.client && gapi.client.drive) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

async function waitForDriveToken(timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (driveAccessToken) return true;
    await new Promise(r=>setTimeout(r, 200));
  }
  return false;
}

async function autoConnectDriveIfPossible() {
  try {
    const okSilent = await requestDriveToken(false);
    if (!okSilent && !driveAccessToken) {
      await requestDriveToken(true);
    }
  } catch (e) {
    console.warn('Auto connect flow failed', e);
  }
}

// Connect drive and ensure master file available after login
async function ensureDriveAndMaster() {
  await autoConnectDriveIfPossible();
  const got = await waitForDriveToken(6500);
  if (!got) return;
  try {
    await ensureFolder();
    await findMasterFile();
  } catch (_) {}
  updateStatus();
}

// ---- Credits helpers
async function ensureUserCredits(user) {
  if (!db || !user) return;
  try {
    const userRef = db.collection("users").doc(user.uid);
    const snap = await userRef.get();
    if (!snap.exists) {
      await userRef.set({
        email: user.email || null,
        displayName: user.displayName || null,
        plan: "free",
        credits: 30,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      userPlan = "free";
      userCreditsCount = 30;
    } else {
      const data = snap.data();
      userPlan = data.plan || "free";
      userCreditsCount = Number(data.credits || 0);
    }
    if (typeof updateCreditsUI === "function") updateCreditsUI();
  } catch (e) {
    console.error("ensureUserCredits error", e);
  }
}

function updateCreditsUI() {
  try {
    const el = document.getElementById("userCredits");
    const btn = document.getElementById("compareBtn");
    if (el) el.textContent = `${userCreditsCount} left`;
    if (btn) btn.disabled = (userPlan === "free" && userCreditsCount <= 0);
  } catch (_) {}
}

async function decrementOneCredit() {
  if (!db || !firebase.auth().currentUser) return;
  try {
    const userRef = db.collection("users").doc(firebase.auth().currentUser.uid);
    await userRef.update({
      credits: firebase.firestore.FieldValue.increment(-1),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    const doc = await userRef.get();
    const data = doc.data() || {};
    userPlan = data.plan || userPlan;
    userCreditsCount = Number(data.credits || 0);
    updateCreditsUI();
  } catch (e) {
    console.error("decrementOneCredit error", e);
  }
}

// ================= Drive Auth & Folder Functions =================
function initDriveAuth() {
  try {
  driveTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: DRIVE_CLIENT_ID,
    scope: DRIVE_SCOPES,
      callback: (resp) => {
        if (resp && resp.access_token) {
          driveAccessToken = resp.access_token;
          try { localStorage.setItem('driveGranted','1'); } catch(_) {}
          // after obtaining a token, ensure folder/master lazily
          ensureFolder().then(findMasterFile).catch(()=>{}).finally(updateStatus);
        } else if (resp && resp.error) { 
          showNotification("Drive auth failed: " + resp.error, "error"); 
        }
      }
    });
  } catch (error) {
    console.error("Drive auth initialization failed:", error);
    showNotification("Drive auth initialization failed", "error");
    updateStatus();
  }
}

async function requestDriveToken(interactive=false) {
  const ready = await waitForGapiReady();
  if (!ready) return false;
  if (!driveTokenClient) initDriveAuth();
  if (isRequestingDriveToken) {
    // wait briefly for existing request
    await new Promise(r=>setTimeout(r, 800));
    return !!driveAccessToken;
  }
  return await new Promise(resolve => {
    try {
      isRequestingDriveToken = true;
      const original = driveTokenClient.callback;
      driveTokenClient.callback = (resp)=>{
        try { original && original(resp); } catch(_) {}
        isRequestingDriveToken = false;
        resolve(!!(resp && resp.access_token));
      };
      driveTokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
      // safety timeout
      setTimeout(()=>{ if(isRequestingDriveToken){ isRequestingDriveToken=false; resolve(!!driveAccessToken); } }, 2000);
    } catch (e) {
      isRequestingDriveToken = false;
      console.warn('requestDriveToken error', e);
      resolve(false);
    }
  });
}

function requestDriveAccess() { 
  try {
    if (!driveTokenClient) initDriveAuth(); 
    driveTokenClient.requestAccessToken({prompt: 'consent'}); 
  } catch (error) {
    console.error("Drive access request failed:", error);
    showNotification("Drive access request failed", "error");
    updateStatus();
  }
}

async function ensureFolder() {
  try {
    const res = await gapi.client.drive.files.list({ 
      q: "name='OverdueComparison_Folder' and mimeType='application/vnd.google-apps.folder' and trashed=false", 
      fields: "files(id)" 
    });
    
    if (res.result.files.length > 0) { 
      masterFolderId = res.result.files[0].id; 
    } else {
      const create = await gapi.client.drive.files.create({ 
        resource: {name: "OverdueComparison_Folder", mimeType: "application/vnd.google-apps.folder"}, 
        fields: "id"
      });
      masterFolderId = create.result.id;
    }
    
    localStorage.setItem("masterFolderId", masterFolderId);
  return masterFolderId;
  } catch (error) {
    console.error("Error ensuring folder:", error);
    showNotification("Error creating/accessing Drive folder", "error");
    throw error;
  }
}

async function uploadMasterFile(file) {
  try {
  await ensureFolder();
    const meta = { name: file.name, mimeType: file.type, parents: [masterFolderId] };
    const fd = new FormData();
    fd.append("metadata", new Blob([JSON.stringify(meta)], {type: "application/json"}));
    fd.append("file", file);
    
    const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST", 
      headers: {Authorization: "Bearer " + driveAccessToken}, 
      body: fd
    });
    
    if (!res.ok) {
      throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
    }
    
    const j = await res.json();
    masterFileId = j.id;
    localStorage.setItem("masterFileId", masterFileId);
    localStorage.setItem("masterFileName", j.name || file.name);
    showNotification("✔ Master uploaded: " + (j.name || file.name), "success");
    updateStatus();
  } catch (error) {
    console.error("Error uploading master file:", error);
    showNotification("Error uploading master file: " + error.message, "error");
    updateStatus();
  }
}

async function findMasterFile() {
  try {
    const res = await gapi.client.drive.files.list({ 
      q: `'${masterFolderId}' in parents and trashed=false`, 
      orderBy: "modifiedTime desc", 
      fields: "files(id,name)" 
    });
    
    if (res.result.files.length > 0) {
      const f = res.result.files[0];
      masterFileId = f.id;
      localStorage.setItem("masterFileId", masterFileId);
      localStorage.setItem("masterFileName", f.name || "");
      showNotification("✔ Master found: " + f.name, "success");
  } else {
      showNotification("⚠ No Master file in Drive", "info");
    }
  } catch (error) {
    console.error("Error finding master file:", error);
    showNotification("Error finding master file", "error");
  }
}

async function downloadMasterFile() {
  try {
    const res = await fetch("https://www.googleapis.com/drive/v3/files/" + masterFileId + "?alt=media", {
      headers: {Authorization: "Bearer " + driveAccessToken}
    });
    
    if (!res.ok) {
      throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    }
    
  return await res.arrayBuffer();
  } catch (error) {
    console.error("Error downloading master file:", error);
    showNotification("Error downloading master file: " + error.message, "error");
    throw error;
  }
}

// ============== Excel Helpers ==================
function forceToNumber(val) { 
  if (!val) return 0; 
  return Number(val.toString().replace(/,/g, "").trim()) || 0; 
}

function validateExcelFile(file) {
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'text/csv' // .csv
  ];
  
  const validExtensions = ['.xlsx', '.xls', '.csv'];
  const fileName = file.name.toLowerCase();
  
  const hasValidType = validTypes.includes(file.type);
  const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
  
  if (!hasValidType && !hasValidExtension) {
    throw new Error("Invalid file format. Please upload an Excel file (.xlsx, .xls) or CSV file.");
  }
  
  if (file.size > 10 * 1024 * 1024) { // 10MB limit
    throw new Error("File too large. Please upload a file smaller than 10MB.");
  }
}

function readExcel(file) {
  return new Promise((resolve, reject) => {
    try {
      validateExcelFile(file);

      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: "array" });
          if (!wb.SheetNames || wb.SheetNames.length === 0) {
            showNotification("⚠ No sheets found in Excel file", "error");
            resolve([]);
            return;
          }
          const sheet = wb.Sheets[wb.SheetNames[0]];
          if (!sheet || !sheet["!ref"]) {
            showNotification("⚠ Sheet is empty", "error");
            resolve([]);
            return;
          }

          // Detect header row by scanning column E (index 4) for first non-empty
          let headerRowIndex = null;
          try {
            const range = XLSX.utils.decode_range(sheet["!ref"]);
            for (let R = range.s.r; R <= range.e.r; ++R) {
              const cellAddr = XLSX.utils.encode_cell({ r: R, c: 4 });
              const cell = sheet[cellAddr];
              if (cell && cell.v != null && cell.v.toString().trim() !== "") {
                headerRowIndex = R;
                break;
              }
            }
          } catch (_) {}

          let jsonData;
          if (headerRowIndex != null) {
            jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true, range: headerRowIndex });
          } else {
            // Fallback: default parsing
            jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
          }

          if (!Array.isArray(jsonData) || jsonData.length === 0) {
            showNotification("⚠ Excel file appears to be empty", "error");
            resolve([]);
            return;
          }

          // Normalize fields similar to legacy logic
          jsonData.forEach(row => {
            row.__id = null;
            row.__overdue = 0;
            row.__branch = null;
            row.__account = null;
            row.__customer = null;

            for (let key in row) {
              if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
              const value = row[key];
              const normKey = key.toString().trim().toLowerCase().replace(/_/g, " ");

              if (normKey === "sale mst id") row.__id = forceToNumber(value) || value; // keep original if non-numeric
              if (normKey.includes("overdue") || normKey.includes("over due")) row.__overdue = forceToNumber(value);
              if (normKey === "plaza" || normKey === "branch") row.__branch = value ? value.toString().trim().toUpperCase() : null;
              if (["account no", "account number", "account", "account no."].includes(normKey)) row.__account = value ? value.toString().trim() : "";
              if (normKey.includes("customer")) row.__customer = value ? value.toString().trim() : "";
            }
          });

          resolve(jsonData);
        } catch (error) {
          reject(new Error("Error parsing Excel file: " + error.message));
        }
      };
      reader.onerror = () => reject(new Error("Error reading file"));
    reader.readAsArrayBuffer(file);
    } catch (error) {
      reject(new Error("Error setting up file reader: " + error.message));
    }
  });
}

function parseWorkbook(buf) {
  try {
    const wb = XLSX.read(buf, {type: "array"});
    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      throw new Error("No sheets found in workbook");
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, {defval: ""});
  } catch (error) {
    console.error("Error parsing workbook:", error);
    throw new Error("Error parsing workbook: " + error.message);
  }
}

// --------- Header normalization helpers ---------
function normalizeKey(key) {
  return (key || "").toString().trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildNormalizedMap(row) {
  const map = {};
  Object.keys(row).forEach(k => {
    map[normalizeKey(k)] = k; // store original key by normalized form
  });
  return map;
}

function getValueByCandidates(row, candidates) {
  const normMap = buildNormalizedMap(row);
  for (const candidate of candidates) {
    const nk = normalizeKey(candidate);
    if (nk in normMap) {
      const originalKey = normMap[nk];
      return row[originalKey];
    }
  }
  return undefined;
}

function getValueByPredicate(row, predicateFn) {
  const normMap = buildNormalizedMap(row);
  for (const nk in normMap) {
    if (predicateFn(nk)) {
      const originalKey = normMap[nk];
      return row[originalKey];
    }
  }
  return undefined;
}

function hasColumnNormalized(columns, normalizedName) {
  return columns.some(k => normalizeKey(k) === normalizedName);
}

// Transform raw rows into normalized internal fields used by legacy logic
function transformRows(rows, isMaster) {
  return rows.map(r => {
    const id = getValueByCandidates(r, ["Sale Mst ID", "SALE MST ID", "SALE_MST_ID", "salemstid"]); 
    const branchVal = 
      getValueByCandidates(r, ["Branch"]) ||
      getValueByCandidates(r, ["PLAZA"]) ||
      getValueByCandidates(r, ["Plaza"]) ||
      getValueByCandidates(r, ["AREA"]) ||
      getValueByCandidates(r, ["Area"]) ||
      getValueByCandidates(r, ["DIVISION"]) ||
      getValueByCandidates(r, ["Division"]);

    // Pull likely numeric fields, coerce text->number
    const overdueRaw = isMaster
      ? getValueByPredicate(r, nk => nk.startsWith("overdue")) // dynamic e.g., Overdue Aug-25
      : (getValueByCandidates(r, ["Overdue"]) ?? getValueByPredicate(r, nk => nk.startsWith("overdue")));
    let overdueNum = forceToNumber(overdueRaw);

    // Daily-specific fallbacks and computed overdue
    if (!isMaster) {
      const balance = forceToNumber(
        getValueByCandidates(r, ["Balance", "BALANCE"]) ?? getValueByPredicate(r, nk => nk === "balance")
      );
      const hireValue = forceToNumber(
        getValueByCandidates(r, ["Hire Value", "HIRE VALUE", "HIRE_VALUE"]) ||
        getValueByCandidates(r, ["HMRP VALUE", "HMRP_VALUE", "HMRPVALUE"]) // some sheets
      );
      const dp = forceToNumber(
        getValueByCandidates(r, ["DP", "Downpayment", "DOWNPAYMENT", " DOWNPAYMENT "]) // note extra spaces in some masters
      );
      const totalCollection = forceToNumber(
        getValueByCandidates(r, ["Total Collection By Ins.", "Total Collection By Ins", "COLLECTION_BY_INS_LPR", "Total Collection"]) ||
        getValueByPredicate(r, nk => nk.includes("collection") && nk.includes("ins"))
      );
      const collectionAfterReschedule = forceToNumber(
        getValueByCandidates(r, ["Collection After   Re-Schedule", "Collection After Re-Schedule"]) ||
        getValueByPredicate(r, nk => nk.includes("collectionafter") && nk.includes("reschedule"))
      );

      // Prefer explicit Overdue; else Balance; else compute from components
      if (overdueNum === 0) {
        if (balance > 0) {
          overdueNum = balance;
        } else if (hireValue > 0) {
          const computed = hireValue - dp - totalCollection - collectionAfterReschedule;
          overdueNum = computed > 0 ? computed : 0;
        }
      }
    }

    const accountVal = getValueByCandidates(r, ["Account No.", "ACCOUNT_NO", "accountno", "Account", "Account Number"]);
    const customerVal = getValueByCandidates(r, ["Customer Name", "CUSTOMER_NAME", "customername", "Customer"]);

    return {
      ...r,
      __id: id,
      __branch: (branchVal || "").toString().trim().toUpperCase(),
      __overdue: overdueNum,
      __account: accountVal,
      __customer: customerVal
    };
  });
}

// =================== Comparison ===================
async function processFiles() {
  try {
    // Optimistic UI: disable main buttons
    const btns = [document.getElementById('compareBtn'), document.getElementById('downloadBtn')];
    btns.forEach(b=>{ if(b) b.disabled = true; });

    // ---- Compare Files (legacy-compatible)
    // Check if user is logged in
    if (!currentUser) {
      showNotification("⚠ Please sign in to use this feature!", "error");
      return;
    }
    // Credits guard
    if (userPlan === "free" && userCreditsCount <= 0) {
      showNotification("⚠ No credits left. Upgrade plan to continue.", "error");
      return;
    }

    // Determine master source: Drive (if connected and file known) OR local master input as fallback
    const canUseDriveMaster = !!(driveAccessToken && masterFileId);
    const localMasterFile = masterInput && masterInput.files ? masterInput.files[0] : null;
    const dailyFile = dailyInput && dailyInput.files ? dailyInput.files[0] : null;

    if ((!canUseDriveMaster && !localMasterFile) || !dailyFile) {
      showNotification("⚠ Please select/upload both files!", "error");
      return;
    }

    loadingDiv.style.display = "block"; resultDiv.innerHTML = ""; hideNotification();

    // Load and transform master
    let masterRowsRaw;
    if (canUseDriveMaster) {
      const masterBuf = await downloadMasterFile();
      masterRowsRaw = parseWorkbook(masterBuf);
    } else {
      masterRowsRaw = await readExcel(localMasterFile);
    }
    const masterData = transformRows(masterRowsRaw, true);

    // Load and transform daily
    const dailyRowsRaw = await readExcel(dailyFile);
    const dailyData = transformRows(dailyRowsRaw, false);

    // Build daily map
    let dailyMap = {};
    dailyData.forEach(r => {
      if (r.__id) dailyMap[r.__id] = { overdue: r.__overdue, account: r.__account, customer: r.__customer };
    });

    // Aggregate
    let summary = {}; accountsData = [];

    masterData.forEach(r => {
      if (!r.__id || !r.__branch || r.__branch === "PLAZA") return;

      let m = r.__overdue || 0;
      let dailyEntry = dailyMap[r.__id];
      let d = dailyEntry ? dailyEntry.overdue : 0;
      let diff = d - m;

      if (!summary[r.__branch]) summary[r.__branch] = { "Branch Name": r.__branch, masterTotal: 0, dailyTotal: 0, change: 0 };
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

    // Sort and add TOTAL
    summaryData = Object.values(summary).sort((a,b)=>a["Branch Name"].localeCompare(b["Branch Name"]));
    summaryData.push(summaryData.reduce((acc,r)=>{
      acc.masterTotal+=r.masterTotal;
      acc.dailyTotal +=r.dailyTotal;
      acc.change     +=r.change;
      return acc;
    }, { "Branch Name":"TOTAL", masterTotal:0,dailyTotal:0,change:0 }));

  renderTable(summaryData);
    loadingDiv.style.display = "none";

    // Decrement credit on successful comparison
    await decrementOneCredit();

    showNotification("✅ Comparison complete!", "success");
  } catch (error) {
    console.error("Error processing files:", error);
  setLoading(false);
    showNotification("Error processing files: " + error.message, "error");
  } finally {
    const btns = [document.getElementById('compareBtn'), document.getElementById('downloadBtn')];
    btns.forEach(b=>{ if(b) b.disabled = false; });
  }
}

// ---- Render summary table (legacy-compatible)
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
    <td>${(r.masterTotal||0).toLocaleString("en-IN")}</td>
    <td>${(r.dailyTotal||0).toLocaleString("en-IN")}</td>
    <td class="${cls}">${(r.change||0).toLocaleString("en-IN")}</td></tr>`;
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
  if(!table || !table.tBodies || !table.tBodies[0]) return;
  let rows = Array.from(table.tBodies[0].rows);
  if(rows.length===0) return;
  const lastRow = rows[rows.length-1];
  const isTotal = lastRow.cells && lastRow.cells[0] && lastRow.cells[0].innerText.trim().toUpperCase()==="TOTAL";
  if(isTotal) rows.pop(); // remove TOTAL
  let asc = table.dataset.sortCol==colIndex && table.dataset.sortDir==="asc" ? false : true;
  rows.sort((a,b)=>{
    let valA=a.cells[colIndex].innerText.replace(/,/g,'');
    let valB=b.cells[colIndex].innerText.replace(/,/g,'');
    let numA=Number(valA), numB=Number(valB);
    if(!isNaN(numA) && !isNaN(numB)) return asc ? numA-numB : numB-numA;
    return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
  });
  rows.forEach(r=>table.tBodies[0].appendChild(r));
  if(isTotal) table.tBodies[0].appendChild(lastRow); // append TOTAL back
  table.dataset.sortCol=colIndex;
  table.dataset.sortDir=asc?"asc":"desc";
}

// ---- Download both Summary + Accounts (legacy-compatible)
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

// ---- Screenshot (legacy-compatible)
function takeScreenshot() {
  // Check if user is logged in
  if (!currentUser) {
    showNotification("⚠ Please sign in to use this feature!", "error");
    return;
  }
  
  if (!resultDiv || !resultDiv.innerHTML.trim()) {
    showNotification("⚠ No results to capture!", "error");
    return;
  }
  
  if (typeof html2canvas === 'undefined') {
    showNotification("⚠ Screenshot library not loaded!", "error");
    return;
  }
  
  html2canvas(resultDiv, { backgroundColor: "#ffffff", scale: 2 }).then(canvas => {
    const link = document.createElement("a");
    link.download = "Overdue_Report.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
}

// ---- Clear (legacy-compatible)
function clearFiles(){
  // Check if user is logged in
  if (!currentUser) {
    showNotification("⚠ Please sign in to use this feature!", "error");
    return;
  }
  
  if (masterInput) masterInput.value=""; if (dailyInput) dailyInput.value="";
  const mf = document.getElementById("masterFileName"); if (mf) mf.innerText="No file chosen...";
  const df = document.getElementById("dailyFileName"); if (df) df.innerText="No file chosen...";
  if (resultDiv) resultDiv.innerHTML=""; summaryData=[]; accountsData=[];
  hideNotification();
}

// =============== Download XLSX ================
function downloadCombined() {
  try {
    if (!summaryData.length) {
      showNotification("⚠ No data to download", "error");
      return;
    }
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accountsData), "Accounts");
    XLSX.writeFile(wb, "Overdue_Report.xlsx");
    showNotification("✅ Report downloaded successfully", "success");
  } catch (error) {
    console.error("Error downloading report:", error);
    showNotification("Error downloading report: " + error.message, "error");
  }
}

// ============= Firebase Auth ==============
function initAuth() {
  try {
    firebase.auth().onAuthStateChanged(async user => {
      if (user) { 
        currentUser = user; 
        if (userProfile) userProfile.style.display = "flex";
        if (userAvatar) userAvatar.src = user.photoURL || "";
        if (userName) userName.textContent = user.displayName || user.email;
        if (loginContainer) loginContainer.style.display = "none";
        if (appContainer) appContainer.style.display = "block";
        await ensureUserCredits(user);
        updateCreditsUI();
        // Avoid auto popup: try silent connect only; ask user to click Connect Drive if needed
        const driveGranted = !!localStorage.getItem('driveGranted');
        const hasSavedMaster = !!localStorage.getItem('masterFileId');
        if (driveGranted) {
          autoConnectDriveIfPossible();
        } else if (!hasSavedMaster) {
          showNotification("Click 'Connect Drive' to enable Drive features.", "info");
        }
        showNotification("✅ Signed in successfully", "success");
      } else { 
        currentUser = null; 
        if (loginContainer) loginContainer.style.display = "block";
        if (appContainer) appContainer.style.display = "none";
      }
      updateStatus();
    });
  } catch (error) {
    console.error("Firebase auth initialization failed:", error);
    showNotification("Authentication initialization failed", "error");
  }
}

function signInWithGoogle() {
  try {
    firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider())
      .catch(e => {
        console.error("Sign-in failed:", e);
        showNotification("Sign-in failed: " + e.message, "error");
      });
  } catch (error) {
    console.error("Sign-in error:", error);
    showNotification("Sign-in error: " + error.message, "error");
  }
}

async function startAuthAndDriveConsent() {
  try {
    // Within the user click gesture: open Drive consent popup first
    await requestDriveToken(true);
  } catch (_) {}
  // Then trigger Firebase Google sign-in (popup or redirect)
  try {
    await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
  } catch (e) {
    console.error("Sign-in failed:", e);
    showNotification("Sign-in failed: " + e.message, "error");
  }
}

function signOutUser() { 
  try {
    firebase.auth().signOut()
      .then(() => {
        showNotification("✅ Signed out successfully", "success");
      })
      .catch(e => {
        console.error("Sign-out failed:", e);
        showNotification("Sign-out failed: " + e.message, "error");
      });
  } catch (error) {
    console.error("Sign-out error:", error);
    showNotification("Sign-out error: " + error.message, "error");
  }
}

// ================= Bindings ==================
function initializeApp() {
  try {
    // Get DOM elements
    masterInput = document.getElementById("masterFile");
    dailyInput = document.getElementById("dailyFile");
    compareBtn = document.getElementById("compareBtn");
    downloadBtn = document.getElementById("downloadBtn");
    resultDiv = document.getElementById("result");
    loadingDiv = document.getElementById("loading");
    notificationBox = document.getElementById("notificationBox");
    loginContainer = document.getElementById("loginContainer");
    googleSignInBtn = document.getElementById("googleSignInBtn");
    userProfile = document.getElementById("userProfile");
    userAvatar = document.getElementById("userAvatar");
    userName = document.getElementById("userName");
    logoutBtn = document.getElementById("logoutBtn");
    appContainer = document.getElementById("appContainer");
    statusDiv = document.getElementById("status");

    // Check if all required elements exist
    const requiredElements = [
      masterInput, dailyInput, compareBtn, downloadBtn, resultDiv, 
      loadingDiv, notificationBox, loginContainer, googleSignInBtn, 
      userProfile, userAvatar, userName, logoutBtn, appContainer
    ];

    const missingElements = requiredElements.filter(el => !el);
    if (missingElements.length > 0) {
      console.error("Missing DOM elements:", missingElements);
      showNotification("⚠ Some UI elements are missing. Please refresh the page.", "error");
      return;
    }

    // Add event listeners
    compareBtn.addEventListener("click", processFiles);
    downloadBtn.addEventListener("click", downloadCombined);
    // Replace sign-in handler to ensure Drive consent popup is user-gesture triggered
    googleSignInBtn.addEventListener("click", startAuthAndDriveConsent);
    logoutBtn.addEventListener("click", signOutUser);

    const driveConnectBtn = document.getElementById("driveConnectBtn");
    const uploadMasterBtn = document.getElementById("uploadMasterBtn");
    const screenshotBtn = document.getElementById("screenshotBtn");
    const clearBtn = document.getElementById("clearBtn");
    const dropMaster = document.getElementById("dropMaster");
    const dropDaily = document.getElementById("dropDaily");
    
    if (uploadMasterBtn) {
      uploadMasterBtn.addEventListener("click", async () => {
        try {
          if (!driveAccessToken) {
            const ok = await requestDriveToken(false) || await requestDriveToken(true);
            if (!ok) {
              showNotification("⚠ Could not connect Drive. Please allow access and try again.", "error");
              return;
            }
          }
          if (!masterInput.files[0]) {
            showNotification("⚠ Choose Master file", "error");
            return;
          }
          await uploadMasterFile(masterInput.files[0]);
        } catch (e) {
          console.error(e);
          showNotification("Drive upload failed", "error");
        }
      });
    }

    function wireDropzone(el, input, badgeId){
      if(!el || !input) return;
      const badge = document.getElementById(badgeId);
      ["dragenter","dragover"].forEach(evt=> el.addEventListener(evt, e=>{ e.preventDefault(); el.classList.add("drag-on"); }));
      ["dragleave","drop"].forEach(evt=> el.addEventListener(evt, e=>{ e.preventDefault(); el.classList.remove("drag-on"); }));
      el.addEventListener("drop", e=>{
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if(f){
          input.files = e.dataTransfer.files;
          if (badge) badge.textContent = f.name;
          input.dispatchEvent(new Event('change'));
        }
      });
      el.addEventListener("click", (e)=>{ 
        // prevent double-open: ignore if actual input is the target
        if (e.target === input) return;
        input.click(); 
      });
    }

    // Add file change listeners to show file info + badge
    if (masterInput) {
      masterInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        const badge = document.getElementById("masterFileName");
        if (badge) badge.textContent = file ? file.name : "No file chosen...";
        if (file) {
          showNotification(`📁 Master file selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`, "info");
        }
      });
    }
    
    if (dailyInput) {
      dailyInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        const badge = document.getElementById("dailyFileName");
        if (badge) badge.textContent = file ? file.name : "No file chosen...";
        if (file) {
          showNotification(`📁 Daily file selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`, "info");
        }
      });
    }

    // Wire dropzones
    wireDropzone(dropMaster, masterInput, "masterFileName");
    wireDropzone(dropDaily, dailyInput, "dailyFileName");

    if (driveConnectBtn) driveConnectBtn.addEventListener("click", async () => {
      try {
        const ok = await requestDriveToken(true);
        if (!ok) {
          showNotification("Drive connection was cancelled or failed.", "error");
        } else {
          showNotification("✅ Drive connected", "success");
        }
        updateStatus();
      } catch (_) {
        showNotification("Drive connect failed", "error");
      }
    });

    if (screenshotBtn) screenshotBtn.addEventListener("click", takeScreenshot);
    if (clearBtn) clearBtn.addEventListener("click", clearFiles);

    // Initialize authentication
  initAuth();
    updateStatus();
    
    console.log("App initialized successfully");
  } catch (error) {
    console.error("App initialization failed:", error);
    showNotification("⚠ App initialization failed. Please refresh the page.", "error");
  }
}

// Check if all required APIs are loaded
function checkAPIsLoaded() {
  const requiredAPIs = {
    'firebase': typeof firebase !== 'undefined',
    'gapi': typeof gapi !== 'undefined',
    'google': typeof google !== 'undefined',
    'XLSX': typeof XLSX !== 'undefined'
  };
  
  const missingAPIs = Object.entries(requiredAPIs)
    .filter(([name, loaded]) => !loaded)
    .map(([name]) => name);
    
  if (missingAPIs.length > 0) {
    console.error('Missing APIs:', missingAPIs);
    showNotification(`Missing required APIs: ${missingAPIs.join(', ')}`, 'error');
    return false;
  }
  
  return true;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for external scripts to load
    setTimeout(() => {
      if (checkAPIsLoaded()) {
        initializeApp();
        updateStatus();
      }
    }, 1000);
  });
} else {
  setTimeout(() => {
    if (checkAPIsLoaded()) {
      initializeApp();
      updateStatus();
    }
  }, 1000);
}