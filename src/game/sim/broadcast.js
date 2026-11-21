/** 모의경기 중계 자막·효과 */
import confetti from 'canvas-confetti';
import { simPosShort } from './roster.js';
import { fontStack } from '../utils.js';

/** 중계 문장을 자동 줄바꿈 (캔버스 폭 기준) */
function wrapSimBroadcastLines(ctx, text, maxWidth) {
const lines = [];
let line = '';
for (let i = 0; i < text.length; i++) {
const ch = text[i];
const test = line + ch;
if (ctx.measureText(test).width > maxWidth && line.length > 0) {
lines.push(line);
line = ch;
} else {
line = test;
}
}
if (line.length) lines.push(line);
return lines.length ? lines : [''];
}

/** 모의경기 이펙트용 confetti 발사 위치 (피치 캔버스 기준) */
function getSimFxOrigin(side) {
const canvas = document.getElementById('simPitchCanvas');
if (!canvas || typeof window === 'undefined') return { x: 0.5, y: 0.38 };
const rect = canvas.getBoundingClientRect();
const nx = side === 'left' ? 0.12 : side === 'right' ? 0.88 : 0.5;
return {
x: (rect.left + rect.width * nx) / window.innerWidth,
y: (rect.top + rect.height * 0.42) / window.innerHeight
};
}

/** 골·슈퍼세이브·킬패스 — confetti + 피치 패널 펄스 */
export function runSimBroadcastFx(fx, pitchOpts) {
if (!fx || typeof confetti !== 'function') return;
const attackA = !!pitchOpts?.attackA;
const origin = getSimFxOrigin(
fx === 'goal' ? (attackA ? 'right' : 'left')
: fx === 'superSave' ? (attackA ? 'left' : 'right')
: 'center'
);
const base = { origin, zIndex: 9999, disableForReducedMotion: true };
if (fx === 'goal') {
confetti({ ...base, particleCount: 130, spread: 88, startVelocity: 54, colors: ['#fbbf24', '#22c55e', '#fef08a', '#ffffff', '#fde047'] });
setTimeout(() => confetti({ ...base, particleCount: 85, spread: 105, startVelocity: 40, scalar: 1.15, colors: ['#eab308', '#4ade80', '#fde047'] }), 160);
setTimeout(() => confetti({ ...base, particleCount: 55, spread: 65, origin: { x: origin.x, y: Math.max(0.05, origin.y - 0.06) }, colors: ['#ffffff', '#fbbf24', '#86efac'] }), 340);
} else if (fx === 'superSave') {
confetti({ ...base, particleCount: 95, spread: 58, startVelocity: 44, scalar: 0.98, colors: ['#22d3ee', '#67e8f9', '#e0f2fe', '#ffffff', '#06b6d4'] });
setTimeout(() => confetti({ ...base, particleCount: 65, spread: 72, angle: 90, startVelocity: 32, colors: ['#0891b2', '#a5f3fc', '#ffffff'] }), 200);
} else if (fx === 'keyPass') {
confetti({ ...base, particleCount: 50, spread: 52, startVelocity: 32, scalar: 0.88, colors: ['#c084fc', '#a78bfa', '#fbbf24', '#ffffff', '#e9d5ff'] });
setTimeout(() => confetti({ ...base, particleCount: 28, spread: 40, startVelocity: 22, scalar: 0.75, colors: ['#ddd6fe', '#fcd34d'] }), 180);
}
}

export function pulseSimPitchCanvas(fx) {
const canvas = document.getElementById('simPitchCanvas');
const wrap = canvas?.parentElement;
if (!wrap) return;
wrap.classList.remove('sim-pitch-fx-goal', 'sim-pitch-fx-save', 'sim-pitch-fx-kp');
const cls = fx === 'goal' ? 'sim-pitch-fx-goal' : fx === 'superSave' ? 'sim-pitch-fx-save' : fx === 'keyPass' ? 'sim-pitch-fx-kp' : null;
if (cls) {
wrap.classList.add(cls);
setTimeout(() => wrap.classList.remove(cls), 1500);
}
}

