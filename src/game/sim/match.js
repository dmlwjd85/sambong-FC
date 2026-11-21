/** 모의경기 진행과 경기 후 기록 */
import { STAT_BASE, SIM_TEAM_A_NAME, SIM_TEAM_B_NAME } from '../constants.js';
import { runSimBroadcastFx, pulseSimPitchCanvas, buildSimSituationMeta, simBroadcastTextToImage } from './broadcast.js';
import { ensureSimFieldPositions, simHolderBallNorm } from './formation.js';
import { resetSimPitchCanvas, drawSimPitchLive } from './pitch.js';
import { countSimTeam, getSimMatchRoster, padSimRosterWithBots, simPosShort, simPickTwoDistinct } from './roster.js';
import { getStat, getOVR } from '../stats.js';
import { escapeAttr, sleep } from '../utils.js';

/** 모의경기 종료 후 평점·xG·골·어시·킬패스·세이브 요약 (FM 스타일) */
function renderSimPostMatchStats(plA, plB, teamAName, teamBName, simStats, live, ratings) {
const el = document.getElementById('simPostMatchStats');
if (!el) return;
const goals = simStats.goals || {};
const assists = simStats.assists || {};
const keypass = simStats.keypass || {};
const saves = simStats.saves || {};
const all = [...plA, ...plB];
const rows = all.map((p) => {
const g = goals[p.id] || 0;
const a = assists[p.id] || 0;
const k = keypass[p.id] || 0;
const s = saves[p.id] || 0;
const rating = Number((ratings && ratings[p.id]) || 6.5);
const inA = plA.some((x) => x.id === p.id);
return { p, g, a, k, s, rating, teamTag: inA ? teamAName : teamBName, teamCls: inA ? 'text-red-400' : 'text-blue-400' };
});
rows.sort((x, y) => y.rating - x.rating || y.g - x.g || String(x.p.name).localeCompare(String(y.p.name), 'ko'));
const motm = rows[0];
const tot = (live?.possA || 0) + (live?.possB || 0) || 1;
const pa = Math.round((100 * (live?.possA || 0)) / tot);
const hudLine = live
? `<div class="grid grid-cols-3 gap-2 text-center mb-3 text-[10px]">
<div class="rounded-lg bg-black/40 py-1.5"><div class="text-slate-500">점유</div><div class="font-black text-emerald-300">${pa}-${100 - pa}</div></div>
<div class="rounded-lg bg-black/40 py-1.5"><div class="text-slate-500">슈팅(유효)</div><div class="font-black text-amber-200">${live.shotA || 0}-${live.shotB || 0} (${live.onA || 0}-${live.onB || 0})</div></div>
<div class="rounded-lg bg-black/40 py-1.5"><div class="text-slate-500">xG</div><div class="font-black text-cyan-200">${(live.xgA || 0).toFixed(2)}-${(live.xgB || 0).toFixed(2)}</div></div>
</div>`
: '';
const motmHtml = motm ? `<p class="text-[11px] text-fut-gold mb-2">MOTM <b>${escapeAttr(motm.p.name)}</b> · 평점 ${motm.rating.toFixed(1)}</p>` : '';
const head = `<div class="flex flex-wrap items-center gap-2 mb-2 border-b border-amber-700/30 pb-2"><i class="fa-solid fa-chart-simple text-amber-400"></i><span class="text-sm font-bold text-amber-200">풀타임 분석</span><span class="text-[10px] text-slate-500">(모의 시뮬 · 서버 미반영)</span></div>`;
const table = `<div class="overflow-x-auto"><table class="w-full text-[11px] sm:text-xs text-left border-collapse"><thead><tr class="text-slate-400 border-b border-slate-700"><th class="py-1.5 pr-2">팀</th><th class="py-1.5 pr-2">선수</th><th class="py-1.5 text-center">평점</th><th class="py-1.5 text-center" title="골">⚽</th><th class="py-1.5 text-center" title="어시스트">🅰️</th><th class="py-1.5 text-center" title="킬패스">KP</th><th class="py-1.5 text-center" title="세이브">🧤</th></tr></thead><tbody>${rows.map((r) => `<tr class="border-b border-slate-800/80 hover:bg-slate-800/40"><td class="py-1.5 pr-2 font-bold ${r.teamCls} truncate max-w-[5.5rem]">${escapeAttr(r.teamTag)}</td><td class="py-1.5 pr-2 text-white font-bold truncate max-w-[8rem]">${escapeAttr(r.p.name)}</td><td class="py-1.5 text-center font-black ${r.rating >= 8 ? 'text-fut-gold' : (r.rating >= 7 ? 'text-emerald-300' : 'text-slate-300')}">${r.rating.toFixed(1)}</td><td class="py-1.5 text-center text-fut-gold font-oswald">${r.g || ''}</td><td class="py-1.5 text-center text-emerald-300">${r.a || ''}</td><td class="py-1.5 text-center text-cyan-300">${r.k || ''}</td><td class="py-1.5 text-center text-orange-300">${r.s || ''}</td></tr>`).join('')}</tbody></table></div>`;
el.innerHTML = head + motmHtml + hudLine + table;
el.classList.remove('hidden');
}

