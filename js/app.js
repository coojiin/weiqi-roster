/**
 * Password-gated Taiwan Weiqi roster query (client-side decrypt + search).
 */

const PAGE_SIZE = 50;
const ENC_URL = "data/roster.enc.json";
const RANK_ORDER = [
  "初段",
  "二段",
  "三段",
  "四段",
  "五段",
  "六段",
  "七段",
  "甲組",
  "乙組",
  "丙組",
  "丁組",
];

/** @type {Array<{name:string,birth_year:number,rank_label:string}>|null} */
let roster = null;
let filtered = [];
let page = 1;
/** @type {Set<string>} */
const selectedRanks = new Set();

const $ = (id) => document.getElementById(id);

const loginView = $("login-view");
const searchView = $("search-view");
const loginForm = $("login-form");
const passwordInput = $("password-input");
const loginError = $("login-error");
const loginBtn = $("login-btn");
const lockBtn = $("lock-btn");
const nameInput = $("name-input");
const yearMin = $("year-min");
const yearMax = $("year-max");
const rankChips = $("rank-chips");
const clearRanks = $("clear-ranks");
const matchCount = $("match-count");
const resultsBody = $("results-body");
const pagination = $("pagination");

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password, salt, iterations) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function decryptRoster(password, packageObj) {
  const salt = b64ToBytes(packageObj.salt);
  const iv = b64ToBytes(packageObj.iv);
  const ciphertext = b64ToBytes(packageObj.ciphertext);
  const key = await deriveKey(password, salt, packageObj.iterations);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  const text = new TextDecoder().decode(plainBuf);
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("invalid payload");
  return data;
}

function showError(msg) {
  loginError.textContent = msg;
  loginError.hidden = !msg;
}

function unlockUI() {
  loginView.hidden = true;
  searchView.hidden = false;
  document.body.classList.add("unlocked");
  passwordInput.value = "";
  showError("");
  nameInput.focus();
  applyFilters();
}

function lockUI() {
  roster = null;
  filtered = [];
  page = 1;
  selectedRanks.clear();
  nameInput.value = "";
  yearMin.value = "";
  yearMax.value = "";
  document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
  resultsBody.innerHTML = '<tr class="empty-row"><td colspan="3">尚無結果</td></tr>';
  matchCount.textContent = "請開始搜尋";
  pagination.hidden = true;
  pagination.innerHTML = "";
  searchView.hidden = true;
  loginView.hidden = false;
  document.body.classList.remove("unlocked");
  passwordInput.focus();
}

function buildRankChips() {
  rankChips.innerHTML = "";
  for (const label of RANK_ORDER) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = label;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => {
      const on = btn.getAttribute("aria-pressed") === "true";
      if (on) {
        selectedRanks.delete(label);
        btn.setAttribute("aria-pressed", "false");
      } else {
        selectedRanks.add(label);
        btn.setAttribute("aria-pressed", "true");
      }
      page = 1;
      applyFilters();
    });
    rankChips.appendChild(btn);
  }
}

function normalizeName(s) {
  return String(s || "").toLowerCase();
}

function applyFilters() {
  if (!roster) return;

  const q = normalizeName(nameInput.value.trim());
  const minY = yearMin.value === "" ? null : Number(yearMin.value);
  const maxY = yearMax.value === "" ? null : Number(yearMax.value);
  const ranks = selectedRanks;

  filtered = roster.filter((row) => {
    if (q && !normalizeName(row.name).includes(q)) return false;
    if (ranks.size > 0 && !ranks.has(row.rank_label)) return false;
    const y = Number(row.birth_year);
    if (minY != null && !Number.isNaN(minY) && y < minY) return false;
    if (maxY != null && !Number.isNaN(maxY) && y > maxY) return false;
    return true;
  });

  const hasQuery = q || ranks.size > 0 || minY != null || maxY != null;
  if (!hasQuery) {
    // Show all when unlocked with no filters (still paginated)
    filtered = roster.slice();
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages) page = totalPages;

  matchCount.textContent =
    total === 0
      ? "沒有符合的結果"
      : `共 ${total.toLocaleString("zh-TW")} 筆${totalPages > 1 ? ` · 第 ${page} / ${totalPages} 頁` : ""}`;

  renderPage();
  renderPagination(totalPages);
}

