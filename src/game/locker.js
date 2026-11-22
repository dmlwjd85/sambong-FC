/** 라커룸·출석 체크·모의경기 팀 분류판 */
import { doc, setDoc, deleteField, writeBatch } from 'firebase/firestore';
import { checkAuthReady, db } from './boot.js';
import { appId, ALLOWED_PLAYERS, getSafeDocId, POS_KR, LOCKER_POS_ORDER, LOCKER_POS_HEAD, SIM_TEAM_KEYS, isSimTeamKey, simTeamInfo, MAX_SIM_TEAM_SIZE } from './constants.js';
import { getOVR, getTierInfo, getPosColor, getPosBg } from './stats.js';
import { getAvatarHtml } from './ui.js';
import { playerDisplayName, escapeHtml, isVisible, escapeAttr } from './utils.js';

/** 라커룸 한 선수 카드 HTML (FUT 미니 카드) */
function lockerPlayerCardHtml(p) {
const isChecked = window.checkedInPlayers.has(p.id);
const isSelected = window.selectedPlayerId === p.id;
const ovr = getOVR(p); const tier = getTierInfo(ovr);
const posShort = { Goleiro: 'GK', Fixo: 'DF', Ala: 'MF', Pivo: 'FW' }[p.pos] || '—';
const st = p.simTeam;
const team = isSimTeamKey(st) ? `<div class="locker-card-team"><span class="inline-block w-1.5 h-1.5 rounded-full ${simTeamInfo(st).dot} mr-0.5 align-middle"></span>${simTeamInfo(st).short}</div>` : '';
const canCheck = !(window.playerState && window.playerState.isGuest);
return `<div class="locker-card-wrap ${isSelected ? 'selected' : ''}">
<div class="locker-card ${tier.cardClass} ${isChecked ? 'checked-in' : 'checked-out'}" onclick="window.selectPlayer('${p.id}')" role="button" aria-label="${escapeAttr(playerDisplayName(p))} OVR ${ovr}">
${canCheck ? `<input type="checkbox" class="locker-checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); window.toggleCheck('${p.id}')" aria-label="${escapeAttr(playerDisplayName(p))} 출석">` : ''}
<div class="locker-card-head"><div><span class="locker-card-ovr">${ovr}</span><span class="locker-card-pos">${posShort}</span></div></div>
<div class="locker-card-face">${getAvatarHtml(p, 'locker')}</div>
<div class="locker-card-name">${escapeHtml(playerDisplayName(p))}</div>
${team}
</div>
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

/** 분류표에 보일 팀 (선수가 있는 팀 + 레드·블루 + 감독이 고른 팀 수만큼) */
export function visibleSimTeamKeys() {
const used = new Set((window.allPlayersData || []).map((p) => p.simTeam).filter(isSimTeamKey));
const want = window.playerState && window.playerState.isGM ? Math.max(2, Number(window.targetTeamCount) || 2) : 2;
return SIM_TEAM_KEYS.filter((k, i) => i < want || used.has(k));
}

/** 포지션 짧은 이름 */
const posShortKr = (pos) => (POS_KR[pos] ? POS_KR[pos].split('(')[0] : '미정');

/** 감독용 포지션 고르기 (분류표·능력치표에서 함께 씀) */
export function gmPosSelectHtml(p, extraClass = '') {
const label = { Goleiro: '골레이로', Fixo: '픽소', Ala: '아라', Pivo: '피보', 미정: '미정' };
const opts = ['Goleiro', 'Fixo', 'Ala', 'Pivo', '미정'].map((k) => `<option value="${k}" ${((p.pos || '미정') === k) ? 'selected' : ''}>${label[k]}</option>`).join('');
return `<select class="gm-pos-select ${extraClass} w-[5.5rem] min-h-[36px] bg-slate-950 border border-slate-600 rounded-lg text-[12px] font-bold text-white px-1" data-player-id="${escapeAttr(p.id)}" aria-label="${escapeAttr(playerDisplayName(p))} 포지션">${opts}</select>`;
}

/** 팀 분류 보드 HTML: 옮길 팀 고르기 → 줄을 누르면 그 팀으로. 끌어다 놓기도 됨 */
function buildSimTeamBoardHtml(boardKey) {
const isGM = !!(window.playerState && window.playerState.isGM);
const keys = visibleSimTeamKeys();
const prefRaw = window.simBoardPreferredTarget[boardKey];
const pref = keys.includes(prefRaw) ? prefRaw : keys[0];
const rname = getSimTeamBoardRadioName(boardKey);
const all = window.allPlayersData || [];
const rowHtml = (p, team) => {
const delBtn = isGM && team
? `<button type="button" class="sim-team-remove-btn shrink-0 min-h-[40px] min-w-[40px] rounded-lg bg-slate-800 text-red-200 border border-red-800/60 text-sm" data-player-id="${escapeAttr(p.id)}" aria-label="${escapeAttr(playerDisplayName(p))} 빼기"><i class="fa-solid fa-xmark"></i></button>`
: '';
const pos = isGM ? gmPosSelectHtml(p, 'shrink-0') : `<span class="text-[11px] font-bold ${getPosColor(p.pos)} shrink-0 w-10 text-center">${posShortKr(p.pos)}</span>`;
return `<div class="sim-team-row flex items-center gap-2 text-sm min-h-[44px] py-1 px-1.5 border-b border-white/5 rounded ${isGM ? 'cursor-pointer active:bg-white/10' : ''}" draggable="${isGM ? 'true' : 'false'}" data-player-id="${escapeAttr(p.id)}" data-sim-team="${team || ''}" data-sim-board="${boardKey}">
${isGM ? '<span class="text-slate-600 select-none shrink-0 hidden sm:inline"><i class="fa-solid fa-grip-vertical"></i></span>' : ''}
<span class="text-white font-bold truncate flex-1 min-w-0">${escapeHtml(playerDisplayName(p))}</span>
${pos}
<span class="text-fut-gold font-oswald shrink-0 w-7 text-right">${getOVR(p)}</span>
${delBtn}
</div>`;
};
const posOrder = ['Goleiro', 'Fixo', 'Ala', 'Pivo', '미정'];
const byPos = (a, b) => posOrder.indexOf(a.pos || '미정') - posOrder.indexOf(b.pos || '미정') || getOVR(b) - getOVR(a);
const emptyHint = `<p class="text-xs text-slate-500 py-3 text-center pointer-events-none">${isGM ? '줄을 눌러 이 팀으로 옮겨요' : '아직 비어 있어요'}</p>`;
const zones = keys.map((k) => {
const ti = simTeamInfo(k);
const list = all.filter((p) => p.simTeam === k).sort(byPos);
const avg = list.length ? Math.round(list.reduce((s, p) => s + getOVR(p), 0) / list.length) : 0;
const cnt = (pos) => list.filter((p) => (p.pos || '미정') === pos).length;
const comp = list.length ? `<span class="text-[10px] text-slate-400 font-sans">GK ${cnt('Goleiro')} · DF ${cnt('Fixo')} · MF ${cnt('Ala')} · FW ${cnt('Pivo')}${cnt('미정') ? ` · 미정 ${cnt('미정')}` : ''}</span>` : '';
const tools = isGM ? `<div class="flex gap-1.5 shrink-0">
${list.length < 5 ? `<button type="button" class="sim-team-random-fill-btn min-h-[36px] px-2.5 rounded-lg bg-emerald-900/55 text-emerald-100 border border-emerald-700/45 text-xs font-bold" data-sim-random-team="${k}">5명 채우기</button>` : ''}
<button type="button" class="sim-team-clear-btn min-h-[36px] px-2.5 rounded-lg bg-slate-900/80 text-amber-100 border border-amber-800/50 text-xs font-bold" data-sim-clear-team="${k}">비우기</button>
</div>` : '';
return `<div class="sim-team-drop-zone rounded-xl border ${ti.zone} p-2.5 sm:p-3 min-h-[6rem] min-w-0" data-sim-drop="${k}">
<div class="mb-1.5">
<div class="font-display ${ti.head} text-base leading-tight flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full ${ti.dot}"></span>${ti.name} <span class="text-[11px] text-slate-400 font-sans">${list.length}명${list.length ? ` · 평균 ${avg}` : ''}</span></div>
<div class="flex items-center justify-between gap-2 mt-1 min-h-[36px]">
<div class="min-w-0">${comp}</div>
${tools}
</div>
</div>
${list.length ? list.map((p) => rowHtml(p, k)).join('') : emptyHint}
</div>`;
}).join('');
// 출석했는데 팀이 없는 선수 (감독만)
const waiting = isGM ? all.filter((p) => window.checkedInPlayers.has(p.id) && !isSimTeamKey(p.simTeam)).sort(byPos) : [];
const waitingZone = waiting.length ? `<div class="sim-team-drop-zone rounded-xl border border-dashed border-slate-600 bg-slate-900/40 p-2.5 sm:p-3 min-w-0" data-sim-drop="">
<div class="text-sm font-bold text-slate-300 mb-1">출석했지만 팀 없음 <span class="text-[11px] text-slate-500 font-normal">${waiting.length}명 · 눌러서 고른 팀으로</span></div>
${waiting.map((p) => rowHtml(p, '')).join('')}
</div>` : '';
const picker = isGM ? `<div class="flex items-center gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1" role="radiogroup" aria-label="옮길 팀">
<span class="text-xs text-slate-400 shrink-0">옮길 팀</span>
${keys.map((k) => { const ti = simTeamInfo(k); return `<label class="shrink-0 cursor-pointer"><input type="radio" name="${rname}" value="${k}" class="peer sr-only" data-sim-board="${boardKey}" ${pref === k ? 'checked' : ''} /><span class="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-full border border-slate-600 bg-slate-800 text-slate-300 text-sm font-bold peer-checked:text-white ${ti.pick} peer-focus-visible:ring-2 peer-focus-visible:ring-white"><span class="w-2 h-2 rounded-full ${ti.dot}"></span>${ti.short}</span></label>`; }).join('')}
</div>` : '';
return `
<div class="flex items-center justify-between gap-2 mb-2 flex-wrap">
<p class="text-sm font-bold text-slate-200 flex items-center gap-2"><i class="fa-solid fa-futbol text-amber-400"></i> 팀 분류표</p>
<span class="text-xs text-slate-400">${isGM ? '줄을 누르면 고른 팀으로 옮겨요. PC에서는 끌어다 놓아도 돼요.' : '지금은 보기만 할 수 있어요.'}</span>
</div>
${picker}
<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
${zones}
</div>
${waitingZone ? `<div class="mt-3">${waitingZone}</div>` : ''}`;
}

/** 라커 하단 + 모의경기 탭 팀 분류창 동시 갱신 */
window.renderSimTeamBoards = () => {
const elLocker = document.getElementById('lockerSimTeamsPreview');
const elTab = document.getElementById('simTeamBoardTab');
if (elLocker) elLocker.innerHTML = buildSimTeamBoardHtml('locker');
if (elTab) elTab.innerHTML = buildSimTeamBoardHtml('sim');
if (window.renderTeamKeepInfo) window.renderTeamKeepInfo();
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
if (!isSimTeamKey(team)) return;
const ids = (window.allPlayersData || []).filter((p) => p.simTeam === team).map((p) => p.id);
if (!ids.length) return;
if (!await window.customConfirm(`${simTeamInfo(team).name} ${ids.length}명을 모두 팀에서 뺄까요?`)) return;
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
if (!isSimTeamKey(team)) return;
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
// 출석했는데 팀 없는 선수 → 팀 없는 선수 → 다른 팀 선수 순으로 보강
const noTeam = (window.allPlayersData || []).filter((p) => !isSimTeamKey(p.simTeam));
const checked = noTeam.filter((p) => window.checkedInPlayers.has(p.id));
const unchecked = noTeam.filter((p) => !window.checkedInPlayers.has(p.id));
const fromOther = (window.allPlayersData || []).filter((p) => isSimTeamKey(p.simTeam) && p.simTeam !== team);
let pool = [...shuffle(checked), ...shuffle(unchecked), ...shuffle(fromOther)];
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
html += `<div class="col-span-full grid grid-cols-4 sm:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">`;
list.forEach(p => { html += lockerPlayerCardHtml(p); });
html += `</div>`;
});
if (pendingNames.length) {
html += `<div class="col-span-full flex items-center gap-2 pt-3 border-t border-slate-700/50"><span class="text-slate-500 font-bold text-sm">등록 대기</span><span class="text-[10px] text-slate-600">${pendingNames.length}명</span></div>`;
html += `<div class="col-span-full grid grid-cols-4 sm:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">`;
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

/** 분류표 팀 지정 (Firestore simTeam 'A'~'F', 팀당 최대 MAX_SIM_TEAM_SIZE명) */
/** @param skipRefresh 일괄 처리 시 true로 중간 렌더 생략 */
window.setPlayerSimTeam = async (pId, team, skipRefresh) => {
try {
checkAuthReady();
if (!window.playerState || !window.playerState.isGM) return;
const target = window.allPlayersData.find((x) => x.id === pId);
if (!target) return;
if (isSimTeamKey(team)) {
const n = (window.allPlayersData || []).filter((x) => x.id !== pId && x.simTeam === team).length;
if (n >= MAX_SIM_TEAM_SIZE) return window.customAlert(`${simTeamInfo(team).name}은 이미 ${MAX_SIM_TEAM_SIZE}명이에요. 다른 팀을 고르거나 한 명을 뺀 뒤 다시 해 주세요.`);
}
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(pId));
const payload = { updatedAt: new Date().toISOString() };
if (isSimTeamKey(team)) payload.simTeam = team;
else payload.simTeam = deleteField();
await setDoc(docRef, payload, { merge: true });
const idx = window.allPlayersData.findIndex((x) => x.id === pId);
if (idx >= 0) {
if (isSimTeamKey(team)) window.allPlayersData[idx] = { ...window.allPlayersData[idx], simTeam: team };
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

/** 팀 편성 결과를 분류표에 그대로 저장: 편성에 든 선수는 그 팀으로, 나머지는 팀에서 뺌 (한 번에 저장) */
window.applyTeamPlan = async (plan) => {
try {
checkAuthReady();
if (!window.playerState || !window.playerState.isGM) return false;
const want = new Map();
plan.forEach((ids, i) => ids.forEach((id) => want.set(id, SIM_TEAM_KEYS[i])));
const batch = writeBatch(db);
const now = new Date().toISOString();
let writes = 0;
(window.allPlayersData || []).forEach((p) => {
const next = want.get(p.id) || null;
const cur = isSimTeamKey(p.simTeam) ? p.simTeam : null;
if (next === cur) return;
const ref = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id));
batch.set(ref, { simTeam: next || deleteField(), updatedAt: now }, { merge: true });
writes++;
});
if (writes) await batch.commit();
// 화면도 바로 맞춰 둠 (서버 응답이 늦어도 분류표가 편성과 같게)
window.allPlayersData = (window.allPlayersData || []).map((p) => {
const next = want.get(p.id);
if (next) return { ...p, simTeam: next };
if (!p.simTeam) return p;
const c = { ...p }; delete c.simTeam; return c;
});
window.simMatchup = { home: 'A', away: 'B' };
window.renderLockerRoom();
if (isVisible('tabSim')) window.renderSimMatchTab();
if (window.selectedPlayerId) window.renderSelectedCard(window.selectedPlayerId);
return true;
} catch (e) {
console.error(e);
window.customAlert('분류표에 저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.');
return false;
}
};

/** 감독: 포지션 바로 바꾸기 (분류표·능력치표의 고르기 칸) */
window.gmSetPosition = async (pId, newPos) => {
try {
checkAuthReady();
if (!window.playerState || !window.playerState.isGM) return;
if (!['Goleiro', 'Fixo', 'Ala', 'Pivo', '미정'].includes(newPos)) return;
const p = (window.allPlayersData || []).find((x) => x.id === pId);
if (!p || (p.pos || '미정') === newPos) return;
const ref = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(pId));
await setDoc(ref, { pos: newPos, updatedAt: new Date().toISOString() }, { merge: true });
} catch (e) {
console.error(e);
window.customAlert('포지션을 저장하지 못했어요. 다시 해 주세요.');
}
};

window.selectPlayer = (pId) => {
window.selectedPlayerId = pId;
window.renderLockerRoom(); window.renderSelectedCard(pId);
if(isVisible('tabAchievements')) window.renderAchievements();
if(isVisible('tabShop')) window.renderShop();
if(isVisible('tabCompare')) window.renderCompareList();
// 휴대폰: 카드가 맨 위에 있으니 맨 위로 올려 카드 전체가 한 화면에 보이게
if(window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: 'smooth' });
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
if (t && t.matches && t.matches('select.gm-pos-select')) {
const pid = t.getAttribute('data-player-id');
if (pid) window.gmSetPosition(pid, t.value);
return;
}
if (t && t.matches && t.matches('.sim-profile-cb')) {
const team = t.getAttribute('data-sim-profile-team');
const pid = t.getAttribute('data-player-id');
if (pid && isSimTeamKey(team)) {
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
if (!isSimTeamKey(t.value)) return;
const k = t.getAttribute('data-sim-board');
if (k && window.simBoardPreferredTarget) window.simBoardPreferredTarget[k] = t.value;
});
document.addEventListener('click', (ev) => {
const clr = ev.target.closest('.sim-team-clear-btn');
if (clr) {
ev.preventDefault();
const tm = clr.getAttribute('data-sim-clear-team');
if (isSimTeamKey(tm)) window.clearSimTeamColumn(tm);
return;
}
const rnd = ev.target.closest('.sim-team-random-fill-btn');
if (rnd) {
ev.preventDefault();
const tm = rnd.getAttribute('data-sim-random-team');
if (isSimTeamKey(tm)) window.fillSimTeamRandomPos(tm);
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
if (!rowTap || ev.target.closest('button, select')) return;
if (!window.playerState || !window.playerState.isGM) return;
const boardKey = rowTap.getAttribute('data-sim-board');
const pid = rowTap.getAttribute('data-player-id');
if (!boardKey || !pid) return;
const picked = document.querySelector(`input[name="${getSimTeamBoardRadioName(boardKey)}"]:checked`);
const team = picked && isSimTeamKey(picked.value) ? picked.value : 'A';
if (rowTap.getAttribute('data-sim-team') === team) return;
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
const toTeamRaw = zone.getAttribute('data-sim-drop');
const toTeam = isSimTeamKey(toTeamRaw) ? toTeamRaw : null;
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
if (pOnly && (pOnly.simTeam || null) === toTeam) return;
await window.setPlayerSimTeam(pid, toTeam);
});
}
}
