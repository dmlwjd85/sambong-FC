/** 모의경기 포메이션 위치 저장·계산 */
import { getOVR } from '../stats.js';

const SIM_FIELD_LS_KEY = 'sfc_sim_field_v2';
/** @type {{ A: Record<string, { nx: number, ny: number }>, B: Record<string, { nx: number, ny: number }> }} */
window.simFieldPositions = window.simFieldPositions || { A: {}, B: {} };

function loadSimFieldPositionsFromStorage() {
try {
const raw = localStorage.getItem(SIM_FIELD_LS_KEY);
if (!raw) return;
const o = JSON.parse(raw);
if (o && o.A && o.B) window.simFieldPositions = { A: o.A, B: o.B };
} catch (e) { console.warn('sim field load', e); }
}
export function saveSimFieldPositionsToStorage() {
try {
localStorage.setItem(SIM_FIELD_LS_KEY, JSON.stringify(window.simFieldPositions));
} catch (e) { console.warn('sim field save', e); }
}
loadSimFieldPositionsFromStorage();

/** 기본 포메이션: 레드 기준 — 골키퍼·픽소·양 측면·피보가 서로 겹치지 않게 간격을 둠 */
const SIM_DEFAULT_SLOTS_A = [
{ nx: 0.08, ny: 0.50 },
{ nx: 0.26, ny: 0.50 },
{ nx: 0.32, ny: 0.16 },
{ nx: 0.32, ny: 0.84 },
{ nx: 0.40, ny: 0.50 }
];
const SIM_DEFAULT_SLOTS_B = SIM_DEFAULT_SLOTS_A.map((s) => ({ nx: 1 - s.nx, ny: s.ny }));

function assignDefaultFormationNorm(plList, team) {
const slots = team === 'A' ? SIM_DEFAULT_SLOTS_A : SIM_DEFAULT_SLOTS_B;
const order = [...plList].sort((a, b) => {
const pr = (p) => ({ Goleiro: 0, Fixo: 1, Ala: 2, Pivo: 3, 미정: 4 }[p.pos] ?? 4);
return pr(a) - pr(b);
});
const out = {};
order.forEach((p, i) => {
const s = slots[Math.min(i, slots.length - 1)];
out[p.id] = { nx: s.nx, ny: s.ny };
});
return out;
}

/** 출전 명단 기준으로 미저장 좌표만 기본 포메이션으로 채움 */
export function ensureSimFieldPositions(plA, plB) {
const defA = assignDefaultFormationNorm(plA, 'A');
const defB = assignDefaultFormationNorm(plB, 'B');
window.simFieldPositions.A = window.simFieldPositions.A || {};
window.simFieldPositions.B = window.simFieldPositions.B || {};
plA.forEach((p) => {
if (!window.simFieldPositions.A[p.id]) window.simFieldPositions.A[p.id] = { ...defA[p.id] };
});
plB.forEach((p) => {
if (!window.simFieldPositions.B[p.id]) window.simFieldPositions.B[p.id] = { ...defB[p.id] };
});
Object.keys(window.simFieldPositions.A).forEach((id) => {
if (!plA.some((p) => p.id === id)) delete window.simFieldPositions.A[id];
});
Object.keys(window.simFieldPositions.B).forEach((id) => {
if (!plB.some((p) => p.id === id)) delete window.simFieldPositions.B[id];
});
saveSimFieldPositionsToStorage();
}

