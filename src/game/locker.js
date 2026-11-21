/** 라커룸·출석 체크·모의경기 팀 분류판 */
import { doc, setDoc, deleteField } from 'firebase/firestore';
import { checkAuthReady, db } from './boot.js';
import { appId, ALLOWED_PLAYERS, getSafeDocId, POS_KR, LOCKER_POS_ORDER, LOCKER_POS_HEAD } from './constants.js';
import { getOVR, getTierInfo, getPosColor, getPosBg } from './stats.js';
import { getAvatarHtml } from './ui.js';
import { playerDisplayName, escapeHtml, isVisible, escapeAttr } from './utils.js';

/** 라커룸 한 선수 카드 HTML */
function lockerPlayerCardHtml(p) {
const isChecked = window.checkedInPlayers.has(p.id);
const isSelected = window.selectedPlayerId === p.id;
const ovr = getOVR(p); const tier = getTierInfo(ovr);
let borderClass = 'border-slate-700';
if(ovr >= 85) borderClass = 'border-purple-500'; else if (ovr >= 75) borderClass = 'border-fut-gold'; else if (ovr >= 65) borderClass = 'border-gray-300';
const posText = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정';
const st = p.simTeam;
let simRow = '';
if (st === 'A' || st === 'B') {
simRow = `<div class="mt-1 text-sm font-bold ${st === 'A' ? 'text-red-300' : 'text-blue-300'}" onclick="event.stopPropagation()">${st === 'A' ? '레드팀' : '블루팀'}</div>`;
}
return `
                     <div class="mini-card fut-mini ${tier.cardClass} flex flex-col items-center p-2 rounded-xl border-2 ${borderClass} cursor-pointer ${isSelected ? 'selected' : ''} ${isChecked ? 'checked-in' : 'checked-out'}" onclick="window.selectPlayer('${p.id}')">
                         <input type="checkbox" class="locker-checkbox absolute top-1.5 left-1.5 w-5 h-5 shadow-lg z-10" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); window.toggleCheck('${p.id}')">
                         <div class="absolute top-1 right-1 ${tier.class} text-[8px] font-black px-1.5 py-0.5 rounded shadow whitespace-nowrap tracking-wide">${tier.name.split(' ')[0]}</div>
                         <div class="flex items-center justify-center min-h-[4.4rem] mt-3">${getAvatarHtml(p, 'locker')}</div>
                         <div class="fut-mini-ovr-plate fut-mini-ovr text-[1.55rem] font-bold leading-none text-current drop-shadow mt-1">${ovr}</div>
                         <div class="flex flex-col items-center mt-0.5 w-full px-0.5">
                         <span class="text-[9px] font-black ${getPosColor(p.pos)} tracking-wider">${posText}</span>
                         <span class="text-sm font-black text-current truncate max-w-full drop-shadow">${playerDisplayName(p)}</span>
                         </div>
                         ${simRow}
                     </div>`;
}

function lockerLockedSlotHtml(name) {
return `<div class="flex flex-col items-center justify-center p-2 rounded-xl border border-slate-800 bg-slate-900/50 opacity-50"><i class="fa-solid fa-user-lock text-xl text-slate-700 mb-2"></i><span class="text-[10px] text-slate-600">${name}</span></div>`;
}

/** 모의경기 팀 분류 라디오 name (라커·모의경기 탭 간 충돌 방지) */
function getSimTeamBoardRadioName(boardKey) {
return `simBoardPick_${boardKey}`;
}

/** 라디오로 선택한 목표 팀 (라커·탭 각각 유지) */
window.simBoardPreferredTarget = window.simBoardPreferredTarget || { locker: 'A', sim: 'A' };