function renderPage() {
  const start = (page - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  if (slice.length === 0) {
    resultsBody.innerHTML = '<tr class="empty-row"><td colspan="3">尚無結果</td></tr>';
    return;
  }

  const frag = document.createDocumentFragment();
  for (const row of slice) {
    const tr = document.createElement("tr");
    const nameTd = document.createElement("td");
    nameTd.textContent = row.name;

    const yearTd = document.createElement("td");
    if (Number(row.birth_year) === 1900) {
      yearTd.textContent = "1900（未知）";
      yearTd.className = "birth-unknown";
    } else {
      yearTd.textContent = String(row.birth_year);
    }

    const rankTd = document.createElement("td");
    rankTd.textContent = row.rank_label;

    tr.append(nameTd, yearTd, rankTd);
    frag.appendChild(tr);
  }
  resultsBody.replaceChildren(frag);
}

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    pagination.hidden = true;
    pagination.innerHTML = "";
    return;
  }
  pagination.hidden = false;
  pagination.innerHTML = "";

  const addBtn = (label, target, opts = {}) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "page-btn";
    b.textContent = label;
    if (opts.current) b.setAttribute("aria-current", "page");
    if (opts.disabled) b.disabled = true;
    else {
      b.addEventListener("click", () => {
        page = target;
        applyFilters();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
    pagination.appendChild(b);
  };

  addBtn("上一頁", page - 1, { disabled: page <= 1 });

  const windowSize = 5;
  let from = Math.max(1, page - Math.floor(windowSize / 2));
  let to = Math.min(totalPages, from + windowSize - 1);
  from = Math.max(1, to - windowSize + 1);

  if (from > 1) {
    addBtn("1", 1);
    if (from > 2) {
      const dots = document.createElement("span");
      dots.textContent = "…";
      dots.style.padding = "0 0.25rem";
      dots.style.color = "var(--muted)";
      pagination.appendChild(dots);
    }
  }
  for (let i = from; i <= to; i++) {
    addBtn(String(i), i, { current: i === page });
  }
  if (to < totalPages) {
    if (to < totalPages - 1) {
      const dots = document.createElement("span");
      dots.textContent = "…";
      dots.style.padding = "0 0.25rem";
      dots.style.color = "var(--muted)";
      pagination.appendChild(dots);
    }
    addBtn(String(totalPages), totalPages);
  }

  addBtn("下一頁", page + 1, { disabled: page >= totalPages });
}

let debounceTimer = null;
function scheduleFilter() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    page = 1;
    applyFilters();
  }, 120);
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = passwordInput.value;
  if (!password) return;

  showError("");
  loginBtn.disabled = true;
  loginBtn.textContent = "解密中…";

  try {
    const res = await fetch(ENC_URL, { cache: "force-cache" });
    if (!res.ok) throw new Error("load failed");
    const packageObj = await res.json();
    roster = await decryptRoster(password, packageObj);
    unlockUI();
  } catch (err) {
    roster = null;
    showError("密碼錯誤或無法解密，請再試一次。");
    passwordInput.select();
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "解鎖查詢";
  }
});

lockBtn.addEventListener("click", lockUI);
clearRanks.addEventListener("click", () => {
  selectedRanks.clear();
  document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
  page = 1;
  applyFilters();
});

nameInput.addEventListener("input", scheduleFilter);
yearMin.addEventListener("input", scheduleFilter);
yearMax.addEventListener("input", scheduleFilter);

buildRankChips();
