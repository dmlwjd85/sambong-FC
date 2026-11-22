/** 로그인 화면(이름·PIN)과 handleLogin, 로그아웃 */
import { signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { needsPinSetup, seasonStartStatMap } from './seasonDate.js';
import { auth, db } from './boot.js';
import { appId, ALLOWED_PLAYERS, getSafeDocId, STAT_BASE } from './constants.js';
import { applyFeatureChrome, applySeasonChrome } from './ui.js';
import { playerDisplayName, stripPrivate, escapeHtml } from './utils.js';

let loginDesk = { pick: null, mode: 'enter', first: '', buffer: '', busy: false };
let didRememberEnter = false;
let pendingRememberId = '';
let rosterReady = false;
let loginSeq = 0;
let slowHintTimer = 0;

function clearSlowHint() {
if (slowHintTimer) clearTimeout(slowHintTimer);
slowHintTimer = 0;
document.getElementById('pinSlowHint')?.classList.add('hidden');
const retry = document.getElementById('btnPinRetry');
if (retry) {
retry.classList.add('hidden');
retry.onclick = null;
}
}

function armSlowHint(seq, onRetry) {
clearSlowHint();
slowHintTimer = setTimeout(() => {
if (seq !== loginSeq) return;
const hint = document.getElementById('pinSlowHint');
if (hint) {
hint.textContent = '연결이 조금 느려요. 이름을 다시 눌러 보세요.';
hint.classList.remove('hidden');
}
const retry = document.getElementById('btnPinRetry');
if (!retry || typeof onRetry !== 'function') return;
retry.classList.remove('hidden');
retry.onclick = () => {
if (seq !== loginSeq) return;
onRetry();
};
}, 9000);
}

function showLoginOverlay() {
loginSeq += 1;
clearSlowHint();
document.getElementById('mainUI')?.classList.add('hidden');
const login = document.getElementById('loginOverlay');
if (login) {
login.classList.remove('hidden');
login.style.opacity = '1';
}
document.getElementById('loginPickWrap')?.classList.remove('hidden');
document.getElementById('pinStage')?.classList.add('hidden');
document.getElementById('pinPad')?.classList.remove('hidden');
loginDesk = { pick: null, mode: 'enter', first: '', buffer: '', busy: false };
}

function paintPin() {
const who = document.getElementById('pinWho');
const dots = document.getElementById('pinDots');
const name = loginDesk.pick ? loginDesk.pick.label : '';
let msg = `${name}, PIN 4자리를 눌러 주세요.`;
if (loginDesk.mode === 'check') msg = `${name}, 확인 중이에요.`;
else if (loginDesk.mode === 'set1') msg = `${name}, 처음이니까 나만의 PIN 4자리를 정해 주세요.`;
else if (loginDesk.mode === 'set2') msg = '같은 숫자를 한 번 더 눌러 주세요.';
if (who) who.textContent = msg;
if (!dots) return;
dots.replaceChildren();
for (let i = 0; i < 4; i++) {
const dot = document.createElement('span');
dot.className = 'pin-dot' + (i < loginDesk.buffer.length ? ' on' : '');
dots.appendChild(dot);
}
}

function showPinChecking(label) {
document.getElementById('loginPickWrap')?.classList.add('hidden');
document.getElementById('pinStage')?.classList.remove('hidden');
document.getElementById('pinPad')?.classList.add('hidden');
const who = document.getElementById('pinWho');
if (who) who.textContent = `${label}, 확인 중이에요.`;
const dots = document.getElementById('pinDots');
if (dots) dots.replaceChildren();
}

function showPinStage(id, needsSet) {
if (!loginDesk.pick || loginDesk.pick.id !== id) return;
clearSlowHint();
loginDesk.mode = needsSet ? 'set1' : 'enter';
loginDesk.busy = false;
loginDesk.buffer = '';
loginDesk.first = '';
document.getElementById('loginPickWrap')?.classList.add('hidden');
document.getElementById('pinStage')?.classList.remove('hidden');
document.getElementById('pinPad')?.classList.remove('hidden');
paintPin();
}

function openPinFor(id, label, role) {
if (role === 'student' && !rosterReady) return;
if (loginDesk.busy && loginDesk.mode === 'check' && loginDesk.pick && loginDesk.pick.id === id) return;
loginSeq += 1;
const seq = loginSeq;
clearSlowHint();
loginDesk.pick = { id, label, role };
loginDesk.first = '';
loginDesk.buffer = '';
loginDesk.mode = 'check';
loginDesk.busy = true;
showPinChecking(label);
armSlowHint(seq, () => {
if (seq !== loginSeq) return;
loginDesk.busy = false;
openPinFor(id, label, role);
});
const finish = (needsSet) => {
if (seq !== loginSeq) return;
if (!loginDesk.pick || loginDesk.pick.id !== id) return;
showPinStage(id, needsSet);
};
try {
const ref = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + id);
getDoc(ref).then((snap) => {
const raw = snap.exists() ? snap.data().pin : '';
finish(needsPinSetup(snap.exists(), raw));
}).catch(() => finish(false));
} catch (e) {
finish(false);
}
}