/** 팀 분류 보드 HTML (삭제·DnD·하단 레드/블루 라디오) */
function buildSimTeamBoardHtml(boardKey) {
const listA = (window.allPlayersData || []).filter((p) => p.simTeam === 'A').sort((a, b) => getOVR(b) - getOVR(a));
const listB = (window.allPlayersData || []).filter((p) => p.simTeam === 'B').sort((a, b) => getOVR(b) - getOVR(a));
const pref = window.simBoardPreferredTarget[boardKey] === 'B' ? 'B' : 'A';
const rname = getSimTeamBoardRadioName(boardKey);
const simTools = !!(window.playerState && window.playerState.isGM);
const clearColA = simTools
? `<button type="button" class="sim-team-clear-btn min-h-[44px] px-3 rounded-lg bg-slate-900/80 text-amber-100 border border-amber-800/50 text-sm font-bold shrink-0" data-sim-clear-team="A">전체 빼기</button>`
: '';
const clearColB = simTools
? `<button type="button" class="sim-team-clear-btn min-h-[44px] px-3 rounded-lg bg-slate-900/80 text-amber-100 border border-amber-800/50 text-sm font-bold shrink-0" data-sim-clear-team="B">전체 빼기</button>`
: '';
const randomFillA = simTools
? `<button type="button" class="sim-team-random-fill-btn min-h-[44px] px-3 rounded-lg bg-emerald-900/55 text-emerald-100 border border-emerald-700/45 text-sm font-bold shrink-0" data-sim-random-team="A">알아서 채우기</button>`
: '';
const randomFillB = simTools
? `<button type="button" class="sim-team-random-fill-btn min-h-[44px] px-3 rounded-lg bg-emerald-900/55 text-emerald-100 border border-emerald-700/45 text-sm font-bold shrink-0" data-sim-random-team="B">알아서 채우기</button>`
: '';
const rowHtml = (p, team) => {
const canEdit = simTools;
const canDrag = canEdit;
const posText = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정';
const delBtn = canEdit
? `<button type="button" class="sim-team-remove-btn shrink-0 min-h-[44px] px-3 rounded-lg bg-slate-800 text-red-200 border border-red-800/60 text-sm font-bold" data-player-id="${escapeAttr(p.id)}">빼기</button>`
: '';
const dragAttr = canDrag ? 'true' : 'false';
return `<div class="sim-team-row flex items-center gap-2 text-sm min-h-[44px] py-1 px-1 border-b border-white/5 rounded" draggable="${dragAttr}" data-player-id="${escapeAttr(p.id)}" data-sim-team="${team}" data-sim-board="${boardKey}">
<span class="text-slate-500 select-none shrink-0">${canDrag ? '<i class="fa-solid fa-grip-vertical"></i>' : ''}</span>
<span class="text-white truncate flex-1 min-w-0">${escapeHtml(playerDisplayName(p))}</span>
<span class="text-[9px] ${getPosColor(p.pos)} shrink-0">${posText}</span>
<span class="text-fut-gold font-oswald shrink-0">${getOVR(p)}</span>
${delBtn}
</div>`;
};
const emptyHint = '<p class="text-[10px] text-slate-500 py-2 pointer-events-none">빈 곳에 놓으면 이동</p>';
return `
<p class="text-sm font-bold text-slate-300 mb-2 flex flex-wrap items-center gap-2"><i class="fa-solid fa-futbol text-amber-400"></i> 팀 나누기 <span class="text-sm font-normal text-slate-400">${window.playerState && window.playerState.isGM ? '감독만 팀을 바꿔요. 줄을 누르면 고른 팀으로 옮겨요.' : '지금은 보기만 할 수 있어요.'}</span></p>
<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
<div class="sim-team-drop-zone rounded-xl border border-red-800/40 bg-red-950/25 p-3 min-h-[6rem]" data-sim-drop="A">
<div class="font-display text-red-400 text-sm mb-1.5 flex justify-between items-center gap-2 flex-wrap">
<span>레드팀</span>
<div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
${randomFillA}
${clearColA}
<span class="text-[10px] text-slate-500 font-sans">${listA.length}명</span>
</div>
</div>
${listA.length ? listA.map((p) => rowHtml(p, 'A')).join('') : emptyHint}
</div>
<div class="sim-team-drop-zone rounded-xl border border-blue-800/40 bg-blue-950/25 p-3 min-h-[6rem]" data-sim-drop="B">
<div class="font-display text-blue-400 text-sm mb-1.5 flex justify-between items-center gap-2 flex-wrap">
<span>블루팀</span>
<div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
${randomFillB}
${clearColB}
<span class="text-[10px] text-slate-500 font-sans">${listB.length}명</span>
</div>
</div>
${listB.length ? listB.map((p) => rowHtml(p, 'B')).join('') : emptyHint}
</div>
</div>
<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-slate-700/50">
<span class="text-sm text-slate-400">고른 팀으로 줄을 누르면 옮겨요.</span>
<div class="flex items-center justify-between gap-6 sm:justify-end">
<label class="flex items-center gap-2 text-xs text-red-300 cursor-pointer">
<input type="radio" name="${rname}" value="A" class="accent-red-500" data-sim-board="${boardKey}" ${pref === 'A' ? 'checked' : ''} />
레드팀
</label>
<label class="flex items-center gap-2 text-xs text-blue-300 cursor-pointer">
<input type="radio" name="${rname}" value="B" class="accent-blue-500" data-sim-board="${boardKey}" ${pref === 'B' ? 'checked' : ''} />
블루팀
</label>
</div>
</div>`;
}