/** 상단 피치·하단 중계가 공유하는 상황 요약 */
export function buildSimSituationMeta(opts, plAll) {
if (!opts) return null;
const sideMap = { left: '왼쪽 측면', center: '중앙', right: '오른쪽 측면' };
const phaseMap = { danger: '페널티 인근', progress: '중앙 전개', build: '빌드업' };
const outcomeMap = { success: '성공', fail: '실패', neutral: '중립' };
const dir = opts.attackA ? 'A→B' : 'B→A';
const sideHint = sideMap[opts.channel] || '중앙';
const cap = phaseMap[opts.phase] || '빌드업';
const out = outcomeMap[opts.outcome] || '중립';
let holderName = '';
let holderPos = '';
if (opts.ballHolderId && plAll && plAll.length) {
const hp = plAll.find((x) => x.id === opts.ballHolderId);
if (hp) {
holderName = hp.name || '';
holderPos = simPosShort(hp);
}
}
let eventTag = '';
if (opts.broadcastFx === 'goal') eventTag = '⚽ GOAL';
else if (opts.broadcastFx === 'superSave') eventTag = '🧤 SUPER SAVE';
else if (opts.broadcastFx === 'keyPass') eventTag = '🎯 KEY PASS';
const holderPart = holderName ? `볼 ${holderName}${holderPos ? `(${holderPos})` : ''}` : '볼 —';
const captionLine = `${dir} · ${sideHint} · ${cap} · ${holderPart} · ${out}${eventTag ? ` · ${eventTag}` : ''}`;
return { dir, sideHint, cap, out, holderName, holderPos, eventTag, captionLine, outcome: opts.outcome, broadcastFx: opts.broadcastFx };
}

export function applySimPitchCaptionMeta(meta) {
const capEl = document.getElementById('simPitchCaption');
if (!capEl) return;
if (!meta || !meta.captionLine) {
capEl.textContent = '경기 시작 시 상황 요약이 표시됩니다';
capEl.className = 'text-[10px] sm:text-[11px] text-slate-400 font-semibold leading-snug break-keep';
return;
}
capEl.textContent = meta.captionLine;
const oc = meta.outcome === 'success' ? 'text-emerald-300'
: meta.outcome === 'fail' ? 'text-red-300'
: 'text-amber-200';
capEl.className = `text-[10px] sm:text-[11px] ${oc} font-semibold leading-snug break-keep`;
}

/** 피치 캔버스 위 하이라이트 오버레이 (선수 아래 레이어 — 코너·골대 위주) */
export function drawSimPitchFxOverlay(ctx, px0, py0, pw, ph, ballX, ballY, fx, flow, attackA) {
ctx.save();
if (fx === 'goal') {
const gx = attackA ? px0 + pw - 6 : px0 + 6;
const gy = py0 + ph / 2;
const grd = ctx.createRadialGradient(gx, gy, 4, gx, gy, Math.max(pw, ph) * 0.42);
grd.addColorStop(0, 'rgba(250, 204, 21, 0.38)');
grd.addColorStop(0.45, 'rgba(34, 197, 94, 0.16)');
grd.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = grd;
ctx.fillRect(px0, py0, pw, ph);
ctx.strokeStyle = 'rgba(254, 240, 138, 0.75)';
ctx.lineWidth = 2.2;
for (let r = 0; r < 3; r++) {
ctx.beginPath();
ctx.arc(gx, gy, 10 + r * 10, 0, Math.PI * 2);
ctx.stroke();
}
for (let i = 0; i < 6; i++) {
const a = (Math.PI * 2 * i) / 6 + 0.2;
ctx.fillStyle = i % 2 === 0 ? 'rgba(253, 224, 71, 0.85)' : 'rgba(254, 249, 195, 0.75)';
ctx.font = 'bold 10px sans-serif';
ctx.fillText('✦', gx + Math.cos(a) * 22 - 4, gy + Math.sin(a) * 18 + 4);
}
} else if (fx === 'superSave') {
const gx = attackA ? px0 + 8 : px0 + pw - 8;
const gy = py0 + ph / 2;
const grd = ctx.createRadialGradient(gx, gy, 2, gx, gy, pw * 0.28);
grd.addColorStop(0, 'rgba(34, 211, 238, 0.38)');
grd.addColorStop(0.5, 'rgba(6, 182, 212, 0.14)');
grd.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = grd;
ctx.fillRect(px0, py0, pw, ph);
ctx.strokeStyle = 'rgba(103, 232, 249, 0.72)';
ctx.lineWidth = 2.2;
for (let i = 0; i < 4; i++) {
ctx.beginPath();
ctx.arc(gx, gy, 14 + i * 10, -Math.PI * 0.62, Math.PI * 0.62, !attackA);
ctx.stroke();
}
ctx.font = 'bold 20px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
ctx.fillText('🧤', gx - 12, gy + 8);
} else if (fx === 'keyPass') {
if (flow && flow.length >= 2) {
const a = flow[flow.length - 2];
const b = flow[flow.length - 1];
const ax = px0 + a.nx * pw;
const ay = py0 + a.ny * ph;
const bx = px0 + b.nx * pw;
const by = py0 + b.ny * ph;
ctx.strokeStyle = 'rgba(192, 132, 252, 0.55)';
ctx.lineWidth = 3;
ctx.setLineDash([6, 4]);
ctx.beginPath();
ctx.moveTo(ax, ay);
ctx.lineTo(bx, by);
ctx.stroke();
ctx.setLineDash([]);
}
ctx.font = 'bold 14px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
ctx.fillText('🎯', px0 + pw - 22, py0 + 16);
}
ctx.restore();
}