function paintRosterStatus() {
const status = document.getElementById('loginRosterStatus');
if (!status) return;
status.textContent = rosterReady ? '' : '명단을 불러오는 중이에요.';
status.classList.toggle('hidden', rosterReady);
}

function buildNameGrid() {
paintRosterStatus();
const grid = document.getElementById('loginNameGrid');
if (!grid) return;
grid.replaceChildren();
grid.setAttribute('aria-busy', rosterReady ? 'false' : 'true');
[...ALLOWED_PLAYERS].sort().forEach((name) => {
const btn = document.createElement('button');
btn.type = 'button';
btn.className = 'login-name-btn';
btn.dataset.name = name;
btn.textContent = name;
btn.disabled = !rosterReady;
if (!rosterReady) btn.setAttribute('aria-label', `${name} 불러오는 중`);
btn.addEventListener('click', () => openPinFor(getSafeDocId(name), name, 'student'));
grid.appendChild(btn);
});
}

export function markRosterReady() {
rosterReady = true;
buildNameGrid();
}

function onPinKey(key) {
if (loginDesk.busy) return;
if (key === '지움') {
loginDesk.buffer = loginDesk.buffer.slice(0, -1);
paintPin();
return;
}
if (key === '확인') {
if (loginDesk.buffer.length === 4) submitPin();
return;
}
if (!/^\d$/.test(key) || loginDesk.buffer.length >= 4) return;
loginDesk.buffer += key;
paintPin();
if (loginDesk.buffer.length === 4) submitPin();
}

function buildPinPad() {
const pad = document.getElementById('pinPad');
if (!pad || pad.dataset.ready === '1') return;
pad.dataset.ready = '1';
['1','2','3','4','5','6','7','8','9','지움','0','확인'].forEach((key) => {
const btn = document.createElement('button');
btn.type = 'button';
btn.className = 'pin-key';
btn.textContent = key;
btn.addEventListener('click', () => onPinKey(key));
pad.appendChild(btn);
});
document.getElementById('btnPinBack')?.addEventListener('click', () => showLoginOverlay());
document.getElementById('btnGuestEnter')?.addEventListener('click', () => enterGuest());
document.getElementById('btnStaffGm1')?.addEventListener('click', () => openPinFor('gm1', '선생님', 'gm'));
document.getElementById('btnStaffGm2')?.addEventListener('click', () => openPinFor('gm2', '코치님', 'gm'));
}

function persistRemember(id) {
try {
localStorage.removeItem('sfc_pin');
if (id) localStorage.setItem('sfc_pid', id);
else localStorage.removeItem('sfc_pid');
} catch (e) { /* 저장이 막혀도 입장은 계속 */ }
}

function showEnteredUI() {
const ps = window.playerState || {};
const login = document.getElementById('loginOverlay');
if (login) login.classList.add('hidden');
document.getElementById('mainUI')?.classList.remove('hidden');
document.getElementById('saveStatus')?.classList.remove('hidden');
const label = ps.isGuest ? '둘러보기' : playerDisplayName(ps);
const roleEl = document.getElementById('playerRoleDisplay');
const nameEl = document.getElementById('playerNameDisplay');
if (roleEl) {
roleEl.textContent = label;
roleEl.className = (ps.isGM ? 'text-fut-gold' : 'text-emerald-300') + ' font-bold text-sm truncate max-w-[9rem]';
}
if (nameEl) nameEl.textContent = label;
if (ps.isGM) {
document.getElementById('btnTabMaster')?.classList.remove('hidden');
document.getElementById('btnTabMasterStats')?.classList.remove('hidden');
document.getElementById('gmAttendanceTools')?.classList.remove('hidden');
document.getElementById('gmAttendanceTools')?.classList.add('flex');
}
applyFeatureChrome();
// 앱을 열면 누구든 라커룸 + 선수 카드가 첫 화면 (학생은 본인 카드, 감독은 첫 선수)
window.switchAppTab('home');
if (!ps.isGM && !ps.isGuest && ps.id) window.selectedPlayerId = ps.id;
if (window.selectedPlayerId && window.allPlayersData.length > 0) window.renderSelectedCard(window.selectedPlayerId);
if (window.renderLockerRoom) window.renderLockerRoom();
window.scrollTo(0, 0);
if (ps.isGuest || !db) return;
const annRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'announcement');
getDoc(annRef).then((snap) => {
const raw = snap.exists() ? snap.data().text : '';
const annText = typeof raw === 'string' ? raw.trim() : '';
const stamp = snap.exists() ? String(snap.data().updatedAt || '') : '';
if (!annText) return;
const token = `${stamp}|${annText}`;
try {
if (localStorage.getItem('sfc_ann_seen_v1') === token) return;
localStorage.setItem('sfc_ann_seen_v1', token);
} catch (e) { /* ignore */ }
setTimeout(() => {
window.customAlert(`📢 [감독님 공지]\n\n${escapeHtml(annText)}`);
}, 800);
}).catch(() => {});
}

