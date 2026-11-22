/**
 * 모의경기 라이브 코트 (연속 애니메이션)
 *
 * - 좌표: x 0~1 (레드=홈 골대 0 → 블루=원정 골대 1), y 0~1 (코트 폭). 풋살 코트 40m × 20m 기준
 * - 선수는 목표 위치로 자기 속도(PAC)만큼 달려가고, 공은 패스·슛·드리블 경로를 따라 움직여요
 * - 가로(landscape) / 세로(portrait) 둘 다 같은 장면을 회전해서 그려요. 글자는 항상 똑바로
 * - match.js가 상황마다 playEvent({...})를 부르면 단계별로 움직이고, 단계마다 자막(해설)을 바꿔요
 */
import { getStat } from '../stats.js';
import { getPortraitUrl } from '../ui.js';
import { fontStack } from '../utils.js';

const FIELD_L = 40;
const FIELD_W = 20;
const GOAL_HALF = 0.075; // 골대 폭 3m → y 0.425~0.575
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const meters = (ax, ay, bx, by) => Math.hypot((ax - bx) * FIELD_L, (ay - by) * FIELD_W);
const rnd = (a, b) => a + Math.random() * (b - a);

const imgCache = new Map();
function loadImg(url) {
  if (!url) return null;
  if (imgCache.has(url)) return imgCache.get(url);
  const im = new Image();
  im.decoding = 'async';
  im.src = url;
  imgCache.set(url, im);
  return im;
}

/** 휴대폰에서는 세로가 기본. 사용자가 고르면 기억 */
export function getSimOrientation() {
  try {
    const v = localStorage.getItem('sfc_sim_orient');
    if (v === 'portrait' || v === 'landscape') return v;
  } catch (e) { /* 무시 */ }
  return (typeof window !== 'undefined' && window.innerWidth < 768) ? 'portrait' : 'landscape';
}
export function setSimOrientation(v) {
  try { localStorage.setItem('sfc_sim_orient', v); } catch (e) { /* 무시 */ }
}

class LiveScene {
  constructor() {
    this.players = new Map(); // id -> { p, side:'A'|'B', x, y, tx, ty, img }
    this.ball = { x: 0.5, y: 0.5, z: 0, holder: null };
    this.ballAnim = null; // { fx, fy, tx, ty, t0, dur, arc, toHolder }
    this.trail = [];
    this.fx = null; // { text, color, t0, dur }
    this.flash = null;
    this.timeScale = 1;
    this.running = false;
    this.last = 0;
    this.orient = getSimOrientation();
    this.highlight = new Set();
  }

  /* ───── 캔버스 ───── */
  canvas() { return document.getElementById('simPitchCanvas'); }

  resize() {
    const canvas = this.canvas();
    if (!canvas) return;
    this.orient = getSimOrientation();
    const panel = document.getElementById('simPitchPanel');
    panel?.classList.toggle('sim-portrait', this.orient === 'portrait');
    const wrap = canvas.parentElement;
    const availW = Math.max(240, Math.min(wrap?.clientWidth || 360, 900) - 8);
    let cssW; let cssH;
    if (this.orient === 'portrait') {
      // 휴대폰 화면에 위 자막·아래 탭과 함께 한 번에 보이게
      const maxH = Math.max(380, window.innerHeight - 250);
      cssH = Math.round(Math.min(availW * 1.85, maxH, 760));
      cssW = Math.round(Math.min(availW, 440, cssH / 1.7));
    } else {
      cssW = availW;
      cssH = Math.round(Math.min(cssW * 0.56, 480));
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
    }
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    this.W = cssW; this.H = cssH; this.dpr = dpr;
    // 코트 영역 (가장자리 여백)
    const m = 14;
    if (this.orient === 'portrait') {
      this.rect = { x0: m, y0: m + 6, w: cssW - m * 2, h: cssH - m * 2 - 12 };
    } else {
      this.rect = { x0: m + 6, y0: m, w: cssW - m * 2 - 12, h: cssH - m * 2 };
    }
    // 1m가 몇 px인지 (선수 크기 계산)
    this.pxPerM = this.orient === 'portrait' ? Math.min(this.rect.w / FIELD_W, this.rect.h / FIELD_L) : Math.min(this.rect.w / FIELD_L, this.rect.h / FIELD_W);
  }

  /** 코트 좌표 → 화면 좌표. 세로일 때 홈(레드)은 아래쪽 골대를 지키고 위로 공격 */
  toScreen(x, y) {
    const r = this.rect;
    if (this.orient === 'portrait') return [r.x0 + y * r.w, r.y0 + (1 - x) * r.h];
    return [r.x0 + x * r.w, r.y0 + y * r.h];
  }