/** 중계 한 줄을 방송용 이미지(img)로 렌더링 — fx: goal | superSave | keyPass, meta: 상단 피치와 동일 요약 */
export function simBroadcastTextToImage(text, fx, meta) {
return new Promise((resolve) => {
const logBox = document.getElementById('simMatchLog');
const maxCssW = Math.min(720, Math.max(260, (logBox?.clientWidth || 560) - 8));
const pad = 14;
const lineHeight = 22;
const metaLineHeight = 18;
const fontSize = 14;
const dpr = Math.min(2, typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1);
const fxGoal = fx === 'goal' || (!fx && text.includes('⚽'));
const fxSave = fx === 'superSave' || text.includes('SUPER SAVE') || text.includes('슈퍼 세이브');
const fxKp = fx === 'keyPass';
const hasMeta = !!(meta && meta.captionLine);

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
if (!ctx) {
const fallback = document.createElement('div');
fallback.className = 'text-slate-200 text-xs p-2 rounded-lg bg-slate-900/90 border border-amber-800/40';
fallback.textContent = text;
resolve(fallback);
return;
}

ctx.font = `600 ${fontSize}px ${fontStack('body')}`;
const innerW = maxCssW - pad * 2 - 6;
const lines = wrapSimBroadcastLines(ctx, text, innerW);
const isGoal = fxGoal;
const isSuperSave = fxSave;
const isKeyPass = fxKp;
const isTitle = text.includes('━━');
const isHalftime = text.includes('하프타임') || text.includes('[휴식]');
const hasFxBanner = isGoal || isSuperSave || isKeyPass;

let cssH = pad * 2 + lines.length * lineHeight + 6 + (hasFxBanner ? 10 : 0) + (hasMeta ? metaLineHeight + 6 : 0);
const cssW = maxCssW;

canvas.width = Math.floor(cssW * dpr);
canvas.height = Math.floor(cssH * dpr);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const grd = ctx.createLinearGradient(0, 0, cssW, cssH);
if (isGoal) {
grd.addColorStop(0, '#166534');
grd.addColorStop(0.45, '#14532d');
grd.addColorStop(1, '#052e16');
} else if (isSuperSave) {
grd.addColorStop(0, '#0e7490');
grd.addColorStop(0.5, '#164e63');
grd.addColorStop(1, '#083344');
} else if (isKeyPass) {
grd.addColorStop(0, '#5b21b6');
grd.addColorStop(0.5, '#4c1d95');
grd.addColorStop(1, '#2e1065');
} else if (isTitle) {
grd.addColorStop(0, '#1e293b');
grd.addColorStop(1, '#0f172a');
} else if (isHalftime) {
grd.addColorStop(0, '#312e81');
grd.addColorStop(1, '#1e1b4b');
} else {
grd.addColorStop(0, '#132447');
grd.addColorStop(1, '#0a1628');
}
ctx.fillStyle = grd;
if (typeof ctx.roundRect === 'function') {
ctx.beginPath();
ctx.roundRect(0, 0, cssW, cssH, 10);
ctx.fill();
} else {
ctx.fillRect(0, 0, cssW, cssH);
}

if (hasFxBanner) {
ctx.strokeStyle = isGoal ? 'rgba(250, 204, 21, 0.75)' : isSuperSave ? 'rgba(34, 211, 238, 0.75)' : 'rgba(192, 132, 252, 0.75)';
ctx.lineWidth = 2;
if (typeof ctx.roundRect === 'function') {
ctx.beginPath();
ctx.roundRect(1, 1, cssW - 2, cssH - 2, 9);
ctx.stroke();
}
for (let i = 0; i < 6; i++) {
const sx = 8 + (i * (cssW - 16)) / 5;
ctx.fillStyle = isGoal ? 'rgba(253, 224, 71, 0.55)' : isSuperSave ? 'rgba(165, 243, 252, 0.5)' : 'rgba(216, 180, 254, 0.5)';
ctx.beginPath();
ctx.arc(sx, cssH - 6, 2.2, 0, Math.PI * 2);
ctx.fill();
}
}

const barColor = isGoal ? '#fbbf24' : isSuperSave ? '#22d3ee' : isKeyPass ? '#c084fc' : isHalftime ? '#a5b4fc' : '#e8c271';
ctx.fillStyle = barColor;
ctx.fillRect(0, 0, 6, cssH);

if (hasFxBanner) {
const badge = isGoal ? '⚽ GOAL!' : isSuperSave ? '🧤 SUPER SAVE' : '🎯 KEY PASS';
ctx.font = `800 11px ${fontStack('body')}`;
ctx.fillStyle = isGoal ? '#fef08a' : isSuperSave ? '#cffafe' : '#ede9fe';
ctx.fillText(badge, pad + 8, pad - 2);
}

ctx.fillStyle = isGoal ? '#fef9c3' : isSuperSave ? '#ecfeff' : isKeyPass ? '#f3e8ff' : '#f1f5f9';
ctx.font = `600 ${fontSize}px ${fontStack('body')}`;
ctx.textBaseline = 'top';
const textY = pad + (hasFxBanner ? 12 : 0);
lines.forEach((ln, i) => {
ctx.fillText(ln, pad + 8, textY + i * lineHeight);
});

if (hasMeta) {
const metaY = textY + lines.length * lineHeight + 4;
ctx.fillStyle = 'rgba(0,0,0,0.42)';
if (typeof ctx.roundRect === 'function') {
ctx.beginPath();
ctx.roundRect(pad + 4, metaY, cssW - (pad + 4) * 2, metaLineHeight + 2, 6);
ctx.fill();
} else {
ctx.fillRect(pad + 4, metaY, cssW - (pad + 4) * 2, metaLineHeight + 2);
}
const metaColor = meta.outcome === 'success' ? '#86efac'
: meta.outcome === 'fail' ? '#fca5a5'
: '#fdba74';
ctx.fillStyle = metaColor;
ctx.font = `700 10px ${fontStack('body')}`;
ctx.fillText(meta.captionLine, pad + 10, metaY + 4);
}

const img = new Image();
const imgCls = isGoal ? 'sim-broadcast-img sim-broadcast-img--goal'
: isSuperSave ? 'sim-broadcast-img sim-broadcast-img--save'
: isKeyPass ? 'sim-broadcast-img sim-broadcast-img--kp'
: 'sim-broadcast-img';
img.className = `${imgCls} w-full h-auto rounded-lg shadow-md border select-none`;
img.alt = text;
img.draggable = false;
img.src = canvas.toDataURL('image/png');
if (img.complete) resolve(img);
else {
img.onload = () => resolve(img);
img.onerror = () => resolve(img);
}
});
}