function enterGuest() {
window.playerState = { id: 'guest', isGM: false, isGuest: true, name: '둘러보기' };
window.selectedPlayerId = getSafeDocId(ALLOWED_PLAYERS[0] || '');
persistRemember('guest');
showEnteredUI();
}

function enterFromMemory(p, isGM) {
window.playerState = { ...stripPrivate(p), id: p.id, isGM: !!isGM, isGuest: false, name: playerDisplayName(p) };
window.selectedPlayerId = isGM ? (window.selectedPlayerId || getSafeDocId(ALLOWED_PLAYERS[0] || '')) : p.id;
showEnteredUI();
}

async function submitPin() {
if (loginDesk.busy || !loginDesk.pick || loginDesk.buffer.length !== 4) return;
const pin = loginDesk.buffer;
loginDesk.buffer = '';
if (loginDesk.mode === 'set1') {
loginDesk.first = pin;
loginDesk.mode = 'set2';
paintPin();
return;
}
if (loginDesk.mode === 'set2' && pin !== loginDesk.first) {
loginDesk.first = '';
loginDesk.mode = 'set1';
paintPin();
window.customAlert('PIN 두 번이 같지 않아요. 다시 정해 주세요.');
return;
}
const mode = loginDesk.mode === 'enter' ? 'enter' : 'set';
const pick = { id: loginDesk.pick.id, label: loginDesk.pick.label, role: loginDesk.pick.role };
await runPinLogin(pick, pin, mode, loginSeq);
}

async function runPinLogin(pick, pin, mode, seq) {
loginDesk.pick = pick;
loginDesk.mode = 'check';
loginDesk.busy = true;
loginDesk.buffer = '';
showPinChecking(pick.label);
armSlowHint(seq, () => {
if (seq !== loginSeq) return;
loginSeq += 1;
runPinLogin(pick, pin, mode, loginSeq);
});
let result = 'bad';
try { result = await window.handleLogin(pick.id, pin, { mode, seq }); }
catch (e) { result = 'bad'; }
if (seq !== loginSeq) return;
clearSlowHint();
loginDesk.busy = false;
loginDesk.first = '';
if (result === 'ok' || result === 'stale') return;
document.getElementById('pinPad')?.classList.remove('hidden');
if (result === 'need-set') {
loginDesk.mode = 'set1';
paintPin();
return;
}
if (result === 'cancel') {
loginDesk.mode = mode === 'set' ? 'set1' : 'enter';
paintPin();
return;
}
loginDesk.mode = 'enter';
paintPin();
window.customAlert('PIN이 맞지 않아요. 다시 눌러 주세요.');
}

export async function tryRememberedEntry() {
if (didRememberEnter) return;
const id = pendingRememberId;
if (!id) {
didRememberEnter = true;
if (!loginDesk.pick) showLoginOverlay();
return;
}
didRememberEnter = true;
if (id === 'guest') { enterGuest(); return; }
if (id === 'gm1' || id === 'gm2') {
let name = id === 'gm1' ? '선생님' : '코치님';
try {
const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + id));
if (snap.exists()) {
const raw = snap.data().name;
if (typeof raw === 'string' && raw.trim()) name = raw.trim();
}
} catch (e) { /* 이름만 비어도 입장 */ }
window.playerState = { id, isGM: true, isGuest: false, name };
if (!window.selectedPlayerId) window.selectedPlayerId = getSafeDocId(ALLOWED_PLAYERS[0] || '');
showEnteredUI();
return;
}
const p = (window.allPlayersData || []).find((x) => x.id === id);
if (!p) {
persistRemember('');
pendingRememberId = '';
showLoginOverlay();
return;
}
enterFromMemory(p, false);
}

