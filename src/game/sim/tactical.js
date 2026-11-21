/** 전술판에 선수 그리기와 드래그 */
import { GENDER_MAP, POS_KR } from '../constants.js';
import { ensureSimFieldPositions, simPlayerLiveNorm, saveSimFieldPositionsToStorage } from './formation.js';
import { paintFutsalPitchSurface } from './pitch.js';
import { getSimMatchRoster, padSimRosterWithBots } from './roster.js';
import { getOVR } from '../stats.js';
import { getPortraitUrl } from '../ui.js';
import { fontStack, escapeHtml, escapeAttr } from '../utils.js';

/** 시뮬 피치: 프로필 이미지 URL별 로드 캐시 */
const simPitchPortraitByUrl = new Map();

function preloadSimPitchPortraitUrl(url) {
if (!url) return Promise.resolve(null);
if (simPitchPortraitByUrl.has(url)) return simPitchPortraitByUrl.get(url);
const p = new Promise((resolve) => {
const im = new Image();
im.crossOrigin = 'anonymous';
im.onload = () => resolve(im.naturalWidth ? im : null);
im.onerror = () => resolve(null);
im.src = url;
});
simPitchPortraitByUrl.set(url, p);
return p;
}

/** 출전 선수별 프로필 캔버스용 Image (없으면 null → 이모지 대체) */
export async function buildSimPitchPortraitMap(players) {
const map = new Map();
await Promise.all(
players.map(async (p) => {
const url = getPortraitUrl(p);
const img = await preloadSimPitchPortraitUrl(url);
map.set(p.id, img);
})
);
return map;
}

/** 캔버스용 축구공 스프라이트(원형·패널 패턴) */
export function drawSoccerBallSprite(ctx, x, y, radius, ringColor) {
ctx.save();
ctx.beginPath();
ctx.arc(x, y, radius, 0, Math.PI * 2);
const grd = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius * 1.2);
grd.addColorStop(0, '#ffffff');
grd.addColorStop(0.55, '#f1f5f9');
grd.addColorStop(1, '#cbd5e1');
ctx.fillStyle = grd;
ctx.fill();
ctx.strokeStyle = '#334155';
ctx.lineWidth = Math.max(1, radius * 0.12);
ctx.stroke();
ctx.fillStyle = '#0f172a';
for (let i = 0; i < 5; i++) {
const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + 0.4;
ctx.beginPath();
ctx.arc(x + Math.cos(a) * radius * 0.42, y + Math.sin(a) * radius * 0.42, radius * 0.2, 0, Math.PI * 2);
ctx.fill();
}
ctx.beginPath();
ctx.arc(x + radius * 0.15, y - radius * 0.35, radius * 0.12, 0, Math.PI * 2);
ctx.fillStyle = 'rgba(15,23,42,0.75)';
ctx.fill();
ctx.beginPath();
ctx.arc(x, y, radius + 2.5, 0, Math.PI * 2);
ctx.strokeStyle = ringColor || 'rgba(251,146,60,0.9)';
ctx.lineWidth = 2;
ctx.stroke();
ctx.restore();
}

/** 피치 위 선수끼리 겹치지 않도록 타원 거리로 밀어냄 */
function separateSimLivePositions(items, minNx, minNy) {
const n = items.length;
const clampItem = (it) => {
it.nx = Math.max(0.05, Math.min(0.95, it.nx));
it.ny = Math.max(0.12, Math.min(0.88, it.ny));
};
for (let iter = 0; iter < 20; iter++) {
for (let i = 0; i < n; i++) {
for (let j = i + 1; j < n; j++) {
let dx = (items[j].nx - items[i].nx) / minNx;
let dy = (items[j].ny - items[i].ny) / minNy;
let dist = Math.hypot(dx, dy);
if (dist < 0.0008) {
items[j].nx += minNx * 0.55;
items[j].ny += minNy * (j % 2 === 0 ? 0.45 : -0.45);
dx = (items[j].nx - items[i].nx) / minNx;
dy = (items[j].ny - items[i].ny) / minNy;
dist = Math.hypot(dx, dy);
}
if (dist < 1) {
const push = ((1 - dist) / 2) * 1.12;
let ux = dx / dist;
let uy = dy / dist;
// 가로로 거의 겹치면 이름표가 가려지지 않게 세로로 더 밀어냄
if (Math.abs(dx) < 0.55) {
uy += (uy >= 0 ? 1 : -1) * 0.35;
const nrm = Math.hypot(ux, uy) || 1;
ux /= nrm;
uy /= nrm;
}
items[i].nx -= ux * push * minNx;
items[i].ny -= uy * push * minNy;
items[j].nx += ux * push * minNx;
items[j].ny += uy * push * minNy;
}
}
}
items.forEach(clampItem);
}
}