/** 라커 하단 + 모의경기 탭 팀 분류창 동시 갱신 */
window.renderSimTeamBoards = () => {
const elLocker = document.getElementById('lockerSimTeamsPreview');
const elTab = document.getElementById('simTeamBoardTab');
if (elLocker) elLocker.innerHTML = buildSimTeamBoardHtml('locker');
if (elTab) elTab.innerHTML = buildSimTeamBoardHtml('sim');
};

/** 서로 다른 팀 소속 두 선수를 맞바꿉니다. 감독만 할 수 있어요. */
window.swapSimTeamPlayers = async (id1, id2) => {
try {
checkAuthReady();
if (!window.playerState || !window.playerState.isGM) return;
const p1 = window.allPlayersData.find((x) => x.id === id1);
const p2 = window.allPlayersData.find((x) => x.id === id2);
if (!p1 || !p2) return;
const t1 = p1.simTeam;
const t2 = p2.simTeam;
if (!t1 || !t2 || t1 === t2) return;
await window.setPlayerSimTeam(id1, null, true);
await window.setPlayerSimTeam(id2, null, true);
await window.setPlayerSimTeam(id1, t2, true);
await window.setPlayerSimTeam(id2, t1, true);
window.renderLockerRoom();
if (isVisible('tabSim')) window.renderSimMatchTab();
if (window.selectedPlayerId) window.renderSelectedCard(window.selectedPlayerId);
} catch (e) {
console.error(e);
window.customAlert('팀 교체에 실패했습니다.');
}
};

/** 해당 팀(레드/블루)에 속한 모든 선수 팀 해제 */
window.clearSimTeamColumn = async (team) => {
try {
checkAuthReady();
if (!window.playerState || !window.playerState.isGM) return;
if (team !== 'A' && team !== 'B') return;
const ids = (window.allPlayersData || []).filter((p) => p.simTeam === team).map((p) => p.id);
for (let i = 0; i < ids.length; i++) {
await window.setPlayerSimTeam(ids[i], null, i < ids.length - 1);
}
} catch (e) {
console.error(e);
window.customAlert('팀 비우기에 실패했습니다.');
}
};

/** 팀 인원이 5명 미만일 때: 미배정 우선 → 부족 시 상대팀에서 보강. 포지션: 골레이로 1순위, 픽소 2순위, 이후 아라·피보·미정을 순환해 골고루 */
window.fillSimTeamRandomPos = async (team) => {
try {
checkAuthReady();
if (!window.playerState || !window.playerState.isGM) return;
if (team !== 'A' && team !== 'B') return;
const other = team === 'A' ? 'B' : 'A';
const onTeam = (window.allPlayersData || []).filter((p) => p.simTeam === team);
const need = 5 - onTeam.length;
if (need <= 0) return window.customAlert('이미 5명입니다.');
const shuffle = (arr) => {
const a = [...arr];
for (let i = a.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[a[i], a[j]] = [a[j], a[i]];
}
return a;
};
/** n번째 보강(0부터)에 맞는 선호 포지션 */
const preferredPosForPick = (n) => {
if (n === 0) return 'Goleiro';
if (n === 1) return 'Fixo';
const restCycle = ['Ala', 'Pivo', '미정'];
return restCycle[(n - 2) % restCycle.length];
};
/** 풀에서 선호 포지션 우선, 없으면 대체 순서로 1명 인덱스 */
const findBestIndexForPos = (pool, prefer) => {
let idx = pool.findIndex((p) => p.pos === prefer);
if (idx >= 0) return idx;
if (prefer === 'Ala') {
idx = pool.findIndex((p) => p.pos === '미정');
if (idx >= 0) return idx;
}
const fallbackByPrefer = {
Goleiro: ['Fixo', 'Ala', 'Pivo', '미정'],
Fixo: ['Goleiro', 'Ala', 'Pivo', '미정'],
Ala: ['Pivo', '미정', 'Fixo', 'Goleiro'],
Pivo: ['Ala', '미정', 'Fixo', 'Goleiro'],
미정: ['Ala', 'Pivo', 'Fixo', 'Goleiro']
};
const chain = fallbackByPrefer[prefer] || ['Goleiro', 'Fixo', 'Ala', 'Pivo', '미정'];
for (let c = 0; c < chain.length; c++) {
idx = pool.findIndex((p) => p.pos === chain[c]);
if (idx >= 0) return idx;
}
return 0;
};
const unassigned = (window.allPlayersData || []).filter((p) => !p.simTeam);
const fromOther = (window.allPlayersData || []).filter((p) => p.simTeam === other);
let pool = [...shuffle(unassigned), ...shuffle(fromOther)];
if (!pool.length) return window.customAlert('보강할 다른 선수가 없습니다.');
const picks = [];
for (let n = 0; n < need && pool.length; n++) {
const prefer = preferredPosForPick(n);
const idx = findBestIndexForPos(pool, prefer);
picks.push(pool[idx]);
pool.splice(idx, 1);
}
if (!picks.length) return window.customAlert('선택할 선수가 없습니다.');
for (let i = 0; i < picks.length; i++) {
await window.setPlayerSimTeam(picks[i].id, team, i < picks.length - 1);
}
} catch (e) {
console.error(e);
window.customAlert('랜덤 보강에 실패했습니다.');
}
};

