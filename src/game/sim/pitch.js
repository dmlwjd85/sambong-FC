/** 풋살 경기장 그리기 */
import { liveScene } from './liveScene.js';
import { getSimMatchRoster, padSimRosterWithBots, simSlotTeam } from './roster.js';
import { buildSimSituationMeta, applySimPitchCaptionMeta, drawSimPitchFxOverlay } from './broadcast.js';
import { simPlayerLiveNorm } from './formation.js';
import { buildSimPitchPortraitMap, drawSoccerBallSprite, drawSimPlayersOnPitch } from './tactical.js';
import { fontStack } from '../utils.js';

/** 풋살 코트 마킹 · 네트 · 페널티 스팟 */
function drawFutsalPitchMarkings(ctx, px0, py0, pw, ph, midX) {
ctx.save();
ctx.strokeStyle = 'rgba(255,255,255,0.72)';
ctx.lineWidth = 1.8;
ctx.strokeRect(px0 + 0.5, py0 + 0.5, pw - 1, ph - 1);
ctx.beginPath();
ctx.moveTo(midX, py0);
ctx.lineTo(midX, py0 + ph);
ctx.stroke();
ctx.strokeStyle = 'rgba(255,255,255,0.28)';
ctx.lineWidth = 1.2;
ctx.beginPath();
ctx.arc(midX, py0 + ph / 2, Math.min(ph, pw) * 0.15, 0, Math.PI * 2);
ctx.stroke();
ctx.fillStyle = 'rgba(255,255,255,0.85)';
ctx.beginPath();
ctx.arc(midX, py0 + ph / 2, 2.4, 0, Math.PI * 2);
ctx.fill();
const gaW = pw * 0.14;
const gaH = ph * 0.46;
const gaY = py0 + (ph - gaH) / 2;
ctx.strokeStyle = 'rgba(255,255,255,0.5)';
ctx.lineWidth = 1.3;
ctx.strokeRect(px0, gaY, gaW, gaH);
ctx.strokeRect(px0 + pw - gaW, gaY, gaW, gaH);
const paW = pw * 0.22;
const paH = ph * 0.62;
const paY = py0 + (ph - paH) / 2;
ctx.strokeStyle = 'rgba(255,255,255,0.22)';
ctx.strokeRect(px0, paY, paW, paH);
ctx.strokeRect(px0 + pw - paW, paY, paW, paH);
const spotR = 2.1;
ctx.fillStyle = 'rgba(255,255,255,0.8)';
ctx.beginPath();
ctx.arc(px0 + gaW + 8, py0 + ph / 2, spotR, 0, Math.PI * 2);
ctx.fill();
ctx.beginPath();
ctx.arc(px0 + pw - gaW - 8, py0 + ph / 2, spotR, 0, Math.PI * 2);
ctx.fill();
const gmouthW = 7;
const gmouthH = gaH * 0.4;
const gmouthY = py0 + ph / 2 - gmouthH / 2;
const drawNet = (x, flip) => {
ctx.fillStyle = 'rgba(15,23,42,0.88)';
ctx.fillRect(x, gmouthY, gmouthW, gmouthH);
ctx.strokeStyle = 'rgba(250,204,21,0.92)';
ctx.lineWidth = 1.6;
ctx.strokeRect(x, gmouthY, gmouthW, gmouthH);
ctx.strokeStyle = 'rgba(226,232,240,0.35)';
ctx.lineWidth = 0.7;
for (let i = 1; i < 4; i++) {
const nx = x + (gmouthW * i) / 4;
ctx.beginPath();
ctx.moveTo(nx, gmouthY);
ctx.lineTo(nx, gmouthY + gmouthH);
ctx.stroke();
}
for (let i = 1; i < 5; i++) {
const ny = gmouthY + (gmouthH * i) / 5;
ctx.beginPath();
ctx.moveTo(x, ny);
ctx.lineTo(x + gmouthW, ny);
ctx.stroke();
}
if (flip) { /* 좌우 대칭용 자리 */ }
};
drawNet(px0 - 2, false);
drawNet(px0 + pw - gmouthW + 2, true);
ctx.restore();
}