/** 공격/수비·공 위치·채널에 따라 홈에서 벗어나 상대 진영과 섞이는 실시간 좌표(정규화 0~1) */
export function simPlayerLiveNorm(p, teamIsA, home, o) {
const pos = p.pos || '미정';
const ballNx = typeof o.ballNx === 'number' ? o.ballNx : 0.5;
const ballNy = typeof o.ballNy === 'number' ? o.ballNy : 0.5;
const attackA = o.attackA;
const channel = o.channel || 'center';
const phase = o.phase || 'build';
const t = ((o.halfIdx || 0) * 1200 + (o.simSec || 0)) * 0.09 + (String(p.id).length % 11) * 0.37;
const weAttack = (attackA && teamIsA) || (!attackA && !teamIsA);
const phZ = phase === 'danger' ? 1.35 : phase === 'progress' ? 1.05 : 0.82;
const cyShift = channel === 'left' ? -0.14 : channel === 'right' ? 0.14 : 0;
let nx = home.nx;
let ny = home.ny;
const wBall = pos === 'Goleiro' ? 0.05 : pos === 'Fixo' ? 0.12 : pos === 'Ala' ? 0.18 : pos === 'Pivo' ? 0.2 : 0.14;
nx += (ballNx - nx) * wBall * 0.22 * phZ;
ny += (ballNy - ny) * wBall * 0.14 * phZ;
ny += cyShift * 0.16 * (weAttack ? 1 : 0.55);
if (weAttack) {
const push = (pos === 'Goleiro' ? 0.02 : pos === 'Fixo' ? 0.05 : pos === 'Pivo' ? 0.12 : 0.1) * phZ;
nx += teamIsA ? push : -push;
if (pos === 'Fixo') {
const hold = teamIsA ? 0.36 : 0.64;
nx += (hold - nx) * 0.28 * phZ;
ny += (0.5 - ny) * 0.12 * phZ;
} else if (pos !== 'Goleiro') {
const wingSpread = 0.34 * phZ;
ny += (home.ny - 0.5) * wingSpread;
const sideBias = Math.abs(home.ny - 0.5);
nx += (teamIsA ? 1 : -1) * (0.1 * phZ + sideBias * 0.09 * phZ);
if (pos === 'Ala' || pos === 'Pivo') {
nx += (teamIsA ? 1 : -1) * 0.06 * phZ;
}
}
} else {
const drop = (pos === 'Goleiro' ? 0.02 : pos === 'Fixo' ? 0.1 : 0.07) * phZ;
nx += teamIsA ? -drop : drop;
ny += (0.5 - ny) * 0.26 * phZ;
if (pos !== 'Goleiro' && pos !== 'Fixo') {
nx += (teamIsA ? -1 : 1) * 0.03 * phZ;
}
}
if (phase === 'danger' && pos !== 'Goleiro') {
nx += (ballNx - nx) * 0.1;
ny += (ballNy - ny) * 0.08;
}
const ovrJ = (getOVR(p) / 99) * 0.022;
nx += Math.sin(t + (teamIsA ? 0 : 2)) * ovrJ;
ny += Math.cos(t * 0.85 + (pos === 'Ala' ? 1 : 0)) * ovrJ * 1.05;
nx += Math.sin(t * 0.4) * 0.012;
ny += Math.cos(t * 0.55) * 0.01;
nx = Math.max(0.03, Math.min(0.97, nx));
ny = Math.max(0.06, Math.min(0.94, ny));
return { nx, ny };
}

/** 볼 소유자 정규화 좌표(중계 캔버스·연속 공 흐름 점과 동일 기준) */
export function simHolderBallNorm(holder, opts) {
if (!holder || !opts.plA || !opts.plB) return { nx: 0.5, ny: 0.5 };
const teamIsA = opts.plA.some((x) => x.id === holder.id);
const base = window.simFieldPositions[teamIsA ? 'A' : 'B'][holder.id] || { nx: teamIsA ? 0.25 : 0.75, ny: 0.5 };
const chY = { left: 0.22, center: 0.5, right: 0.78 };
const lane = chY[opts.channel] ?? 0.5;
const attackA = opts.attackA;
let baseBallNx;
if (opts.phase === 'build') baseBallNx = attackA ? 0.28 : 0.72;
else if (opts.phase === 'progress') baseBallNx = attackA ? 0.55 : 0.45;
else baseBallNx = attackA ? 0.82 : 0.18;
const baseBallNy = lane;
return simPlayerLiveNorm(holder, teamIsA, base, { ...opts, ballNx: baseBallNx, ballNy: baseBallNy });
}