window.setLockerViewMode = (mode) => {
window.lockerViewMode = mode === 'byPos' ? 'byPos' : 'default';
window.renderLockerRoom();
};

window.renderLockerRoom = () => {
const grid = document.getElementById('lockerGrid');
if(!grid) return;
const mode = window.lockerViewMode || 'default';
const bd = document.getElementById('btnLockerViewDefault');
const bp = document.getElementById('btnLockerViewPos');
const tabOn = 'text-xs font-bold px-3 py-2 rounded-lg border transition shadow bg-emerald-700 text-white border-emerald-500';
const tabOff = 'text-xs font-bold px-3 py-2 rounded-lg border transition bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700';
if (bd) bd.className = mode === 'byPos' ? tabOff : tabOn;
if (bp) bp.className = mode === 'byPos' ? tabOn : tabOff;

if (mode === 'byPos') {
const buckets = { Goleiro: [], Fixo: [], Ala: [], Pivo: [], '미정': [] };
const pendingNames = [];
ALLOWED_PLAYERS.forEach(name => {
const safeDocId = getSafeDocId(name);
const p = window.allPlayersData.find(x => x.id === safeDocId);
if (p) {
const k = ['Goleiro', 'Fixo', 'Ala', 'Pivo'].includes(p.pos) ? p.pos : '미정';
buckets[k].push(p);
} else pendingNames.push(name);
});
let html = '';
LOCKER_POS_ORDER.forEach(pos => {
const list = buckets[pos];
if (!list.length) return;
html += `<div class="col-span-full flex items-center gap-2 pt-3 first:pt-0 border-t border-slate-700/50 first:border-0"><span class="text-emerald-400 font-bold text-sm">${LOCKER_POS_HEAD[pos]}</span><span class="text-[10px] text-slate-500">${list.length}명</span></div>`;
html += `<div class="col-span-full grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 sm:gap-4">`;
list.forEach(p => { html += lockerPlayerCardHtml(p); });
html += `</div>`;
});
if (pendingNames.length) {
html += `<div class="col-span-full flex items-center gap-2 pt-3 border-t border-slate-700/50"><span class="text-slate-500 font-bold text-sm">등록 대기</span><span class="text-[10px] text-slate-600">${pendingNames.length}명</span></div>`;
html += `<div class="col-span-full grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 sm:gap-4">`;
pendingNames.forEach(n => { html += lockerLockedSlotHtml(n); });
html += `</div>`;
}
grid.innerHTML = html || '<div class="col-span-full text-center text-slate-500 py-8">표시할 선수가 없습니다.</div>';
window.renderSimTeamBoards();
return;
}

let html = '';
ALLOWED_PLAYERS.forEach(name => {
const safeDocId = getSafeDocId(name);
const p = window.allPlayersData.find(x => x.id === safeDocId);
if(p) html += lockerPlayerCardHtml(p);
else html += lockerLockedSlotHtml(name);
});
grid.innerHTML = html;
window.renderSimTeamBoards();
};

