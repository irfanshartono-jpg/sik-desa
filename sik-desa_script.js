/**
 * SISTEM INFORMASI ADMINISTRASI KEPENDUDUKAN DESA (SIK-DESA)
 * Frontend Logic (script.js)
 * 
 * Catatan Arsitektur:
 * - Seluruh data kependudukan, KK, mutasi, referensi, dan pengaturan bersumber 100% dari Google Spreadsheet via Google Apps Script Web App API.
 * - LocalStorage HANYA menyimpan URL API endpoint dan token sesi login sementara (tidak ada data database disimpan di browser).
 */

// ==================== KONFIGURASI DEFAULT ====================
// Anda dapat menempelkan URL Web App Deployment Google Apps Script langsung di sini agar pengguna tidak perlu mengetiknya saat login:
const DEFAULT_API_URL = "";

const STORAGE_KEYS = {
  API_URL: "sikdesa_api_url_pref",
  SESSION_TOKEN: "sikdesa_session_token",
  SESSION_USER: "sikdesa_session_user"
};

let APP_STATE = {
  apiUrl: localStorage.getItem(STORAGE_KEYS.API_URL) || DEFAULT_API_URL,
  token: localStorage.getItem(STORAGE_KEYS.SESSION_TOKEN) || "",
  user: JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION_USER) || "null"),
  penduduk: [],
  kk: [],
  anggotaKK: [],
  mutasiDatang: [],
  mutasiPindah: [],
  mutasiMeninggal: [],
  referensi: [],
  pengaturan: {},
  pengguna: [],
  logs: [],
  pddPage: 1,
  selectedBiodataNik: "",
  charts: {}
};

// ==================== INISIALISASI HALAMAN ====================
document.addEventListener("DOMContentLoaded", () => {
  const apiInput = document.getElementById("apiUrlInput");
  if (apiInput && APP_STATE.apiUrl) {
    apiInput.value = APP_STATE.apiUrl;
  }

  if (APP_STATE.token && APP_STATE.user && APP_STATE.apiUrl) {
    showAppScreen();
    syncAllData(false);
  } else {
    showLoginScreen();
  }
});

function toggleApiInput() {
  const el = document.getElementById("apiInputContainer");
  el.style.display = el.style.display === "none" ? "block" : "none";
}

function showLoading(show, text = "Menyinkronkan data dengan Google Spreadsheet...") {
  const overlay = document.getElementById("loadingOverlay");
  const label = document.getElementById("loadingText");
  label.textContent = text;
  if (show) overlay.classList.add("active");
  else overlay.classList.remove("active");
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icon = type === "success" ? "fa-circle-check" : type === "error" ? "fa-circle-exclamation" : "fa-circle-info";
  toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ==================== API CLIENT (GOOGLE APPS SCRIPT) ====================
async function apiCall(action, payload = {}, useLoading = true, loadingMsg = "Memproses data...") {
  if (!APP_STATE.apiUrl) {
    throw new Error("URL Web App Google Apps Script belum diatur.");
  }
  if (useLoading) showLoading(true, loadingMsg);

  try {
    const body = Object.assign({}, payload, {
      action: action,
      token: APP_STATE.token
    });

    const response = await fetch(APP_STATE.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8" // Menghindari preflight CORS OPTIONS pada Google Apps Script
      },
      body: JSON.stringify(body)
    });

    const result = await response.json();
    if (!result.success) {
      if (result.code === "UNAUTHORIZED") {
        handleLogout(true);
      }
      throw new Error(result.message || "Terjadi kesalahan dari server.");
    }
    return result;
  } finally {
    if (useLoading) showLoading(false);
  }
}

// ==================== AUTENTIKASI ====================
async function handleLoginSubmit(e) {
  e.preventDefault();
  const apiUrl = document.getElementById("apiUrlInput").value.trim();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!apiUrl) {
    showToast("Harap masukkan URL Web App Google Apps Script terlebih dahulu.", "error");
    return;
  }

  APP_STATE.apiUrl = apiUrl;
  localStorage.setItem(STORAGE_KEYS.API_URL, apiUrl);

  try {
    const res = await apiCall("login", { username, password }, true, "Memverifikasi kredensial...");
    APP_STATE.token = res.token;
    APP_STATE.user = res.user;
    localStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, res.token);
    localStorage.setItem(STORAGE_KEYS.SESSION_USER, JSON.stringify(res.user));

    showToast("Selamat datang, " + res.user.nama_lengkap, "success");
    showAppScreen();
    await syncAllData(false);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function handleLogout(silent = false) {
  if (!silent && APP_STATE.token && APP_STATE.apiUrl) {
    try {
      await apiCall("logout", {}, false);
    } catch (e) {}
  }
  APP_STATE.token = "";
  APP_STATE.user = null;
  APP_STATE.penduduk = [];
  APP_STATE.kk = [];
  APP_STATE.anggotaKK = [];
  localStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.SESSION_USER);
  showLoginScreen();
  if (!silent) showToast("Anda telah keluar dari sistem.", "info");
}

function showLoginScreen() {
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("appScreen").style.display = "none";
}

function showAppScreen() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "flex";

  const u = APP_STATE.user;
  if (u) {
    document.getElementById("headerUserName").textContent = u.nama_lengkap;
    document.getElementById("headerUserRole").textContent = u.role;
    document.getElementById("headerUserAvatar").textContent = u.nama_lengkap.substring(0, 2).toUpperCase();

    // Pembatasan hak akses UI berdasarkan Role
    const isAdmin = u.role === "Administrator";
    const canWrite = u.role === "Administrator" || u.role === "Operator";

    document.querySelectorAll(".admin-only").forEach(el => {
      el.style.display = isAdmin ? "" : "none";
    });
    document.querySelectorAll(".write-only").forEach(el => {
      el.style.display = canWrite ? "" : "none";
    });
  }
}

// ==================== SINKRONISASI DATA ====================
async function syncAllData(notify = false) {
  try {
    const res = await apiCall("getAllData", {}, true, "Mengambil data terbaru dari Google Spreadsheet...");
    const d = res.data;
    APP_STATE.penduduk = d.penduduk || [];
    APP_STATE.kk = d.kk || [];
    APP_STATE.anggotaKK = d.anggotaKK || [];
    APP_STATE.mutasiDatang = d.mutasiDatang || [];
    APP_STATE.mutasiPindah = d.mutasiPindah || [];
    APP_STATE.mutasiMeninggal = d.mutasiMeninggal || [];
    APP_STATE.referensi = d.referensi || [];
    APP_STATE.pengaturan = d.pengaturan || {};
    APP_STATE.pengguna = d.pengguna || [];
    APP_STATE.logs = d.logs || [];

    document.getElementById("lastSyncTime").textContent = "Sinkron: " + (res.serverTime || "").split(" ")[1];
    applyVillageIdentity();
    populateAllDropdowns();
    refreshCurrentView();

    if (notify) showToast("Seluruh data berhasil disinkronkan dengan Google Spreadsheet.", "success");
  } catch (err) {
    showToast("Gagal sinkronisasi: " + err.message, "error");
  }
}

function applyVillageIdentity() {
  const s = APP_STATE.pengaturan;
  const namaDesa = s.nama_desa || "DESA";
  document.getElementById("sidebarDesaName").textContent = "DESA " + namaDesa;
  document.getElementById("headerDesaFull").textContent =
    `Pemerintah Desa ${namaDesa}, Kec. ${s.kecamatan || "-"}, ${s.kabupaten || "-"}`;

  // Isi form pengaturan
  const keys = [
    "nama_desa", "kecamatan", "kabupaten", "provinsi", "kode_pos",
    "tahun_laporan", "alamat_kantor", "nama_kepala_desa", "nip_kepala_desa",
    "jabatan_penandatangan", "nama_sekretaris_desa", "nama_kasi_pemerintahan", "logo_desa"
  ];
  keys.forEach(k => {
    const el = document.getElementById("set_" + k);
    if (el) el.value = s[k] || "";
  });
}

// ==================== NAVIGASI SIDEBAR ====================
const VIEW_TITLES = {
  "dashboard": "Dashboard Statistik Kependudukan",
  "penduduk": "Data Induk Penduduk Desa",
  "biodata": "Detail Biodata Penduduk",
  "kk": "Manajemen Kartu Keluarga (KK)",
  "mutasi-datang": "Mutasi Penduduk Datang",
  "mutasi-pindah": "Mutasi Penduduk Pindah / Pergi",
  "mutasi-meninggal": "Mutasi Penduduk Meninggal Dunia",
  "rekapitulasi": "Rekapitulasi Statistik Penduduk",
  "laporan": "Laporan Resmi Kependudukan Desa",
  "pengaturan": "Pengaturan Identitas & Wilayah Desa",
  "pengguna": "Manajemen Pengguna & Hak Akses",
  "logs": "Log Aktivitas Sistem"
};

function switchView(viewName) {
  document.querySelectorAll(".view-section").forEach(sec => sec.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("active"));

  const targetSec = document.getElementById("view-" + viewName);
  if (targetSec) targetSec.classList.add("active");

  const activeBtn = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  document.getElementById("headerPageTitle").textContent = VIEW_TITLES[viewName] || "SIK-DESA";
  document.getElementById("sidebar").classList.remove("open");

  refreshCurrentView(viewName);
}

function toggleMutasiSubmenu() {
  document.getElementById("mutasiSubmenu").classList.toggle("open");
}

function toggleMobileSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
}

function refreshCurrentView(explicitView) {
  const activeSec = explicitView
    ? document.getElementById("view-" + explicitView)
    : document.querySelector(".view-section.active");
  if (!activeSec) return;
  const id = activeSec.id.replace("view-", "");

  if (id === "dashboard") renderDashboard();
  else if (id === "penduduk") renderPendudukTable();
  else if (id === "biodata" && APP_STATE.selectedBiodataNik) renderBiodataDetail(APP_STATE.selectedBiodataNik);
  else if (id === "kk") renderKKTable();
  else if (id === "mutasi-datang") renderMutasiDatangTable();
  else if (id === "mutasi-pindah") renderMutasiPindahTable();
  else if (id === "mutasi-meninggal") renderMutasiMeninggalTable();
  else if (id === "rekapitulasi") renderRekapitulasi();
  else if (id === "laporan") renderLaporanResmi();
  else if (id === "pengaturan") renderReferensiTable();
  else if (id === "pengguna") renderUsersTable();
  else if (id === "logs") renderLogsTable();
}

// ==================== HELPER USIA & TANGGAL ====================
function calculateAge(birthDateStr) {
  if (!birthDateStr) return 0;
  const dob = new Date(birthDateStr);
  if (isNaN(dob.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age < 0 ? 0 : age;
}

function formatDateID(dateStr) {
  if (!dateStr) return "-";
  const parts = String(dateStr).split("-");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

function formatDateLongID(dateStr) {
  if (!dateStr) return "-";
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getRefValues(kategori) {
  return APP_STATE.referensi
    .filter(r => r.kategori === kategori && r.aktif !== "TIDAK")
    .map(r => r.nilai);
}

function populateSelectOptions(selectId, values, placeholder = null) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const currentVal = el.value;
  el.innerHTML = "";
  if (placeholder !== null) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = placeholder;
    el.appendChild(opt);
  }
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    el.appendChild(opt);
  });
  if (currentVal && values.includes(currentVal)) el.value = currentVal;
}

function populateAllDropdowns() {
  const agama = getRefValues("AGAMA");
  const pendidikan = getRefValues("PENDIDIKAN");
  const pekerjaan = getRefValues("PEKERJAAN");
  const goldar = getRefValues("GOLONGAN_DARAH");
  const kawin = getRefValues("STATUS_PERKAWINAN");
  const shdk = getRefValues("STATUS_HUBUNGAN");
  const dusun = getRefValues("DUSUN");
  const rw = getRefValues("RW");
  const rt = getRefValues("RT");

  populateSelectOptions("pdd_agama", agama);
  populateSelectOptions("pdd_pendidikan", pendidikan);
  populateSelectOptions("pdd_pekerjaan", pekerjaan);
  populateSelectOptions("pdd_golongan_darah", goldar);
  populateSelectOptions("pdd_status_perkawinan", kawin);
  populateSelectOptions("pdd_status_hubungan", shdk);
  populateSelectOptions("pdd_dusun", dusun);
  populateSelectOptions("pdd_rw", rw);
  populateSelectOptions("pdd_rt", rt);

  populateSelectOptions("kk_dusun", dusun);
  populateSelectOptions("kk_rw", rw);
  populateSelectOptions("kk_rt", rt);

  populateSelectOptions("md_dusun", dusun);
  populateSelectOptions("md_rw", rw);
  populateSelectOptions("md_rt", rt);

  populateSelectOptions("filterPddReligion", agama, "Semua Agama");
  populateSelectOptions("filterPddEducation", pendidikan, "Semua Pendidikan");
  populateSelectOptions("filterPddJob", pekerjaan, "Semua Pekerjaan");
  populateSelectOptions("filterPddDusun", dusun, "Semua Dusun");
  populateSelectOptions("filterPddRW", rw, "Semua RW");
  populateSelectOptions("filterPddRT", rt, "Semua RT");

  populateSelectOptions("rekapFilterDusun", dusun, "Semua Dusun");
  populateSelectOptions("rekapFilterRW", rw, "Semua RW");
  populateSelectOptions("rekapFilterRT", rt, "Semua RT");

  // Tahun filter
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear; y >= currentYear - 5; y--) years.push(String(y));

  populateSelectOptions("chartMutasiYearFilter", years);
  populateSelectOptions("rekapFilterTahun", years, "Semua Tahun");
  populateSelectOptions("laporanTahunSelect", years);
}

