/** 모의경기 명단과 팀 자동 편성 */
import { POS_KR } from '../constants.js';
import { ensureSimFieldPositions } from './formation.js';
import { resetSimPitchCanvas } from './pitch.js';
import { getOVR, getPosColor } from '../stats.js';
import { getAvatarHtml, triggerConfetti } from '../ui.js';
import { escapeHtml } from '../utils.js';

window.changeTeamCount = (change) => {
window.targetTeamCount = Math.max(2, Math.min(6, window.targetTeamCount + change));
document.getElementById('targetTeamCount') && (document.getElementById('targetTeamCount').innerText = window.targetTeamCount);
};

/** 모의경기: 팀별 라커 소속 인원 수 */
export function countSimTeam(team) {
return (window.allPlayersData || []).filter((p) => p.simTeam === team).length;
}

export function getSimMatchRoster(team) {
return (window.allPlayersData || [])
.filter((p) => p.simTeam === team)
.sort((a, b) => getOVR(b) - getOVR(a))
.slice(0, 5);
}

/** 모의경기 탭: 인원 수 + 팀 분류 보드(라커와 동일 UI) */
window.renderSimMatchTab = () => {
const na = countSimTeam('A');
const nb = countSimTeam('B');
const ca = document.getElementById('simCountA');
const cb = document.getElementById('simCountB');
if (ca) ca.textContent = `소속 ${na}명 · 출전 OVR 상위 5명 (팀당 1명 이상이면 연습 경기 가능)`;
if (cb) cb.textContent = `소속 ${nb}명 · 출전 OVR 상위 5명 (팀당 1명 이상이면 연습 경기 가능)`;
window.renderSimTeamBoards();
const rawTA = getSimMatchRoster('A');
const rawTB = getSimMatchRoster('B');
const padTA = padSimRosterWithBots(rawTA, 'A');
const padTB = padSimRosterWithBots(rawTB, 'B');
ensureSimFieldPositions(padTA.roster, padTB.roster);
window.renderSimTacticalStrips();
window.drawSimTacticalBoard();
const slog = document.getElementById('simMatchLog');
if (slog && slog.children.length === 0) resetSimPitchCanvas();
const brief = document.getElementById('simPrematchBrief');
if (brief && padTA.roster.length && padTB.roster.length) {
const oa = Math.round(padTA.roster.reduce((s, p) => s + getOVR(p), 0) / padTA.roster.length);
const ob = Math.round(padTB.roster.reduce((s, p) => s + getOVR(p), 0) / padTB.roster.length);
const starA = [...padTA.roster].sort((a, b) => getOVR(b) - getOVR(a))[0];
const starB = [...padTB.roster].sort((a, b) => getOVR(b) - getOVR(a))[0];
const fav = oa === ob ? '팽팽한 전력' : (oa > ob ? `레드팀이 OVR ${oa - ob} 우세` : `블루팀이 OVR ${ob - oa} 우세`);
brief.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-2 mb-2"><span class="text-[10px] font-black tracking-widest text-amber-300">PRE-MATCH · 레드팀 VS 블루팀</span><span class="text-[10px] text-slate-400">${fav}</span></div>
<div class="grid grid-cols-3 gap-2 text-center mb-2">
<div><div class="text-red-300 font-black text-lg">${oa}</div><div class="text-[9px] text-slate-500">레드팀 평균</div></div>
<div class="text-[10px] text-slate-400 self-center">VS</div>
<div><div class="text-blue-300 font-black text-lg">${ob}</div><div class="text-[9px] text-slate-500">블루팀 평균</div></div>
</div>
<p class="text-[11px] text-slate-300">핵심 매치업: <b class="text-red-200">${escapeHtml(starA.name)}</b> (OVR ${getOVR(starA)}) vs <b class="text-blue-200">${escapeHtml(starB.name)}</b> (OVR ${getOVR(starB)}). 슈팅은 슈팅/반사신경, 패스는 패스/가로채기 맞대결로 판정됩니다.</p>`;
}
};

/** 모의경기 포지션 약칭 (중계용) */
export function simPosShort(p) {
const m = { Goleiro: '골키퍼', Fixo: '픽소', Ala: '아라', Pivo: '피보', 미정: '미정' };
return m[p.pos] || '미정';
}

export function simPickTwoDistinct(players) {
if (players.length < 2) return [players[0], players[0]];
const a = players[Math.floor(Math.random() * players.length)];
let b = players[Math.floor(Math.random() * players.length)];
let guard = 0;
while (b.id === a.id && guard++ < 12) b = players[Math.floor(Math.random() * players.length)];
return [a, b];
}

/** 실제 소속 선수만으로 5명 미만일 때 시뮬용 가상 팀원으로 채움 (서버·기록 없음) */
export function padSimRosterWithBots(realRoster, teamLetter) {
const sorted = [...realRoster].sort((a, b) => getOVR(b) - getOVR(a)).slice(0, 5);
const need = Math.max(0, 5 - sorted.length);
let bots = 0;
const posCycle = ['Goleiro', 'Fixo', 'Ala', 'Pivo', 'Ala'];
const avgOvr = sorted.length
? Math.round(sorted.reduce((s, p) => s + getOVR(p), 0) / sorted.length)
: 72;
for (let i = 0; i < need; i++) {
bots++;
const idx = sorted.length;
const v = Math.max(58, Math.min(82, avgOvr + Math.floor(Math.random() * 7) - 3));
const pos = posCycle[idx % posCycle.length];
const bot = {
id: `__sim_bot_${teamLetter}_${idx}`,
name: `자동 보조 ${bots}`,
pos,
age: 15,
level: 1,
pac: v, sho: v, pas: v, dri: v, def: v, phy: v, ref: v, int: v, pst: v, dis: v, cmp: v, wrk: v,
inventory: [],
itemLevels: {},
equipHead: null, equipHandL: null, equipHandR: null, equipFootL: null, equipFootR: null, equipFace: null
};
sorted.push(bot);
}
return { roster: sorted, bots };
}

window.generateBalancedTeams = () => {
const resultEl = document.getElementById('teamResult');
if(window.checkedInPlayers.size < window.targetTeamCount) { window.customAlert(`선택된 선수가 ${window.targetTeamCount}명보다 적습니다.`); return; }

const activePlayers = Array.from(window.checkedInPlayers).map(id => window.allPlayersData.find(p => p.id === id)).filter(Boolean);
const teams = Array.from({ length: window.targetTeamCount }, () => ({ players: [], totalOvr: 0 }));

// 1. 포지션별 그룹화
const posGroups = { 'Goleiro': [], 'Fixo': [], 'Pivo': [], 'Ala': [], '미정': [] };
activePlayers.forEach(p => {
const pos = p.pos && posGroups[p.pos] ? p.pos : '미정';
posGroups[pos].push(p);
});

// 2. 골레이로(GK) 우선 고정 배치 (각 팀에 1명씩 최대한 보장되도록 라운드로빈 배분)
posGroups['Goleiro'].sort((a, b) => getOVR(b) - getOVR(a));
let teamIdx = 0;
posGroups['Goleiro'].forEach(p => {
if (teamIdx < window.targetTeamCount) {
teams[teamIdx].players.push(p);
teams[teamIdx].totalOvr += getOVR(p);
teamIdx++;
} else {
teams.sort((a, b) => a.totalOvr - b.totalOvr);
teams[0].players.push(p);
teams[0].totalOvr += getOVR(p);
}
});

// 3. 픽소(DF) 다음으로 밸런스 분배
posGroups['Fixo'].sort((a, b) => getOVR(b) - getOVR(a));
posGroups['Fixo'].forEach(p => {
teams.sort((a, b) => a.totalOvr - b.totalOvr);
teams[0].players.push(p);
teams[0].totalOvr += getOVR(p);
});

// 4. 나머지 포지션(Pivo, Ala, 미정) 밸런스 분배
const posOrder = ['Pivo', 'Ala', '미정'];
posOrder.forEach(pos => {
posGroups[pos].sort((a, b) => getOVR(b) - getOVR(a));
posGroups[pos].forEach(p => {
teams.sort((a, b) => a.totalOvr - b.totalOvr);
teams[0].players.push(p);
teams[0].totalOvr += getOVR(p);
});
});

let html = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">';
teams.forEach((team, idx) => {
const avgOvr = Math.round(team.totalOvr / team.players.length);
let pList = team.players.map(p => {
const posColor = getPosColor(p.pos); const posText = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정';
return `<div class="flex justify-between items-center text-sm py-1 border-b border-slate-700/50 last:border-0"><span class="flex items-center gap-2"><span class="inline-flex w-8 justify-center">${getAvatarHtml(p, 'sm')}</span> <span class="text-white font-bold">${p.name}</span></span> <div class="flex items-center gap-2"><span class="text-[9px] ${posColor} border border-slate-700 px-1 rounded font-bold">${posText}</span><span class="font-oswald text-fut-gold">${getOVR(p)}</span></div></div>`;
}).join('');

html += `<div class="bg-slate-900/80 p-4 rounded-xl border-t-4 border-emerald-500 shadow-lg"><div class="flex justify-between items-center mb-3 pb-2 border-b border-emerald-900/50"><h4 class="font-display text-emerald-400 text-lg">TEAM ${idx + 1}</h4><span class="text-xs bg-emerald-900/50 text-emerald-300 px-2 py-1 rounded font-bold shadow-inner">평균 OVR ${avgOvr}</span></div><div class="space-y-1">${pList}</div></div>`;
});
html += '</div>';
if(resultEl) { resultEl.innerHTML = html; resultEl.classList.remove('hidden'); resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
window.renderSimTeamBoards();
triggerConfetti();
};