function setupLoginFormDom() {
try {
localStorage.removeItem('sfc_pin');
pendingRememberId = localStorage.getItem('sfc_pid') || '';
} catch (e) { pendingRememberId = ''; }
buildPinPad();
buildNameGrid();
applySeasonChrome();
if (!pendingRememberId) {
didRememberEnter = true;
showLoginOverlay();
}
}
/** 로그인 화면 준비(앱 시작 때 initApp.js가 한 번 부릅니다) */
export function bootLoginForm() {
if (document.readyState === 'loading') {
window.addEventListener('DOMContentLoaded', () => { setupLoginFormDom(); });
} else {
setupLoginFormDom();
}
}

window.logout = () => { localStorage.removeItem('sfc_pid'); localStorage.removeItem('sfc_pin'); location.reload(); };


// ==============================================
// 🚀 앱 코어 인증 및 초기화
// ==============================================
window.handleLogin = async (pId, pin, opts = {}) => {
const mode = opts && opts.mode === 'set' ? 'set' : 'enter';
const seq = opts ? opts.seq : undefined;
const abandoned = () => seq != null && seq !== loginSeq;
if (!pId) return 'bad';
const isGM = pId === 'gm1' || pId === 'gm2';
const pinText = String(pin || '');
if (!/^\d{4}$/.test(pinText)) return 'bad';
if (!auth || !auth.currentUser) {
try {
if (typeof globalThis.__initial_auth_token !== 'undefined' && globalThis.__initial_auth_token) {
await signInWithCustomToken(auth, globalThis.__initial_auth_token);
} else {
await signInAnonymously(auth);
}
} catch (e) {
if (abandoned()) return 'stale';
window.customAlert('서버와 연결할 수 없어요. 학교 와이파이가 막혀 있으면 휴대폰 데이터로 다시 들어와 주세요.');
return 'cancel';
}
}
if (abandoned()) return 'stale';
const safeDocId = isGM ? pId : getSafeDocId(pId);
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + safeDocId);
try {
const snap = await getDoc(docRef);
if (abandoned()) return 'stale';
if (snap.exists()) {
const data = snap.data();
const serverPin = data.pin == null ? '' : String(data.pin).trim();
if (!serverPin) {
if (mode !== 'set') return abandoned() ? 'stale' : 'need-set';
await setDoc(docRef, { pin: pinText, updatedAt: new Date().toISOString() }, { merge: true });
if (abandoned()) return 'stale';
const idx = window.allPlayersData.findIndex((x) => x.id === safeDocId);
if (idx >= 0) window.allPlayersData[idx] = { ...window.allPlayersData[idx], pin: pinText, fromDb: true, name: playerDisplayName({ ...window.allPlayersData[idx], id: safeDocId }) };
window.playerState = { ...stripPrivate(data), id: safeDocId, isGM, isGuest: false, name: playerDisplayName({ ...data, id: safeDocId }) };
} else if (serverPin !== pinText) {
return abandoned() ? 'stale' : 'bad';
} else {
if (abandoned()) return 'stale';
window.playerState = { ...stripPrivate(data), id: safeDocId, isGM, isGuest: false, name: playerDisplayName({ ...data, id: safeDocId }) };
}
} else {
if (mode !== 'set') return abandoned() ? 'stale' : 'need-set';
const baseData = {
name: isGM ? (pId === 'gm1' ? '감독 J' : '수석코치 J') : pId,
pin: pinText,
pos: isGM ? 'Fixo' : '미정',
...seasonStartStatMap(STAT_BASE),
level: 1, exp: 0, goals: 0, assists: 0, matches: 0, training: 0, saves: 0, keypass: 0, bong: 0, lastWageWeek: '',
age: 13,
inventory: [], itemLevels: {}, equipHead: null, equipHandL: null, equipHandR: null, equipFootL: null, equipFootR: null, equipFace: null,
activityUndo: [],
updatedAt: new Date().toISOString()
};
await setDoc(docRef, baseData);
if (abandoned()) return 'stale';
window.playerState = { ...stripPrivate(baseData), id: safeDocId, isGM, isGuest: false, name: playerDisplayName({ ...baseData, id: safeDocId }) };
}
if (abandoned()) return 'stale';
persistRemember(isGM ? pId : safeDocId);
if (!isGM) window.selectedPlayerId = safeDocId;
else if (!window.selectedPlayerId) window.selectedPlayerId = getSafeDocId(ALLOWED_PLAYERS[0] || '');
showEnteredUI();
return 'ok';
} catch (e) {
console.error('Login err:', e);
if (abandoned()) return 'stale';
window.customAlert('들어가는 중에 문제가 생겼어요. 잠시 뒤 다시 눌러 주세요.');
return 'cancel';
}
};