/** 스타디움 바닥 · 줄무늬 잔디 · 사이드보드 · 레드/블루 코너 */
export function paintFutsalPitchSurface(ctx, W, H, px0, py0, pw, ph) {
ctx.fillStyle = '#071018';
ctx.fillRect(0, 0, W, H);
const flood = ctx.createRadialGradient(W / 2, H * 0.28, 12, W / 2, H * 0.42, Math.max(W, H) * 0.7);
flood.addColorStop(0, 'rgba(255,255,230,0.1)');
flood.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = flood;
ctx.fillRect(0, 0, W, H);
ctx.fillStyle = '#7f1d1d';
ctx.fillRect(px0 - 7, py0 - 5, 7, ph + 10);
ctx.fillStyle = '#1e3a8a';
ctx.fillRect(px0 + pw, py0 - 5, 7, ph + 10);
ctx.fillStyle = '#0f172a';
ctx.fillRect(px0 - 7, py0 - 5, pw + 14, 5);
ctx.fillRect(px0 - 7, py0 + ph, pw + 14, 5);
const stripeN = 12;
const stripeW = pw / stripeN;
for (let i = 0; i < stripeN; i++) {
ctx.fillStyle = i % 2 === 0 ? '#168a3f' : '#127536';
ctx.fillRect(px0 + i * stripeW, py0, stripeW + 0.6, ph);
}
const gloss = ctx.createLinearGradient(px0, py0, px0, py0 + ph);
gloss.addColorStop(0, 'rgba(255,255,255,0.1)');
gloss.addColorStop(0.45, 'rgba(255,255,255,0)');
gloss.addColorStop(1, 'rgba(0,0,0,0.22)');
ctx.fillStyle = gloss;
ctx.fillRect(px0, py0, pw, ph);
const midX = px0 + pw / 2;
drawFutsalPitchMarkings(ctx, px0, py0, pw, ph, midX);
ctx.fillStyle = 'rgba(185,28,28,0.22)';
ctx.beginPath();
ctx.moveTo(px0, py0);
ctx.lineTo(px0 + 28, py0);
ctx.lineTo(px0, py0 + 22);
ctx.fill();
ctx.fillStyle = 'rgba(37,99,235,0.22)';
ctx.beginPath();
ctx.moveTo(px0 + pw, py0);
ctx.lineTo(px0 + pw - 28, py0);
ctx.lineTo(px0 + pw, py0 + 22);
ctx.fill();
ctx.font = '800 10px ' + fontStack('num');
ctx.fillStyle = 'rgba(254,226,226,0.92)';
ctx.fillText('RED', px0 + 6, py0 + ph - 7);
ctx.fillStyle = 'rgba(219,234,254,0.92)';
ctx.textAlign = 'right';
ctx.fillText('BLUE', px0 + pw - 6, py0 + ph - 7);
ctx.textAlign = 'left';
}