  /* ───── 선수 명단 ───── */
  setRosters(plA, plB) {
    const keep = new Set();
    const add = (p, side) => {
      keep.add(p.id);
      const cur = this.players.get(p.id);
      if (cur) { cur.p = p; cur.side = side; return; }
      const home = (window.simFieldPositions && window.simFieldPositions[side] && window.simFieldPositions[side][p.id]) || { nx: side === 'A' ? 0.25 : 0.75, ny: 0.5 };
      this.players.set(p.id, { p, side, x: home.nx, y: home.ny, tx: home.nx, ty: home.ny, img: loadImg(getPortraitUrl(p)) });
    };
    plA.forEach((p) => add(p, 'A'));
    plB.forEach((p) => add(p, 'B'));
    [...this.players.keys()].forEach((id) => { if (!keep.has(id)) this.players.delete(id); });
    if (this.ball.holder && !this.players.has(this.ball.holder)) this.ball.holder = null;
  }

  /** 교체: 나가는 선수 자리에서 들어오는 선수가 이어받음 */
  substitute(outId, inP, side) {
    const o = this.players.get(outId);
    const x = o ? o.x : (side === 'A' ? 0.2 : 0.8);
    const y = o ? o.y : 0.5;
    this.players.delete(outId);
    this.players.set(inP.id, { p: inP, side, x: clamp(x, 0, 1), y: side === 'A' ? 1.02 : 1.02, tx: x, ty: y, img: loadImg(getPortraitUrl(inP)) });
    if (this.ball.holder === outId) this.ball.holder = null;
  }

  get(id) { return this.players.get(id); }

  /* ───── 팀 모양: 공 주변으로 모이고, 수비는 공과 골대 사이 ───── */
  shape(attackSide, opts = {}) {
    const bx = this.ball.x; const by = this.ball.y;
    const holder = this.ball.holder;
    const press = opts.press !== false;
    let nearestDef = null; let nd = 1e9;
    this.players.forEach((pl, id) => {
      const isA = pl.side === 'A';
      const home = (window.simFieldPositions && window.simFieldPositions[pl.side] && window.simFieldPositions[pl.side][id]) || { nx: isA ? 0.3 : 0.7, ny: 0.5 };
      const toU = (x) => (isA ? x : 1 - x);
      const fromU = (u) => (isA ? u : 1 - u);
      const hu = toU(home.nx); const bu = toU(bx);
      let u; let v;
      if (pl.p.pos === 'Goleiro') {
        u = attackSide === pl.side ? 0.06 + bu * 0.06 : 0.025 + (1 - bu) * 0.01;
        v = 0.5 + (by - 0.5) * 0.35;
      } else if (attackSide === pl.side) {
        u = clamp(hu * 0.55 + bu * 0.45 + 0.07 + rnd(-0.03, 0.03), 0.12, 0.94);
        v = clamp(home.ny * 0.72 + by * 0.28 + rnd(-0.05, 0.05), 0.06, 0.94);
        if (pl.p.pos === 'Fixo') u = Math.min(u, bu - 0.05);
        if (pl.p.pos === 'Pivo') u = Math.max(u, bu + 0.08);
      } else {
        u = clamp(Math.min(hu * 0.4 + bu * 0.6 - 0.05, bu - 0.03) + rnd(-0.02, 0.02), 0.08, 0.9);
        v = clamp(home.ny * 0.5 + by * 0.5 + rnd(-0.04, 0.04), 0.08, 0.92);
        if (pl.p.pos !== 'Goleiro' && id !== holder) {
          const d = meters(fromU(u), v, bx, by);
          if (d < nd) { nd = d; nearestDef = { pl, isA }; }
        }
      }
      if (id === holder) return;
      pl.tx = fromU(u); pl.ty = v;
    });
    // 가장 가까운 수비가 공 가진 선수에게 붙음 (조금 겹쳐도 됨)
    if (press && nearestDef && holder) {
      const dir = nearestDef.isA ? -1 : 1; // 자기 골대 쪽
      nearestDef.pl.tx = clamp(bx + dir * 0.035, 0.02, 0.98);
      nearestDef.pl.ty = clamp(by + rnd(-0.04, 0.04), 0.03, 0.97);
    }
    this.separate();
  }