window.toggleCheck = (pId) => {
if(window.playerState.isGuest) return window.customAlert("게스트 모드에서는 출석 체크를 할 수 없습니다.");
if(window.checkedInPlayers.has(pId)) window.checkedInPlayers.delete(pId); else window.checkedInPlayers.add(pId);
window.renderLockerRoom(); renderActivePool();
};

/** 라커룸에서 모의경기 팀 A/B 지정 (Firestore simTeam, 팀당 최대 5명) */
/** @param skipRefresh 일괄 처리 시 true로 중간 렌더 생략 */
window.setPlayerSimTeam = async (pId, team, skipRefresh) => {
try {
checkAuthReady();
if (!window.playerState || !window.playerState.isGM) return;
const target = window.allPlayersData.find((x) => x.id === pId);
if (!target) return;
if (team === 'A' || team === 'B') {
const n = (window.allPlayersData || []).filter((x) => x.id !== pId && x.simTeam === team).length;
if (n >= 5) return window.customAlert('해당 팀은 이미 5명입니다. 다른 팀을 선택하거나 해제 후 다시 시도하세요.');
}
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(pId));
const payload = { updatedAt: new Date().toISOString() };
if (team === 'A' || team === 'B') payload.simTeam = team;
else payload.simTeam = deleteField();
await setDoc(docRef, payload, { merge: true });
const idx = window.allPlayersData.findIndex((x) => x.id === pId);
if (idx >= 0) {
if (team === 'A' || team === 'B') window.allPlayersData[idx] = { ...window.allPlayersData[idx], simTeam: team };
else {
const copy = { ...window.allPlayersData[idx] };
delete copy.simTeam;
window.allPlayersData[idx] = copy;
}
}
if (!skipRefresh) {
window.renderLockerRoom();
if (isVisible('tabSim')) window.renderSimMatchTab();
if (window.selectedPlayerId) window.renderSelectedCard(window.selectedPlayerId);
}
} catch (e) {
console.error(e);
window.customAlert('모의경기 팀 설정 저장에 실패했습니다.');
}
};

window.selectPlayer = (pId) => {
window.selectedPlayerId = pId;
window.renderLockerRoom(); window.renderSelectedCard(pId);
if(isVisible('tabAchievements')) window.renderAchievements();
if(isVisible('tabShop')) window.renderShop();
if(isVisible('tabCompare')) window.renderCompareList();
if(window.innerWidth < 1024) document.getElementById('detailPanelTitle')?.scrollIntoView();
};

export function renderActivePool() {
const container = document.getElementById('activePool'); if(!container) return;
document.getElementById('activeCount')?.innerText && (document.getElementById('activeCount').innerText = `${window.checkedInPlayers.size} 명`);

if(window.checkedInPlayers.size === 0) { container.innerHTML = `<span class="text-xs text-slate-600 italic">라커룸에서 선수를 체크해주세요.</span>`; return; }
let html = '';
window.checkedInPlayers.forEach(id => {
const p = window.allPlayersData.find(x => x.id === id);
if(p) html += `<div class="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs font-bold text-white flex items-center gap-1 shadow-sm"><span class="w-2 h-2 rounded-full ${getPosBg(p.pos||'Ala')}"></span>${p.name}</div>`;
});
container.innerHTML = html;
}