// ==================== 1. DASHBOARD & CHART.JS ====================
function renderDashboard() {
  const aktif = APP_STATE.penduduk.filter(p => p.status_kependudukan === "AKTIF");
  const totalAktif = aktif.length;
  const totalArsip = APP_STATE.penduduk.length;
  const laki = aktif.filter(p => p.jenis_kelamin === "LAKI-LAKI").length;
  const perempuan = aktif.filter(p => p.jenis_kelamin === "PEREMPUAN").length;
  const currentYear = String(new Date().getFullYear());
  const lahir = aktif.filter(p => String(p.tanggal_lahir || "").startsWith(currentYear)).length;

  document.getElementById("statTotalPenduduk").textContent = totalAktif.toLocaleString("id-ID");
  document.getElementById("statTotalArsip").textContent = `Total arsip database: ${totalArsip.toLocaleString("id-ID")} jiwa`;
  document.getElementById("statTotalKK").textContent = APP_STATE.kk.length.toLocaleString("id-ID");
  document.getElementById("statLaki").textContent = laki.toLocaleString("id-ID");
  document.getElementById("statLakiPct").textContent = totalAktif ? ((laki / totalAktif) * 100).toFixed(1) + "%" : "0%";
  document.getElementById("statPerempuan").textContent = perempuan.toLocaleString("id-ID");
  document.getElementById("statPerempuanPct").textContent = totalAktif ? ((perempuan / totalAktif) * 100).toFixed(1) + "%" : "0%";
  document.getElementById("statDatang").textContent = APP_STATE.mutasiDatang.length.toLocaleString("id-ID");
  document.getElementById("statPindah").textContent = APP_STATE.mutasiPindah.length.toLocaleString("id-ID");
  document.getElementById("statMeninggal").textContent = APP_STATE.mutasiMeninggal.length.toLocaleString("id-ID");
  document.getElementById("statLahir").textContent = lahir.toLocaleString("id-ID");

  renderDashboardCharts();
}

function buildOrUpdateChart(canvasId, type, labels, datasets, extraOptions = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (APP_STATE.charts[canvasId]) {
    APP_STATE.charts[canvasId].destroy();
  }
  APP_STATE.charts[canvasId] = new Chart(ctx, {
    type: type,
    data: { labels, datasets },
    options: Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: type === "doughnut" || type === "pie" ? "bottom" : "top" }
      }
    }, extraOptions)
  });
}