window.simClearLog = () => {
const log = document.getElementById('simMatchLog');
if (log) log.innerHTML = '';
document.getElementById('simScoreBar')?.classList.add('hidden');
document.getElementById('simClockWrap')?.classList.add('hidden');
document.getElementById('simLiveHud')?.classList.add('hidden');
const post = document.getElementById('simPostMatchStats');
if (post) {
post.classList.add('hidden');
post.innerHTML = '';
}
resetSimPitchCanvas();
};

/** 풋살 5vs5 · 시뮬 전·후반 각 20분을 실제 시청 전·후반 각 2분에 비례 압축 중계 */
window.runSimMatch = async () => {
if (window.playerState.isGuest) {
return window.customAlert('둘러보기는 경기를 돌릴 수 없어요. 내 이름으로 들어와 주세요.');
}
if (countSimTeam('A') < 1 || countSimTeam('B') < 1) {
return window.customAlert(window.playerState.isGM ? '레드팀과 블루팀에 각각 한 명 이상 넣어 주세요.' : '아직 팀이 정해지지 않았어요. 감독님이 나눠 주면 경기를 볼 수 있어요.');
}
const rawA = getSimMatchRoster('A');
const rawB = getSimMatchRoster('B');
const padA = padSimRosterWithBots(rawA, 'A');
const padB = padSimRosterWithBots(rawB, 'B');
const plA = padA.roster;
const plB = padB.roster;
const usedBots = padA.bots > 0 || padB.bots > 0;
if (plA.length !== 5 || plB.length !== 5) return window.customAlert('출전 선수를 구성할 수 없습니다.');
ensureSimFieldPositions(plA, plB);
document.getElementById('simTacticalSection')?.classList.add('hidden');

const teamAName = SIM_TEAM_A_NAME;
const teamBName = SIM_TEAM_B_NAME;

const btn = document.getElementById('btnSimStart');
if (btn) { btn.disabled = true; btn.classList.add('opacity-50', 'cursor-not-allowed'); }
const logEl = document.getElementById('simMatchLog');
const scoreBar = document.getElementById('simScoreBar');
const scoreNums = document.getElementById('simScoreNums');
const nameAEl = document.getElementById('simScoreAName');
const nameBEl = document.getElementById('simScoreBName');
const clockWrap = document.getElementById('simClockWrap');
const postStatsEl = document.getElementById('simPostMatchStats');
if (postStatsEl) {
postStatsEl.classList.add('hidden');
postStatsEl.innerHTML = '';
}
if (logEl) logEl.innerHTML = '';
resetSimPitchCanvas();
if (scoreBar) scoreBar.classList.remove('hidden');
if (clockWrap) clockWrap.classList.remove('hidden');
if (nameAEl) nameAEl.textContent = teamAName;
if (nameBEl) nameBEl.textContent = teamBName;
let sa = 0;
let sb = 0;
const updScore = () => { if (scoreNums) scoreNums.textContent = `${sa} - ${sb}`; };
updScore();

const strA = plA.reduce((s, p) => s + getOVR(p), 0);
const strB = plB.reduce((s, p) => s + getOVR(p), 0);
const ratio = strA + strB > 0 ? strA / (strA + strB) : 0.5;
const mentA = document.getElementById('simMentalityA')?.value || 'balanced';
const mentB = document.getElementById('simMentalityB')?.value || 'balanced';
const mentDelta = (code) => (code === 'attack' ? 0.07 : code === 'defend' ? -0.06 : 0);
const live = { possA: 0, possB: 0, shotA: 0, shotB: 0, onA: 0, onB: 0, xgA: 0, xgB: 0 };
const ratings = {};
const bumpRating = (id, d) => { if (!id) return; ratings[id] = Math.max(5.2, Math.min(9.8, (ratings[id] || 6.5) + d)); };
const teamMean = (arr, key) => arr.length ? arr.reduce((s, p) => s + getStat(p, key), 0) / arr.length : STAT_BASE;
const clash = (atkV, defV) => {
const a = Number(atkV) / 99;
const d = Number(defV) / 99;
return Math.max(0.16, Math.min(0.84, 0.47 + (a - d) * 0.44 + (Math.random() * 0.1 - 0.05)));
};
const paintHud = () => {
const hud = document.getElementById('simLiveHud');
if (hud) hud.classList.remove('hidden');
const tot = live.possA + live.possB || 1;
const pa = Math.round((100 * live.possA) / tot);
const possEl = document.getElementById('simHudPoss');
if (possEl) possEl.textContent = `${pa}-${100 - pa}`;
const shEl = document.getElementById('simHudShots');
if (shEl) shEl.textContent = `${live.shotA}-${live.shotB} (${live.onA}-${live.onB})`;
const xgEl = document.getElementById('simHudXg');
if (xgEl) xgEl.textContent = `${live.xgA.toFixed(2)}-${live.xgB.toFixed(2)}`;
};
paintHud();

const simStats = { goals: {}, assists: {}, keypass: {}, saves: {} };
const bumpStat = (cat, id) => {
if (!id) return;
simStats[cat][id] = (simStats[cat][id] || 0) + 1;
};

/** 시뮬레이터 한 하프 길이(초): 20분 */
const SIM_HALF_SEC = 20 * 60;
/** 한 하프 실제 시청 시간 2분 — 상황은 5초마다 1회 */
const SITUATION_INTERVAL_MS = 5000;
const SITUATIONS_PER_HALF = Math.max(1, Math.floor((2 * 60 * 1000) / SITUATION_INTERVAL_MS));

const setMatchClock = (halfIdx, simSec) => {
const el = document.getElementById('simMatchClock');
const halfLabel = halfIdx === 0 ? '전반' : '후반';
const m = Math.floor(simSec / 60);
const s = simSec % 60;
if (el) el.textContent = `${halfLabel} ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/** 중계 텍스트(하단) + 상단 경기장 캔버스 갱신 */
const append = async (line, pitchOpts) => {
if (!logEl) return;
const fx = pitchOpts?.broadcastFx || null;
const plAll = pitchOpts ? [...(pitchOpts.plA || []), ...(pitchOpts.plB || [])] : [];
const meta = pitchOpts ? buildSimSituationMeta(pitchOpts, plAll) : null;
if (pitchOpts) {
applySimChainAndFlow(pitchOpts);
await drawSimPitchLive({ ...pitchOpts, ballFlowTrail: [...simBallFlowTrail] });
if (pitchOpts.isGoalShot) simBallFlowTrail = [];
if (fx) {
pulseSimPitchCanvas(fx);
runSimBroadcastFx(fx, pitchOpts);
}
}
const tImg = await simBroadcastTextToImage(line, fx, meta);
logEl.appendChild(tImg);
logEl.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' });
await sleep(fx ? 120 : 42);
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const gkOf = (arr) => arr.find((p) => p.pos === 'Goleiro') || arr[0];

/** 풋살: 사이드 전개 비중↑ (좌·우 약 38%씩) */
const pickSimChannel = () => {
const u = Math.random();
if (u < 0.38) return 'left';
if (u < 0.76) return 'right';
return 'center';
};
/** 공격 측 연속 성공 — 2·3·4연속일 때 골 확률 가중 */
let simChainSuccess = 0;
/** 연속 패스·드리블 궤적(정규화 좌표, 캔버스 점선) */
let simBallFlowTrail = [];
/** 공격 실패 시 다음 이벤트 공격 방향(상대 턴) */
let possessionNextAttackA = null;

function applySimChainAndFlow(opts) {
if (opts.isGoalShot) {
if (opts.ballHolderId && opts.plA && opts.plB) {
const gHolder = [...opts.plA, ...opts.plB].find((p) => p.id === opts.ballHolderId);
if (gHolder) {
const { nx, ny } = simHolderBallNorm(gHolder, opts);
simBallFlowTrail.push({ nx, ny });
if (simBallFlowTrail.length > 12) simBallFlowTrail.shift();
}
}
simChainSuccess = 0;
return;
}
if (!opts.ballHolderId || !opts.plA || !opts.plB) return;
const holder = [...opts.plA, ...opts.plB].find((p) => p.id === opts.ballHolderId);
if (!holder) return;
const atk = opts.attackA ? opts.plA : opts.plB;
const atkSet = new Set(atk.map((p) => p.id));
const holderIsAtk = atkSet.has(holder.id);
if (opts.outcome === 'success' && holderIsAtk) {
simChainSuccess++;
const { nx, ny } = simHolderBallNorm(holder, opts);
simBallFlowTrail.push({ nx, ny });
if (simBallFlowTrail.length > 12) simBallFlowTrail.shift();
return;
}
if (opts.outcome === 'neutral' && holderIsAtk) {
const { nx, ny } = simHolderBallNorm(holder, opts);
simBallFlowTrail.push({ nx, ny });
if (simBallFlowTrail.length > 12) simBallFlowTrail.shift();
return;
}
if (opts.outcome === 'fail') {
simChainSuccess = 0;
const { nx, ny } = simHolderBallNorm(holder, opts);
simBallFlowTrail = [{ nx, ny }];
possessionNextAttackA = !opts.attackA;
return;
}
if (opts.outcome === 'neutral' && !holderIsAtk) {
simChainSuccess = 0;
const { nx, ny } = simHolderBallNorm(holder, opts);
simBallFlowTrail = [{ nx, ny }];
}
}

/** 5초마다 1회: 패스/가로채기·드리블/수비·슈팅/반사신경 맞대결. 연속 성공 시 슈팅 기회와 xG가 올라갑니다. */
const tryOneSituation = async (halfIdx, simSec) => {
const halfLabel = halfIdx === 0 ? '전반' : '후반';
const mm = String(Math.floor(simSec / 60)).padStart(2, '0');
const ss = String(simSec % 60).padStart(2, '0');
const prefix = `[${halfLabel} ${mm}:${ss}]`;

const wrkBias = (teamMean(plA, 'wrk') - teamMean(plB, 'wrk')) / (halfIdx === 1 ? 550 : 750);
let pAtk = ratio + mentDelta(mentA) - mentDelta(mentB) + wrkBias;
let attackA = Math.random() < Math.max(0.28, Math.min(0.72, pAtk + (Math.random() * 0.06 - 0.03)));
if (possessionNextAttackA !== null) {
attackA = possessionNextAttackA;
possessionNextAttackA = null;
}
if (attackA) live.possA++; else live.possB++;
paintHud();
const atk = attackA ? plA : plB;
const def = attackA ? plB : plA;
const atkName = attackA ? teamAName : teamBName;
const defName = attackA ? teamBName : teamAName;

let ch = pickSimChannel();
const pitch = (phase, outcome, chOverride, ballHolder, extra) => ({
attackA,
channel: chOverride !== undefined ? chOverride : ch,
phase,
outcome: outcome || 'neutral',
plA,
plB,
halfIdx,
simSec,
ballHolderId: ballHolder && ballHolder.id ? ballHolder.id : null,
isGoalShot: !!(extra && extra.isGoalShot),
broadcastFx: extra && extra.broadcastFx ? extra.broadcastFx : null
});

const atkField = atk.filter((p) => p.pos !== 'Goleiro');
const pickAtk = () => {
const pool = atkField.length ? atkField : atk;
const weights = pool.map((p) => {
let w = 1 + getStat(p, 'wrk') / 90;
if (p.pos === 'Pivo') w += 1.35;
else if (p.pos === 'Ala') w += 0.55;
else if (p.pos === 'Fixo') w += 0.12;
return w;
});
const sum = weights.reduce((a, b) => a + b, 0) || 1;
let r = Math.random() * sum;
for (let i = 0; i < pool.length; i++) {
r -= weights[i];
if (r <= 0) return pool[i];
}
return pool[pool.length - 1];
};
const actor = pickAtk();
const gk = gkOf(def);

const sideHint = ch === 'left' ? '왼쪽 측면' : ch === 'right' ? '오른쪽 측면' : '중앙';
const atkCtrl = teamMean(atk, 'pas') * 0.55 + teamMean(atk, 'dri') * 0.45 + (mentDelta(attackA ? mentA : mentB) * 40);
const defCtrl = teamMean(def, 'int') * 0.5 + teamMean(def, 'def') * 0.5 - (mentDelta(attackA ? mentB : mentA) * 20);
const success = Math.random() < clash(atkCtrl, defCtrl);

if (!success) {
const intr = pick(def);
const marker = pick(def.filter((p) => p.id !== intr.id)) || intr;
bumpRating(intr.id, 0.22);
bumpRating(actor.id, -0.06);
const failKinds = [
`${prefix} ${atkName} ${sideHint}. ${intr.name}(${simPosShort(intr)})가 발끝으로 끊어냅니다. ${atkName} 연결 아쉽게 무산.`,
`${prefix} ${defName} ${intr.name}, 상대 패스 루트 읽고 인터셉트! ${atkName}는 한 템포 늦었습니다.`,
`${prefix} 좁은 코트 ${sideHint}. ${marker.name}에게 시선이 갔다가 ${intr.name}에게 공이 넘어갑니다. ${atkName} 공격 흐름 끊깁니다.`,
`${prefix} ${atkName} 전진 시도 — ${intr.name}가 몸을 싣고 막아냅니다. 아쉽게 놓치고 맙니다.`,
`${prefix} ${intr.name}(${simPosShort(intr)}) 스틸 성공. ${defName} 볼 회수, ${atkName}는 다시 빌드업부터.`,
`${prefix} ${sideHint} 2대1 압박! ${intr.name}가 가로채기에 성공합니다. ${atkName} 패스 타이밍이 살짝 빗나갔습니다.`
];
await append(failKinds[Math.floor(Math.random() * failKinds.length)], pitch('progress', 'fail', ch, intr));
return;
}

const nextChain = simChainSuccess + 1;
const shotChance = nextChain >= 4 ? 0.70 : nextChain === 3 ? 0.48 : nextChain === 2 ? 0.28 : 0;
const isShot = shotChance > 0 && Math.random() < shotChance;

if (isShot) {
const actorSho = getStat(actor, 'sho') + getStat(actor, 'cmp') * 0.25 + getStat(actor, 'pst') * 0.15;
const gkRef = getStat(gk, 'ref') + getStat(gk, 'pst') * 0.2;
const shotQuality = clash(actorSho + nextChain * 3, gkRef);
let xg = (nextChain >= 4 ? 0.36 : nextChain === 3 ? 0.24 : 0.14) * shotQuality;
if ((attackA ? mentA : mentB) === 'attack') xg *= 1.12;
if ((attackA ? mentB : mentA) === 'defend') xg *= 0.88;
xg = Math.max(0.05, Math.min(0.48, xg));
if (attackA) { live.shotA++; live.xgA += xg; } else { live.shotB++; live.xgB += xg; }
paintHud();
const rollGoal = Math.random() < xg;

if (rollGoal) {
if (attackA) { sa++; live.onA++; } else { sb++; live.onB++; }
updScore();
paintHud();
bumpStat('goals', actor.id);
bumpRating(actor.id, 1.05);
bumpRating(gk.id, -0.28);
const mates = atk.filter((x) => x.id !== actor.id);
const assi = mates.length ? pick(mates) : null;
if (assi) {
bumpStat('assists', assi.id);
bumpRating(assi.id, 0.38);
}
const df = pick(def.filter((p) => p.id !== gk.id)) || pick(def);
const goalLines = assi
? [
`${prefix} ⚽ 골! ${atkName} ${actor.name}, 페널티 호라이즌에서 마무리! 어시스트 ${assi.name}. ${defName} ${gk.name} 손끝에 닿았지만 들어갑니다. ${sa}-${sb}`,
`${prefix} ⚽ 들어갑니다! ${assi.name}→${actor.name} 원터치 연결 끝에 골. ${defName} ${df.name}는 막지 못했습니다. ${sa}-${sb}`
]
: [
`${prefix} ⚽ 골! ${actor.name}가 골 앞 혼전을 가르며 강슛. ${defName} ${gk.name} 반응했으나 꺾이지 않습니다. ${sa}-${sb}`,
`${prefix} ⚽ ${actor.name} 결정적 한 방! 풋살 골문 앞 각도 좁혔는데도 넣습니다. ${gk.name} 아쉬운 실점. ${sa}-${sb}`
];
await append(goalLines[Math.floor(Math.random() * goalLines.length)], pitch('danger', 'success', ch, actor, { isGoalShot: true, broadcastFx: 'goal' }));
return;
}

const saveProb = Math.max(0.18, Math.min(0.62, clash(gkRef, actorSho)));
if (Math.random() < saveProb) {
if (attackA) live.onA++; else live.onB++;
paintHud();
bumpStat('saves', gk.id);
bumpRating(gk.id, 0.72);
bumpRating(actor.id, 0.12);
const saveLines = [
`${prefix} 🧤 SUPER SAVE! ${defName} ${gk.name}가 ${actor.name}의 결정적 슈팅을 막아냅니다! (xG ${xg.toFixed(2)})`,
`${prefix} 🧤 슈퍼 세이브! ${gk.name} 리플렉스로 ${actor.name} 강슛을 걷어냈습니다.`,
`${prefix} 🧤 ${gk.name}의 기적 같은 선방! ${atkName} ${actor.name} — ${gk.name}가 코트를 살렸습니다.`
];
await append(saveLines[Math.floor(Math.random() * saveLines.length)], pitch('danger', 'neutral', ch, gk, { broadcastFx: 'superSave' }));
return;
}

bumpRating(actor.id, -0.08);
const missLines = [
`${prefix} ${actor.name}의 슈팅! 골문을 살짝 벗어납니다. (xG ${xg.toFixed(2)})`,
`${prefix} ${sideHint}에서 ${actor.name} 감아차기 — ${gk.name}가 손 쓸 필요 없이 아웃.`,
`${prefix} ${actor.name} vs ${gk.name}, 각도는 좋았으나 빗맞습니다. ${defName} 한숨 돌립니다.`
];
await append(missLines[Math.floor(Math.random() * missLines.length)], pitch('danger', 'fail', ch, actor));
return;
}

const kind = Math.floor(Math.random() * 5);
const d1 = pick(def);

if (kind === 0) {
const [p1, p2] = simPickTwoDistinct(atk);
const z1 = simPosShort(p1);
const z2 = simPosShort(p2);
const mark = pick(def);
bumpStat('keypass', p1.id);
bumpRating(p1.id, 0.12);
const passOkLines = [
`${prefix} ${atkName} ${sideHint}. ${p1.name}(${z1})가 ${mark.name}(${simPosShort(mark)}) 압박을 등지고 ${p2.name}(${z2})에게 연결 성공.`,
`${prefix} 원터치 교환! ${p1.name}→${p2.name}, ${defName} ${d1.name}가 붙기 전에 라인 통과합니다.`,
`${prefix} ${p1.name}가 ${d1.name}와의 간격 벌리며 ${p2.name}에게. 좁은 코트에서 시야 좋습니다.`
];
await append(passOkLines[Math.floor(Math.random() * passOkLines.length)], pitch('progress', 'success', ch, p2, { broadcastFx: 'keyPass' }));
} else if (kind === 1) {
const duel = pick(def);
const wonDuel = Math.random() < clash(getStat(actor, 'dri') + getStat(actor, 'pac') * 0.2, getStat(duel, 'def') + getStat(duel, 'phy') * 0.2);
if (!wonDuel) {
bumpRating(duel.id, 0.2);
bumpRating(actor.id, -0.05);
await append(`${prefix} 1대1! ${actor.name} vs ${duel.name} — ${duel.name}가 몸으로 막아 돌파를 차단합니다.`, pitch('progress', 'fail', ch, duel));
return;
}
bumpStat('keypass', actor.id);
bumpRating(actor.id, 0.14);
const dribLines = [
`${prefix} ${atkName} ${sideHint}. ${actor.name}가 ${duel.name}(${simPosShort(duel)})를 제치고 돌파합니다. 발재간 살아 있습니다.`,
`${prefix} 1대1! ${actor.name} vs ${duel.name} — ${actor.name}가 몸으로 버티며 전진 성공.`,
`${prefix} ${duel.name}의 태클 타이밍을 피해 ${actor.name}가 빗겨 나갑니다. ${defName} 수비 한 수 무력화.`
];
await append(dribLines[Math.floor(Math.random() * dribLines.length)], pitch('progress', 'success', ch, actor, { broadcastFx: 'keyPass' }));
} else if (kind === 2) {
const w = atk.filter((x) => x.pos === 'Ala' || x.pos === '미정' || x.pos === 'Pivo');
const wx = w.length ? pick(w) : actor;
const others = atk.filter((x) => x.id !== wx.id);
const tgt = others.length ? pick(others) : wx;
const back = pick(def);
bumpStat('keypass', wx.id);
bumpRating(wx.id, 0.12);
const cutLines = [
`${prefix} ${sideHint} ${wx.name}가 엔드라인 쪽으로 끌고 갔다가 ${back.name}를 앞에 두고 컷백! ${tgt.name}가 받아 전개합니다.`,
`${prefix} 크로스형 컷백 — ${wx.name}→${tgt.name}. ${defName} ${back.name}가 막으려 했으나 연결됐습니다.`,
`${prefix} 풋살식 사이드 연계. ${wx.name}가 골라인 근처에서 띄워주고 ${tgt.name}가 중앙에서 이어받습니다.`
];
await append(cutLines[Math.floor(Math.random() * cutLines.length)], pitch('danger', 'success', ch, tgt, { broadcastFx: 'keyPass' }));
} else if (kind === 3) {
const gkA = gkOf(atk);
const lonPool = atk.filter((x) => x.id !== gkA.id);
const lon = lonPool.length ? pick(lonPool) : actor;
const high = pick(def);
bumpStat('keypass', gkA.id);
bumpRating(gkA.id, 0.1);
const longLines = [
`${prefix} 골레이로 ${gkA.name} 롱킥! ${high.name} 라인 위로 넘겨 ${lon.name}가 잡았습니다. 상대 압박 한 번에 벗어납니다.`,
`${prefix} ${gkA.name}가 손으로 배급 — ${lon.name}에게 직접. ${defName} ${high.name}는 높이 못 올렸습니다.`,
`${prefix} 풋살에서 보는 롱 드로잉. ${gkA.name}→${lon.name} 연결 성공, 전환 타이밍 좋습니다.`
];
await append(longLines[Math.floor(Math.random() * longLines.length)], pitch('build', 'success', ch, lon, { broadcastFx: 'keyPass' }));
} else {
const press = pick(def);
bumpStat('keypass', actor.id);
bumpRating(actor.id, 0.08);
const keepLines = [
`${prefix} ${atkName} ${sideHint}. ${actor.name}가 ${press.name}의 압박 속에서도 볼 지키며 링으로 연계합니다.`,
`${prefix} ${press.name}가 붙었지만 ${actor.name}가 몸싸움 이깁니다. 볼 소유 유지 성공.`,
`${prefix} 좁은 공간, ${actor.name} 침착하게 터치 한 번 줄여서 팀 동료 쪽으로. ${defName} ${press.name} 아쉬운 압박.`
];
await append(keepLines[Math.floor(Math.random() * keepLines.length)], pitch('progress', 'success', ch, actor, { broadcastFx: 'keyPass' }));
}
};

const kickPitch = { attackA: true, channel: 'center', phase: 'build', outcome: 'neutral', plA, plB, halfIdx: 0, simSec: 0, ballHolderId: null };
const mentLabel = (code) => (code === 'attack' ? '공격적' : code === 'defend' ? '수비적' : '밸런스');
try {
await append(`━━ ${teamAName} vs ${teamBName} · 모의 풋살 (5vs5, 시뮬 전·후반 각 20분 — 시청은 각 2분 비례) ━━`, kickPitch);
if (usedBots) {
await append(`[연습 모드] 실제 소속 인원이 5명 미만인 팀은 자동 보조 선수로 채워 5vs5로 진행합니다. (가상 인원은 기록에 반영되지 않습니다)`, kickPitch);
}
await append(`전력 요약: ${teamAName} 출전 OVR 합 ${strA} (${mentLabel(mentA)})  |  ${teamBName} 출전 OVR 합 ${strB} (${mentLabel(mentB)})`, kickPitch);
await append(`[전반 00:00] 킥오프 — 패스 vs 가로채기, 드리블 vs 수비, 슈팅 vs 반사신경으로 판정합니다. 공격적 템포는 슈팅을 늘리고, 수비적은 실점을 줄입니다.`, kickPitch);
for (let halfIdx = 0; halfIdx < 2; halfIdx++) {
setMatchClock(halfIdx, 0);
for (let si = 0; si < SITUATIONS_PER_HALF; si++) {
const simSec = Math.min(SIM_HALF_SEC - 1, Math.floor(((si + 1) / SITUATIONS_PER_HALF) * SIM_HALF_SEC));
setMatchClock(halfIdx, simSec);
await tryOneSituation(halfIdx, simSec);
await sleep(SITUATION_INTERVAL_MS);
}
setMatchClock(halfIdx, SIM_HALF_SEC);
const hl = halfIdx === 0 ? '전반' : '후반';
await append(`[${hl} 20:00] ${hl} 종료 휘슬`);
if (halfIdx === 0) {
const totH = live.possA + live.possB || 1;
const paH = Math.round((100 * live.possA) / totH);
await append(`[하프타임] 점유 ${paH}-${100 - paH} · 슈팅 ${live.shotA}-${live.shotB} (${live.onA}-${live.onB}) · xG ${live.xgA.toFixed(2)}-${live.xgB.toFixed(2)} · 스코어 ${sa}-${sb}`);
await append(`[휴식] 하프타임 — 전술을 가다듬습니다.`);
}
}

await append(`━━ 최종 스코어 ${teamAName} ${sa} : ${sb} ${teamBName} ━━`);
await append(`(모의 시뮬레이션 종료 · 서버 기록·EXP 미반영)`);
renderSimPostMatchStats(plA, plB, teamAName, teamBName, simStats, live, ratings);
} finally {
if (btn) { btn.disabled = false; btn.classList.remove('opacity-50', 'cursor-not-allowed'); }
document.getElementById('simTacticalSection')?.classList.remove('hidden');
window.drawSimTacticalBoard();
window.renderSimTacticalStrips();
}
};
