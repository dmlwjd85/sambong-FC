/** 모의경기 진행과 경기 후 기록 */
import { STAT_BASE } from '../constants.js';
import { runSimBroadcastFx, pulseSimPitchCanvas, buildSimSituationMeta, simBroadcastTextToImage } from './broadcast.js';
import { ensureSimFieldPositions, simHolderBallNorm } from './formation.js';
import { resetSimPitchCanvas } from './pitch.js';
import { liveScene } from './liveScene.js';
import { getTactic, channelWeights } from './tactics.js';
import { PLAYS, DEFENSE_NOTES, resolveRoles, choosePlay, fillSay, josa } from './playbook.js';
import { simSlotTeam } from './roster.js';
import { countSimTeam, getSimLineup, padSimRosterWithBots, simPosShort, simPickTwoDistinct, simSlotName, fitOVR, asRole } from './roster.js';
import { getStat, getOVR } from '../stats.js';
import { escapeAttr, sleep } from '../utils.js';
import { mangaGenderOf, peekFcGoalSpecial, pickFcMangaScene, preloadMangaCutIns, showMangaCutIn } from './mangaCutIn.js';

/** 모의경기 종료 후 평점·xG·골·어시·킬패스·세이브 요약 (FM 스타일) */
function renderSimPostMatchStats(plA, plB, teamAName, teamBName, simStats, live, ratings, minutes, extra) {
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
const min = minutes ? Math.round((minutes[p.id] || 0) / 60) : null;
return { p, g, a, k, s, rating, min, teamTag: inA ? teamAName : teamBName, teamCls: inA ? 'text-red-400' : 'text-blue-400' };
});
rows.sort((x, y) => y.rating - x.rating || y.g - x.g || String(x.p.name).localeCompare(String(y.p.name), 'ko'));
const motm = rows.find((r) => !String(r.p.id).startsWith('__sim_bot')) || rows[0];
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
const table = `<div class="overflow-x-auto"><table class="w-full text-[11px] sm:text-xs text-left border-collapse"><thead><tr class="text-slate-400 border-b border-slate-700"><th class="py-1.5 pr-2">팀</th><th class="py-1.5 pr-2">선수</th><th class="py-1.5 text-center">평점</th><th class="py-1.5 text-center" title="뛴 시간(분)">분</th><th class="py-1.5 text-center" title="골">⚽</th><th class="py-1.5 text-center" title="어시스트">🅰️</th><th class="py-1.5 text-center" title="킬패스">KP</th><th class="py-1.5 text-center" title="세이브">🧤</th></tr></thead><tbody>${rows.map((r) => `<tr class="border-b border-slate-800/80 hover:bg-slate-800/40"><td class="py-1.5 pr-2 font-bold ${r.teamCls} truncate max-w-[5.5rem]">${escapeAttr(r.teamTag)}</td><td class="py-1.5 pr-2 text-white font-bold truncate max-w-[8rem]">${escapeAttr(r.p.name)}</td><td class="py-1.5 text-center font-black ${r.rating >= 8 ? 'text-fut-gold' : (r.rating >= 7 ? 'text-emerald-300' : 'text-slate-300')}">${r.rating.toFixed(1)}</td><td class="py-1.5 text-center text-slate-400">${r.min == null ? '' : r.min}</td><td class="py-1.5 text-center text-fut-gold font-oswald">${r.g || ''}</td><td class="py-1.5 text-center text-emerald-300">${r.a || ''}</td><td class="py-1.5 text-center text-cyan-300">${r.k || ''}</td><td class="py-1.5 text-center text-orange-300">${r.s || ''}</td></tr>`).join('')}</tbody></table></div>`;
const extraLine = extra ? `<p class="text-[11px] text-slate-400 mb-2">파울 ${extra.foulsA}-${extra.foulsB} · 경고 ${extra.cardsA}-${extra.cardsB} · 코너킥 ${extra.cornersA}-${extra.cornersB} · 교체 ${extra.subsA}-${extra.subsB}</p>` : '';
const playRows = extra && extra.plays ? Object.entries(extra.plays) : [];
const playHtml = playRows.length ? `<div class="mb-2 rounded-lg bg-black/30 p-2"><div class="text-[11px] font-bold text-sky-300 mb-1">📘 오늘 쓴 전술 (시도 · 슈팅까지 · 골)</div><div class="grid gap-1">${playRows.map(([k, v]) => {
const nm = (PLAYS[k] && PLAYS[k].name) || k;
const cell = (x) => (x.t ? `${x.t}회 · ${x.s} · ${x.g}${x.g ? '⚽' : ''}` : '—');
return `<div class="flex flex-wrap items-center justify-between gap-x-2 text-[11px]"><span class="text-white font-bold truncate">${escapeAttr(nm)}</span><span class="text-slate-300 shrink-0"><span class="text-cyan-300">${escapeAttr(teamAName)}</span> ${cell(v.A)} | <span class="text-rose-300">${escapeAttr(teamBName)}</span> ${cell(v.B)}</span></div>`;
}).join('')}</div><p class="text-[10px] text-slate-500 mt-1">슈팅까지 간 비율이 높은 전술이 우리 팀에 잘 맞는 전술이에요. 다음 경기 작전 회의 때 써 보세요!</p></div>` : '';
el.innerHTML = head + motmHtml + hudLine + extraLine + playHtml + table;
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
const lineupA = getSimLineup('A');
const lineupB = getSimLineup('B');
const padA = padSimRosterWithBots(lineupA.starters, 'A');
const padB = padSimRosterWithBots(lineupB.starters, 'B');
/** 교체 명단 (원래 포지션 그대로) */
const benchA = [...lineupA.bench];
const benchB = [...lineupB.bench];
const plA = padA.roster;
const plB = padB.roster;
const usedBots = padA.bots > 0 || padB.bots > 0;
if (plA.length !== 5 || plB.length !== 5) return window.customAlert('출전 선수를 구성할 수 없습니다.');
ensureSimFieldPositions(plA, plB);
document.getElementById('simTacticalDetails')?.classList.add('hidden');
document.getElementById('simBoardDetails')?.removeAttribute('open');

