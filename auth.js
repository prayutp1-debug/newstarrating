/* ═══════════════════════════════════════════════════════════════════════════
   AUTHENTICATION — หน้า Login สำหรับ Franchise Scorecard
   ---------------------------------------------------------------------------
   ใช้ backend เดียวกับแดชบอร์ดอื่นในองค์กร คือ Google Sheet ผ่าน Apps Script
   Web App เพื่อให้ username / password ชุดเดียวกันเข้าได้ทุกแดชบอร์ด
   เรียกผ่าน JSONP (ไม่ใช้ fetch) เพราะ Apps Script Web App มักติดปัญหา CORS

   ถ้าเว้น AUTH_API_URL เป็นค่าว่าง ระบบจะถอยไปใช้ไฟล์ USER.xlsx ที่วางไว้
   โฟลเดอร์เดียวกัน (ต้องมี SheetJS) หรือ DEFAULT_USERS ที่ฝังไว้ในไฟล์นี้
   ซึ่งกรณีนั้นการเปลี่ยนรหัสผ่านจะเก็บแค่ใน localStorage ของเครื่องนั้น
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* Google Sheet backend เดียวกับ Plant Visit / Production Executive Dashboard */
const AUTH_API_URL = 'https://script.google.com/macros/s/AKfycbxSOm4Mjmb1iYmLavAioYfSlGzZu2UOdcph6XR5zWdV_Cp5dW8NHysfDfPI1_HGMGmU/exec';

const DEFAULT_USERS = [];
const USER_SOURCE_URL = 'USER.xlsx';
/* ใช้คีย์ชุดเดียวกับแดชบอร์ดอื่น เพื่อให้ "จดจำฉัน" ใช้ร่วมกันได้ */
const SESSION_KEY = 'saledash_auth_session_v1';
const RESET_OVERRIDE_KEY = 'saledash_pw_overrides_v1';
const REMEMBER_KEY = 'saledash_remembered_login_v1';

const $ = id => document.getElementById(id);

/* ───────────────────────────── JSONP ────────────────────────────────────── */
function jsonpRequest(params) {
  return new Promise((resolve, reject) => {
    const cbName = 'fcScoreCallback_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    const script = document.createElement('script');
    const cleanup = () => {
      clearTimeout(timer);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 30000);
    window[cbName] = data => { cleanup(); resolve(data); };
    const qs = Object.keys(params)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    script.src = AUTH_API_URL + '?' + qs + '&callback=' + cbName;
    script.onerror = () => { cleanup(); reject(new Error('script_load_error')); };
    document.body.appendChild(script);
  });
}
async function apiCall(action, payload) {
  try {
    return await jsonpRequest(Object.assign({ action: action }, payload));
  } catch (err) {
    console.warn('เรียก Auth API ครั้งแรกไม่สำเร็จ กำลังลองใหม่...', err.message);
    return await jsonpRequest(Object.assign({ action: action }, payload));
  }
}
const apiLogin = (username, password) => apiCall('login', { username, password });
const apiResetPassword = (username, oldPassword, newPassword) =>
  apiCall('resetPassword', { username, oldPassword, newPassword });

/* ─────────────────────────── ผู้ใช้สำรอง (fallback) ──────────────────────── */
let AUTH_USERS = DEFAULT_USERS;

function normalizeUsername(raw) {
  return (raw || '').trim().toLowerCase().replace(/@scg\.com$/i, '');
}

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getPwOverrides() {
  try { return JSON.parse(localStorage.getItem(RESET_OVERRIDE_KEY) || '{}'); }
  catch (e) { return {}; }
}
function savePwOverride(username, hash) {
  try {
    const o = getPwOverrides();
    o[username] = hash;
    localStorage.setItem(RESET_OVERRIDE_KEY, JSON.stringify(o));
    return true;
  } catch (e) { return false; }
}
const findAuthUser = username => AUTH_USERS.find(u => u.username === username) || null;

async function tryAutoFetchUsers() {
  if (typeof XLSX === 'undefined') return null;
  try {
    const res = await fetch(USER_SOURCE_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return null;
    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames.includes('Sheet1') ? 'Sheet1' : wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const seen = {};
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[1] || !r[2]) continue;
      const username = String(r[1]).trim().toLowerCase();
      seen[username] = {
        name: r[0] ? String(r[0]).trim() : '', username,
        passwordHash: await sha256Hex(String(r[2]).trim()),
      };
    }
    const list = Object.values(seen);
    return list.length ? list : null;
  } catch (e) {
    console.warn('อ่านไฟล์ "' + USER_SOURCE_URL + '" ไม่ได้ (ปกติถ้าไม่ได้วางไฟล์ไว้):', e.message);
    return null;
  }
}