  /** 아주 가까울 때만 살짝 벌림 (겹침 약간 허용: 1.4m 안쪽만 밀어냄, 선수 원은 약 2m라 조금 겹침) */
  separate() {
    const arr = [...this.players.values()];
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i]; const b = arr[j];
          const d = meters(a.tx, a.ty, b.tx, b.ty);
          if (d > 1.4 || d === 0) continue;
          const push = (1.4 - d) / 2;
          const dx = (a.tx - b.tx) * FIELD_L; const dy = (a.ty - b.ty) * FIELD_W;
          const L = Math.hypot(dx, dy) || 1;
          if (a.p.id !== this.ball.holder) { a.tx += (dx / L) * push / FIELD_L; a.ty += (dy / L) * push / FIELD_W; }
          if (b.p.id !== this.ball.holder) { b.tx -= (dx / L) * push / FIELD_L; b.ty -= (dy / L) * push / FIELD_W; }
        }
      }
    }
  }

  /* ───── 시간 진행 ───── */
  start() {
    this.resize();
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt, now);
      this.draw(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop() { this.running = false; }

  /** 경기 전·중계 지운 뒤: 빈 코트(선수는 기본 위치)를 한 장 그림 */
  idle(plA = [], plB = []) {
    this.stop();
    this.resize();
    this.setRosters(plA, plB);
    this.players.forEach((pl, id) => {
      const home = window.simFieldPositions?.[pl.side]?.[id];
      if (home) { pl.x = pl.tx = home.nx; pl.y = pl.ty = home.ny; }
    });
    this.ball = { x: 0.5, y: 0.5, z: 0, holder: null };
    this.ballAnim = null; this.trail = []; this.fx = null; this.highlight = new Set();
    this.draw(performance.now());
    this.say('경기 시작을 누르면 선수들이 움직이며 중계해요', '대기', 'info');
  }

  update(dt, now) {
    const sp = this.timeScale > 0 ? 1 / Math.max(0.15, this.timeScale) : 50;
    this.players.forEach((pl) => {
      const pac = getStat(pl.p, 'pac') || 60;
      const v = (3.2 + (pac / 99) * 3.4) * sp; // m/s (화면 속도에 맞춰 빠르게)
      const d = meters(pl.x, pl.y, pl.tx, pl.ty);
      if (d < 0.02) { pl.x = pl.tx; pl.y = pl.ty; return; }
      const step = Math.min(1, (v * dt) / d);
      pl.x = lerp(pl.x, pl.tx, step);
      pl.y = lerp(pl.y, pl.ty, step);
    });
    const b = this.ball;
    if (this.ballAnim) {
      const a = this.ballAnim;
      const t = a.dur <= 0 ? 1 : clamp((now - a.t0) / a.dur, 0, 1);
      const e = a.linear ? t : ease(t);
      let tx = a.tx; let ty = a.ty;
      if (a.toId && this.players.get(a.toId)) {
        const r = this.players.get(a.toId);
        tx = lerp(a.tx, r.x, t); ty = lerp(a.ty, r.y, t);
      }
      b.x = lerp(a.fx, tx, e); b.y = lerp(a.fy, ty, e);
      b.z = a.arc ? Math.sin(Math.PI * t) * a.arc : 0;
      if (Math.random() < 0.6) this.trail.push({ x: b.x, y: b.y, t: now });
      if (t >= 1) {
        this.ballAnim = null;
        b.z = 0;
        if (a.toId) b.holder = a.toId;
      }
    } else if (b.holder && this.players.get(b.holder)) {
      const h = this.players.get(b.holder);
      const dir = h.side === 'A' ? 1 : -1;
      b.x = h.x + dir * 0.012; b.y = h.y + 0.012;
    }
    this.trail = this.trail.filter((p) => now - p.t < 900);
  }

  /* ───── 단계 실행 ───── */
  wait(ms) {
    const real = ms * this.timeScale;
    if (real <= 0) return Promise.resolve();
    return new Promise((r) => setTimeout(r, real));
  }

  /** 공을 보내기: toId(선수) 또는 좌표로. speed m/s, arc(높이 px) */
  kick({ toId = null, x = null, y = null, speed = 14, arc = 0, linear = false }) {
    const b = this.ball;
    const target = toId ? this.players.get(toId) : null;
    const tx = target ? target.tx : x; const ty = target ? target.ty : y;
    const dist = meters(b.x, b.y, tx, ty);
    const dur = Math.max(140, (dist / speed) * 1000) * this.timeScale;
    b.holder = null;
    this.ballAnim = { fx: b.x, fy: b.y, tx, ty, toId, t0: performance.now(), dur, arc, linear };
    return new Promise((res) => {
      if (dur <= 0) { this.update(0, performance.now() + 1); res(); return; }
      setTimeout(res, dur + 20);
    });
  }

  /** 선수 한 명을 특정 위치로 (공 가진 선수면 드리블) */
  move(id, x, y) {
    const pl = this.players.get(id);
    if (!pl) return;
    pl.tx = clamp(x, 0.01, 0.99); pl.ty = clamp(y, 0.02, 0.98);
  }

  /** 순간 정리 (빠른 모드 0초) */
  snap() {
    this.players.forEach((pl) => { pl.x = pl.tx; pl.y = pl.ty; });
  }

  say(text, badge, tone) {
    const cap = document.getElementById('simPitchCaption');
    if (cap && text) cap.textContent = text;
    const bd = document.getElementById('simPitchBadge');
    if (bd && badge) {
      bd.textContent = badge;
      const cls = { good: 'bg-emerald-700 text-emerald-50', bad: 'bg-red-800 text-red-50', hot: 'bg-amber-500 text-slate-900', info: 'bg-slate-700 text-slate-100' }[tone || 'info'];
      bd.className = `text-[11px] font-bold px-2.5 py-0.5 rounded-md shrink-0 ${cls}`;
    }
  }

  showFx(text, color) { this.fx = { text, color, t0: performance.now(), dur: Math.max(500, 1400 * Math.max(0.4, this.timeScale)) }; }

  /* ───── 그리기 ───── */
  draw(now) {
    const canvas = this.canvas();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const { W, H } = this;
    ctx.clearRect(0, 0, W, H);
    this.drawPitch(ctx);
    // 공 궤적
    if (this.trail.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1]; const b = this.trail[i];
        const al = 1 - (now - b.t) / 900;
        const [ax, ay] = this.toScreen(a.x, a.y); const [bx, by] = this.toScreen(b.x, b.y);
        ctx.strokeStyle = `rgba(253,224,71,${0.55 * al})`;
        ctx.lineWidth = 3 * al + 0.5;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
      ctx.restore();
    }
    // 선수 (아래쪽부터 그려서 자연스럽게 겹치게)
    const list = [...this.players.values()].sort((a, b) => this.toScreen(a.x, a.y)[1] - this.toScreen(b.x, b.y)[1]);
    const r = clamp(this.pxPerM * 0.95, 10, 19);
    list.forEach((pl) => this.drawPlayer(ctx, pl, r));
    this.drawBall(ctx, r);
    // 큰 글자 효과
    if (this.fx) {
      const t = (now - this.fx.t0) / this.fx.dur;
      if (t >= 1) this.fx = null;
      else {
        const s = 1 + 0.25 * Math.sin(Math.min(1, t * 3) * Math.PI / 2);
        ctx.save();
        ctx.globalAlpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
        ctx.translate(W / 2, H / 2);
        ctx.scale(s, s);
        ctx.font = `900 ${Math.round(Math.min(W, H) * 0.16)}px ${fontStack('num')}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(this.fx.text, 0, 0);
        ctx.fillStyle = this.fx.color;
        ctx.fillText(this.fx.text, 0, 0);
        ctx.restore();
      }
    }
  }

  /** 코트 그리기 (좌표 변환 함수로 가로·세로 모두) */
  drawPitch(ctx) {
    const { W, H } = this;
    ctx.fillStyle = '#06101c';
    ctx.fillRect(0, 0, W, H);
    const P = (x, y) => this.toScreen(x, y);
    const poly = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => { const [sx, sy] = P(x, y); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }); ctx.closePath(); };
    // 줄무늬 잔디 (길이 방향)
    const N = 10;
    for (let i = 0; i < N; i++) {
      poly([[i / N, 0], [(i + 1) / N, 0], [(i + 1) / N, 1], [i / N, 1]]);
      ctx.fillStyle = i % 2 ? '#15803d' : '#16a34a';
      ctx.fill();
    }
    // 조명 느낌
    const [cx, cy] = P(0.5, 0.5);
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
    poly([[0, 0], [1, 0], [1, 1], [0, 1]]); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
    poly([[0, 0], [1, 0], [1, 1], [0, 1]]); ctx.stroke();
    // 하프라인·센터서클
    const [h1x, h1y] = P(0.5, 0); const [h2x, h2y] = P(0.5, 1);
    ctx.beginPath(); ctx.moveTo(h1x, h1y); ctx.lineTo(h2x, h2y); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 3 * this.pxPerM, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    // 페널티 구역 (6m 반원 모양) · 10m 지점 · 골대
    [0, 1].forEach((gx) => {
      const dir = gx === 0 ? 1 : -1;
      const pts = [];
      for (let k = 0; k <= 24; k++) {
        const a = -Math.PI / 2 + (k / 24) * Math.PI;
        const yy = 0.5 + Math.sin(a) * (6 / FIELD_W) * 1.05;
        const xx = gx + dir * Math.cos(a) * (6 / FIELD_L);
        pts.push([xx, clamp(yy, 0.05, 0.95)]);
      }
      ctx.beginPath();
      pts.forEach(([x, y], i) => { const [sx, sy] = P(x, y); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
      ctx.stroke();
      [[6], [10]].forEach(([m]) => { const [sx, sy] = P(gx + dir * (m / FIELD_L), 0.5); ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); });
      // 골대 (그물)
      const depth = 1.2 / FIELD_L;
      poly([[gx, 0.5 - GOAL_HALF], [gx - dir * depth, 0.5 - GOAL_HALF], [gx - dir * depth, 0.5 + GOAL_HALF], [gx, 0.5 + GOAL_HALF]]);
      const flash = this.flash && this.flash.gx === gx && performance.now() - this.flash.t0 < 900;
      ctx.fillStyle = flash ? 'rgba(253,224,71,0.85)' : 'rgba(255,255,255,0.22)'; ctx.fill();
      ctx.strokeStyle = gx === 0 ? '#fca5a5' : '#93c5fd'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
    });
  }

  drawPlayer(ctx, pl, r) {
    const [sx, sy] = this.toScreen(pl.x, pl.y);
    const isHome = pl.side === 'A';
    const kit = isHome ? '#ef4444' : '#3b82f6';
    const kitDark = isHome ? '#7f1d1d' : '#1e3a8a';
    const hasBall = this.ball.holder === pl.p.id;
    const hot = this.highlight.has(pl.p.id);
    // 그림자
    ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.9, r * 0.9, r * 0.32, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    // 몸(조끼)
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
    const grd = ctx.createLinearGradient(sx, sy - r, sx, sy + r);
    grd.addColorStop(0, kit); grd.addColorStop(1, kitDark);
    ctx.fillStyle = grd; ctx.fill();
    // 얼굴
    const img = pl.img;
    if (img && img.complete && img.naturalWidth) {
      ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, r * 0.82, 0, Math.PI * 2); ctx.clip();
      // 얼굴 부분만 잘라서 (그림 가운데 위쪽)
      const iw = img.naturalWidth; const ih = img.naturalHeight;
      const cw = iw * 0.5; const cx0 = (iw - cw) / 2; const cy0 = ih * 0.3;
      ctx.drawImage(img, cx0, cy0, cw, cw, sx - r * 0.85, sy - r * 0.85, r * 1.7, r * 1.7);
      ctx.restore();
    }
    ctx.lineWidth = hasBall ? 3 : 2;
    ctx.strokeStyle = hasBall ? '#fde047' : hot ? '#ffffff' : 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
    if (pl.p.pos === 'Goleiro') { ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(sx + r * 0.75, sy - r * 0.75, r * 0.28, 0, Math.PI * 2); ctx.fill(); }
    // 이름
    const name = String(pl.p.name || '').slice(0, 4);
    ctx.font = `800 ${Math.round(clamp(r * 0.78, 9, 12))}px ${fontStack('body')}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const tw = ctx.measureText(name).width + 6;
    ctx.fillStyle = hasBall ? 'rgba(253,224,71,0.95)' : 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx - tw / 2, sy + r + 2, tw, Math.round(clamp(r * 0.78, 9, 12)) + 3);
    ctx.fillStyle = hasBall ? '#111827' : '#fff';
    ctx.fillText(name, sx, sy + r + 3);
  }

  drawBall(ctx, r) {
    const b = this.ball;
    const [sx, sy] = this.toScreen(b.x, b.y);
    const br = Math.max(4, r * 0.38);
    ctx.beginPath(); ctx.ellipse(sx, sy + br * 0.6, br, br * 0.45, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
    const y = sy - b.z;
    ctx.beginPath(); ctx.arc(sx, y, br, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#111827'; ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, y, br * 0.38, 0, Math.PI * 2); ctx.fillStyle = '#111827'; ctx.fill();
  }

  /* ───── 상황 연출 ───── */
  goalPoint(attackSide, onTarget) {
    const gx = attackSide === 'A' ? 1 : 0;
    const y = onTarget ? 0.5 + rnd(-GOAL_HALF * 0.85, GOAL_HALF * 0.85) : 0.5 + (Math.random() < 0.5 ? -1 : 1) * rnd(GOAL_HALF * 1.3, GOAL_HALF * 3);
    return { x: gx, y };
  }

  /** 공이 이 선수에게 가 있도록 (이전 상황에서 이어지게) */
  async bringBallTo(id, sideOf) {
    const target = this.players.get(id);
    if (!target) return;
    if (this.ball.holder === id) return;
    const h = this.ball.holder ? this.players.get(this.ball.holder) : null;
    if (h && h.side === target.side) {
      this.say(`${h.p.name} → ${target.p.name}, 짧게 연결`, '빌드업', 'info');
      await this.kick({ toId: id, speed: 13 });
    } else if (!h) {
      await this.kick({ toId: id, speed: 11 });
    } else {
      // 상대가 가지고 있었으면 뺏어 오는 장면
      target.tx = h.x; target.ty = h.y;
      await this.wait(350);
      this.ball.holder = id;
    }
  }

  /**
   * 한 상황 재생
   * ev: { kind, attackA, channel, actor, target, defender, gk, result, lines? }
   */
  async playEvent(ev) {
    this.start();
    const atkSide = ev.attackA ? 'A' : 'B';
    const dir = atkSide === 'A' ? 1 : -1;
    const laneY = { left: 0.2, right: 0.8, center: 0.5 }[ev.channel] ?? 0.5;
    const id = (p) => (p && p.id) || null;
    const name = (p) => (p && p.name) || '';
    this.highlight = new Set([id(ev.actor), id(ev.target), id(ev.defender)].filter(Boolean));
    const fwd = (pl, m) => clamp(pl.x + dir * (m / FIELD_L), 0.04, 0.96);
    const A = ev.actor ? this.players.get(ev.actor.id) : null;

    if (ev.kind === 'kickoff') {
      this.ball.holder = null; this.ballAnim = null;
      this.ball.x = 0.5; this.ball.y = 0.5;
      this.players.forEach((pl, pid) => {
        const home = (window.simFieldPositions?.[pl.side]?.[pid]) || { nx: pl.side === 'A' ? 0.3 : 0.7, ny: 0.5 };
        pl.tx = pl.side === 'A' ? Math.min(home.nx, 0.46) : Math.max(home.nx, 0.54); pl.ty = home.ny;
      });
      if (this.timeScale <= 0) this.snap();
      this.say(ev.say || '킥오프!', '킥오프', 'info');
      await this.wait(700);
      return;
    }
    if (ev.kind === 'sub' || ev.kind === 'none') { this.shape(this.ball.holder ? this.players.get(this.ball.holder)?.side : atkSide); return; }
    if (!A) return;

    // 1) 공 가진 선수에게 공이 오도록 → 팀 모양 잡기
    if (ev.kind !== 'long') await this.bringBallTo(A.p.id);
    this.shape(atkSide);
    if (this.timeScale <= 0) this.snap();
    const T = ev.target ? this.players.get(ev.target.id) : null;
    const D = ev.defender ? this.players.get(ev.defender.id) : null;
    const G = ev.gk ? this.players.get(ev.gk.id) : null;

    switch (ev.kind) {
      case 'pass': {
        this.say(`${name(ev.actor)}, 고개 들고 전진합니다`, '전개', 'info');
        this.move(A.p.id, fwd(A, 3), lerp(A.y, laneY, 0.4));
        if (D) this.move(D.p.id, fwd(A, 2.2), A.y + rnd(-0.06, 0.06));
        await this.wait(650);
        this.say(`${name(ev.actor)} → ${name(ev.target)} 패스!`, '패스', 'good');
        if (T) this.move(T.p.id, fwd(T, 2.5), T.ty);
        await this.kick({ toId: ev.target.id, speed: 14 });
        this.say(`${name(ev.target)} 잡았습니다. 공격 이어갑니다`, '전개', 'good');
        this.shape(atkSide);
        await this.wait(350);
        break;
      }
      case 'dribble': {
        const beat = ev.result !== 'fail';
        this.say(`${name(ev.actor)} vs ${name(ev.defender)}, 1대1!`, '1대1', 'hot');
        if (D) this.move(D.p.id, fwd(A, 2.5), A.y);
        this.move(A.p.id, fwd(A, 2), A.y);
        await this.wait(600);
        if (beat) {
          const side = A.y < 0.5 ? 1 : -1;
          this.move(A.p.id, fwd(A, 3), clamp(A.y + side * 0.14, 0.06, 0.94));
          await this.wait(380);
          this.move(A.p.id, fwd(A, 6), clamp(A.y, 0.06, 0.94));
          if (D) this.move(D.p.id, D.x - dir * 0.01, D.y);
          this.say(`${name(ev.actor)}, 제쳤습니다! 수비 한 명 따돌립니다`, '돌파', 'good');
          await this.wait(650);
        } else {
          if (D) { D.tx = A.x; D.ty = A.y; }
          await this.wait(380);
          if (D) this.ball.holder = D.p.id;
          this.say(`${name(ev.defender)}가 몸으로 막아냅니다! 공 빼앗김`, '차단', 'bad');
          this.shape(D ? D.side : atkSide);
          await this.wait(500);
        }
        break;
      }
      case 'cutback': {
        this.say(`${name(ev.actor)}, 측면 깊숙이 파고듭니다`, '측면', 'info');
        const byY = A.y < 0.5 ? 0.12 : 0.88;
        this.move(A.p.id, atkSide === 'A' ? 0.9 : 0.1, byY);
        if (T) this.move(T.p.id, atkSide === 'A' ? 0.8 : 0.2, 0.5 + rnd(-0.08, 0.08));
        await this.wait(900);
        this.say(`컷백! ${name(ev.actor)} → ${name(ev.target)}`, '찬스', 'hot');
        if (T) await this.kick({ toId: T.p.id, speed: 15 });
        await this.wait(250);
        break;
      }
      case 'long': {
        // 골키퍼가 공을 잡고 멀리 차 줌
        this.ball.holder = A.p.id; this.ballAnim = null;
        this.shape(atkSide);
        if (T) this.move(T.p.id, atkSide === 'A' ? rnd(0.55, 0.7) : rnd(0.3, 0.45), rnd(0.25, 0.75));
        this.say(`골키퍼 ${name(ev.actor)}, 길게 넘깁니다`, '롱볼', 'info');
        await this.wait(500);
        if (T) await this.kick({ toId: T.p.id, speed: 16, arc: 26 });
        this.say(`${name(ev.target)}가 받아 냅니다!`, '전환', 'good');
        this.shape(atkSide);
        await this.wait(300);
        break;
      }
      case 'keep': {
        this.say(`${name(ev.actor)}, ${name(ev.defender)}의 압박을 버팁니다`, '키핑', 'info');
        if (D) this.move(D.p.id, A.x - dir * 0.015, A.y + 0.02);
        this.move(A.p.id, fwd(A, 1), A.y + rnd(-0.05, 0.05));
        await this.wait(900);
        this.say(`${name(ev.actor)}, 침착하게 볼 지킵니다`, '키핑', 'good');
        break;
      }
      case 'intercept': {
        const mates = [...this.players.values()].filter((p) => p.side === atkSide && p.p.id !== A.p.id && p.p.pos !== 'Goleiro');
        const M = mates.length ? mates[Math.floor(Math.random() * mates.length)] : null;
        this.say(`${name(ev.actor)}, 패스를 노립니다`, '전개', 'info');
        this.move(A.p.id, fwd(A, 2), A.y);
        await this.wait(500);
        if (M && D) {
          const ix = lerp(A.x, M.x, 0.55); const iy = lerp(A.y, M.y, 0.55);
          this.move(D.p.id, ix, iy);
          this.say(`${name(ev.actor)} → ${M.p.name}… 아! 끊깁니다`, '차단', 'bad');
          await this.kick({ x: ix, y: iy, speed: 13 });
          this.ball.holder = D.p.id;
        } else if (D) {
          D.tx = A.x; D.ty = A.y; await this.wait(400); this.ball.holder = D.p.id;
        }
        this.say(`${name(ev.defender)} 가로채기!${ev.counter ? ' 바로 역습!' : ''}`, ev.counter ? '역습' : '차단', 'bad');
        this.shape(D ? D.side : atkSide);
        await this.wait(ev.counter ? 300 : 500);
        break;
      }
      case 'foul': {
        this.say(`${name(ev.actor)} 돌파 시도…`, '돌파', 'info');
        this.move(A.p.id, fwd(A, 2.5), A.y);
        if (D) { D.tx = fwd(A, 2.5); D.ty = A.y + 0.02; }
        await this.wait(650);
        this.showFx('FOUL', '#fca5a5');
        this.say(`휘슬! ${name(ev.defender)}의 파울${ev.card ? ' · 경고' : ''}`, '파울', 'bad');
        await this.wait(700);
        break;
      }
      case 'shot':
      case 'setpiece': {
        const label = ev.label || '슈팅';
        if (ev.kind === 'setpiece') {
          this.ball.holder = null; this.ballAnim = null;
          const sx = atkSide === 'A' ? 1 - (ev.dist || 10) / FIELD_L : (ev.dist || 10) / FIELD_L;
          this.ball.x = sx; this.ball.y = ev.dist === 10 ? 0.5 : rnd(0.3, 0.7);
          this.move(A.p.id, sx - dir * 0.03, this.ball.y);
          this.say(`${label} — 키커 ${name(ev.actor)}`, '세트피스', 'hot');
          await this.wait(900);
          this.ball.holder = A.p.id;
        } else {
          this.say(`${name(ev.actor)}, 슈팅 각도를 만듭니다`, '찬스', 'hot');
          this.move(A.p.id, fwd(A, 2), lerp(A.y, 0.5, 0.35));
          await this.wait(450);
        }
        if (G) { this.move(G.p.id, atkSide === 'A' ? 0.97 : 0.03, lerp(0.5, this.ball.y, 0.25)); }
        this.say(`${name(ev.actor)}의 ${label}!`, '슈팅', 'hot');
        const res = ev.result; // goal | save | miss | post
        if (res === 'goal') {
          const pt = this.goalPoint(atkSide, true);
          await this.kick({ x: pt.x + dir * 0.02, y: pt.y, speed: 24, linear: true });
          this.flash = { gx: atkSide === 'A' ? 1 : 0, t0: performance.now() };
          this.showFx('GOAL!', '#fde047');
          this.say(`골!!! ${name(ev.actor)}${ev.assist ? ` (도움 ${ev.assist.name})` : ''}`, '골', 'good');
          await this.wait(1100);
          this.ball.x = 0.5; this.ball.y = 0.5; this.ball.holder = null; this.trail = [];
        } else if (res === 'save') {
          const pt = this.goalPoint(atkSide, true);
          if (G) this.move(G.p.id, atkSide === 'A' ? 0.975 : 0.025, pt.y);
          await this.kick({ x: lerp(this.ball.x, pt.x, 0.93), y: pt.y, speed: 22, linear: true });
          if (G) this.ball.holder = G.p.id;
          this.showFx('SAVE!', '#7dd3fc');
          this.say(`${name(ev.gk)} 선방!${ev.corner ? ' 코너킥으로 나갑니다' : ''}`, '선방', 'good');
          if (ev.corner) {
            this.ball.holder = null;
            await this.kick({ x: atkSide === 'A' ? 0.995 : 0.005, y: pt.y < 0.5 ? 0.01 : 0.99, speed: 9 });
          }
          await this.wait(700);
        } else if (res === 'post') {
          const postY = 0.5 + (Math.random() < 0.5 ? -GOAL_HALF : GOAL_HALF);
          await this.kick({ x: atkSide === 'A' ? 0.995 : 0.005, y: postY, speed: 24, linear: true });
          this.showFx('POST!', '#fdba74');
          this.say('골대를 맞았습니다!', '골대', 'hot');
          await this.kick({ x: atkSide === 'A' ? 0.85 : 0.15, y: postY + rnd(-0.15, 0.15), speed: 12 });
          await this.wait(400);
        } else {
          const pt = this.goalPoint(atkSide, false);
          await this.kick({ x: pt.x + dir * 0.02, y: pt.y, speed: 22, linear: true });
          this.say('골문을 벗어납니다', '빗나감', 'bad');
          await this.wait(600);
          if (G) { this.ball.x = G.x; this.ball.y = G.y; this.ball.holder = G.p.id; }
        }
        break;
      }
      case 'corner': {
        const cy = Math.random() < 0.5 ? 0.01 : 0.99;
        this.ball.holder = null; this.ballAnim = null;
        this.ball.x = atkSide === 'A' ? 0.995 : 0.005; this.ball.y = cy;
        this.move(A.p.id, this.ball.x - dir * 0.01, cy);
        this.say(`코너킥 — ${name(ev.actor)}가 올립니다`, '코너킥', 'hot');
        await this.wait(800);
        this.ball.holder = A.p.id;
        break;
      }
      default:
        await this.wait(400);
    }
  }
}

/** 하나만 쓰는 장면 */
export const liveScene = new LiveScene();

/** 화면 크기·방향이 바뀌면 다시 맞춤 */
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => { if (liveScene.running) liveScene.resize(); });
}

/** 세로/가로 바꾸기 버튼 */
export function paintSimOrientButton() {
  const label = document.getElementById('simOrientLabel');
  if (label) label.textContent = getSimOrientation() === 'portrait' ? '가로로 보기' : '세로로 보기';
}
if (typeof window !== 'undefined') {
  window.toggleSimOrientation = () => {
    setSimOrientation(getSimOrientation() === 'portrait' ? 'landscape' : 'portrait');
    paintSimOrientButton();
    if (liveScene.running) { liveScene.resize(); } else { liveScene.resize(); liveScene.draw(performance.now()); }
  };
}