const teamAName = simSlotName('A');
const teamBName = simSlotName('B');

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
preloadMangaCutIns();
if (scoreBar) scoreBar.classList.remove('hidden');
// 휴대폰에서도 바로 경기 화면이 보이게
requestAnimationFrame(() => {
// 휴대폰 세로: 경기장 패널(점수·자막 포함)이 화면에 꽉 차게. 그 밖에는 점수판부터
const portraitPhone = window.innerWidth < 768 && document.getElementById('simPitchPanel')?.classList.contains('sim-portrait');
const target = portraitPhone ? document.getElementById('simPitchPanel') : (document.getElementById('simClockWrap') || scoreBar);
target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
if (clockWrap) clockWrap.classList.remove('hidden');
if (nameAEl) nameAEl.textContent = teamAName;
if (nameBEl) nameBEl.textContent = teamBName;
let sa = 0;
let sb = 0;
const updScore = () => { if (scoreNums) scoreNums.textContent = `${sa} - ${sb}`; const ps = document.getElementById('simPitchScore'); if (ps) ps.textContent = `${sa} - ${sb}`; };
updScore();

const strA = plA.reduce((s, p) => s + getOVR(p), 0);
const strB = plB.reduce((s, p) => s + getOVR(p), 0);
const ratio = strA + strB > 0 ? strA / (strA + strB) : 0.5;
const mentA = document.getElementById('simMentalityA')?.value || 'balanced';
const mentB = document.getElementById('simMentalityB')?.value || 'balanced';
const tacA = getTactic(simSlotTeam('A'));
const tacB = getTactic(simSlotTeam('B'));
liveScene.tactics = { A: tacA, B: tacB };
liveScene.setKits(simSlotTeam('A'), simSlotTeam('B'));
const mentDelta = (code) => (code === 'attack' ? 0.07 : code === 'defend' ? -0.06 : 0);
const live = { possA: 0, possB: 0, shotA: 0, shotB: 0, onA: 0, onB: 0, xgA: 0, xgB: 0 };
const ratings = {};
const bumpRating = (id, d) => { if (!id) return; ratings[id] = Math.max(5.2, Math.min(9.8, (ratings[id] || 6.5) + d)); };
/** 체력(0~100): 많이 뛰면 떨어지고, 벤치에서 쉬면 회복. 지치면 능력치가 최대 18%까지 내려가요 */
const stamina = {};
[...plA, ...plB, ...benchA, ...benchB].forEach((p) => { stamina[p.id] = 100; });
const minutesPlayed = {};
const played = { A: new Map(), B: new Map() };
const notePlayed = () => { plA.forEach((p) => played.A.set(p.id, p)); plB.forEach((p) => played.B.set(p.id, p)); };
notePlayed();
const effStat = (p, key) => getStat(p, key) * (0.82 + 0.18 * ((stamina[p.id] ?? 100) / 100));
const teamMean = (arr, key) => arr.length ? arr.reduce((s, p) => s + effStat(p, key), 0) / arr.length : STAT_BASE;
const extra = { foulsA: 0, foulsB: 0, cardsA: 0, cardsB: 0, cornersA: 0, cornersB: 0, subsA: 0, subsB: 0, plays: {} };
/** 이번 경기에서 처음 나온 전술은 설명을 길게, 다음부터는 짧게 */
const seenPlays = new Set();
/** 하프별 팀 누적 파울 (풋살: 6번째부터 10m 프리킥) */
let halfFouls = { A: 0, B: 0 };
const yellow = {};
/** 마지막으로 공을 건넨 선수 (어시스트 판정) */
let lastPasser = null;
/** 다음 상황 강제: 코너킥·역습·프리킥 */
let setPiece = null;
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
/** 상황 사이 간격: 경기 속도에 따라 */
/** 상황 사이 쉬는 시간 (움직임 자체는 liveScene이 속도에 맞춰 재생) */
const SPEED_MS = { real: 900, normal: 450, fast: 120, test: 0 };
/** 움직임 속도 배율 (1 = 실감, 작을수록 빠르게, 0 = 바로 결과) */
const MOTION_SCALE = { real: 1, normal: 0.6, fast: 0.28, test: 0 };
liveScene.timeScale = MOTION_SCALE[document.getElementById('simSpeed')?.value] ?? MOTION_SCALE.normal;
const SITUATION_INTERVAL_MS = SPEED_MS[document.getElementById('simSpeed')?.value] ?? SPEED_MS.normal;
/** 한 하프 상황 수는 속도와 상관없이 24번 (시뮬 50초마다 1번) */
const SITUATIONS_PER_HALF = 24;

const setMatchClock = (halfIdx, simSec) => {
const el = document.getElementById('simMatchClock');
const halfLabel = halfIdx === 0 ? '전반' : '후반';
const m = Math.floor(simSec / 60);
const s = simSec % 60;
if (el) el.textContent = `${halfLabel} ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/** 중계 텍스트(하단) + 상단 경기장 캔버스 갱신 */
window.__simLastLog = [];
const append = async (line, pitchOpts) => {
window.__simLastLog.push(line);
if (!logEl) return;
const fx = pitchOpts?.broadcastFx || null;
const plAll = pitchOpts ? [...(pitchOpts.plA || []), ...(pitchOpts.plB || [])] : [];
const meta = pitchOpts ? buildSimSituationMeta(pitchOpts, plAll) : null;
if (pitchOpts) {
applySimChainAndFlow(pitchOpts);
liveScene.setRosters(plA, plB);
// 움직임 먼저 보여 주고(단계마다 자막), 결과가 나온 뒤 중계 줄을 남김
if (pitchOpts.motion) await liveScene.playEvent({ ...pitchOpts.motion, attackA: pitchOpts.attackA, channel: pitchOpts.channel });
if (pitchOpts.isGoalShot) simBallFlowTrail = [];
if (fx) {
pulseSimPitchCanvas(fx);
if (fx === 'goal' || fx === 'superSave') runSimBroadcastFx(fx, pitchOpts);
}
}
const tImg = await simBroadcastTextToImage(line, fx, meta);
logEl.appendChild(tImg);
logEl.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' });
await sleep(fx ? 120 : 42);
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const gkOf = (arr) => arr.find((p) => p.pos === 'Goleiro') || arr[0];

/** 골 뒤 상황 해설: 동점·역전·멀티골 */
const goalCount = {};
const goalContext = async (attackA, scorer, prefix) => {
goalCount[scorer.id] = (goalCount[scorer.id] || 0) + 1;
const mine = attackA ? sa : sb;
const theirs = attackA ? sb : sa;
const name = attackA ? teamAName : teamBName;
const n = goalCount[scorer.id];
if (n === 3) await append(`${prefix} 🎩 해트트릭! ${scorer.name}, 오늘 경기의 주인공입니다!`);
else if (n === 2) await append(`${prefix} ${scorer.name} 멀티골! 오늘 감이 좋습니다.`);
if (mine === theirs) await append(`${prefix} 동점! ${name}가 다시 균형을 맞춥니다. ${sa}-${sb}`);
else if (mine === theirs + 1 && mine > 1 && lastLeader !== null && lastLeader !== attackA) await append(`${prefix} 역전! ${name}가 경기를 뒤집습니다!`);
if (mine > theirs) lastLeader = attackA; else if (mine < theirs) lastLeader = !attackA; else lastLeader = null;
// 풋살 규칙: 골이 나면 실점한 팀이 센터 마크에서 킥오프로 다시 시작
const concName = attackA ? teamBName : teamAName;
const conc = attackA ? plB : plA;
const ko = conc.find((p) => p.pos === 'Pivo') || conc.find((p) => p.pos !== 'Goleiro') || conc[0];
await liveScene.playEvent({ kind: 'kickoff', holderId: ko && ko.id, say: josa(`센터 킥오프 — 실점한 ${concName}이(가) 가운데서 다시 시작합니다`) });
await append(josa(`${prefix} ⏺ 센터 킥오프 — 골을 먹은 ${concName}이(가) 하프라인 가운데에서 다시 시작합니다. (풋살 규칙: 실점한 팀이 킥오프, 상대는 3m 떨어져요)`));
simChainSuccess = 0;
simBallFlowTrail = [];
possessionNextAttackA = !attackA;
};
let lastLeader = null;
const playManga = (id) => showMangaCutIn(id, { timeScale: liveScene.timeScale });
const playGoalManga = async (attackA, scorer) => {
const special = peekFcGoalSpecial({
scorerGoalsBefore: goalCount[scorer.id] || 0,
mine: attackA ? sa : sb,
theirs: attackA ? sb : sa,
lastLeader,
attackA,
});
const id = pickFcMangaScene({ kind: 'goal', attackA, special, gender: mangaGenderOf(scorer), team: attackA ? 'red' : 'blue' });
if (id) await playManga(id);
};


/** 세트피스 슈팅 (프리킥·10m 킥) */
const setPieceShot = async ({ attackA, shooter, gk, baseXg, prefix, ch, pitch, label }) => {
const sho = effStat(shooter, 'sho') + effStat(shooter, 'cmp') * 0.3;
const ref = effStat(gk, 'ref') + effStat(gk, 'pst') * 0.2;
const xg = Math.max(0.05, Math.min(0.6, baseXg * (0.6 + clash(sho, ref))));
if (attackA) { live.shotA++; live.xgA += xg; } else { live.shotB++; live.xgB += xg; }
const r = Math.random();
if (r < xg) {
if (attackA) { sa++; live.onA++; } else { sb++; live.onB++; }
updScore(); paintHud();
bumpStat('goals', shooter.id); bumpRating(shooter.id, 1.0); bumpRating(gk.id, -0.25);
await append(`${prefix} ⚽ ${label} 골! ${shooter.name}의 슈팅이 그대로 꽂힙니다! ${sa}-${sb}`, pitch('danger', 'success', ch, shooter, { isGoalShot: true, broadcastFx: 'goal', motion: { kind: 'setpiece', actor: shooter, gk, result: 'goal', label, dist: label.includes('10m') ? 10 : label.includes('페널티') ? 6 : 12 } }));
await playGoalManga(attackA, shooter);
await goalContext(attackA, shooter, prefix);
} else if (r < xg + 0.35) {
if (attackA) live.onA++; else live.onB++;
paintHud();
bumpStat('saves', gk.id); bumpRating(gk.id, 0.6);
await append(`${prefix} 🧤 ${label} — ${shooter.name}의 슈팅을 ${gk.name}가 막아냅니다!`, pitch('danger', 'neutral', ch, gk, { broadcastFx: 'superSave', motion: { kind: 'setpiece', actor: shooter, gk, result: 'save', label, dist: label.includes('10m') ? 10 : label.includes('페널티') ? 6 : 12 } }));
await playManga(pickFcMangaScene({ kind: 'superSave', gender: mangaGenderOf(gk), team: attackA ? 'blue' : 'red' }));
} else {
paintHud();
await append(`${prefix} ${label} — ${shooter.name}의 슈팅이 벽에 맞고 나갑니다.`, pitch('danger', 'fail', ch, shooter, { motion: { kind: 'setpiece', actor: shooter, gk, result: 'miss', label, dist: label.includes('10m') ? 10 : label.includes('페널티') ? 6 : 12 } }));
}
};

/** 파울: 팀 누적 파울, 경고, 프리킥 / 6번째부터 10m 프리킥 */
const handleFoul = async (attackA, victim, fouler, prefix, ch, pitch, atk, def, gk, atkName, defName, inBox = false) => {
const side = attackA ? 'B' : 'A';
halfFouls[side]++;
if (side === 'A') extra.foulsA++; else extra.foulsB++;
bumpRating(fouler.id, -0.12);
let line = `${prefix} 휘슬! ${defName} ${fouler.name}가 ${victim.name}를 막다가 파울. (${defName} 이번 하프 누적 파울 ${halfFouls[side]})`;
if (Math.random() < 0.14) {
yellow[fouler.id] = (yellow[fouler.id] || 0) + 1;
if (side === 'A') extra.cardsA++; else extra.cardsB++;
bumpRating(fouler.id, -0.2);
line += ` 🟨 ${fouler.name} 경고${yellow[fouler.id] >= 2 ? ' — 오늘 두 번째예요, 조심해야 합니다!' : '.'}`;
}
await append(line, pitch('progress', 'fail', ch, victim, { motion: { kind: 'foul', actor: victim, defender: fouler, card: line.includes('🟨') } }));
const shooter = [...atk].filter((p) => p.pos !== 'Goleiro').sort((a, b) => effStat(b, 'sho') - effStat(a, 'sho'))[0] || victim;
if (halfFouls[side] >= 6) {
await append(`${prefix} 누적 파울 6개 — ${atkName}에게 10m 프리킥! 키커는 ${shooter.name}.`);
await setPieceShot({ attackA, shooter, gk, baseXg: 0.42, prefix, ch: 'center', pitch, label: '10m 프리킥' });
return;
}
// 골키퍼 구역(페널티 에어리어) 안 파울 → 페널티킥
if (inBox && Math.random() < 0.55) {
await append(`${prefix} 페널티 에어리어 안 파울! 주심이 페널티 마크(6m)를 가리킵니다. 키커 ${shooter.name}.`);
await setPieceShot({ attackA, shooter, gk, baseXg: 0.62, prefix, ch: 'center', pitch, label: '페널티킥' });
return;
}
// 그 밖에는 프리킥: 골문 가까우면 직접 슈팅, 멀면 짧게 이어서 다시 공격
if (inBox || Math.random() < 0.25) {
await setPieceShot({ attackA, shooter, gk, baseXg: 0.13, prefix, ch, pitch, label: '직접 프리킥' });
return;
}
const mates = atk.filter((p) => p.id !== victim.id && p.pos !== 'Goleiro');
const recv = mates.length ? pick(mates) : victim;
await append(`${prefix} ${atkName} 프리킥 — 수비벽 5m. ${victim.name}가 ${recv.name}에게 짧게 연결해 다시 공격합니다.`,
pitch('progress', 'success', ch, recv, { motion: { kind: 'freekick', actor: victim, target: recv } }));
possessionNextAttackA = attackA;
};

/** 체력·뛴 시간 계산 (상황 1번 = 시뮬 50초) */
const tickStamina = () => {
const secPer = SIM_HALF_SEC / SITUATIONS_PER_HALF;
const drainFor = (p, ment) => {
let d = 2.6 * (1.2 - getStat(p, 'wrk') / 99 * 0.3 - getStat(p, 'phy') / 99 * 0.25);
if (p.pos === 'Goleiro') d *= 0.3;
if (ment === 'attack') d *= 1.15; else if (ment === 'defend') d *= 0.9;
return d;
};
plA.forEach((p) => { stamina[p.id] = Math.max(20, (stamina[p.id] ?? 100) - drainFor(p, mentA)); minutesPlayed[p.id] = (minutesPlayed[p.id] || 0) + secPer; });
plB.forEach((p) => { stamina[p.id] = Math.max(20, (stamina[p.id] ?? 100) - drainFor(p, mentB)); minutesPlayed[p.id] = (minutesPlayed[p.id] || 0) + secPer; });
[...benchA, ...benchB].forEach((p) => { stamina[p.id] = Math.min(100, (stamina[p.id] ?? 100) + 3.5); });
};

const ROLE_KR = { Goleiro: 'GK', Fixo: 'DF', Ala: 'MF', Pivo: 'FW', 미정: '?' };
/** 교체: 지친 필드 선수 ↔ 쉰 벤치 선수 (아직 못 뛴 선수 우선). 하프타임엔 최대 2명 */
const rotateSubs = async (halfIdx, simSec, halftime) => {
for (const slot of ['A', 'B']) {
const field = slot === 'A' ? plA : plB;
const bench = slot === 'A' ? benchA : benchB;
if (!bench.length) continue;
const teamName = slot === 'A' ? teamAName : teamBName;
let left = halftime ? 2 : 1;
const tired = field.filter((p) => p.pos !== 'Goleiro').sort((a, b) => (stamina[a.id] ?? 100) - (stamina[b.id] ?? 100));
for (const out of tired) {
if (left <= 0 || !bench.length) break;
const unplayed = bench.some((b) => !minutesPlayed[b.id]);
const needRest = (stamina[out.id] ?? 100) < (halftime ? (unplayed ? 95 : 80) : 62);
if (!needRest) continue;
let best = -1; let bestScore = -Infinity;
bench.forEach((b, i) => {
if ((stamina[b.id] ?? 100) < 70) return;
const sc = fitOVR(b, out.pos) + (minutesPlayed[b.id] ? 0 : 12) + (stamina[b.id] ?? 100) / 10 - (b.pos === 'Goleiro' ? 25 : 0);
if (sc > bestScore) { bestScore = sc; best = i; }
});
if (best < 0) continue;
const b = bench.splice(best, 1)[0];
const incoming = asRole(b, out.pos);
const idx = field.findIndex((x) => x.id === out.id);
field[idx] = incoming;
liveScene.substitute(out.id, incoming, slot);
const back = { ...out, pos: out.natPos || out.pos };
delete back.natPos;
bench.push(back);
const fp = window.simFieldPositions && window.simFieldPositions[slot];
if (fp && fp[out.id]) { fp[incoming.id] = { ...fp[out.id] }; delete fp[out.id]; }
if (slot === 'A') extra.subsA++; else extra.subsB++;
notePlayed();
left--;
const hl = halfIdx === 0 ? '전반' : '후반';
const t = halftime ? '하프타임' : `${hl} ${String(Math.floor(simSec / 60)).padStart(2, '0')}:${String(simSec % 60).padStart(2, '0')}`;
await append(`[${t}] 🔁 ${teamName} 교체 — OUT ${out.name} (체력 ${Math.round(stamina[out.id] ?? 0)}) · IN ${incoming.name} (${ROLE_KR[incoming.pos] || '?'})`, { attackA: slot === 'A', channel: 'center', phase: 'build', outcome: 'neutral', plA, plB, halfIdx, simSec, ballHolderId: null });
}
}
};

/** 풋살: 사이드 전개 비중↑ (좌·우 약 38%씩) */
const pickSimChannel = (attackA) => {
const w = channelWeights(attackA ? tacA : tacB);
const u = Math.random();
if (u < w.left) return 'left';
if (u < w.left + w.right) return 'right';
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
const piece = setPiece;
setPiece = null;
if (piece) attackA = piece.attackA;
if (attackA) live.possA++; else live.possB++;
paintHud();
const atk = attackA ? plA : plB;
const def = attackA ? plB : plA;
const atkName = attackA ? teamAName : teamBName;
const defName = attackA ? teamBName : teamAName;

let ch = pickSimChannel(attackA);
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
broadcastFx: extra && extra.broadcastFx ? extra.broadcastFx : null,
motion: extra && extra.motion ? extra.motion : null
});

const atkField = atk.filter((p) => p.pos !== 'Goleiro');
const pickAtk = () => {
const pool = atkField.length ? atkField : atk;
const weights = pool.map((p) => {
let w = 1 + effStat(p, 'wrk') / 90;
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
let actor = pickAtk();
const gk = gkOf(def);
if (piece && piece.kind === 'corner') {
simChainSuccess = Math.max(simChainSuccess, 2);
const taker = pick(atk.filter((p) => p.pos !== 'Goleiro')) || actor;
await append(`${prefix} ⛳ 코너킥 — ${atkName} ${taker.name}가 올립니다. 골문 앞 자리싸움!`, pitch('danger', 'neutral', ch, taker, { motion: { kind: 'corner', actor: taker } }));
lastPasser = { attackA, id: taker.id };
} else if (piece && piece.kind === 'counter') {
simChainSuccess = Math.max(simChainSuccess, 2);
}

const sideHint = ch === 'left' ? '왼쪽 측면' : ch === 'right' ? '오른쪽 측면' : '중앙';
const atkCtrl = teamMean(atk, 'pas') * 0.55 + teamMean(atk, 'dri') * 0.45 + (mentDelta(attackA ? mentA : mentB) * 40);
const defTac = attackA ? tacB : tacA;
const defCtrl = teamMean(def, 'int') * 0.5 + teamMean(def, 'def') * 0.5 - (mentDelta(attackA ? mentB : mentA) * 20) + (defTac.press === 'high' ? 3 : defTac.press === 'low' ? -2 : 0);
const myTac = attackA ? tacA : tacB;
const emptyNet = !!(piece && piece.emptyNet);

/** 전술 패턴 진행: 단계마다 패스·드리블 맞대결. 끝까지 가면 슈터를 돌려주고, 끊기면 null */
const runPlay = async (key) => {
const play = PLAYS[key];
const roles = resolveRoles(atk, ch);
const side = attackA ? 'A' : 'B';
if (!extra.plays[key]) extra.plays[key] = { A: { t: 0, s: 0, g: 0 }, B: { t: 0, s: 0, g: 0 } };
const st = extra.plays[key][side];
st.t++;
const first = !seenPlays.has(key + side);
seenPlays.add(key + side);
if (play.side && ch === 'center') ch = Math.random() < 0.5 ? 'left' : 'right';
const starter = roles[play.steps[0].from] || actor;
await append(`${prefix} 📘 전술 노트 — ${atkName}의 [${play.name}]` + (first ? ` · ${play.lesson}` : ''),
pitch('build', 'neutral', ch, starter, { motion: { kind: 'none' } }));
for (let i = 0; i < play.steps.length; i++) {
const step = play.steps[i];
const from = roles[step.from] || actor;
if (step.type === 'shot') { st.s++; return from; }
const to = step.to ? roles[step.to] : null;
if (step.type === 'pass' && (!to || to.id === from.id)) continue;
const defField = def.filter((p) => p.pos !== 'Goleiro');
const mark = pick(defField.length ? defField : def);
const dribble = step.type === 'dribble';
const atkV = dribble ? effStat(from, 'dri') + effStat(from, 'pac') * 0.2 : effStat(from, 'pas') * 0.75 + effStat(to, 'pst') * 0.25;
const defV = dribble ? effStat(mark, 'def') + effStat(mark, 'phy') * 0.2 : effStat(mark, 'int') * 0.7 + effStat(mark, 'def') * 0.3;
let pOk = 0.66 + ((atkV - defV) / 99) * 0.5;
if (defTac.press === 'high') pOk -= i === 0 ? 0.08 : -0.02; // 전방 압박: 처음 패스가 어렵고, 넘기면 뒤가 비어요
if (defTac.press === 'low') pOk += i === 0 ? 0.08 : -0.06; // 내려서기: 앞은 편하지만 골문 앞이 촘촘
if (key === 'powerplay') pOk += 0.06;
if (key === 'counter') pOk += 0.04;
const ok = Math.random() < Math.max(0.35, Math.min(0.9, pOk));
if (!ok) {
lastPasser = null;
if (Math.random() < 0.15) {
await handleFoul(attackA, from, mark, prefix, ch, pitch, atk, def, gk, atkName, defName, step.run === 'box' || i >= play.steps.length - 2);
return null;
}
bumpRating(mark.id, 0.22);
bumpRating(from.id, -0.05);
let counter = Math.random() < Math.max(0.08, Math.min(0.4, 0.2 + (teamMean(def, 'pac') - teamMean(atk, 'pac')) / 60));
let tail = '';
if (key === 'powerplay') {
counter = true;
setPiece = { kind: 'counter', attackA: !attackA, emptyNet: true };
tail = josa(` ⚠️ 골대가 비었어요! ${defName}이(가) 빈 골문을 노립니다 — 파워플레이의 위험!`);
} else if (counter) {
setPiece = { kind: 'counter', attackA: !attackA };
tail = ` ⚡ ${defName} 바로 역습!`;
}
const notes = DEFENSE_NOTES[defTac.press] || DEFENSE_NOTES.mid;
const what = josa(dribble ? `${mark.name}이(가) 길을 막고 공을 빼앗습니다` : `${mark.name}이(가) 패스 길을 읽고 가로챕니다`);
await append(`${prefix} ✋ ${defName} ${what}! [${play.name}] 실패. 🛡 ${pick(notes)}${tail}`,
pitch('progress', 'fail', ch, mark, { motion: { kind: 'intercept', actor: from, defender: mark, counter } }));
return null;
}
bumpRating(from.id, 0.08);
const said = fillSay(step.say, roles, step);
const learn = step.learn && (first || Math.random() < 0.3) ? ` 📘 ${step.learn}` : '';
if (dribble) {
await append(`${prefix} ${said}${learn}`, pitch('progress', 'success', ch, from, { motion: { kind: 'dribble', actor: from, defender: mark } }));
} else {
const later = play.steps.slice(i + 1).some((x) => x.to === step.from || (x.from === step.from && x.type === 'shot'));
lastPasser = { attackA, id: from.id };
if (i === play.steps.length - 2) bumpStat('keypass', from.id);
await append(`${prefix} ${said}${learn}`, pitch('progress', 'success', ch, to, { motion: { kind: 'playpass', actor: from, target: to, defender: mark, run: step.run, passerRun: later ? 'forward' : null, say1: josa(`${play.name}: ${from.name}이(가) 동료의 움직임을 봅니다`), say2: said, badge: '전술' } }));
}
}
return null;
};

let playShot = false;
let playKey = null;
const behindNow = attackA ? sa < sb : sb < sa;
const powerplay = halfIdx === 1 && simSec >= SIM_HALF_SEC - 300 && behindNow && Math.abs(sa - sb) <= 2 && !piece && Math.random() < 0.7;
const isCounterPiece = !!(piece && piece.kind === 'counter');
if (!(piece && piece.kind === 'corner') && (powerplay || isCounterPiece || (simChainSuccess === 0 && Math.random() < 0.6))) {
playKey = choosePlay({ tactic: myTac, counter: isCounterPiece, powerplay });
if (playKey === 'powerplay' && !gkOf(atk)) playKey = 'diagonal';
const shooter = await runPlay(playKey);
if (!shooter) return;
actor = shooter;
playShot = true;
}
const success = playShot || Math.random() < clash(atkCtrl, defCtrl);

if (!success) {
const intr = pick(def);
const marker = pick(def.filter((p) => p.id !== intr.id)) || intr;
lastPasser = null;
if (Math.random() < 0.2) {
await handleFoul(attackA, actor, intr === gk ? marker : intr, prefix, ch, pitch, atk, def, gk, atkName, defName, simChainSuccess >= 2 || (simChainSuccess >= 1 && Math.random() < 0.3));
return;
}
// 공이 터치라인 밖으로 → 상대 킥인 (풋살은 스로인 대신 킥인, 수비는 5m, 4초 안에)
if (ch !== 'center' && Math.random() < 0.3) {
const kicker = intr.pos === 'Goleiro' ? marker : intr;
const mates = def.filter((p) => p.id !== kicker.id && p.pos !== 'Goleiro');
const recv = mates.length ? pick(mates) : kicker;
simChainSuccess = 0;
await append(`${prefix} ${sideHint}에서 공이 터치라인 밖으로 — ${defName} 킥인! 수비는 5m 물러서고, ${kicker.name}가 4초 안에 차야 합니다. ${kicker.name} → ${recv.name}.`,
pitch('build', 'neutral', ch, recv, { motion: { kind: 'kickin', actor, defender: kicker, target: recv, side: ch } }));
possessionNextAttackA = !attackA;
return;
}
// 빠른 팀이 공을 뺏으면 역습
const paceEdge = (teamMean(def, 'pac') - teamMean(atk, 'pac')) / 60;
const counter = Math.random() < Math.max(0.08, Math.min(0.4, 0.2 + paceEdge));
if (counter) setPiece = { kind: 'counter', attackA: !attackA };
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
await append(failKinds[Math.floor(Math.random() * failKinds.length)] + (counter ? ` ⚡ ${defName} 빠르게 역습 나갑니다!` : ''), pitch('progress', 'fail', ch, intr, { motion: { kind: 'intercept', actor, defender: intr, counter } }));
return;
}

const nextChain = simChainSuccess + 1;
/** 풋살은 코트가 좁아 슈팅이 잦아요 (한 경기 양 팀 합쳐 약 15~25개) */
const atkTac = attackA ? tacA : tacB;
// 첫 연결에서 바로 차는 건 중거리슛 → 잘 안 차고 잘 안 들어감. 박스 근처까지 들어가서 차는 게 대부분
const shotChance = (nextChain >= 4 ? 0.85 : nextChain === 3 ? 0.74 : nextChain === 2 ? 0.6 : 0.12) + (defTac.press === 'high' && nextChain >= 2 ? 0.05 : 0);
const longShot = !playShot && nextChain <= 1;
const isShot = playShot || (shotChance > 0 && Math.random() < shotChance);

if (isShot) {
const actorSho = effStat(actor, 'sho') + effStat(actor, 'cmp') * 0.25 + effStat(actor, 'pst') * 0.15;
const gkRef = effStat(gk, 'ref') + effStat(gk, 'pst') * 0.2;
const shotQuality = clash(actorSho + nextChain * 3, gkRef);
let xg = (nextChain >= 4 ? 0.84 : nextChain === 3 ? 0.74 : nextChain === 2 ? 0.64 : 0.24) * shotQuality;
if (defTac.press === 'low' && !longShot) xg *= 0.9;
void atkTac;
if ((attackA ? mentA : mentB) === 'attack') xg *= 1.12;
if ((attackA ? mentB : mentA) === 'defend') xg *= 0.88;
if (playShot && !emptyNet) xg *= 0.78; // 수비도 패턴을 알고 따라와요
if (emptyNet) xg = Math.max(xg, 0.55);
xg = Math.max(0.05, Math.min(emptyNet ? 0.75 : 0.6, xg));
if (attackA) { live.shotA++; live.xgA += xg; } else { live.shotB++; live.xgB += xg; }
paintHud();
const rollGoal = Math.random() < xg;
const lsTag = longShot ? ' (중거리 슛)' : '';

if (rollGoal) {
if (attackA) { sa++; live.onA++; } else { sb++; live.onB++; }
updScore();
paintHud();
if (playKey && extra.plays[playKey]) extra.plays[playKey][attackA ? 'A' : 'B'].g++;
if (emptyNet) await append(`${prefix} 🥅 빈 골문! 골키퍼가 올라가 있던 틈을 놓치지 않습니다.`);
bumpStat('goals', actor.id);
bumpRating(actor.id, 1.05);
bumpRating(gk.id, -0.28);
const mates = atk.filter((x) => x.id !== actor.id);
const lp = lastPasser && lastPasser.attackA === attackA && lastPasser.id !== actor.id ? atk.find((x) => x.id === lastPasser.id) : null;
const assi = lp || (mates.length && Math.random() < 0.45 ? pick(mates) : null);
lastPasser = null;
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
await append(goalLines[Math.floor(Math.random() * goalLines.length)] + lsTag, pitch('danger', 'success', ch, actor, { isGoalShot: true, broadcastFx: 'goal', motion: { kind: 'shot', long: longShot, actor, gk, result: 'goal', assist: assi } }));
await playGoalManga(attackA, actor);
await goalContext(attackA, actor, prefix);
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
const corner = Math.random() < 0.4;
if (corner) { setPiece = { kind: 'corner', attackA }; if (attackA) extra.cornersA++; else extra.cornersB++; }
await append(saveLines[Math.floor(Math.random() * saveLines.length)] + lsTag + (corner ? ' 공이 라인 밖으로 — 코너킥!' : ''), pitch('danger', 'neutral', ch, gk, { broadcastFx: 'superSave', motion: { kind: 'shot', long: longShot, actor, gk, result: 'save', corner } }));
await playManga(pickFcMangaScene({ kind: 'superSave', gender: mangaGenderOf(gk), team: attackA ? 'blue' : 'red' }));
return;
}

bumpRating(actor.id, -0.08);
lastPasser = null;
if (Math.random() < 0.15) {
if (attackA) live.onA++; else live.onB++;
paintHud();
await append(`${prefix} 🥅 땡! ${actor.name}의 슈팅이 골대를 강타합니다! ${gk.name}도 얼어붙었습니다. (xG ${xg.toFixed(2)})`, pitch('danger', 'fail', ch, actor, { motion: { kind: 'shot', long: longShot, actor, gk, result: 'post' } }));
return;
}
const missLines = [
`${prefix} ${actor.name}의 슈팅! 골문을 살짝 벗어납니다. (xG ${xg.toFixed(2)})`,
`${prefix} ${sideHint}에서 ${actor.name} 감아차기 — ${gk.name}가 손 쓸 필요 없이 아웃.`,
`${prefix} ${actor.name} vs ${gk.name}, 각도는 좋았으나 빗맞습니다. ${defName} 한숨 돌립니다.`
];
await append(missLines[Math.floor(Math.random() * missLines.length)] + lsTag, pitch('danger', 'fail', ch, actor, { motion: { kind: 'shot', long: longShot, actor, gk, result: 'miss' } }));
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
lastPasser = { attackA, id: p1.id };
const passOkLines = [
`${prefix} ${atkName} ${sideHint}. ${p1.name}(${z1})가 ${mark.name}(${simPosShort(mark)}) 압박을 등지고 ${p2.name}(${z2})에게 연결 성공.`,
`${prefix} 원터치 교환! ${p1.name}→${p2.name}, ${defName} ${d1.name}가 붙기 전에 라인 통과합니다.`,
`${prefix} ${p1.name}가 ${d1.name}와의 간격 벌리며 ${p2.name}에게. 좁은 코트에서 시야 좋습니다.`
];
await append(passOkLines[Math.floor(Math.random() * passOkLines.length)], pitch('progress', 'success', ch, p2, { broadcastFx: 'keyPass', motion: { kind: 'pass', actor: p1, target: p2, defender: mark } }));
} else if (kind === 1) {
const duel = pick(def);
const wonDuel = Math.random() < clash(effStat(actor, 'dri') + effStat(actor, 'pac') * 0.2, effStat(duel, 'def') + effStat(duel, 'phy') * 0.2);
if (!wonDuel) {
bumpRating(duel.id, 0.2);
bumpRating(actor.id, -0.05);
await append(`${prefix} 1대1! ${actor.name} vs ${duel.name} — ${duel.name}가 몸으로 막아 돌파를 차단합니다.`, pitch('progress', 'fail', ch, duel, { motion: { kind: 'dribble', actor, defender: duel, result: 'fail' } }));
return;
}
bumpStat('keypass', actor.id);
bumpRating(actor.id, 0.14);
const dribLines = [
`${prefix} ${atkName} ${sideHint}. ${actor.name}가 ${duel.name}(${simPosShort(duel)})를 제치고 돌파합니다. 발재간 살아 있습니다.`,
`${prefix} 1대1! ${actor.name} vs ${duel.name} — ${actor.name}가 몸으로 버티며 전진 성공.`,
`${prefix} ${duel.name}의 태클 타이밍을 피해 ${actor.name}가 빗겨 나갑니다. ${defName} 수비 한 수 무력화.`
];
await append(dribLines[Math.floor(Math.random() * dribLines.length)], pitch('progress', 'success', ch, actor, { broadcastFx: 'keyPass', motion: { kind: 'dribble', actor, defender: duel } }));
} else if (kind === 2) {
const w = atk.filter((x) => x.pos === 'Ala' || x.pos === '미정' || x.pos === 'Pivo');
const wx = w.length ? pick(w) : actor;
const others = atk.filter((x) => x.id !== wx.id);
const tgt = others.length ? pick(others) : wx;
const back = pick(def);
bumpStat('keypass', wx.id);
bumpRating(wx.id, 0.12);
lastPasser = { attackA, id: wx.id };
const cutLines = [
`${prefix} ${sideHint} ${wx.name}가 엔드라인 쪽으로 끌고 갔다가 ${back.name}를 앞에 두고 컷백! ${tgt.name}가 받아 전개합니다.`,
`${prefix} 크로스형 컷백 — ${wx.name}→${tgt.name}. ${defName} ${back.name}가 막으려 했으나 연결됐습니다.`,
`${prefix} 풋살식 사이드 연계. ${wx.name}가 골라인 근처에서 띄워주고 ${tgt.name}가 중앙에서 이어받습니다.`
];
await append(cutLines[Math.floor(Math.random() * cutLines.length)], pitch('danger', 'success', ch, tgt, { broadcastFx: 'keyPass', motion: { kind: 'cutback', actor: wx, target: tgt, defender: back } }));
} else if (kind === 3) {
const gkA = gkOf(atk);
const lonPool = atk.filter((x) => x.id !== gkA.id);
const lon = lonPool.length ? pick(lonPool) : actor;
const high = pick(def);
bumpStat('keypass', gkA.id);
bumpRating(gkA.id, 0.1);
lastPasser = { attackA, id: gkA.id };
const longLines = [
`${prefix} 골레이로 ${gkA.name} 롱킥! ${high.name} 라인 위로 넘겨 ${lon.name}가 잡았습니다. 상대 압박 한 번에 벗어납니다.`,
`${prefix} ${gkA.name}가 손으로 배급 — ${lon.name}에게 직접. ${defName} ${high.name}는 높이 못 올렸습니다.`,
`${prefix} 골키퍼 ${gkA.name}의 빠른 스로 — ${lon.name}에게 바로 연결, 전환 타이밍 좋습니다.`
];
await append(longLines[Math.floor(Math.random() * longLines.length)], pitch('build', 'success', ch, lon, { broadcastFx: 'keyPass', motion: { kind: 'long', actor: gkA, target: lon } }));
} else {
const press = pick(def);
bumpStat('keypass', actor.id);
bumpRating(actor.id, 0.08);
const keepLines = [
`${prefix} ${atkName} ${sideHint}. ${actor.name}가 ${press.name}의 압박 속에서도 볼 지키며 링으로 연계합니다.`,
`${prefix} ${press.name}가 붙었지만 ${actor.name}가 몸싸움 이깁니다. 볼 소유 유지 성공.`,
`${prefix} 좁은 공간, ${actor.name} 침착하게 터치 한 번 줄여서 팀 동료 쪽으로. ${defName} ${press.name} 아쉬운 압박.`
];
await append(keepLines[Math.floor(Math.random() * keepLines.length)], pitch('progress', 'success', ch, actor, { broadcastFx: 'keyPass', motion: { kind: 'keep', actor, defender: press } }));
}
};

const kickPitch = { attackA: true, channel: 'center', phase: 'build', outcome: 'neutral', plA, plB, halfIdx: 0, simSec: 0, ballHolderId: null };
const mentLabel = (code) => (code === 'attack' ? '공격적' : code === 'defend' ? '수비적' : '밸런스');
try {
await append(`━━ ${teamAName} vs ${teamBName} · 모의 풋살 (5vs5, 전·후반 각 20분, 교체 자유) ━━`, kickPitch);
if (usedBots) {
await append(`[연습 모드] 실제 소속 인원이 5명 미만인 팀은 자동 보조 선수로 채워 5vs5로 진행합니다. (가상 인원은 기록에 반영되지 않습니다)`, kickPitch);
}
await append(`전력 요약: ${teamAName} 출전 OVR 합 ${strA} (${mentLabel(mentA)})  |  ${teamBName} 출전 OVR 합 ${strB} (${mentLabel(mentB)})`, kickPitch);
await append(`[전반 00:00] 킥오프 — 패스 vs 가로채기, 드리블 vs 수비, 슈팅 vs 반사신경으로 판정합니다. 공격적 템포는 슈팅을 늘리고, 수비적은 실점을 줄입니다.`, kickPitch);
for (let halfIdx = 0; halfIdx < 2; halfIdx++) {
setMatchClock(halfIdx, 0);
liveScene.setRosters(plA, plB);
// 전반은 홈, 후반은 원정이 킥오프
const koTaker = (halfIdx === 0 ? plA : plB).find((p) => p.pos === 'Pivo') || (halfIdx === 0 ? plA : plB)[1];
await liveScene.playEvent({ kind: 'kickoff', say: `${halfIdx === 0 ? '전반' : '후반'} 킥오프! ${halfIdx === 0 ? teamAName : teamBName} 공격으로 시작합니다` });
if (koTaker) { liveScene.ball.holder = koTaker.id; }
for (let si = 0; si < SITUATIONS_PER_HALF; si++) {
const simSec = Math.min(SIM_HALF_SEC - 1, Math.floor(((si + 1) / SITUATIONS_PER_HALF) * SIM_HALF_SEC));
setMatchClock(halfIdx, simSec);
if (halfIdx === 1 && si >= SITUATIONS_PER_HALF - 3 && Math.abs(sa - sb) <= 1 && Math.random() < 0.4) {
const behind = sa < sb ? teamAName : sb < sa ? teamBName : null;
await append(behind ? `[후반 ${String(Math.floor(simSec / 60)).padStart(2, '0')}:${String(simSec % 60).padStart(2, '0')}] 막판! ${behind}가 골키퍼까지 올리며 총공세에 나섭니다.` : `[후반 ${String(Math.floor(simSec / 60)).padStart(2, '0')}:${String(simSec % 60).padStart(2, '0')}] 동점 상황, 남은 시간이 얼마 없습니다. 양 팀 모두 한 방을 노립니다!`);
}
await tryOneSituation(halfIdx, simSec);
tickStamina();
if ((si + 1) % 4 === 0 && si < SITUATIONS_PER_HALF - 1) await rotateSubs(halfIdx, simSec, false);
await sleep(SITUATION_INTERVAL_MS);
}
setMatchClock(halfIdx, SIM_HALF_SEC);
const hl = halfIdx === 0 ? '전반' : '후반';
await append(`[${hl} 20:00] ${hl} 종료 휘슬`);
if (halfIdx === 0) {
const totH = live.possA + live.possB || 1;
const paH = Math.round((100 * live.possA) / totH);
await append(`[하프타임] 점유 ${paH}-${100 - paH} · 슈팅 ${live.shotA}-${live.shotB} (${live.onA}-${live.onB}) · xG ${live.xgA.toFixed(2)}-${live.xgB.toFixed(2)} · 스코어 ${sa}-${sb}`);
await append(`[휴식] 하프타임 — 전술을 가다듬습니다. 선수들 체력을 회복합니다.`);
[...plA, ...plB, ...benchA, ...benchB].forEach((p) => { stamina[p.id] = Math.min(100, (stamina[p.id] ?? 100) + 30); });
halfFouls = { A: 0, B: 0 };
await rotateSubs(halfIdx, SIM_HALF_SEC, true);
}
}

await append(`━━ 최종 스코어 ${teamAName} ${sa} : ${sb} ${teamBName} ━━`);
await append(`(모의 시뮬레이션 종료 · 서버 기록·EXP 미반영)`);
renderSimPostMatchStats([...played.A.values()], [...played.B.values()], teamAName, teamBName, simStats, live, ratings, minutesPlayed, extra);
} finally {
setTimeout(() => liveScene.stop(), 1500);
if (btn) { btn.disabled = false; btn.classList.remove('opacity-50', 'cursor-not-allowed'); }
document.getElementById('simTacticalDetails')?.classList.remove('hidden');
window.drawSimTacticalBoard();
window.renderSimTacticalStrips();
}
};