/** 상단 고정 캔버스: 경기장·위험지역·골대·페널티·볼·공격 방향 화살표(성공=초록/실패=빨강/중립=주황) */
export async function drawSimPitchLive(opts) {
const canvas = document.getElementById('simPitchCanvas');
const badge = document.getElementById('simPitchBadge');
if (!canvas || !canvas.getContext) return;
const ctx = canvas.getContext('2d');
const wrap = canvas.parentElement;
const maxCssW = typeof window !== 'undefined' ? Math.min(window.innerWidth - 20, 720) : 720;
const cssW = Math.max(260, Math.min(maxCssW, wrap?.clientWidth || maxCssW));
const cssH = Math.max(188, Math.min(380, Math.floor(cssW * 0.5)));
const dpr = Math.min(2, typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1);
canvas.width = Math.floor(cssW * dpr);
canvas.height = Math.floor(cssH * dpr);
canvas.style.width = `${cssW}px`;
canvas.style.height = `${cssH}px`;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const W = cssW;
const H = cssH;
const px0 = 16;
const py0 = 12;
const pw = W - 32;
const ph = H - 44;

paintFutsalPitchSurface(ctx, W, H, px0, py0, pw, ph);

const dzW = pw * 0.2;
ctx.fillStyle = 'rgba(220, 38, 38, 0.18)';
ctx.fillRect(px0, py0, dzW, ph);
ctx.fillRect(px0 + pw - dzW, py0, dzW, ph);
ctx.font = '600 9px ' + fontStack('body');
ctx.fillStyle = 'rgba(254, 242, 242, 0.88)';
ctx.fillText('BOX', px0 + 8, py0 + 22);
ctx.fillText('BOX', px0 + pw - dzW + 8, py0 + 22);

ctx.fillStyle = 'rgba(0,0,0,0.5)';
ctx.fillRect(px0 - 3, py0 + ph * 0.32, 3, ph * 0.36);
ctx.fillRect(px0 + pw, py0 + ph * 0.32, 3, ph * 0.36);

const chY = { left: 0.22, center: 0.5, right: 0.78 };
const lane = chY[opts.channel] ?? 0.5;
const attackA = opts.attackA;
let baseBallNx;
if (opts.phase === 'build') baseBallNx = attackA ? 0.28 : 0.72;
else if (opts.phase === 'progress') baseBallNx = attackA ? 0.55 : 0.45;
else baseBallNx = attackA ? 0.82 : 0.18;
const baseBallNy = lane;
let ballNx = baseBallNx;
let ballNy = baseBallNy;
const plAll = [...(opts.plA || []), ...(opts.plB || [])];
if (opts.ballHolderId && plAll.length) {
const hp = plAll.find((x) => x.id === opts.ballHolderId);
if (hp) {
const teamIsA = opts.plA.some((x) => x.id === hp.id);
const base = window.simFieldPositions[teamIsA ? 'A' : 'B'][hp.id] || { nx: teamIsA ? 0.25 : 0.75, ny: 0.5 };
const hPos = simPlayerLiveNorm(hp, teamIsA, base, { ...opts, ballNx: baseBallNx, ballNy: baseBallNy });
const towardGoal = teamIsA ? 1 : -1;
ballNx = Math.max(0.03, Math.min(0.97, hPos.nx + towardGoal * 0.007));
ballNy = Math.max(0.06, Math.min(0.94, hPos.ny));
}
}
const portraitMap = plAll.length ? await buildSimPitchPortraitMap(plAll) : new Map();
const ballX = px0 + pw * ballNx;
const ballY = py0 + ph * ballNy;

const flow = opts.ballFlowTrail || [];
if (flow.length >= 2) {
ctx.save();
ctx.globalAlpha = 0.42;
ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
ctx.lineWidth = 2;
ctx.lineJoin = 'round';
ctx.setLineDash([5, 5]);
ctx.beginPath();
flow.forEach((pt, i) => {
const tx = px0 + pt.nx * pw;
const ty = py0 + pt.ny * ph;
if (i === 0) ctx.moveTo(tx, ty);
else ctx.lineTo(tx, ty);
});
ctx.stroke();
ctx.setLineDash([]);
flow.forEach((pt) => {
ctx.beginPath();
ctx.arc(px0 + pt.nx * pw, py0 + pt.ny * ph, 2.4, 0, Math.PI * 2);
ctx.fillStyle = 'rgba(251, 191, 36, 0.75)';
ctx.fill();
});
ctx.restore();
}

if (opts.broadcastFx) {
drawSimPitchFxOverlay(ctx, px0, py0, pw, ph, ballX, ballY, opts.broadcastFx, flow, attackA);
}

const oc = opts.outcome === 'success' ? '#4ade80' : opts.outcome === 'fail' ? '#f87171' : '#fb923c';
const gaW = pw * 0.13;
const goalTargetX = attackA ? px0 + pw - gaW * 0.45 : px0 + gaW * 0.45;
const laneT = chY[opts.channel] ?? 0.5;
const goalTargetY = py0 + ph * (0.35 + laneT * 0.3);
let ang = Math.atan2(goalTargetY - ballY, goalTargetX - ballX);
const arrowLen = Math.min(88, pw * 0.28);
let tipX = ballX + Math.cos(ang) * arrowLen;
let tipY = ballY + Math.sin(ang) * arrowLen;
ctx.save();
ctx.globalAlpha = 0.5;
ctx.strokeStyle = oc;
ctx.lineWidth = 2;
ctx.setLineDash([4, 3]);
ctx.beginPath();
ctx.moveTo(ballX, ballY);
ctx.lineTo(tipX, tipY);
ctx.stroke();
ctx.setLineDash([]);
ctx.globalAlpha = 0.65;
ctx.fillStyle = oc;
const head = 9;
const backAng = ang + Math.PI;
ctx.beginPath();
ctx.moveTo(tipX, tipY);
ctx.lineTo(tipX + Math.cos(backAng + 0.35) * head, tipY + Math.sin(backAng + 0.35) * head);
ctx.lineTo(tipX + Math.cos(backAng - 0.35) * head, tipY + Math.sin(backAng - 0.35) * head);
ctx.closePath();
ctx.fill();
ctx.restore();

drawSoccerBallSprite(ctx, ballX, ballY, Math.max(6, Math.min(9, pw * 0.015)), oc);

if (opts.plA && opts.plB && opts.plA.length && opts.plB.length) {
drawSimPlayersOnPitch(ctx, px0, py0, pw, ph, { ...opts, ballNx, ballNy, portraitMap, ballHolderId: opts.ballHolderId });
}

const plAllMeta = plAll;
const meta = buildSimSituationMeta(opts, plAllMeta);
applySimPitchCaptionMeta(meta);

ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
ctx.fillRect(px0, py0 + ph + 1, pw, 14);
if (meta && meta.captionLine) {
const metaColor = opts.outcome === 'success' ? 'rgba(134, 239, 172, 0.95)'
: opts.outcome === 'fail' ? 'rgba(252, 165, 165, 0.95)'
: 'rgba(253, 186, 116, 0.95)';
ctx.fillStyle = metaColor;
ctx.font = '700 9px ' + fontStack('body');
let shown = meta.captionLine;
for (let s = meta.captionLine.length; s >= 8; s--) {
shown = s < meta.captionLine.length ? `${meta.captionLine.slice(0, s)}…` : meta.captionLine;
if (ctx.measureText(shown).width <= pw - 8) break;
}
ctx.fillText(shown, px0 + 4, py0 + ph + 11);
}

if (badge) {
if (opts.broadcastFx === 'goal') {
badge.textContent = '⚽ GOAL!';
badge.className = 'text-[11px] font-black px-2.5 py-0.5 rounded-md bg-yellow-900/90 text-yellow-100 border border-yellow-400/70 sim-badge-pulse';
} else if (opts.broadcastFx === 'superSave') {
badge.textContent = '🧤 SUPER SAVE';
badge.className = 'text-[11px] font-black px-2.5 py-0.5 rounded-md bg-cyan-900/90 text-cyan-100 border border-cyan-400/70 sim-badge-pulse';
} else if (opts.broadcastFx === 'keyPass') {
badge.textContent = '🎯 KEY PASS';
badge.className = 'text-[11px] font-black px-2.5 py-0.5 rounded-md bg-purple-900/90 text-purple-100 border border-purple-400/70 sim-badge-pulse';
} else {
const out = opts.outcome === 'success' ? '성공' : opts.outcome === 'fail' ? '실패' : '중립';
badge.textContent = `진행: ${out}`;
badge.className = opts.outcome === 'success'
? 'text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-emerald-900/80 text-emerald-200 border border-emerald-600/50'
: opts.outcome === 'fail'
? 'text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-red-900/80 text-red-200 border border-red-600/50'
: 'text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-amber-900/70 text-amber-100 border border-amber-600/40';
}
}
}

/** 경기 전·중계 지움 후 상단 패널 초기화 */
export function resetSimPitchCanvas() {
// 새 라이브 코트(가로·세로)로 대기 화면을 그림. 출전 선수는 기본 위치에 서 있음
const rosterOf = (slot) => padSimRosterWithBots(getSimMatchRoster(slot), slot).roster;
let plA = []; let plB = [];
try { plA = rosterOf('A'); plB = rosterOf('B'); } catch (e) { /* 명단 없음 */ }
try { liveScene.setKits(simSlotTeam('A'), simSlotTeam('B')); } catch (e) { /* 무시 */ }
liveScene.idle(plA, plB);
}