function renderDashboardCharts() {
  const aktif = APP_STATE.penduduk.filter(p => p.status_kependudukan === "AKTIF");
  const palette = ["#1e4d85", "#0284c7", "#059669", "#d97706", "#e11d48", "#6366f1", "#0d9488", "#64748b", "#8b5cf6", "#ec4899"];

  // 1. Gender
  const laki = aktif.filter(p => p.jenis_kelamin === "LAKI-LAKI").length;
  const perempuan = aktif.filter(p => p.jenis_kelamin === "PEREMPUAN").length;
  buildOrUpdateChart("chartGender", "doughnut", ["Laki-Laki", "Perempuan"], [{
    data: [laki, perempuan],
    backgroundColor: ["#1e4d85", "#e11d48"]
  }]);

  // 2. Kelompok Usia
  const ageBuckets = { "Balita (0-4)": 0, "Anak (5-14)": 0, "Remaja (15-24)": 0, "Produktif (25-59)": 0, "Lansia (60+)": 0 };
  aktif.forEach(p => {
    const u = calculateAge(p.tanggal_lahir);
    if (u <= 4) ageBuckets["Balita (0-4)"]++;
    else if (u <= 14) ageBuckets["Anak (5-14)"]++;
    else if (u <= 24) ageBuckets["Remaja (15-24)"]++;
    else if (u <= 59) ageBuckets["Produktif (25-59)"]++;
    else ageBuckets["Lansia (60+)"]++;
  });
  buildOrUpdateChart("chartAge", "bar", Object.keys(ageBuckets), [{
    label: "Jumlah Jiwa",
    data: Object.values(ageBuckets),
    backgroundColor: "#1e4d85"
  }]);

  // 3. Pendidikan
  const eduCounts = {};
  aktif.forEach(p => {
    const k = p.pendidikan || "TIDAK DIKETAHUI";
    eduCounts[k] = (eduCounts[k] || 0) + 1;
  });
  buildOrUpdateChart("chartEducation", "bar", Object.keys(eduCounts), [{
    label: "Jumlah Jiwa",
    data: Object.values(eduCounts),
    backgroundColor: "#0284c7"
  }], { indexAxis: "y" });

  // 4. Pekerjaan (Top 8)
  const jobCounts = {};
  aktif.forEach(p => {
    const k = p.pekerjaan || "LAINNYA";
    jobCounts[k] = (jobCounts[k] || 0) + 1;
  });
  const topJobs = Object.entries(jobCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  buildOrUpdateChart("chartJob", "bar", topJobs.map(x => x[0]), [{
    label: "Jumlah Jiwa",
    data: topJobs.map(x => x[1]),
    backgroundColor: "#059669"
  }], { indexAxis: "y" });

  // 5. Agama
  const relCounts = {};
  aktif.forEach(p => {
    const k = p.agama || "ISLAM";
    relCounts[k] = (relCounts[k] || 0) + 1;
  });
  buildOrUpdateChart("chartReligion", "pie", Object.keys(relCounts), [{
    data: Object.values(relCounts),
    backgroundColor: palette
  }]);

  // 6. Status Perkawinan
  const marCounts = {};
  aktif.forEach(p => {
    const k = p.status_perkawinan || "BELUM KAWIN";
    marCounts[k] = (marCounts[k] || 0) + 1;
  });
  buildOrUpdateChart("chartMarital", "doughnut", Object.keys(marCounts), [{
    data: Object.values(marCounts),
    backgroundColor: palette
  }]);

  // 7. Dusun
  const dusunCounts = {};
  aktif.forEach(p => {
    const k = p.dusun || "TANPA DUSUN";
    dusunCounts[k] = (dusunCounts[k] || 0) + 1;
  });
  buildOrUpdateChart("chartDusun", "bar", Object.keys(dusunCounts), [{
    label: "Jumlah Penduduk",
    data: Object.values(dusunCounts),
    backgroundColor: "#0f294a"
  }]);

  // 8. Mutasi Per Bulan
  const yr = document.getElementById("chartMutasiYearFilter").value || String(new Date().getFullYear());
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const mDatang = Array(12).fill(0);
  const mPindah = Array(12).fill(0);
  const mMeninggal = Array(12).fill(0);

  APP_STATE.mutasiDatang.forEach(m => {
    if (String(m.tanggal_datang || "").startsWith(yr)) {
      const idx = parseInt(m.tanggal_datang.split("-")[1], 10) - 1;
      if (idx >= 0 && idx < 12) mDatang[idx]++;
    }
  });
  APP_STATE.mutasiPindah.forEach(m => {
    if (String(m.tanggal_pindah || "").startsWith(yr)) {
      const idx = parseInt(m.tanggal_pindah.split("-")[1], 10) - 1;
      if (idx >= 0 && idx < 12) mPindah[idx]++;
    }
  });
  APP_STATE.mutasiMeninggal.forEach(m => {
    if (String(m.tanggal_meninggal || "").startsWith(yr)) {
      const idx = parseInt(m.tanggal_meninggal.split("-")[1], 10) - 1;
      if (idx >= 0 && idx < 12) mMeninggal[idx]++;
    }
  });

  buildOrUpdateChart("chartMutasi", "line", months, [
    { label: "Datang", data: mDatang, borderColor: "#059669", backgroundColor: "#059669", tension: 0.3 },
    { label: "Pindah", data: mPindah, borderColor: "#d97706", backgroundColor: "#d97706", tension: 0.3 },
    { label: "Meninggal", data: mMeninggal, borderColor: "#e11d48", backgroundColor: "#e11d48", tension: 0.3 }
  ]);
}

// ==================== 2. DATA PENDUDUK ====================
function getFilteredPenduduk() {
  const q = document.getElementById("filterPddSearch").value.trim().toLowerCase();
  const gender = document.getElementById("filterPddGender").value;
  const ageGroup = document.getElementById("filterPddAgeGroup").value;
  const rel = document.getElementById("filterPddReligion").value;
  const edu = document.getElementById("filterPddEducation").value;
  const job = document.getElementById("filterPddJob").value;
  const dusun = document.getElementById("filterPddDusun").value;
  const rw = document.getElementById("filterPddRW").value;
  const rt = document.getElementById("filterPddRT").value;
  const status = document.getElementById("filterPddStatus").value;
  const sortBy = document.getElementById("sortPddBy").value;

  let filtered = APP_STATE.penduduk.filter(p => {
    if (status && p.status_kependudukan !== status) return false;
    if (gender && p.jenis_kelamin !== gender) return false;
    if (rel && p.agama !== rel) return false;
    if (edu && p.pendidikan !== edu) return false;
    if (job && p.pekerjaan !== job) return false;
    if (dusun && p.dusun !== dusun) return false;
    if (rw && p.rw !== rw) return false;
    if (rt && p.rt !== rt) return false;

    if (ageGroup) {
      const age = calculateAge(p.tanggal_lahir);
      if (ageGroup === "balita" && age > 4) return false;
      if (ageGroup === "anak" && (age < 5 || age > 14)) return false;
      if (ageGroup === "remaja" && (age < 15 || age > 24)) return false;
      if (ageGroup === "produktif" && (age < 15 || age > 64)) return false;
      if (ageGroup === "lansia" && age < 60) return false;
    }

    if (q) {
      const hay = `${p.nik} ${p.nama_lengkap} ${p.no_kk}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sortBy === "nama_asc") return a.nama_lengkap.localeCompare(b.nama_lengkap);
    if (sortBy === "nama_desc") return b.nama_lengkap.localeCompare(a.nama_lengkap);
    if (sortBy === "nik_asc") return a.nik.localeCompare(b.nik);
    if (sortBy === "nik_desc") return b.nik.localeCompare(a.nik);
    return 0;
  });

  return filtered;
}

function resetPddPageAndRender() {
  APP_STATE.pddPage = 1;
  renderPendudukTable();
}

function changePddPage(delta) {
  const filtered = getFilteredPenduduk();
  const pageSize = parseInt(document.getElementById("pendudukPageSize").value, 10) || 15;
  const maxPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  APP_STATE.pddPage = Math.min(maxPage, Math.max(1, APP_STATE.pddPage + delta));
  renderPendudukTable();
}

function renderPendudukTable() {
  const filtered = getFilteredPenduduk();
  const pageSize = parseInt(document.getElementById("pendudukPageSize").value, 10) || 15;
  const maxPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (APP_STATE.pddPage > maxPage) APP_STATE.pddPage = maxPage;

  const start = (APP_STATE.pddPage - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);
  const canWrite = APP_STATE.user && ["Administrator", "Operator"].includes(APP_STATE.user.role);

  const tbody = document.getElementById("pendudukTableBody");
  if (slice.length === 0) {
    tbody.innerHTML = `<tr><td colspan="22" style="text-align:center; padding:24px; color:#64748b;">Tidak ada data penduduk yang sesuai kriteria.</td></tr>`;
  } else {
    tbody.innerHTML = slice.map((p, idx) => {
      const age = calculateAge(p.tanggal_lahir);
      const statusBadge = p.status_kependudukan === "AKTIF"
        ? `<span class="badge badge-aktif">AKTIF</span>`
        : p.status_kependudukan === "PINDAH"
          ? `<span class="badge badge-pindah">PINDAH</span>`
          : `<span class="badge badge-meninggal">MENINGGAL</span>`;

      return `
        <tr>
          <td>${start + idx + 1}</td>
          <td><strong>${escapeHtml(p.nik)}</strong></td>
          <td>${escapeHtml(p.no_kk || "-")}</td>
          <td><strong>${escapeHtml(p.nama_lengkap)}</strong></td>
          <td>${p.jenis_kelamin === "LAKI-LAKI" ? "L" : "P"}</td>
          <td>${escapeHtml(p.tempat_lahir)}</td>
          <td>${formatDateID(p.tanggal_lahir)}</td>
          <td>${age} Thn</td>
          <td>${escapeHtml(p.agama)}</td>
          <td>${escapeHtml(p.pendidikan)}</td>
          <td>${escapeHtml(p.pekerjaan)}</td>
          <td>${escapeHtml(p.status_perkawinan)}</td>
          <td>${escapeHtml(p.status_hubungan)}</td>
          <td>${escapeHtml(p.kewarganegaraan)}</td>
          <td>${escapeHtml(p.nama_ayah)}</td>
          <td>${escapeHtml(p.nama_ibu)}</td>
          <td>${escapeHtml(p.alamat)}</td>
          <td>${escapeHtml(p.rt)}</td>
          <td>${escapeHtml(p.rw)}</td>
          <td>${escapeHtml(p.dusun)}</td>
          <td>${statusBadge}</td>
          <td class="no-print">
            <button class="btn btn-outline btn-sm" title="Lihat Biodata Lengkap" onclick="openBiodataByNik('${p.nik}')">
              <i class="fa-solid fa-id-card"></i>
            </button>
            ${canWrite ? `
              <button class="btn btn-warning btn-sm" title="Edit Data" onclick="openPendudukModal('${p.id_penduduk}')">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn btn-danger btn-sm" title="Hapus Data" onclick="deletePenduduk('${p.id_penduduk}', '${escapeHtml(p.nama_lengkap)}')">
                <i class="fa-solid fa-trash"></i>
              </button>
            ` : ""}
          </td>
        </tr>
      `;
    }).join("");
  }

  document.getElementById("pendudukPaginationInfo").textContent =
    `Menampilkan ${filtered.length === 0 ? 0 : start + 1}–${Math.min(start + pageSize, filtered.length)} dari ${filtered.length} penduduk`;
  document.getElementById("pendudukPageIndicator").textContent = `Hal ${APP_STATE.pddPage} / ${maxPage}`;
}

function validateNikInput(input) {
  const val = input.value.replace(/\D/g, "");
  input.value = val;
  const msg = document.getElementById("nikValidationMsg");
  const editId = document.getElementById("pdd_id_penduduk").value;

  if (val.length !== 16) {
    msg.className = "form-error";
    msg.textContent = `NIK harus 16 digit (saat ini ${val.length} digit).`;
    return;
  }
  const dup = APP_STATE.penduduk.find(p => p.nik === val && p.id_penduduk !== editId);
  if (dup) {
    msg.className = "form-error";
    msg.textContent = `PERINGATAN: NIK sudah terdaftar atas nama ${dup.nama_lengkap}!`;
  } else {
    msg.className = "form-hint";
    msg.style.color = "#059669";
    msg.textContent = "NIK valid (16 digit) dan belum terdaftar ganda.";
  }
}

function openPendudukModal(idPenduduk = null) {
  const form = document.getElementById("formPenduduk");
  form.reset();
  document.getElementById("pdd_id_penduduk").value = "";
  document.getElementById("nikValidationMsg").className = "form-hint";
  document.getElementById("nikValidationMsg").textContent = "Wajib 16 digit angka.";

  if (idPenduduk) {
    const p = APP_STATE.penduduk.find(item => item.id_penduduk === idPenduduk);
    if (!p) return;
    document.getElementById("modalPendudukTitle").textContent = "Edit Data Penduduk: " + p.nama_lengkap;
    document.getElementById("pdd_id_penduduk").value = p.id_penduduk;
    document.getElementById("pdd_nik").value = p.nik;
    document.getElementById("pdd_no_kk").value = p.no_kk || "";
    document.getElementById("pdd_nama_lengkap").value = p.nama_lengkap;
    document.getElementById("pdd_jenis_kelamin").value = p.jenis_kelamin;
    document.getElementById("pdd_tempat_lahir").value = p.tempat_lahir;
    document.getElementById("pdd_tanggal_lahir").value = p.tanggal_lahir;
    document.getElementById("pdd_agama").value = p.agama;
    document.getElementById("pdd_pendidikan").value = p.pendidikan;
    document.getElementById("pdd_pekerjaan").value = p.pekerjaan;
    document.getElementById("pdd_golongan_darah").value = p.golongan_darah || "TIDAK TAHU";
    document.getElementById("pdd_status_perkawinan").value = p.status_perkawinan;
    document.getElementById("pdd_tanggal_perkawinan").value = p.tanggal_perkawinan || "";
    document.getElementById("pdd_status_hubungan").value = p.status_hubungan;
    document.getElementById("pdd_kewarganegaraan").value = p.kewarganegaraan || "WNI";
    document.getElementById("pdd_no_paspor").value = p.no_paspor || "-";
    document.getElementById("pdd_no_kitap").value = p.no_kitap || "-";
    document.getElementById("pdd_nama_ayah").value = p.nama_ayah || "";
    document.getElementById("pdd_nama_ibu").value = p.nama_ibu || "";
    document.getElementById("pdd_alamat").value = p.alamat || "";
    document.getElementById("pdd_rt").value = p.rt || "";
    document.getElementById("pdd_rw").value = p.rw || "";
    document.getElementById("pdd_dusun").value = p.dusun || "";
    document.getElementById("pdd_status_kependudukan").value = p.status_kependudukan || "AKTIF";
  } else {
    document.getElementById("modalPendudukTitle").textContent = "Tambah Data Penduduk Baru";
  }

  openModal("modalPenduduk");
}

async function handleSavePendudukSubmit(e) {
  e.preventDefault();
  const payload = {
    id_penduduk: document.getElementById("pdd_id_penduduk").value,
    nik: document.getElementById("pdd_nik").value.trim(),
    no_kk: document.getElementById("pdd_no_kk").value.trim(),
    nama_lengkap: document.getElementById("pdd_nama_lengkap").value.trim(),
    jenis_kelamin: document.getElementById("pdd_jenis_kelamin").value,
    tempat_lahir: document.getElementById("pdd_tempat_lahir").value.trim(),
    tanggal_lahir: document.getElementById("pdd_tanggal_lahir").value,
    agama: document.getElementById("pdd_agama").value,
    pendidikan: document.getElementById("pdd_pendidikan").value,
    pekerjaan: document.getElementById("pdd_pekerjaan").value,
    golongan_darah: document.getElementById("pdd_golongan_darah").value,
    status_perkawinan: document.getElementById("pdd_status_perkawinan").value,
    tanggal_perkawinan: document.getElementById("pdd_tanggal_perkawinan").value,
    status_hubungan: document.getElementById("pdd_status_hubungan").value,
    kewarganegaraan: document.getElementById("pdd_kewarganegaraan").value,
    no_paspor: document.getElementById("pdd_no_paspor").value,
    no_kitap: document.getElementById("pdd_no_kitap").value,
    nama_ayah: document.getElementById("pdd_nama_ayah").value.trim(),
    nama_ibu: document.getElementById("pdd_nama_ibu").value.trim(),
    alamat: document.getElementById("pdd_alamat").value.trim(),
    rt: document.getElementById("pdd_rt").value,
    rw: document.getElementById("pdd_rw").value,
    dusun: document.getElementById("pdd_dusun").value,
    status_kependudukan: document.getElementById("pdd_status_kependudukan").value
  };

  try {
    const res = await apiCall("savePenduduk", { data: payload }, true, "Menyimpan data penduduk ke Google Spreadsheet...");
    closeModal("modalPenduduk");
    showToast(res.message, "success");
    await syncAllData(false);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deletePenduduk(idPenduduk, nama) {
  if (!confirm(`Apakah Anda yakin ingin menghapus data penduduk "${nama}" dari Google Spreadsheet?`)) return;
  try {
    const res = await apiCall("deletePenduduk", { id_penduduk: idPenduduk }, true, "Menghapus data penduduk...");
    showToast(res.message, "success");
    await syncAllData(false);
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ==================== IMPORT & EXPORT EXCEL ====================
function downloadTemplateExcel() {
  const sample = [{
    nik: "3523010101900001",
    no_kk: "3523010101150001",
    nama_lengkap: "BUDI SANTOSO",
    jenis_kelamin: "LAKI-LAKI",
    tempat_lahir: "TUBAN",
    tanggal_lahir: "1990-01-01",
    agama: "ISLAM",
    pendidikan: "SLTA/SEDERAJAT",
    pekerjaan: "PETANI/PEKEBUN",
    golongan_darah: "O",
    status_perkawinan: "KAWIN TERCATAT",
    tanggal_perkawinan: "2015-05-10",
    status_hubungan: "KEPALA KELUARGA",
    kewarganegaraan: "WNI",
    no_paspor: "-",
    no_kitap: "-",
    nama_ayah: "SUPARMAN",
    nama_ibu: "SITI",
    alamat: "JL. RAYA DESA NO. 10",
    rt: "001",
    rw: "001",
    dusun: "DUSUN KRAJAN"
  }];
  const ws = XLSX.utils.json_to_sheet(sample);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "TEMPLATE_PENDUDUK");
  XLSX.writeFile(wb, "Template_Import_Penduduk_SIK_DESA.xlsx");
}

function handleExcelImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
      if (rows.length === 0) {
        showToast("File Excel kosong.", "warning");
        return;
      }
      const res = await apiCall("importPenduduk", { records: rows }, true, `Mengimpor ${rows.length} baris ke Google Spreadsheet...`);
      showToast(res.message, "success");
      await syncAllData(false);
    } catch (err) {
      showToast("Gagal import Excel: " + err.message, "error");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsArrayBuffer(file);
}

function exportPendudukExcel() {
  const data = getFilteredPenduduk().map((p, idx) => ({
    No: idx + 1,
    NIK: p.nik,
    "Nomor KK": p.no_kk,
    "Nama Lengkap": p.nama_lengkap,
    "Jenis Kelamin": p.jenis_kelamin,
    "Tempat Lahir": p.tempat_lahir,
    "Tanggal Lahir": p.tanggal_lahir,
    "Usia (Thn)": calculateAge(p.tanggal_lahir),
    Agama: p.agama,
    Pendidikan: p.pendidikan,
    Pekerjaan: p.pekerjaan,
    "Golongan Darah": p.golongan_darah,
    "Status Perkawinan": p.status_perkawinan,
    "Status Hubungan": p.status_hubungan,
    Kewarganegaraan: p.kewarganegaraan,
    "Nama Ayah": p.nama_ayah,
    "Nama Ibu": p.nama_ibu,
    Alamat: p.alamat,
    RT: p.rt,
    RW: p.rw,
    Dusun: p.dusun,
    Status: p.status_kependudukan
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "DATA_PENDUDUK");
  XLSX.writeFile(wb, `Data_Penduduk_${APP_STATE.pengaturan.nama_desa || "Desa"}.xlsx`);
}

// ==================== 3. BIODATA PENDUDUK ====================
function openBiodataByNik(nik) {
  APP_STATE.selectedBiodataNik = nik;
  switchView("biodata");
  renderBiodataDetail(nik);
}

function searchBiodataDropdown() {
  const q = document.getElementById("biodataSearchInput").value.trim().toLowerCase();
  const box = document.getElementById("biodataSearchResults");
  if (!q) {
    box.innerHTML = "";
    return;
  }
  const matches = APP_STATE.penduduk.filter(p =>
    p.nik.includes(q) || p.nama_lengkap.toLowerCase().includes(q)
  ).slice(0, 8);

  if (matches.length === 0) {
    box.innerHTML = `<div style="padding:8px; color:#64748b;">Tidak ditemukan penduduk dengan kata kunci tersebut.</div>`;
    return;
  }

  box.innerHTML = `
    <div style="display:flex; flex-wrap:wrap; gap:8px;">
      ${matches.map(m => `
        <button class="btn btn-outline btn-sm" onclick="renderBiodataDetail('${m.nik}')">
          <strong>${escapeHtml(m.nik)}</strong> — ${escapeHtml(m.nama_lengkap)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderBiodataDetail(nik) {
  APP_STATE.selectedBiodataNik = nik;
  const p = APP_STATE.penduduk.find(item => item.nik === nik);
  const container = document.getElementById("biodataDetailContainer");
  if (!p) {
    container.innerHTML = `<p style="color:#e11d48;">Data penduduk tidak ditemukan.</p>`;
    return;
  }

  const s = APP_STATE.pengaturan;
  const kk = APP_STATE.kk.find(k => k.no_kk === p.no_kk);
  const datang = APP_STATE.mutasiDatang.filter(m => m.nik === nik);
  const pindah = APP_STATE.mutasiPindah.filter(m => m.nik === nik);
  const meninggal = APP_STATE.mutasiMeninggal.filter(m => m.nik === nik);
  const canWrite = APP_STATE.user && ["Administrator", "Operator"].includes(APP_STATE.user.role);

  container.innerHTML = `
    <div class="toolbar no-print" style="margin-bottom:16px;">
      <div>
        <h3 style="color:#0f294a;">${escapeHtml(p.nama_lengkap)}</h3>
        <span style="color:#64748b; font-size:13px;">NIK: ${escapeHtml(p.nik)} | Status: <strong>${escapeHtml(p.status_kependudukan)}</strong></span>
      </div>
      <div class="toolbar-group">
        ${canWrite ? `<button class="btn btn-warning btn-sm" onclick="openPendudukModal('${p.id_penduduk}')"><i class="fa-solid fa-pen"></i> Edit Biodata</button>` : ""}
        ${p.no_kk ? `<button class="btn btn-primary btn-sm" onclick="openKKDetailModal('${p.no_kk}')"><i class="fa-solid fa-address-book"></i> Lihat Kartu Keluarga</button>` : ""}
        <button class="btn btn-outline btn-sm" onclick="window.print()"><i class="fa-solid fa-print"></i> Cetak Biodata</button>
      </div>
    </div>

    <div class="biodata-section-title">A. IDENTITAS PRIBADI</div>
    <table class="biodata-table">
      <tr><td>NIK</td><td>: <strong>${escapeHtml(p.nik)}</strong></td></tr>
      <tr><td>Nama Lengkap</td><td>: <strong>${escapeHtml(p.nama_lengkap)}</strong></td></tr>
      <tr><td>Jenis Kelamin</td><td>: ${escapeHtml(p.jenis_kelamin)}</td></tr>
      <tr><td>Tempat / Tanggal Lahir</td><td>: ${escapeHtml(p.tempat_lahir)}, ${formatDateLongID(p.tanggal_lahir)}</td></tr>
      <tr><td>Usia</td><td>: ${calculateAge(p.tanggal_lahir)} Tahun</td></tr>
      <tr><td>Agama</td><td>: ${escapeHtml(p.agama)}</td></tr>
      <tr><td>Pendidikan Terakhir</td><td>: ${escapeHtml(p.pendidikan)}</td></tr>
      <tr><td>Jenis Pekerjaan</td><td>: ${escapeHtml(p.pekerjaan)}</td></tr>
      <tr><td>Golongan Darah</td><td>: ${escapeHtml(p.golongan_darah || "-")}</td></tr>
      <tr><td>Status Perkawinan</td><td>: ${escapeHtml(p.status_perkawinan)}</td></tr>
      <tr><td>Kewarganegaraan</td><td>: ${escapeHtml(p.kewarganegaraan || "WNI")}</td></tr>
    </table>

    <div class="biodata-section-title">B. DATA KELUARGA</div>
    <table class="biodata-table">
      <tr><td>Nomor Kartu Keluarga (KK)</td><td>: <strong>${escapeHtml(p.no_kk || "-")}</strong></td></tr>
      <tr><td>Status Hubungan Dalam Keluarga</td><td>: ${escapeHtml(p.status_hubungan)}</td></tr>
      <tr><td>Nama Kepala Keluarga</td><td>: ${escapeHtml(kk ? kk.nama_kepala_keluarga : "-")}</td></tr>
      <tr><td>Nama Ayah Kandung</td><td>: ${escapeHtml(p.nama_ayah || "-")}</td></tr>
      <tr><td>Nama Ibu Kandung</td><td>: ${escapeHtml(p.nama_ibu || "-")}</td></tr>
    </table>

    <div class="biodata-section-title">C. ALAMAT DOMISILI</div>
    <table class="biodata-table">
      <tr><td>Alamat Lengkap</td><td>: ${escapeHtml(p.alamat || "-")}</td></tr>
      <tr><td>RT / RW</td><td>: ${escapeHtml(p.rt || "-")} / ${escapeHtml(p.rw || "-")}</td></tr>
      <tr><td>Dusun</td><td>: ${escapeHtml(p.dusun || "-")}</td></tr>
      <tr><td>Desa / Kelurahan</td><td>: ${escapeHtml(s.nama_desa || "-")}</td></tr>
      <tr><td>Kecamatan</td><td>: ${escapeHtml(s.kecamatan || "-")}</td></tr>
      <tr><td>Kabupaten / Kota</td><td>: ${escapeHtml(s.kabupaten || "-")}</td></tr>
      <tr><td>Provinsi</td><td>: ${escapeHtml(s.provinsi || "-")}</td></tr>
      <tr><td>Kode Pos</td><td>: ${escapeHtml(s.kode_pos || "-")}</td></tr>
    </table>

    <div class="biodata-section-title">D. RIWAYAT KEPENDUDUKAN</div>
    <table class="biodata-table">
      <tr><td>Riwayat Kelahiran</td><td>: Lahir di ${escapeHtml(p.tempat_lahir)} pada tanggal ${formatDateLongID(p.tanggal_lahir)}</td></tr>
      <tr><td>Riwayat Kedatangan</td><td>: ${datang.length ? datang.map(d => `Datang pada ${formatDateID(d.tanggal_datang)} dari ${escapeHtml(d.alamat_asal)} (${escapeHtml(d.no_transaksi)})`).join("; ") : "Penduduk asli / tidak ada catatan mutasi datang"}</td></tr>
      <tr><td>Riwayat Perpindahan</td><td>: ${pindah.length ? pindah.map(m => `Pindah pada ${formatDateID(m.tanggal_pindah)} ke ${escapeHtml(m.alamat_tujuan)} (${escapeHtml(m.no_transaksi)})`).join("; ") : "Tidak ada catatan mutasi pindah"}</td></tr>
      <tr><td>Riwayat Perubahan Data</td><td>: Terdaftar sejak ${escapeHtml(p.created_at || "-")} | Pembaruan terakhir: ${escapeHtml(p.updated_at || "-")}</td></tr>
      <tr><td>Riwayat Kematian</td><td>: ${meninggal.length ? meninggal.map(m => `Meninggal pada ${formatDateID(m.tanggal_meninggal)} di ${escapeHtml(m.tempat_meninggal)} (${escapeHtml(m.no_surat_kematian)})`).join("; ") : "Masih Hidup / Aktif"}</td></tr>
    </table>
  `;
}

// ==================== 4. KARTU KELUARGA & DESAIN CETAK ====================
function renderKKTable() {
  const q = document.getElementById("filterKKSearch").value.trim().toLowerCase();
  const canWrite = APP_STATE.user && ["Administrator", "Operator"].includes(APP_STATE.user.role);

  const filtered = APP_STATE.kk.filter(k => {
    if (!q) return true;
    return `${k.no_kk} ${k.nama_kepala_keluarga} ${k.dusun}`.toLowerCase().includes(q);
  });

  const tbody = document.getElementById("kkTableBody");
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:#64748b;">Tidak ada data Kartu Keluarga.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((k, idx) => {
    const anggotaCount = APP_STATE.penduduk.filter(p => p.no_kk === k.no_kk && p.status_kependudukan === "AKTIF").length;
    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${escapeHtml(k.no_kk)}</strong></td>
        <td>${escapeHtml(k.nik_kepala_keluarga || "-")}</td>
        <td><strong>${escapeHtml(k.nama_kepala_keluarga)}</strong></td>
        <td>${escapeHtml(k.alamat)}</td>
        <td>${escapeHtml(k.rt)} / ${escapeHtml(k.rw)}</td>
        <td>${escapeHtml(k.dusun)}</td>
        <td><span class="badge badge-aktif">${anggotaCount} Jiwa</span></td>
        <td class="no-print">
          <button class="btn btn-primary btn-sm" onclick="openKKDetailModal('${k.no_kk}')">
            <i class="fa-solid fa-eye"></i> Anggota &amp; Cetak KK
          </button>
          ${canWrite ? `
            <button class="btn btn-warning btn-sm" onclick="openKKModal('${k.id_kk}')">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteKK('${k.no_kk}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : ""}
        </td>
      </tr>
    `;
  }).join("");
}

function openKKModal(idKK = null) {
  const form = document.getElementById("formKK");
  form.reset();
  document.getElementById("kk_id_kk").value = "";

  // Isi dropdown calon kepala keluarga
  const selKepala = document.getElementById("kk_nik_kepala");
  selKepala.innerHTML = `<option value="">-- Pilih Penduduk (Opsional) --</option>` +
    APP_STATE.penduduk.filter(p => p.status_kependudukan === "AKTIF").map(p =>
      `<option value="${p.nik}" data-nama="${escapeHtml(p.nama_lengkap)}">${p.nik} - ${escapeHtml(p.nama_lengkap)}</option>`
    ).join("");

  if (idKK) {
    const k = APP_STATE.kk.find(item => item.id_kk === idKK);
    if (!k) return;
    document.getElementById("modalKKTitle").textContent = "Edit Kartu Keluarga: " + k.no_kk;
    document.getElementById("kk_id_kk").value = k.id_kk;
    document.getElementById("kk_no_kk").value = k.no_kk;
    document.getElementById("kk_nik_kepala").value = k.nik_kepala_keluarga || "";
    document.getElementById("kk_nama_kepala").value = k.nama_kepala_keluarga;
    document.getElementById("kk_tanggal_dikeluarkan").value = k.tanggal_dikeluarkan || "";
    document.getElementById("kk_alamat").value = k.alamat || "";
    document.getElementById("kk_rt").value = k.rt || "";
    document.getElementById("kk_rw").value = k.rw || "";
    document.getElementById("kk_dusun").value = k.dusun || "";
    document.getElementById("kk_kode_pos").value = k.kode_pos || APP_STATE.pengaturan.kode_pos || "";
  } else {
    document.getElementById("modalKKTitle").textContent = "Tambah Kartu Keluarga Baru";
    document.getElementById("kk_kode_pos").value = APP_STATE.pengaturan.kode_pos || "";
    document.getElementById("kk_tanggal_dikeluarkan").value = new Date().toISOString().split("T")[0];
  }
  openModal("modalKK");
}

function autoFillKepalaNama() {
  const sel = document.getElementById("kk_nik_kepala");
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.nama) {
    document.getElementById("kk_nama_kepala").value = opt.dataset.nama;
  }
}

async function handleSaveKKSubmit(e) {
  e.preventDefault();
  const payload = {
    id_kk: document.getElementById("kk_id_kk").value,
    no_kk: document.getElementById("kk_no_kk").value.trim(),
    nik_kepala_keluarga: document.getElementById("kk_nik_kepala").value,
    nama_kepala_keluarga: document.getElementById("kk_nama_kepala").value.trim(),
    tanggal_dikeluarkan: document.getElementById("kk_tanggal_dikeluarkan").value,
    alamat: document.getElementById("kk_alamat").value.trim(),
    rt: document.getElementById("kk_rt").value,
    rw: document.getElementById("kk_rw").value,
    dusun: document.getElementById("kk_dusun").value,
    kode_pos: document.getElementById("kk_kode_pos").value.trim()
  };

  try {
    const res = await apiCall("saveKK", { data: payload }, true, "Menyimpan Kartu Keluarga...");
    closeModal("modalKK");
    showToast(res.message, "success");
    await syncAllData(false);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteKK(noKK) {
  if (!confirm(`Hapus induk Kartu Keluarga No. ${noKK}?`)) return;
  try {
    const res = await apiCall("deleteKK", { no_kk: noKK }, true, "Menghapus Kartu Keluarga...");
    showToast(res.message, "success");
    await syncAllData(false);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function openKKDetailModal(noKK) {
  const kk = APP_STATE.kk.find(k => k.no_kk === noKK);
  if (!kk) {
    showToast("Data Kartu Keluarga tidak ditemukan.", "error");
    return;
  }

  const s = APP_STATE.pengaturan;
  const canWrite = APP_STATE.user && ["Administrator", "Operator"].includes(APP_STATE.user.role);

  // Urutkan anggota berdasarkan hierarki SHDK standar KK
  const shdkOrder = {
    "KEPALA KELUARGA": 1, "SUAMI": 2, "ISTRI": 3, "ANAK": 4,
    "MENANTU": 5, "CUCU": 6, "ORANG TUA": 7, "MERTUA": 8,
    "FAMILI LAIN": 9, "PEMBANTU": 10, "LAINNYA": 11
  };

  const members = APP_STATE.penduduk
    .filter(p => p.no_kk === noKK && p.status_kependudukan === "AKTIF")
    .sort((a, b) => (shdkOrder[a.status_hubungan] || 99) - (shdkOrder[b.status_hubungan] || 99));

  const otherKKs = APP_STATE.kk.filter(k => k.no_kk !== noKK);
  const availablePenduduk = APP_STATE.penduduk.filter(p => p.status_kependudukan === "AKTIF" && p.no_kk !== noKK);
  const shdkOptions = getRefValues("STATUS_HUBUNGAN");

  // Buat minimal 10 baris pada tabel cetak KK agar proporsional seperti blangko asli
  const totalRows = Math.max(10, members.length);
  let table1Rows = "";
  let table2Rows = "";

  for (let i = 0; i < totalRows; i++) {
    const m = members[i];
    if (m) {
      table1Rows += `
        <tr>
          <td class="center">${i + 1}</td>
          <td>${escapeHtml(m.nama_lengkap)}</td>
          <td class="center">${escapeHtml(m.nik)}</td>
          <td class="center">${escapeHtml(m.jenis_kelamin)}</td>
          <td>${escapeHtml(m.tempat_lahir)}</td>
          <td class="center">${formatDateID(m.tanggal_lahir)}</td>
          <td class="center">${escapeHtml(m.agama)}</td>
          <td>${escapeHtml(m.pendidikan)}</td>
          <td>${escapeHtml(m.pekerjaan)}</td>
          <td class="center">${escapeHtml(m.golongan_darah || "-")}</td>
        </tr>
      `;
      table2Rows += `
        <tr>
          <td class="center">${i + 1}</td>
          <td class="center">${escapeHtml(m.status_perkawinan)}</td>
          <td class="center">${formatDateID(m.tanggal_perkawinan)}</td>
          <td class="center">${escapeHtml(m.status_hubungan)}</td>
          <td class="center">${escapeHtml(m.kewarganegaraan || "WNI")}</td>
          <td class="center">${escapeHtml(m.no_paspor || "-")}</td>
          <td class="center">${escapeHtml(m.no_kitap || "-")}</td>
          <td>${escapeHtml(m.nama_ayah || "-")}</td>
          <td>${escapeHtml(m.nama_ibu || "-")}</td>
        </tr>
      `;
    } else {
      table1Rows += `<tr><td class="center">${i + 1}</td><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
      table2Rows += `<tr><td class="center">${i + 1}</td><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
    }
  }

  const body = document.getElementById("modalKKDetailBody");
  body.innerHTML = `
    ${canWrite ? `
      <div class="card no-print" style="background:#f8fafc; margin-bottom:18px;">
        <div class="card-body" style="padding:14px;">
          <h4 style="margin-bottom:10px; color:#0f294a;">Kelola Anggota Kartu Keluarga (${escapeHtml(noKK)})</h4>
          <div class="form-grid" style="align-items:end;">
            <div>
              <label>Pilih Penduduk</label>
              <select id="addAnggotaNik" class="form-control">
                <option value="">-- Pilih Penduduk --</option>
                ${availablePenduduk.map(p => `<option value="${p.nik}">${p.nik} - ${escapeHtml(p.nama_lengkap)}</option>`).join("")}
              </select>
            </div>
            <div>
              <label>Status Hubungan Dalam Keluarga</label>
              <select id="addAnggotaShdk" class="form-control">
                ${shdkOptions.map(v => `<option value="${v}">${v}</option>`).join("")}
              </select>
            </div>
            <div>
              <button class="btn btn-success" onclick="addAnggotaToKK('${noKK}')">
                <i class="fa-solid fa-user-plus"></i> Tambahkan ke KK
              </button>
            </div>
          </div>

          <div class="table-responsive" style="margin-top:12px;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>NIK</th>
                  <th>Nama Lengkap</th>
                  <th>Status Hubungan</th>
                  <th>Pindah ke KK Lain</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${members.map(m => `
                  <tr>
                    <td>${escapeHtml(m.nik)}</td>
                    <td><strong>${escapeHtml(m.nama_lengkap)}</strong></td>
                    <td>${escapeHtml(m.status_hubungan)}</td>
                    <td>
                      <div style="display:flex; gap:6px;">
                        <select id="moveTarget_${m.nik}" class="form-control" style="padding:4px 8px; font-size:12px;">
                          <option value="">-- Pilih KK Tujuan --</option>
                          ${otherKKs.map(ok => `<option value="${ok.no_kk}">${ok.no_kk} (${escapeHtml(ok.nama_kepala_keluarga)})</option>`).join("")}
                        </select>
                        <button class="btn btn-outline btn-sm" onclick="moveAnggotaKK('${m.nik}', '${noKK}')">Pindah</button>
                      </div>
                    </td>
                    <td>
                      <button class="btn btn-danger btn-sm" onclick="removeAnggotaFromKK('${noKK}', '${m.nik}')">
                        Keluarkan
                      </button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    ` : ""}

    <!-- PRATINJAU DOKUMEN CETAK KARTU KELUARGA (A4 LANDSCAPE) -->
    <div id="kkPrintableArea" class="kk-print-wrapper">
      <div class="kk-document">
        <div class="kk-header-grid">
          <div class="kk-garuda-box">
            <svg viewBox="0 0 100 100" fill="none" stroke="#000000" stroke-width="2">
              <circle cx="50" cy="48" r="36" />
              <path d="M22 45 C30 22, 70 22, 78 45 C70 68, 30 68, 22 45 Z" />
              <polygon points="50,28 63,36 63,56 50,66 37,56 37,36" fill="#ffffff" stroke="#000000" stroke-width="2"/>
              <line x1="50" y1="28" x2="50" y2="66" />
              <line x1="37" y1="46" x2="63" y2="46" />
            </svg>
            <span>REPUBLIK INDONESIA</span>
          </div>
          <div class="kk-title-box">
            <h1>KARTU KELUARGA</h1>
            <div class="kk-number">No. ${escapeHtml(kk.no_kk)}</div>
          </div>
          <div class="kk-disclaimer-tag">
            DOKUMEN ADMINISTRASI INTERNAL DESA<br/>
            (Bukan Pengganti Dokumen Resmi Disdukcapil)
          </div>
        </div>

        <div class="kk-meta-grid">
          <table class="kk-meta-table">
            <tr><td class="label">Nama Kepala Keluarga</td><td class="colon">:</td><td><strong>${escapeHtml(kk.nama_kepala_keluarga)}</strong></td></tr>
            <tr><td class="label">Alamat</td><td class="colon">:</td><td>${escapeHtml(kk.alamat || "-")}</td></tr>
            <tr><td class="label">RT / RW</td><td class="colon">:</td><td>${escapeHtml(kk.rt || "-")} / ${escapeHtml(kk.rw || "-")}</td></tr>
            <tr><td class="label">Kode Pos</td><td class="colon">:</td><td>${escapeHtml(kk.kode_pos || s.kode_pos || "-")}</td></tr>
          </table>
          <table class="kk-meta-table">
            <tr><td class="label">Desa / Kelurahan</td><td class="colon">:</td><td>${escapeHtml(s.nama_desa || "-")}</td></tr>
            <tr><td class="label">Kecamatan</td><td class="colon">:</td><td>${escapeHtml(s.kecamatan || "-")}</td></tr>
            <tr><td class="label">Kabupaten / Kota</td><td class="colon">:</td><td>${escapeHtml(s.kabupaten || "-")}</td></tr>
            <tr><td class="label">Provinsi</td><td class="colon">:</td><td>${escapeHtml(s.provinsi || "-")}</td></tr>
          </table>
        </div>

        <!-- TABEL PERTAMA: DATA ANGGOTA KELUARGA -->
        <table class="kk-table">
          <thead>
            <tr>
              <th style="width:24px;">No</th>
              <th>Nama Lengkap</th>
              <th style="width:112px;">NIK</th>
              <th style="width:76px;">Jenis Kelamin</th>
              <th style="width:92px;">Tempat Lahir</th>
              <th style="width:72px;">Tanggal Lahir</th>
              <th style="width:65px;">Agama</th>
              <th>Pendidikan</th>
              <th>Jenis Pekerjaan</th>
              <th style="width:52px;">Gol. Darah</th>
            </tr>
            <tr class="col-num">
              <th>(1)</th><th>(2)</th><th>(3)</th><th>(4)</th><th>(5)</th>
              <th>(6)</th><th>(7)</th><th>(8)</th><th>(9)</th><th>(10)</th>
            </tr>
          </thead>
          <tbody>${table1Rows}</tbody>
        </table>

        <!-- TABEL KEDUA: DATA STATUS DAN HUBUNGAN KELUARGA -->
        <table class="kk-table">
          <thead>
            <tr>
              <th rowspan="2" style="width:24px;">No</th>
              <th rowspan="2" style="width:105px;">Status Perkawinan</th>
              <th rowspan="2" style="width:78px;">Tanggal Perkawinan</th>
              <th rowspan="2" style="width:115px;">Status Hubungan Dalam Keluarga</th>
              <th rowspan="2" style="width:72px;">Kewarganegaraan</th>
              <th colspan="2">Dokumen Imigrasi</th>
              <th colspan="2">Nama Orang Tua</th>
            </tr>
            <tr>
              <th style="width:78px;">No. Paspor</th>
              <th style="width:78px;">No. KITAP</th>
              <th>Ayah</th>
              <th>Ibu</th>
            </tr>
            <tr class="col-num">
              <th></th><th>(11)</th><th>(12)</th><th>(13)</th><th>(14)</th>
              <th>(15)</th><th>(16)</th><th>(17)</th><th>(18)</th>
            </tr>
          </thead>
          <tbody>${table2Rows}</tbody>
        </table>

        <!-- BAGIAN BAWAH KARTU KELUARGA -->
        <div class="kk-footer-grid">
          <div>
            Dikeluarkan Tanggal : <strong>${formatDateID(kk.tanggal_dikeluarkan)}</strong><br/>
            <span style="font-size:8.5px;">Catatan: Salinan data registrasi administrasi kependudukan tingkat Pemerintah Desa.</span>
          </div>
          <div class="kk-sign-box">
            KEPALA KELUARGA
            <div class="kk-sign-space"></div>
            <strong><u>${escapeHtml(kk.nama_kepala_keluarga)}</u></strong><br/>
            Tanda Tangan / Cap Jempol
          </div>
          <div class="kk-sign-box">
            ${escapeHtml(s.jabatan_penandatangan || "KEPALA DESA")}<br/>
            <div class="kk-sign-space"></div>
            <strong><u>${escapeHtml(s.nama_kepala_desa || "-")}</u></strong><br/>
            ${s.nip_kepala_desa && s.nip_kepala_desa !== "-" ? "NIP. " + escapeHtml(s.nip_kepala_desa) : ""}
          </div>
        </div>
      </div>
    </div>
  `;

  openModal("modalKKDetail");
}

function printKKDocument() {
  const content = document.getElementById("kkPrintableArea").innerHTML;
  const win = window.open("", "_blank");
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Cetak Kartu Keluarga - SIK-DESA</title>
      <link rel="stylesheet" href="style.css" />
      <style>
        @page { size: A4 landscape; margin: 8mm; }
        body { background: #fff; margin: 0; padding: 0; }
        .kk-print-wrapper { border: none; padding: 0; }
      </style>
    </head>
    <body onload="window.print(); window.close();">
      ${content}
    </body>
    </html>
  `);
  win.document.close();
}

async function addAnggotaToKK(noKK) {
  const nik = document.getElementById("addAnggotaNik").value;
  const statusHubungan = document.getElementById("addAnggotaShdk").value;
  if (!nik) {
    showToast("Pilih penduduk terlebih dahulu.", "warning");
    return;
  }
  try {
    const res = await apiCall("addAnggotaKK", {
      data: { no_kk: noKK, nik: nik, status_hubungan: statusHubungan }
    }, true, "Menambahkan anggota keluarga...");
    showToast(res.message, "success");
    await syncAllData(false);
    openKKDetailModal(noKK);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function removeAnggotaFromKK(noKK, nik) {
  if (!confirm("Keluarkan anggota ini dari Kartu Keluarga?")) return;
  try {
    const res = await apiCall("removeAnggotaKK", { no_kk: noKK, nik: nik }, true, "Memperbarui anggota KK...");
    showToast(res.message, "success");
    await syncAllData(false);
    openKKDetailModal(noKK);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function moveAnggotaKK(nik, fromNoKK) {
  const toNoKK = document.getElementById("moveTarget_" + nik).value;
  if (!toNoKK) {
    showToast("Pilih Kartu Keluarga tujuan terlebih dahulu.", "warning");
    return;
  }
  try {
    const res = await apiCall("moveAnggotaKK", {
      data: { nik, from_no_kk: fromNoKK, to_no_kk: toNoKK, status_hubungan: "FAMILI LAIN" }
    }, true, "Memindahkan anggota ke KK tujuan...");
    showToast(res.message, "success");
    await syncAllData(false);
    openKKDetailModal(fromNoKK);
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ==================== 5. MUTASI PENDUDUK ====================
function renderMutasiDatangTable() {
  const canWrite = APP_STATE.user && ["Administrator", "Operator"].includes(APP_STATE.user.role);
  const tbody = document.getElementById("mutasiDatangBody");
  if (APP_STATE.mutasiDatang.length === 0) {
    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:20px;">Belum ada riwayat penduduk datang.</td></tr>`;
    return;
  }
  tbody.innerHTML = APP_STATE.mutasiDatang.map(m => `
    <tr>
      <td><strong>${escapeHtml(m.no_transaksi)}</strong></td>
      <td>${escapeHtml(m.tanggal_pencatatan)}</td>
      <td>${escapeHtml(m.nik)}</td>
      <td><strong>${escapeHtml(m.nama_lengkap)}</strong></td>
      <td>${escapeHtml(m.tempat_lahir)}, ${formatDateID(m.tanggal_lahir)}</td>
      <td>${escapeHtml(m.jenis_kelamin)}</td>
      <td>${escapeHtml(m.alamat_asal)}</td>
      <td>${escapeHtml(m.alamat_tujuan)}</td>
      <td>RT ${escapeHtml(m.rt)}/RW ${escapeHtml(m.rw)} - ${escapeHtml(m.dusun)}</td>
      <td>${formatDateID(m.tanggal_datang)}</td>
      <td>${escapeHtml(m.no_surat_pindah || "-")}</td>
      <td>${m.status_verifikasi === "TERVERIFIKASI"
        ? `<span class="badge badge-aktif">TERVERIFIKASI</span>`
        : `<span class="badge badge-pending">MENUNGGU</span>`}</td>
      <td class="no-print">
        ${canWrite && m.status_verifikasi !== "TERVERIFIKASI"
          ? `<button class="btn btn-success btn-sm" onclick="verifikasiMutasi('verifikasiMutasiDatang', '${m.no_transaksi}')">Verifikasi</button>`
          : "-"}
      </td>
    </tr>
  `).join("");
}

function openMutasiDatangModal() {
  document.getElementById("formMutasiDatang").reset();
  document.getElementById("md_tanggal_datang").value = new Date().toISOString().split("T")[0];
  openModal("modalMutasiDatang");
}

async function handleSaveMutasiDatangSubmit(e) {
  e.preventDefault();
  const payload = {
    nik: document.getElementById("md_nik").value.trim(),
    no_kk: document.getElementById("md_no_kk").value.trim(),
    nama_lengkap: document.getElementById("md_nama").value.trim(),
    jenis_kelamin: document.getElementById("md_jk").value,
    tempat_lahir: document.getElementById("md_tempat_lahir").value.trim(),
    tanggal_lahir: document.getElementById("md_tanggal_lahir").value,
    alamat_asal: document.getElementById("md_alamat_asal").value.trim(),
    alamat_tujuan: document.getElementById("md_alamat_tujuan").value.trim(),
    rt: document.getElementById("md_rt").value,
    rw: document.getElementById("md_rw").value,
    dusun: document.getElementById("md_dusun").value,
    tanggal_datang: document.getElementById("md_tanggal_datang").value,
    no_surat_pindah: document.getElementById("md_no_surat").value.trim(),
    keterangan: document.getElementById("md_keterangan").value.trim(),
    auto_verifikasi: document.getElementById("md_auto_verifikasi").checked
  };
  try {
    const res = await apiCall("saveMutasiDatang", { data: payload }, true, "Menyimpan mutasi penduduk datang...");
    closeModal("modalMutasiDatang");
    showToast(res.message, "success");
    await syncAllData(false);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderMutasiPindahTable() {
  const canWrite = APP_STATE.user && ["Administrator", "Operator"].includes(APP_STATE.user.role);
  const tbody = document.getElementById("mutasiPindahBody");
  if (APP_STATE.mutasiPindah.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:20px;">Belum ada riwayat penduduk pindah.</td></tr>`;
    return;
  }
  tbody.innerHTML = APP_STATE.mutasiPindah.map(m => `
    <tr>
      <td><strong>${escapeHtml(m.no_transaksi)}</strong></td>
      <td>${escapeHtml(m.tanggal_pencatatan)}</td>
      <td>${escapeHtml(m.nik)}</td>
      <td><strong>${escapeHtml(m.nama_lengkap)}</strong></td>
      <td>${escapeHtml(m.no_kk)}</td>
      <td>${escapeHtml(m.alamat_asal)}</td>
      <td>${escapeHtml(m.alamat_tujuan)}, Desa ${escapeHtml(m.desa_tujuan)}, Kec. ${escapeHtml(m.kecamatan_tujuan)}, ${escapeHtml(m.kabupaten_tujuan)}</td>
      <td>${formatDateID(m.tanggal_pindah)}</td>
      <td>${escapeHtml(m.alasan_pindah)}</td>
      <td>${m.status_verifikasi === "TERVERIFIKASI"
        ? `<span class="badge badge-pindah">DISAHKAN</span>`
        : `<span class="badge badge-pending">MENUNGGU</span>`}</td>
      <td class="no-print">
        ${canWrite && m.status_verifikasi !== "TERVERIFIKASI"
          ? `<button class="btn btn-success btn-sm" onclick="verifikasiMutasi('verifikasiMutasiPindah', '${m.no_transaksi}')">Sahkan</button>`
          : "-"}
      </td>
    </tr>
  `).join("");
}

function openMutasiPindahModal() {
  document.getElementById("formMutasiPindah").reset();
  const sel = document.getElementById("mp_select_penduduk");
  sel.innerHTML = `<option value="">-- Pilih Penduduk Aktif --</option>` +
    APP_STATE.penduduk.filter(p => p.status_kependudukan === "AKTIF").map(p =>
      `<option value="${p.nik}">${p.nik} - ${escapeHtml(p.nama_lengkap)}</option>`
    ).join("");
  document.getElementById("mp_tanggal_pindah").value = new Date().toISOString().split("T")[0];
  openModal("modalMutasiPindah");
}

function fillMutasiPindahFromPenduduk() {
  const nik = document.getElementById("mp_select_penduduk").value;
  const p = APP_STATE.penduduk.find(item => item.nik === nik);
  if (!p) return;
  document.getElementById("mp_nik").value = p.nik;
  document.getElementById("mp_no_kk").value = p.no_kk || "";
  document.getElementById("mp_alamat_asal").value = `${p.alamat || ""} RT ${p.rt}/RW ${p.rw} ${p.dusun || ""}`;
}

async function handleSaveMutasiPindahSubmit(e) {
  e.preventDefault();
  const nik = document.getElementById("mp_nik").value;
  const p = APP_STATE.penduduk.find(item => item.nik === nik);
  if (!p) return;

  const payload = {
    nik: p.nik,
    nama_lengkap: p.nama_lengkap,
    no_kk: p.no_kk,
    alamat_asal: document.getElementById("mp_alamat_asal").value,
    alamat_tujuan: document.getElementById("mp_alamat_tujuan").value,
    desa_tujuan: document.getElementById("mp_desa_tujuan").value,
    kecamatan_tujuan: document.getElementById("mp_kecamatan_tujuan").value,
    kabupaten_tujuan: document.getElementById("mp_kabupaten_tujuan").value,
    provinsi_tujuan: document.getElementById("mp_provinsi_tujuan").value,
    tanggal_pindah: document.getElementById("mp_tanggal_pindah").value,
    alasan_pindah: document.getElementById("mp_alasan").value,
    keterangan: document.getElementById("mp_keterangan").value,
    auto_verifikasi: document.getElementById("mp_auto_verifikasi").checked
  };
  try {
    const res = await apiCall("saveMutasiPindah", { data: payload }, true, "Menyimpan transaksi pindah...");
    closeModal("modalMutasiPindah");
    showToast(res.message, "success");
    await syncAllData(false);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderMutasiMeninggalTable() {
  const canWrite = APP_STATE.user && ["Administrator", "Operator"].includes(APP_STATE.user.role);
  const tbody = document.getElementById("mutasiMeninggalBody");
  if (APP_STATE.mutasiMeninggal.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:20px;">Belum ada laporan kematian tercatat.</td></tr>`;
    return;
  }
  tbody.innerHTML = APP_STATE.mutasiMeninggal.map(m => `
    <tr>
      <td><strong>${escapeHtml(m.no_transaksi)}</strong></td>
      <td>${escapeHtml(m.tanggal_pencatatan)}</td>
      <td>${escapeHtml(m.nik)}</td>
      <td><strong>${escapeHtml(m.nama_lengkap)}</strong></td>
      <td>${escapeHtml(m.no_kk)}</td>
      <td>${formatDateID(m.tanggal_meninggal)}</td>
      <td>${escapeHtml(m.tempat_meninggal)}</td>
      <td>${escapeHtml(m.penyebab_meninggal)}</td>
      <td>${escapeHtml(m.no_surat_kematian || "-")}</td>
      <td>${m.status_verifikasi === "TERVERIFIKASI"
        ? `<span class="badge badge-meninggal">TERVERIFIKASI</span>`
        : `<span class="badge badge-pending">MENUNGGU</span>`}</td>
      <td class="no-print">
        ${canWrite && m.status_verifikasi !== "TERVERIFIKASI"
          ? `<button class="btn btn-success btn-sm" onclick="verifikasiMutasi('verifikasiMutasiMeninggal', '${m.no_transaksi}')">Verifikasi</button>`
          : "-"}
      </td>
    </tr>
  `).join("");
}

function openMutasiMeninggalModal() {
  document.getElementById("formMutasiMeninggal").reset();
  const sel = document.getElementById("mm_select_penduduk");
  sel.innerHTML = `<option value="">-- Pilih Penduduk --</option>` +
    APP_STATE.penduduk.filter(p => p.status_kependudukan === "AKTIF").map(p =>
      `<option value="${p.nik}">${p.nik} - ${escapeHtml(p.nama_lengkap)}</option>`
    ).join("");
  document.getElementById("mm_tanggal_meninggal").value = new Date().toISOString().split("T")[0];
  openModal("modalMutasiMeninggal");
}

function fillMutasiMeninggalFromPenduduk() {
  const nik = document.getElementById("mm_select_penduduk").value;
  const p = APP_STATE.penduduk.find(item => item.nik === nik);
  if (!p) return;
  document.getElementById("mm_nik").value = p.nik;
  document.getElementById("mm_no_kk").value = p.no_kk || "";
  document.getElementById("mm_ttl").value = `${p.tempat_lahir}, ${formatDateID(p.tanggal_lahir)}`;
  document.getElementById("mm_jk").value = p.jenis_kelamin;
}

async function handleSaveMutasiMeninggalSubmit(e) {
  e.preventDefault();
  const nik = document.getElementById("mm_nik").value;
  const p = APP_STATE.penduduk.find(item => item.nik === nik);
  if (!p) return;

  const payload = {
    nik: p.nik,
    nama_lengkap: p.nama_lengkap,
    no_kk: p.no_kk,
    tempat_lahir: p.tempat_lahir,
    tanggal_lahir: p.tanggal_lahir,
    jenis_kelamin: p.jenis_kelamin,
    tanggal_meninggal: document.getElementById("mm_tanggal_meninggal").value,
    tempat_meninggal: document.getElementById("mm_tempat_meninggal").value,
    penyebab_meninggal: document.getElementById("mm_penyebab").value,
    no_surat_kematian: document.getElementById("mm_no_surat").value,
    keterangan: document.getElementById("mm_keterangan").value,
    auto_verifikasi: document.getElementById("mm_auto_verifikasi").checked
  };
  try {
    const res = await apiCall("saveMutasiMeninggal", { data: payload }, true, "Menyimpan laporan kematian...");
    closeModal("modalMutasiMeninggal");
    showToast(res.message, "success");
    await syncAllData(false);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function verifikasiMutasi(actionName, noTransaksi) {
  if (!confirm(`Verifikasi & sahkan transaksi ${noTransaksi}? Status kependudukan akan diperbarui otomatis.`)) return;
  try {
    const res = await apiCall(actionName, { no_transaksi: noTransaksi }, true, "Memverifikasi transaksi mutasi...");
    showToast(res.message, "success");
    await syncAllData(false);
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ==================== 6. REKAPITULASI PENDUDUK ====================
function buildRekapTableHtml(title, rows, totalAll) {
  return `
    <div style="margin-bottom:24px;">
      <h4 style="color:#0f294a; margin-bottom:8px; border-left:4px solid #1e4d85; padding-left:10px;">${title}</h4>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:50px;">No</th>
              <th>Kategori / Uraian</th>
              <th style="width:120px;">Laki-Laki</th>
              <th style="width:120px;">Perempuan</th>
              <th style="width:120px;">Jumlah Total</th>
              <th style="width:110px;">Persentase</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${escapeHtml(r.label)}</td>
                <td>${r.l}</td>
                <td>${r.p}</td>
                <td><strong>${r.total}</strong></td>
                <td>${totalAll > 0 ? ((r.total / totalAll) * 100).toFixed(2) : "0.00"}%</td>
              </tr>
            `).join("")}
            <tr style="background:#f1f5f9; font-weight:700;">
              <td colspan="2">JUMLAH KESELURUHAN</td>
              <td>${rows.reduce((s, x) => s + x.l, 0)}</td>
              <td>${rows.reduce((s, x) => s + x.p, 0)}</td>
              <td>${totalAll}</td>
              <td>100.00%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function groupByField(list, fieldGetter, predefinedKeys = null) {
  const map = {};
  if (predefinedKeys) {
    predefinedKeys.forEach(k => { map[k] = { label: k, l: 0, p: 0, total: 0 }; });
  }
  list.forEach(item => {
    const key = fieldGetter(item) || "LAINNYA";
    if (!map[key]) map[key] = { label: key, l: 0, p: 0, total: 0 };
    if (item.jenis_kelamin === "LAKI-LAKI") map[key].l++;
    else map[key].p++;
    map[key].total++;
  });
  return Object.values(map);
}

function renderRekapitulasi() {
  const fTahun = document.getElementById("rekapFilterTahun").value;
  const fDusun = document.getElementById("rekapFilterDusun").value;
  const fRW = document.getElementById("rekapFilterRW").value;
  const fRT = document.getElementById("rekapFilterRT").value;

  const list = APP_STATE.penduduk.filter(p => {
    if (p.status_kependudukan !== "AKTIF") return false;
    if (fDusun && p.dusun !== fDusun) return false;
    if (fRW && p.rw !== fRW) return false;
    if (fRT && p.rt !== fRT) return false;
    if (fTahun && p.created_at && !String(p.created_at).startsWith(fTahun)) {
      // Tetap tampilkan penduduk yang lahir/terdaftar sampai tahun filter
      const birthYr = String(p.tanggal_lahir || "").slice(0, 4);
      if (birthYr && birthYr > fTahun) return false;
    }
    return true;
  });

  const total = list.length;

  // A. Jenis Kelamin
  const rekapJK = groupByField(list, p => p.jenis_kelamin, ["LAKI-LAKI", "PEREMPUAN"]);

  // B. Kelompok Usia 5 tahunan
  const ageBrackets = [
    "0–4 tahun", "5–9 tahun", "10–14 tahun", "15–19 tahun",
    "20–24 tahun", "25–29 tahun", "30–34 tahun", "35–39 tahun",
    "40–44 tahun", "45–49 tahun", "50–54 tahun", "55–59 tahun",
    "60–64 tahun", "65–69 tahun", "70–74 tahun", "75 tahun ke atas"
  ];
  const rekapUsia = groupByField(list, p => {
    const u = calculateAge(p.tanggal_lahir);
    if (u >= 75) return "75 tahun ke atas";
    const idx = Math.floor(u / 5);
    return ageBrackets[idx] || "75 tahun ke atas";
  }, ageBrackets);

  // Kategori Usia Khusus
  const catKeys = ["Balita (0-4 Thn)", "Anak-anak (5-11 Thn)", "Remaja (12-24 Thn)", "Usia Produktif (15-64 Thn)", "Lansia (60+ Thn)"];
  const catMap = {};
  catKeys.forEach(k => { catMap[k] = { label: k, l: 0, p: 0, total: 0 }; });
  list.forEach(p => {
    const u = calculateAge(p.tanggal_lahir);
    const isL = p.jenis_kelamin === "LAKI-LAKI";
    const add = (k) => { if (isL) catMap[k].l++; else catMap[k].p++; catMap[k].total++; };
    if (u <= 4) add("Balita (0-4 Thn)");
    if (u >= 5 && u <= 11) add("Anak-anak (5-11 Thn)");
    if (u >= 12 && u <= 24) add("Remaja (12-24 Thn)");
    if (u >= 15 && u <= 64) add("Usia Produktif (15-64 Thn)");
    if (u >= 60) add("Lansia (60+ Thn)");
  });

  // C. Pendidikan
  const rekapEdu = groupByField(list, p => p.pendidikan, getRefValues("PENDIDIKAN"));

  // D. Pekerjaan
  const rekapJob = groupByField(list, p => p.pekerjaan, getRefValues("PEKERJAAN"));

  // E. Agama
  const rekapRel = groupByField(list, p => p.agama, getRefValues("AGAMA"));

  // F. Status Perkawinan
  const rekapMar = groupByField(list, p => p.status_perkawinan, getRefValues("STATUS_PERKAWINAN"));

  // G. Wilayah (Dusun & RT/RW)
  const rekapDusun = groupByField(list, p => p.dusun || "BELUM DIATUR");
  const rekapRTRW = groupByField(list, p => `Dusun ${p.dusun || "-"} — RW ${p.rw || "-"}/RT ${p.rt || "-"}`);

  document.getElementById("rekapitulasiContent").innerHTML =
    buildRekapTableHtml("A. Rekapitulasi Berdasarkan Jenis Kelamin", rekapJK, total) +
    buildRekapTableHtml("B1. Rekapitulasi Berdasarkan Kelompok Usia (Interval 5 Tahun)", rekapUsia, total) +
    `
      <div style="margin-bottom:24px;">
        <h4 style="color:#0f294a; margin-bottom:8px; border-left:4px solid #1e4d85; padding-left:10px;">B2. Rekapitulasi Kategori Usia Strategis (Catatan: Usia Produktif &amp; Lansia dapat beririsan pada usia 60–64)</h4>
        <div class="table-responsive">
          <table class="data-table">
            <thead><tr><th>No</th><th>Kategori Usia</th><th>Laki-Laki</th><th>Perempuan</th><th>Jumlah</th><th>% dari Total Penduduk</th></tr></thead>
            <tbody>
              ${Object.values(catMap).map((r, i) => `
                <tr><td>${i + 1}</td><td>${r.label}</td><td>${r.l}</td><td>${r.p}</td><td><strong>${r.total}</strong></td><td>${total ? ((r.total / total) * 100).toFixed(2) : "0.00"}%</td></tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    ` +
    buildRekapTableHtml("C. Rekapitulasi Berdasarkan Pendidikan", rekapEdu, total) +
    buildRekapTableHtml("D. Rekapitulasi Berdasarkan Pekerjaan", rekapJob, total) +
    buildRekapTableHtml("E. Rekapitulasi Berdasarkan Agama", rekapRel, total) +
    buildRekapTableHtml("F. Rekapitulasi Berdasarkan Status Perkawinan", rekapMar, total) +
    buildRekapTableHtml("G1. Rekapitulasi Berdasarkan Dusun", rekapDusun, total) +
    buildRekapTableHtml("G2. Rekapitulasi Berdasarkan Wilayah RT / RW", rekapRTRW, total);
}

// ==================== 7. LAPORAN RESMI KEPENDUDUKAN ====================
function renderLaporanResmi() {
  const jenis = document.getElementById("laporanJenisSelect").value;
  const bulan = document.getElementById("laporanBulanSelect").value;
  const tahun = document.getElementById("laporanTahunSelect").value || String(new Date().getFullYear());
  const s = APP_STATE.pengaturan;
  const aktif = APP_STATE.penduduk.filter(p => p.status_kependudukan === "AKTIF");

  const titles = {
    "1": "LAPORAN JUMLAH PENDUDUK KESELURUHAN",
    "2": "LAPORAN PENDUDUK BERDASARKAN JENIS KELAMIN",
    "3": "LAPORAN PENDUDUK BERDASARKAN KELOMPOK USIA",
    "4": "LAPORAN PENDUDUK BERDASARKAN PENDIDIKAN",
    "5": "LAPORAN PENDUDUK BERDASARKAN PEKERJAAN",
    "6": "LAPORAN PENDUDUK BERDASARKAN AGAMA",
    "7": "LAPORAN PENDUDUK BERDASARKAN STATUS PERKAWINAN",
    "8": "LAPORAN JUMLAH KARTU KELUARGA (KK)",
    "9": "LAPORAN ANGGOTA KELUARGA PER KARTU KELUARGA",
    "10": "LAPORAN PENDUDUK BERDASARKAN DUSUN",
    "11": "LAPORAN PENDUDUK BERDASARKAN RT / RW",
    "12": "LAPORAN MUTASI PENDUDUK DATANG",
    "13": "LAPORAN MUTASI PENDUDUK PINDAH",
    "14": "LAPORAN MUTASI PENDUDUK MENINGGAL DUNIA",
    "15": "LAPORAN PERKEMBANGAN PENDUDUK BULANAN",
    "16": "LAPORAN PERKEMBANGAN PENDUDUK TAHUNAN"
  };

  let tableHtml = "";
  if (jenis === "1") {
    tableHtml = `
      <table class="kk-table" style="font-size:11px;">
        <thead><tr><th>No</th><th>NIK</th><th>No. KK</th><th>Nama Lengkap</th><th>L/P</th><th>TTL</th><th>Usia</th><th>Alamat</th><th>RT/RW</th><th>Dusun</th></tr></thead>
        <tbody>
          ${aktif.map((p, i) => `
            <tr>
              <td class="center">${i + 1}</td><td>${p.nik}</td><td>${p.no_kk}</td><td>${escapeHtml(p.nama_lengkap)}</td>
              <td class="center">${p.jenis_kelamin === "LAKI-LAKI" ? "L" : "P"}</td>
              <td>${escapeHtml(p.tempat_lahir)}, ${formatDateID(p.tanggal_lahir)}</td>
              <td class="center">${calculateAge(p.tanggal_lahir)}</td>
              <td>${escapeHtml(p.alamat)}</td><td class="center">${p.rt}/${p.rw}</td><td>${escapeHtml(p.dusun)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } else if (["2", "3", "4", "5", "6", "7", "10", "11"].includes(jenis)) {
    let rows = [];
    if (jenis === "2") rows = groupByField(aktif, p => p.jenis_kelamin, ["LAKI-LAKI", "PEREMPUAN"]);
    if (jenis === "3") rows = groupByField(aktif, p => {
      const u = calculateAge(p.tanggal_lahir);
      if (u <= 4) return "0–4 Tahun (Balita)";
      if (u <= 14) return "5–14 Tahun (Anak)";
      if (u <= 24) return "15–24 Tahun (Remaja)";
      if (u <= 59) return "25–59 Tahun (Dewasa/Produktif)";
      return "60+ Tahun (Lansia)";
    });
    if (jenis === "4") rows = groupByField(aktif, p => p.pendidikan);
    if (jenis === "5") rows = groupByField(aktif, p => p.pekerjaan);
    if (jenis === "6") rows = groupByField(aktif, p => p.agama);
    if (jenis === "7") rows = groupByField(aktif, p => p.status_perkawinan);
    if (jenis === "10") rows = groupByField(aktif, p => p.dusun);
    if (jenis === "11") rows = groupByField(aktif, p => `Dusun ${p.dusun} — RW ${p.rw} / RT ${p.rt}`);

    tableHtml = `
      <table class="kk-table" style="font-size:11.5px;">
        <thead><tr><th style="width:45px;">No</th><th>Uraian / Kategori</th><th>Laki-Laki</th><th>Perempuan</th><th>Jumlah Total</th><th>Persentase</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr>
              <td class="center">${i + 1}</td><td>${escapeHtml(r.label)}</td>
              <td class="center">${r.l}</td><td class="center">${r.p}</td>
              <td class="center"><strong>${r.total}</strong></td>
              <td class="center">${aktif.length ? ((r.total / aktif.length) * 100).toFixed(2) : "0.00"}%</td>
            </tr>
          `).join("")}
          <tr style="font-weight:bold; background:#f1f5f9;">
            <td colspan="2" class="center">TOTAL KESELURUHAN</td>
            <td class="center">${rows.reduce((a, b) => a + b.l, 0)}</td>
            <td class="center">${rows.reduce((a, b) => a + b.p, 0)}</td>
            <td class="center">${aktif.length}</td>
            <td class="center">100.00%</td>
          </tr>
        </tbody>
      </table>
    `;
  } else if (jenis === "8" || jenis === "9") {
    tableHtml = `
      <table class="kk-table" style="font-size:11px;">
        <thead><tr><th>No</th><th>Nomor KK</th><th>Nama Kepala Keluarga</th><th>Alamat</th><th>RT/RW</th><th>Dusun</th><th>Jumlah Anggota</th>${jenis === "9" ? "<th>Daftar Anggota Keluarga</th>" : ""}</tr></thead>
        <tbody>
          ${APP_STATE.kk.map((k, i) => {
            const mems = aktif.filter(p => p.no_kk === k.no_kk);
            return `
              <tr>
                <td class="center">${i + 1}</td><td class="center">${k.no_kk}</td><td>${escapeHtml(k.nama_kepala_keluarga)}</td>
                <td>${escapeHtml(k.alamat)}</td><td class="center">${k.rt}/${k.rw}</td><td>${escapeHtml(k.dusun)}</td>
                <td class="center">${mems.length}</td>
                ${jenis === "9" ? `<td>${mems.map(m => `${escapeHtml(m.nama_lengkap)} (${escapeHtml(m.status_hubungan)})`).join(", ")}</td>` : ""}
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  } else if (jenis === "12") {
    const data = APP_STATE.mutasiDatang.filter(m => !tahun || String(m.tanggal_datang || "").startsWith(tahun));
    tableHtml = `
      <table class="kk-table" style="font-size:11px;">
        <thead><tr><th>No</th><th>No. Transaksi</th><th>NIK</th><th>Nama Lengkap</th><th>L/P</th><th>Alamat Asal</th><th>Alamat Tujuan</th><th>Tgl Datang</th><th>No. Surat</th></tr></thead>
        <tbody>
          ${data.map((m, i) => `
            <tr><td class="center">${i + 1}</td><td>${m.no_transaksi}</td><td>${m.nik}</td><td>${escapeHtml(m.nama_lengkap)}</td><td class="center">${m.jenis_kelamin}</td><td>${escapeHtml(m.alamat_asal)}</td><td>${escapeHtml(m.alamat_tujuan)}</td><td class="center">${formatDateID(m.tanggal_datang)}</td><td>${escapeHtml(m.no_surat_pindah)}</td></tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } else if (jenis === "13") {
    const data = APP_STATE.mutasiPindah.filter(m => !tahun || String(m.tanggal_pindah || "").startsWith(tahun));
    tableHtml = `
      <table class="kk-table" style="font-size:11px;">
        <thead><tr><th>No</th><th>No. Transaksi</th><th>NIK</th><th>Nama Lengkap</th><th>No. KK</th><th>Alamat Tujuan</th><th>Tgl Pindah</th><th>Alasan</th></tr></thead>
        <tbody>
          ${data.map((m, i) => `
            <tr><td class="center">${i + 1}</td><td>${m.no_transaksi}</td><td>${m.nik}</td><td>${escapeHtml(m.nama_lengkap)}</td><td>${m.no_kk}</td><td>${escapeHtml(m.alamat_tujuan)}, ${escapeHtml(m.kabupaten_tujuan)}</td><td class="center">${formatDateID(m.tanggal_pindah)}</td><td>${escapeHtml(m.alasan_pindah)}</td></tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } else if (jenis === "14") {
    const data = APP_STATE.mutasiMeninggal.filter(m => !tahun || String(m.tanggal_meninggal || "").startsWith(tahun));
    tableHtml = `
      <table class="kk-table" style="font-size:11px;">
        <thead><tr><th>No</th><th>No. Transaksi</th><th>NIK</th><th>Nama Lengkap</th><th>Tgl Meninggal</th><th>Tempat Meninggal</th><th>Penyebab</th><th>No. Surat Kematian</th></tr></thead>
        <tbody>
          ${data.map((m, i) => `
            <tr><td class="center">${i + 1}</td><td>${m.no_transaksi}</td><td>${m.nik}</td><td>${escapeHtml(m.nama_lengkap)}</td><td class="center">${formatDateID(m.tanggal_meninggal)}</td><td>${escapeHtml(m.tempat_meninggal)}</td><td>${escapeHtml(m.penyebab_meninggal)}</td><td>${escapeHtml(m.no_surat_kematian)}</td></tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } else if (jenis === "15" || jenis === "16") {
    const prefix = bulan ? `${tahun}-${bulan}` : tahun;
    const dCount = APP_STATE.mutasiDatang.filter(m => String(m.tanggal_datang || "").startsWith(prefix)).length;
    const pCount = APP_STATE.mutasiPindah.filter(m => String(m.tanggal_pindah || "").startsWith(prefix)).length;
    const mCount = APP_STATE.mutasiMeninggal.filter(m => String(m.tanggal_meninggal || "").startsWith(prefix)).length;
    const lCount = aktif.filter(p => String(p.tanggal_lahir || "").startsWith(prefix)).length;

    tableHtml = `
      <table class="kk-table" style="font-size:12px;">
        <thead><tr><th>No</th><th>Komponen Perkembangan Penduduk</th><th>Jumlah (Jiwa)</th><th>Keterangan</th></tr></thead>
        <tbody>
          <tr><td class="center">1</td><td>Jumlah Penduduk Aktif Saat Ini</td><td class="center"><strong>${aktif.length}</strong></td><td>Laki-laki: ${aktif.filter(p => p.jenis_kelamin === "LAKI-LAKI").length}, Perempuan: ${aktif.filter(p => p.jenis_kelamin === "PEREMPUAN").length}</td></tr>
          <tr><td class="center">2</td><td>Jumlah Kepala Keluarga (KK)</td><td class="center"><strong>${APP_STATE.kk.length}</strong></td><td>Kartu Keluarga aktif terdaftar</td></tr>
          <tr><td class="center">3</td><td>Kelahiran Tercatat Periode ${prefix}</td><td class="center">${lCount}</td><td>Berdasarkan tanggal lahir penduduk</td></tr>
          <tr><td class="center">4</td><td>Penduduk Datang Periode ${prefix}</td><td class="center">${dCount}</td><td>Mutasi masuk desa</td></tr>
          <tr><td class="center">5</td><td>Penduduk Pindah Periode ${prefix}</td><td class="center">${pCount}</td><td>Mutasi keluar desa</td></tr>
          <tr><td class="center">6</td><td>Penduduk Meninggal Periode ${prefix}</td><td class="center">${mCount}</td><td>Arsip kematian</td></tr>
        </tbody>
      </table>
    `;
  }

  const todayStr = formatDateLongID(new Date().toISOString().split("T")[0]);
  document.getElementById("laporanResmiPreview").innerHTML = `
    <div style="text-align:center; border-bottom:3px double #000; padding-bottom:10px; margin-bottom:16px;">
      <div style="font-size:14px; font-weight:bold;">PEMERINTAH ${escapeHtml(s.kabupaten || "KABUPATEN")}</div>
      <div style="font-size:14px; font-weight:bold;">KECAMATAN ${escapeHtml(s.kecamatan || "KECAMATAN")}</div>
      <div style="font-size:17px; font-weight:bold;">PEMERINTAH DESA ${escapeHtml(s.nama_desa || "DESA")}</div>
      <div style="font-size:11px;">Alamat: ${escapeHtml(s.alamat_kantor || "-")} Kode Pos ${escapeHtml(s.kode_pos || "-")}</div>
    </div>

    <div style="text-align:center; margin-bottom:14px;">
      <div style="font-size:15px; font-weight:bold; text-decoration:underline;">${titles[jenis]}</div>
      <div style="font-size:12px;">Periode Laporan: ${bulan ? "Bulan " + bulan + " " : ""}Tahun ${tahun}</div>
    </div>

    ${tableHtml}

    <div style="display:flex; justify-content:space-between; margin-top:28px; font-size:12px;">
      <div style="text-align:center; width:260px;">
        Mengetahui,<br/>
        Sekretaris Desa ${escapeHtml(s.nama_desa || "")}
        <div style="height:60px;"></div>
        <strong><u>${escapeHtml(s.nama_sekretaris_desa || "....................")}</u></strong>
      </div>
      <div style="text-align:center; width:280px;">
        ${escapeHtml(s.nama_desa || "Desa")}, ${todayStr}<br/>
        ${escapeHtml(s.jabatan_penandatangan || "KEPALA DESA")}
        <div style="height:60px;"></div>
        <strong><u>${escapeHtml(s.nama_kepala_desa || "....................")}</u></strong><br/>
        ${s.nip_kepala_desa && s.nip_kepala_desa !== "-" ? "NIP. " + escapeHtml(s.nip_kepala_desa) : ""}
      </div>
    </div>
  `;
}

function exportLaporanExcel() {
  const table = document.querySelector("#laporanResmiPreview table");
  if (!table) {
    showToast("Tidak ada tabel laporan untuk diekspor.", "warning");
    return;
  }
  const wb = XLSX.utils.table_to_book(table, { sheet: "LAPORAN_DESA" });
  XLSX.writeFile(wb, `Laporan_Kependudukan_${APP_STATE.pengaturan.nama_desa || "Desa"}.xlsx`);
}

// ==================== 8. PENGATURAN & REFERENSI ====================
async function handleSavePengaturanSubmit(e) {
  e.preventDefault();
  const keys = [
    "nama_desa", "kecamatan", "kabupaten", "provinsi", "kode_pos",
    "tahun_laporan", "alamat_kantor", "nama_kepala_desa", "nip_kepala_desa",
    "jabatan_penandatangan", "nama_sekretaris_desa", "nama_kasi_pemerintahan", "logo_desa"
  ];
  const payload = {};
  keys.forEach(k => {
    payload[k] = document.getElementById("set_" + k).value.trim();
  });

  try {
    const res = await apiCall("savePengaturan", { data: payload }, true, "Menyimpan pengaturan desa...");
    showToast(res.message, "success");
    await syncAllData(false);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderReferensiTable() {
  const kat = document.getElementById("refKategoriSelect").value;
  const rows = APP_STATE.referensi.filter(r => r.kategori === kat);
  const tbody = document.getElementById("referensiTableBody");
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.kategori)}</td>
      <td>${escapeHtml(r.kode)}</td>
      <td><strong>${escapeHtml(r.nilai)}</strong></td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteReferensi('${r.kategori}', '${escapeHtml(r.nilai)}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join("");
}

async function handleAddReferensi() {
  const kategori = document.getElementById("refKategoriSelect").value;
  const nilai = document.getElementById("refNilaiInput").value.trim();
  if (!nilai) {
    showToast("Isi nilai referensi terlebih dahulu.", "warning");
    return;
  }
  try {
    const res = await apiCall("saveReferensi", { data: { kategori, nilai } }, true, "Menyimpan referensi...");
    document.getElementById("refNilaiInput").value = "";
    showToast(res.message, "success");
    await syncAllData(false);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteReferensi(kategori, nilai) {
  if (!confirm(`Hapus referensi "${nilai}" dari kategori ${kategori}?`)) return;
  try {
    const res = await apiCall("deleteReferensi", { kategori, nilai }, true, "Menghapus referensi...");
    showToast(res.message, "success");
    await syncAllData(false);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function triggerDatabaseBackup() {
  if (!confirm("Buat salinan backup lengkap Google Spreadsheet database ke Google Drive Anda sekarang?")) return;
  try {
    const res = await apiCall("backupDatabase", {}, true, "Membuat salinan backup database di Google Drive...");
    showToast(`${res.message} (${res.backupName})`, "success");
    await syncAllData(false);
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ==================== 9. MANAJEMEN PENGGUNA & LOGS ====================
function renderUsersTable() {
  const tbody = document.getElementById("usersTableBody");
  tbody.innerHTML = APP_STATE.pengguna.map(u => `
    <tr>
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td>${escapeHtml(u.nama_lengkap)}</td>
      <td>${escapeHtml(u.jabatan)}</td>
      <td><span class="badge badge-pending">${escapeHtml(u.role)}</span></td>
      <td><span class="badge ${u.status === "AKTIF" ? "badge-aktif" : "badge-meninggal"}">${escapeHtml(u.status)}</span></td>
      <td>${escapeHtml(u.last_login || "-")}</td>
      <td>
        <button class="btn btn-warning btn-sm" onclick="openUserModal('${u.id_user}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id_user}', '${escapeHtml(u.username)}')"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join("");
}

function openUserModal(idUser = null) {
  document.getElementById("formUser").reset();
  document.getElementById("usr_id_user").value = "";
  if (idUser) {
    const u = APP_STATE.pengguna.find(item => item.id_user === idUser);
    if (!u) return;
    document.getElementById("modalUserTitle").textContent = "Edit Pengguna: " + u.username;
    document.getElementById("usr_id_user").value = u.id_user;
    document.getElementById("usr_username").value = u.username;
    document.getElementById("usr_nama_lengkap").value = u.nama_lengkap;
    document.getElementById("usr_jabatan").value = u.jabatan;
    document.getElementById("usr_role").value = u.role;
    document.getElementById("usr_status").value = u.status;
  } else {
    document.getElementById("modalUserTitle").textContent = "Tambah Pengguna Baru";
  }
  openModal("modalUser");
}

async function handleSaveUserSubmit(e) {
  e.preventDefault();
  const payload = {
    id_user: document.getElementById("usr_id_user").value,
    username: document.getElementById("usr_username").value.trim(),
    nama_lengkap: document.getElementById("usr_nama_lengkap").value.trim(),
    jabatan: document.getElementById("usr_jabatan").value.trim(),
    role: document.getElementById("usr_role").value,
    status: document.getElementById("usr_status").value,
    password: document.getElementById("usr_password").value
  };
  try {
    const res = await apiCall("saveUser", { data: payload }, true, "Menyimpan data pengguna...");
    closeModal("modalUser");
    showToast(res.message, "success");
    await syncAllData(false);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteUser(idUser, username) {
  if (!confirm(`Hapus akun pengguna "${username}"?`)) return;
  try {
    const res = await apiCall("deleteUser", { id_user: idUser }, true, "Menghapus akun...");
    showToast(res.message, "success");
    await syncAllData(false);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderLogsTable() {
  const tbody = document.getElementById("logsTableBody");
  tbody.innerHTML = APP_STATE.logs.map(l => `
    <tr>
      <td>${escapeHtml(l.waktu)}</td>
      <td><strong>${escapeHtml(l.username)}</strong></td>
      <td>${escapeHtml(l.nama_user)}</td>
      <td>${escapeHtml(l.role)}</td>
      <td><span class="badge badge-pending">${escapeHtml(l.aksi)}</span></td>
      <td>${escapeHtml(l.modul)}</td>
      <td>${escapeHtml(l.detail)}</td>
    </tr>
  `).join("");
}

// ==================== UTILITAS MODAL & PRINT ====================
function openModal(id) {
  document.getElementById(id).classList.add("open");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

function printTableSection(elementId, title) {
  const html = document.getElementById(elementId).innerHTML;
  const s = APP_STATE.pengaturan;
  const win = window.open("", "_blank");
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        body { font-family: Arial, sans-serif; font-size: 10px; color: #000; }
        h2, p { margin: 2px 0; text-align: center; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #000; padding: 4px; text-align: left; }
        th { background: #f1f5f9; }
        .no-print { display: none !important; }
      </style>
    </head>
    <body onload="window.print(); window.close();">
      <h2>PEMERINTAH DESA ${escapeHtml(s.nama_desa || "")}</h2>
      <p>KECAMATAN ${escapeHtml(s.kecamatan || "")} - ${escapeHtml(s.kabupaten || "")}</p>
      <h3 style="text-align:center; margin-top:10px;">${title}</h3>
      ${html}
    </body>
    </html>
  `);
  win.document.close();
}