export function drawSimPlayersOnPitch(ctx, px0, py0, pw, ph, opts) {
const plA = opts.plA;
const plB = opts.plB;
if (!plA || !plB || !plA.length || !plB.length) return;
const portraitMap = opts.portraitMap;
const holderId = opts.ballHolderId || null;
const maxNameW = Math.max(34, Math.min(52, pw * 0.13));
const prRef = Math.max(11, Math.min(16, pw * 0.028));
const placed = [];
[...plA.map((p) => ({ p, team: 'A' })), ...plB.map((p) => ({ p, team: 'B' }))].forEach(({ p, team }) => {
const teamIsA = team === 'A';
const base = window.simFieldPositions[team][p.id] || { nx: teamIsA ? 0.25 : 0.75, ny: 0.5 };
const live = opts.useHomeOnly ? { nx: base.nx, ny: base.ny } : simPlayerLiveNorm(p, teamIsA, base, opts);
placed.push({ p, team, nx: live.nx, ny: live.ny });
});
// 유니폼 폭·이름표 높이까지 포함해 최소 간격을 확보
separateSimLivePositions(
placed,
Math.max(0.11, Math.max(prRef * 2.4, maxNameW * 0.92) / pw),
Math.max(0.22, (prRef * 4.8) / ph)
);
const drawOne = (p, team, nx, ny) => {
const teamIsA = team === 'A';
const x = px0 + nx * pw;
const y = py0 + ny * ph;
const isHolder = holderId && p.id === holderId;
const kitTop = teamIsA ? '#ef4444' : '#3b82f6';
const kitBot = teamIsA ? '#7f1d1d' : '#1e3a8a';
const colRing = isHolder ? 'rgba(250, 204, 21, 0.98)' : teamIsA ? 'rgba(254,202,202,0.95)' : 'rgba(191,219,254,0.95)';
const pr = Math.max(11, Math.min(16, pw * 0.028)) * (isHolder ? 1.12 : 1);
const img = portraitMap && portraitMap.get(p.id);
ctx.save();
ctx.fillStyle = 'rgba(0,0,0,0.35)';
ctx.beginPath();
ctx.ellipse(x, y + pr + 3, pr * 0.85, pr * 0.28, 0, 0, Math.PI * 2);
ctx.fill();
if (isHolder) {
ctx.beginPath();
ctx.arc(x, y, pr + 5, 0, Math.PI * 2);
ctx.fillStyle = 'rgba(250, 204, 21, 0.2)';
ctx.fill();
}
const jw = pr * 1.72;
const jh = pr * 2.15;
ctx.beginPath();
if (typeof ctx.roundRect === 'function') ctx.roundRect(x - jw / 2, y - pr * 1.05, jw, jh, 5);
else ctx.rect(x - jw / 2, y - pr * 1.05, jw, jh);
const kit = ctx.createLinearGradient(x, y - pr, x, y + pr);
kit.addColorStop(0, kitTop);
kit.addColorStop(1, kitBot);
ctx.fillStyle = kit;
ctx.fill();
ctx.save();
ctx.beginPath();
ctx.arc(x, y - 1, pr * 0.92, 0, Math.PI * 2);
ctx.clip();
if (img && img.naturalWidth) {
ctx.drawImage(img, x - pr, y - pr - 2, pr * 2, pr * 2);
} else {
ctx.fillStyle = kitTop;
ctx.fillRect(x - pr, y - pr - 2, pr * 2, pr * 2);
const emoji = (p.gender || GENDER_MAP[p.name]) === 'F' ? '👧' : '👦';
ctx.font = `${Math.floor(pr * 1.4)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(emoji, x, y);
}
ctx.restore();
ctx.beginPath();
ctx.arc(x, y - 1, pr * 0.92, 0, Math.PI * 2);
ctx.strokeStyle = colRing;
ctx.lineWidth = isHolder ? 2.8 : 2;
ctx.stroke();
ctx.restore();
ctx.textAlign = 'center';
ctx.textBaseline = 'alphabetic';
ctx.font = '800 8px ' + fontStack('num');
ctx.fillStyle = 'rgba(15,23,42,0.72)';
ctx.fillRect(x - 10, y - pr - 13, 20, 10);
ctx.fillStyle = isHolder ? '#fef08a' : '#f8fafc';
ctx.fillText(String(getOVR(p)), x, y - pr - 5);
const fullName = String(p.name || '?').trim();
ctx.font = (isHolder ? '800 8px ' : '700 7px ') + fontStack('body');
let shown = fullName;
for (let s = fullName.length; s >= 1; s--) {
shown = s < fullName.length ? `${fullName.slice(0, s)}…` : fullName;
if (ctx.measureText(shown).width <= maxNameW) break;
}
const nw = Math.min(maxNameW, ctx.measureText(shown).width + 8);
ctx.fillStyle = teamIsA ? 'rgba(127,29,29,0.82)' : 'rgba(30,58,138,0.82)';
if (typeof ctx.roundRect === 'function') {
ctx.beginPath();
ctx.roundRect(x - nw / 2, y + pr + 3, nw, 11, 4);
ctx.fill();
} else {
ctx.fillRect(x - nw / 2, y + pr + 3, nw, 11);
}
ctx.fillStyle = isHolder ? 'rgba(254, 249, 195, 0.98)' : 'rgba(248,250,252,0.96)';
ctx.fillText(shown, x, y + pr + 12);
ctx.textAlign = 'left';
};
placed.sort((a, b) => {
if (Math.abs(a.ny - b.ny) > 0.002) return a.ny - b.ny;
const ah = a.p.id === holderId ? 1 : 0;
const bh = b.p.id === holderId ? 1 : 0;
return ah - bh;
});
placed.forEach(({ p, team, nx, ny }) => drawOne(p, team, nx, ny));
}

/** 전술 보드 캔버스: 배치 전용(공 없음) */
window.drawSimTacticalBoard = async () => {
const canvas = document.getElementById('simTacticalCanvas');
if (!canvas || !canvas.getContext) return;
const rawA = getSimMatchRoster('A');
const rawB = getSimMatchRoster('B');
const padA = padSimRosterWithBots(rawA, 'A');
const padB = padSimRosterWithBots(rawB, 'B');
ensureSimFieldPositions(padA.roster, padB.roster);
const plAll = [...padA.roster, ...padB.roster];
const portraitMap = plAll.length ? await buildSimPitchPortraitMap(plAll) : new Map();
const ctx = canvas.getContext('2d');
const wrap = canvas.parentElement;
const cssW = Math.min(720, Math.max(260, wrap?.clientWidth || 320));
const cssH = Math.max(200, Math.min(380, Math.floor(cssW * 0.5)));
const dpr = Math.min(2, window.devicePixelRatio || 1);
canvas.width = Math.floor(cssW * dpr);
canvas.height = Math.floor(cssH * dpr);
canvas.style.width = `${cssW}px`;
canvas.style.height = `${cssH}px`;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
const W = cssW;
const H = cssH;
const px0 = 12;
const py0 = 10;
const pw = W - 24;
const ph = H - 36;
paintFutsalPitchSurface(ctx, W, H, px0, py0, pw, ph);
ctx.strokeStyle = 'rgba(250,204,21,0.28)';
ctx.setLineDash([6, 4]);
ctx.beginPath();
ctx.moveTo(px0 + pw / 2, py0);
ctx.lineTo(px0 + pw / 2, py0 + ph);
ctx.stroke();
ctx.setLineDash([]);
ctx.fillStyle = 'rgba(254,240,138,0.9)';
ctx.font = '700 10px ' + fontStack('body');
ctx.fillText('레드팀 ←  |  → 블루팀', px0 + 4, py0 + ph + 14);
drawSimPlayersOnPitch(ctx, px0, py0, pw, ph, {
plA: padA.roster,
plB: padB.roster,
useHomeOnly: true,
attackA: true,
channel: 'center',
phase: 'build',
outcome: 'neutral',
halfIdx: 0,
simSec: 0,
ballNx: 0.5,
ballNy: 0.5,
portraitMap
});
};

window.renderSimTacticalStrips = () => {
const elA = document.getElementById('simTacticalStripA');
const elB = document.getElementById('simTacticalStripB');
if (!elA || !elB) return;
const rawA = getSimMatchRoster('A');
const rawB = getSimMatchRoster('B');
const padA = padSimRosterWithBots(rawA, 'A');
const padB = padSimRosterWithBots(rawB, 'B');
const chip = (p, team) => {
const br = team === 'A' ? 'border-red-700/60 bg-red-950/50 text-red-100' : 'border-blue-700/60 bg-blue-950/50 text-blue-100';
const pt = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정';
return `<button type="button" draggable="true" class="sim-tactical-chip text-[10px] font-bold px-2 py-1 rounded-lg border ${br} whitespace-nowrap shrink-0" data-sim-chip-team="${team}" data-sim-chip-id="${escapeAttr(p.id)}">${escapeHtml(p.name)} <span class="opacity-70">${pt}</span></button>`;
};
elA.innerHTML = padA.roster.map((p) => chip(p, 'A')).join('') || '<span class="text-[10px] text-slate-500">레드 인원 없음</span>';
elB.innerHTML = padB.roster.map((p) => chip(p, 'B')).join('') || '<span class="text-[10px] text-slate-500">블루 인원 없음</span>';
};

// 전술 보드: 필드 드래그·칩 드롭·기본 포메이션
/** 화면 이벤트 연결(앱 시작 때 initApp.js가 한 번 부릅니다) */
export function bindSimTacticalUi() {
if (typeof window !== 'undefined' && !window.__simTacticalUiBound) {
window.__simTacticalUiBound = true;
window.resetSimFormationDefaults = () => {
const rawA = getSimMatchRoster('A');
const rawB = getSimMatchRoster('B');
const padRA = padSimRosterWithBots(rawA, 'A');
const padRB = padSimRosterWithBots(rawB, 'B');
window.simFieldPositions.A = {};
window.simFieldPositions.B = {};
ensureSimFieldPositions(padRA.roster, padRB.roster);
window.drawSimTacticalBoard();
};
document.getElementById('btnSimFormationReset')?.addEventListener('click', () => window.resetSimFormationDefaults());
let __simTacticalDrag = null;
function __simTacticalLogicalXY(canvas, clientX, clientY) {
const rect = canvas.getBoundingClientRect();
const dpr = Math.min(2, window.devicePixelRatio || 1);
const lw = canvas.width / dpr;
const lh = canvas.height / dpr;
const x = ((clientX - rect.left) / rect.width) * lw;
const y = ((clientY - rect.top) / rect.height) * lh;
return { x, y, lw, lh };
}
function __simTacticalHit(x, y, lw, lh) {
const px0 = 12;
const py0 = 10;
const pw = lw - 24;
const ph = lh - 36;
const padRA = padSimRosterWithBots(getSimMatchRoster('A'), 'A');
const padRB = padSimRosterWithBots(getSimMatchRoster('B'), 'B');
for (const team of ['A', 'B']) {
const roster = team === 'A' ? padRA.roster : padRB.roster;
for (let i = 0; i < roster.length; i++) {
const p = roster[i];
const b = window.simFieldPositions[team][p.id];
if (!b) continue;
const px = px0 + b.nx * pw;
const py = py0 + b.ny * ph;
if (Math.hypot(x - px, y - py) < 18) return { team, pid: p.id };
}
}
return null;
}
const __tacCan = document.getElementById('simTacticalCanvas');
if (__tacCan) {
__tacCan.addEventListener('pointerdown', (e) => {
if (e.button !== undefined && e.button !== 0) return;
const o = __simTacticalLogicalXY(__tacCan, e.clientX, e.clientY);
const h = __simTacticalHit(o.x, o.y, o.lw, o.lh);
if (h) {
__simTacticalDrag = h;
try { __tacCan.setPointerCapture(e.pointerId); } catch (err) {}
}
});
__tacCan.addEventListener('pointermove', (e) => {
if (!__simTacticalDrag) return;
const o = __simTacticalLogicalXY(__tacCan, e.clientX, e.clientY);
const px0 = 12;
const py0 = 10;
const pw = o.lw - 24;
const ph = o.lh - 36;
let nx = (o.x - px0) / pw;
let ny = (o.y - py0) / ph;
nx = Math.max(0.03, Math.min(0.97, nx));
ny = Math.max(0.06, Math.min(0.94, ny));
window.simFieldPositions[__simTacticalDrag.team][__simTacticalDrag.pid] = { nx, ny };
window.drawSimTacticalBoard();
});
const __tacUp = () => {
if (__simTacticalDrag) {
saveSimFieldPositionsToStorage();
__simTacticalDrag = null;
}
};
__tacCan.addEventListener('pointerup', __tacUp);
__tacCan.addEventListener('pointercancel', __tacUp);
__tacCan.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
__tacCan.addEventListener('drop', (e) => {
e.preventDefault();
const pid = e.dataTransfer.getData('text/sim-player');
const team = e.dataTransfer.getData('text/sim-team');
if (!pid || (team !== 'A' && team !== 'B')) return;
const o = __simTacticalLogicalXY(__tacCan, e.clientX, e.clientY);
const px0 = 12;
const py0 = 10;
const pw = o.lw - 24;
const ph = o.lh - 36;
let nx = (o.x - px0) / pw;
let ny = (o.y - py0) / ph;
nx = Math.max(0.03, Math.min(0.97, nx));
ny = Math.max(0.06, Math.min(0.94, ny));
window.simFieldPositions[team][pid] = { nx, ny };
saveSimFieldPositionsToStorage();
window.drawSimTacticalBoard();
});
}
}
}