async function checkPassword(user, inputPassword) {
  const overrides = getPwOverrides();
  const hash = await sha256Hex(inputPassword);
  if (overrides[user.username]) return overrides[user.username] === hash;
  return user.passwordHash === hash;
}

/* ─────────────────────────── session / remember ─────────────────────────── */
function saveSession(username, name) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ username, name, at: new Date().toISOString() })); }
  catch (e) {}
}
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
function getRemembered() {
  try { return JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null'); }
  catch (e) { return null; }
}
function saveRemembered(username, password) {
  try { localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username, password })); } catch (e) {}
}
function clearRemembered() { try { localStorage.removeItem(REMEMBER_KEY); } catch (e) {} }

function prefillLoginForm() {
  const r = getRemembered(), cb = $('rememberMe');
  if (r && r.username) {
    $('loginUser').value = r.username;
    $('loginPass').value = r.password || '';
    if (cb) cb.checked = true;
  } else if (cb) { cb.checked = false; }
}

/* ─────────────────────────── ข้อความแจ้งเตือน ───────────────────────────── */
const setMsg = (okId, errId, msg, isOk) => {
  $(isOk ? okId : errId).textContent = msg;
  $(isOk ? errId : okId).textContent = '';
};
const loginError   = m => setMsg('loginOk', 'loginErr', m, false);
const loginSuccess = m => setMsg('loginOk', 'loginErr', m, true);
const resetError   = m => setMsg('resetOk', 'resetErr', m, false);
const resetSuccess = m => setMsg('resetOk', 'resetErr', m, true);

/* ─────────────────────────── เปิด / ปิดหน้า Login ───────────────────────── */
let currentUser = null;
let inAppChangeMode = false;

function showApp(username, name) {
  currentUser = username;
  $('loginGate').style.display = 'none';
  document.body.classList.add('authed');
  const chip = $('userChip');
  if (chip) chip.textContent = name || username;
  const su = $('sideUser');
  if (su) su.hidden = false;
  if (typeof window.__bootDashboard === 'function') window.__bootDashboard();
}

function closeGateOverlay() {
  $('loginGate').style.display = 'none';
  $('gateClose').hidden = true;
  $('resetView').hidden = true;
  $('loginView').hidden = false;
  resetError(''); resetSuccess('');
}

function backToLoginAfterReset(username) {
  $('resetOld').value = ''; $('resetNew').value = ''; $('resetConfirm').value = '';
  if (inAppChangeMode) { inAppChangeMode = false; closeGateOverlay(); return; }
  $('resetView').hidden = true;
  $('loginView').hidden = false;
  $('loginUser').value = username;
  $('loginPass').value = '';
  loginSuccess('เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่');
}

/* ─────────────────────────── เข้าสู่ระบบ ────────────────────────────────── */
$('loginSubmit').addEventListener('click', async () => {
  loginError('');
  const username = normalizeUsername($('loginUser').value);
  const pw = $('loginPass').value;
  const remember = $('rememberMe').checked;
  if (!username || !pw) { loginError('กรุณากรอก Username และ Password'); return; }

  const btn = $('loginSubmit');
  btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ...';
  try {
    if (AUTH_API_URL) {
      let result;
      try {
        result = await apiLogin(username, pw);
      } catch (err) {
        console.error('Auth API error', err);
        loginError('เชื่อมต่อระบบยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        return;
      }
      if (!result || !result.ok) {
        loginError(result && result.error === 'user_not_found'
          ? 'ไม่พบชื่อผู้ใช้นี้ในระบบ' : 'รหัสผ่านไม่ถูกต้อง');
        return;
      }
      const u = result.username || username;
      saveSession(u, result.name);
      if (remember) saveRemembered(u, pw); else clearRemembered();
      showApp(u, result.name);
    } else {
      const user = findAuthUser(username);
      if (!user) { loginError('ไม่พบชื่อผู้ใช้นี้ในระบบ'); return; }
      if (!await checkPassword(user, pw)) { loginError('รหัสผ่านไม่ถูกต้อง'); return; }
      saveSession(user.username, user.name);
      if (remember) saveRemembered(user.username, pw); else clearRemembered();
      showApp(user.username, user.name);
    }
  } finally {
    btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
  }
});

$('loginUser').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginPass').focus(); });
$('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginSubmit').click(); });