// 모의경기 팀 분류창: 삭제 버튼·레드/블루 라디오·더블클릭 이동·드래그 앤 드롭 (한 번만 등록)
/** 화면 이벤트 연결(앱 시작 때 initApp.js가 한 번 부릅니다) */
export function bindSimTeamBoardUi() {
if (typeof window !== 'undefined' && !window.__simTeamBoardUiBound) {
window.__simTeamBoardUiBound = true;
let dragSimPid = null;
document.addEventListener('change', (ev) => {
const t = ev.target;
if (t && t.matches && t.matches('.sim-profile-cb')) {
const team = t.getAttribute('data-sim-profile-team');
const pid = t.getAttribute('data-player-id');
if (pid && (team === 'A' || team === 'B')) {
if (t.checked) {
window.setPlayerSimTeam(pid, team);
} else {
const pl = window.allPlayersData.find((x) => x.id === pid);
if (pl && pl.simTeam === team) window.setPlayerSimTeam(pid, null);
}
}
return;
}
if (!t || !t.matches || !t.matches('input[type="radio"][data-sim-board]')) return;
if (t.value !== 'A' && t.value !== 'B') return;
const k = t.getAttribute('data-sim-board');
if (k && window.simBoardPreferredTarget) window.simBoardPreferredTarget[k] = t.value;
});
document.addEventListener('click', (ev) => {
const clr = ev.target.closest('.sim-team-clear-btn');
if (clr) {
ev.preventDefault();
const tm = clr.getAttribute('data-sim-clear-team');
if (tm === 'A' || tm === 'B') window.clearSimTeamColumn(tm);
return;
}
const rnd = ev.target.closest('.sim-team-random-fill-btn');
if (rnd) {
ev.preventDefault();
const tm = rnd.getAttribute('data-sim-random-team');
if (tm === 'A' || tm === 'B') window.fillSimTeamRandomPos(tm);
return;
}
const btn = ev.target.closest('.sim-team-remove-btn');
if (btn) {
ev.preventDefault();
const pid = btn.getAttribute('data-player-id');
if (pid) window.setPlayerSimTeam(pid, null);
return;
}
const rowTap = ev.target.closest('.sim-team-row');
if (!rowTap || ev.target.closest('button')) return;
if (!window.playerState || !window.playerState.isGM) return;
const boardKey = rowTap.getAttribute('data-sim-board');
const pid = rowTap.getAttribute('data-player-id');
if (!boardKey || !pid) return;
const picked = document.querySelector(`input[name="${getSimTeamBoardRadioName(boardKey)}"]:checked`);
const team = picked && (picked.value === 'A' || picked.value === 'B') ? picked.value : 'A';
window.setPlayerSimTeam(pid, team);
});
document.addEventListener('dblclick', (ev) => {
if (!window.playerState || !window.playerState.isGM) return;
const row = ev.target.closest('.sim-team-row');
if (!row) return;
const boardKey = row.getAttribute('data-sim-board');
if (!boardKey) return;
const pid = row.getAttribute('data-player-id');
if (!pid) return;
const r = document.querySelector(`input[name="${getSimTeamBoardRadioName(boardKey)}"]:checked`);
const team = r && (r.value === 'A' || r.value === 'B') ? r.value : 'A';
window.setPlayerSimTeam(pid, team);
});
document.addEventListener('dragstart', (ev) => {
const chip = ev.target.closest('.sim-tactical-chip');
if (chip) {
ev.dataTransfer.setData('text/sim-player', chip.getAttribute('data-sim-chip-id') || '');
ev.dataTransfer.setData('text/sim-team', chip.getAttribute('data-sim-chip-team') || '');
ev.dataTransfer.effectAllowed = 'copy';
return;
}
const row = ev.target.closest('.sim-team-row');
if (!row || row.getAttribute('draggable') !== 'true') return;
dragSimPid = row.getAttribute('data-player-id');
if (dragSimPid) {
ev.dataTransfer.setData('text/plain', dragSimPid);
ev.dataTransfer.effectAllowed = 'move';
}
});
document.addEventListener('dragend', () => { dragSimPid = null; });
document.addEventListener('dragover', (ev) => {
if (ev.target.closest('.sim-team-drop-zone')) {
ev.preventDefault();
ev.dataTransfer.dropEffect = 'move';
}
});
document.addEventListener('drop', async (ev) => {
const zone = ev.target.closest('.sim-team-drop-zone');
if (!zone) return;
if (!window.playerState || !window.playerState.isGM) return;
ev.preventDefault();
const pid = (ev.dataTransfer.getData('text/plain') || dragSimPid || '').trim();
if (!pid) return;
const toTeam = zone.getAttribute('data-sim-drop');
if (toTeam !== 'A' && toTeam !== 'B') return;
const hitRow = ev.target.closest('.sim-team-row');
if (hitRow && hitRow.getAttribute('data-player-id') !== pid) {
const otherId = hitRow.getAttribute('data-player-id');
const pDrag = window.allPlayersData.find((x) => x.id === pid);
const pOther = window.allPlayersData.find((x) => x.id === otherId);
if (pDrag && pOther && pDrag.simTeam && pOther.simTeam && pDrag.simTeam !== pOther.simTeam) {
await window.swapSimTeamPlayers(pid, otherId);
}
return;
}
const pOnly = window.allPlayersData.find((x) => x.id === pid);
if (pOnly && pOnly.simTeam === toTeam) return;
await window.setPlayerSimTeam(pid, toTeam);
});
}
}