/* ─────────────────────────── เปลี่ยนรหัสผ่าน ────────────────────────────── */
$('resetSubmit').addEventListener('click', async () => {
  resetError(''); resetSuccess('');
  const username = normalizeUsername($('resetUser').value);
  const oldPw = $('resetOld').value, newPw = $('resetNew').value, confirmPw = $('resetConfirm').value;
  if (!username || !oldPw || !newPw || !confirmPw) { resetError('กรุณากรอกข้อมูลให้ครบทุกช่อง'); return; }
  if (newPw !== confirmPw) { resetError('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน'); return; }
  if (newPw.length < 4) { resetError('รหัสผ่านใหม่ควรมีความยาวอย่างน้อย 4 ตัวอักษร'); return; }

  const btn = $('resetSubmit');
  btn.disabled = true; btn.textContent = 'กำลังดำเนินการ...';
  try {
    if (AUTH_API_URL) {
      let result;
      try {
        result = await apiResetPassword(username, oldPw, newPw);
      } catch (err) {
        console.error('Auth API error', err);
        resetError('เชื่อมต่อระบบยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        return;
      }
      if (!result || !result.ok) {
        const e = result && result.error;
        resetError(e === 'user_not_found' ? 'ไม่พบชื่อผู้ใช้นี้ในระบบ'
          : e === 'wrong_old_password' ? 'รหัสผ่านเดิมไม่ถูกต้อง'
          : e === 'weak_new_password' ? 'รหัสผ่านใหม่สั้นเกินไป'
          : 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
        return;
      }
      resetSuccess('เปลี่ยนรหัสผ่านสำเร็จ บันทึกลง Google Sheet แล้ว มีผลกับทุกอุปกรณ์');
      if (getRemembered()) saveRemembered(username, newPw);
      backToLoginAfterReset(username);
      return;
    }
    const user = findAuthUser(username);
    if (!user) { resetError('ไม่พบชื่อผู้ใช้นี้ในระบบ'); return; }
    if (!await checkPassword(user, oldPw)) { resetError('รหัสผ่านเดิมไม่ถูกต้อง'); return; }
    if (savePwOverride(username, await sha256Hex(newPw))) {
      resetSuccess('เปลี่ยนรหัสผ่านสำเร็จ (มีผลเฉพาะเบราว์เซอร์นี้)');
      if (getRemembered()) saveRemembered(username, newPw);
      backToLoginAfterReset(username);
    } else {
      resetError('บันทึกรหัสผ่านใหม่ไม่สำเร็จ (เบราว์เซอร์อาจปิด localStorage)');
    }
  } finally {
    btn.disabled = false; btn.textContent = 'เปลี่ยนรหัสผ่าน';
  }
});

/* ─────────────────────────── ปุ่มต่าง ๆ ─────────────────────────────────── */
document.querySelectorAll('.eye').forEach(btn => {
  btn.addEventListener('click', () => {
    const t = $(btn.dataset.target);
    if (!t) return;
    const showing = t.type === 'text';
    t.type = showing ? 'password' : 'text';
    btn.classList.toggle('on', !showing);
  });
});

$('showReset').addEventListener('click', () => {
  $('loginView').hidden = true;
  $('resetView').hidden = false;
  $('resetUser').value = normalizeUsername($('loginUser').value);
  resetError(''); resetSuccess('');
});
$('showLogin').addEventListener('click', () => {
  if (inAppChangeMode) { inAppChangeMode = false; closeGateOverlay(); return; }
  $('resetView').hidden = true;
  $('loginView').hidden = false;
  loginError('');
});

const btnPw = $('btnChangePw');
if (btnPw) btnPw.addEventListener('click', () => {
  inAppChangeMode = true;
  $('loginGate').style.display = 'flex';
  $('gateClose').hidden = false;
  $('loginView').hidden = true;
  $('resetView').hidden = false;
  $('resetUser').value = currentUser || '';
  $('resetOld').value = ''; $('resetNew').value = ''; $('resetConfirm').value = '';
  resetError(''); resetSuccess('');
});
$('gateClose').addEventListener('click', () => { inAppChangeMode = false; closeGateOverlay(); });

const btnOut = $('btnLogout');
if (btnOut) btnOut.addEventListener('click', () => { clearSession(); location.reload(); });

/* ─────────────────────────── เริ่มต้น ──────────────────────────────────── */
(async function initAuth() {
  if (AUTH_API_URL) {
    const note = $('resetNote');
    if (note) note.innerHTML =
      'ระบบนี้เชื่อมต่อกับ Google Sheet โดยตรง การเปลี่ยนรหัสผ่านจะถูกบันทึกจริงและมีผลกับทุกอุปกรณ์ทันที';
  } else {
    const fetched = await tryAutoFetchUsers();
    if (fetched) AUTH_USERS = fetched;
  }
  /* แสดงหน้า Login เสมอ ไม่ข้ามอัตโนมัติแม้เคยเข้าระบบไว้ */
  prefillLoginForm();
  $('loginUser').focus();
})();

})();
