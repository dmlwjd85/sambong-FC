/**
 * 팀 자동 편성 (화면·Firebase와 무관한 순수 계산이라 테스트할 수 있어요)
 *
 * 세 가지 방식
 *  - position : 포지션 우선. 팀마다 골레이로·픽소·아라·피보 수가 최대한 같게, 그 안에서 OVR을 맞춤
 *  - ability  : 능력치 우선. 팀 평균 OVR 차이를 가장 작게, 포지션은 동점일 때만 고려
 *  - balanced : 밸런스형. OVR 차이와 포지션 쏠림을 함께 줄임 (골레이로 없는 팀이 생기지 않게 특히 신경 씀)
 *
 * 팀 인원은 항상 최대 1명 차이로 맞춰요.
 */

export const TEAM_MODES = {
  position: { label: '포지션 우선', short: '포지션', desc: '팀마다 골키퍼·수비·미드·공격 수를 먼저 똑같이 맞추고, 그다음 OVR을 맞춰요.' },
  ability: { label: '능력치 우선', short: '능력치', desc: '팀 평균 OVR 차이가 가장 작게 나눠요. 포지션은 덜 따져요.' },
  balanced: { label: '밸런스형', short: '밸런스', desc: 'OVR과 포지션을 함께 봐요. 골키퍼가 없는 팀이 생기지 않게 나눠요.' },
};

export const POSITIONS = ['Goleiro', 'Fixo', 'Ala', 'Pivo', '미정'];

const normPos = (p) => (POSITIONS.includes(p && p.pos) ? p.pos : '미정');

/** 팀 상태 요약 */
export function teamSummary(team, ovrOf) {
  const counts = Object.fromEntries(POSITIONS.map((k) => [k, 0]));
  let total = 0;
  team.forEach((p) => { counts[normPos(p)]++; total += ovrOf(p); });
  return { size: team.length, counts, total, avg: team.length ? total / team.length : 0 };
}

/** 편성 품질 측정: OVR 평균 차이, 포지션 쏠림 */
export function measureTeams(teams, ovrOf) {
  const sums = teams.map((t) => teamSummary(t, ovrOf));
  const avgs = sums.map((s) => s.avg);
  const ovrSpread = Math.max(...avgs) - Math.min(...avgs);
  let posSpread = 0;
  POSITIONS.forEach((k) => {
    const c = sums.map((s) => s.counts[k]);
    posSpread += Math.max(...c) - Math.min(...c);
  });
  // 인원상 피할 수 없는 차이를 뺀 '쓸데없는 쏠림' (0이면 가장 고르게 나눈 것)
  let posExcess = 0;
  POSITIONS.forEach((k) => {
    const c = sums.map((s) => s.counts[k]);
    const total = c.reduce((a, b) => a + b, 0);
    posExcess += Math.max(0, (Math.max(...c) - Math.min(...c)) - (total % teams.length ? 1 : 0));
  });
  const totalGk = sums.reduce((s, x) => s + x.counts.Goleiro, 0);
  // 골레이로가 팀 수 이상인데도 골레이로 없는 팀 수
  const missingGk = totalGk >= teams.length ? sums.filter((s) => s.counts.Goleiro === 0).length : 0;
  return { ovrSpread, posSpread, posExcess, missingGk, summaries: sums };
}

function costOf(m, mode) {
  if (mode === 'position') return m.missingGk * 1e6 + m.posSpread * 1e3 + m.ovrSpread;
  if (mode === 'ability') return m.ovrSpread * 1e3 + m.posSpread + m.missingGk * 5;
  // balanced: 포지션 1명 쏠림 ≈ 평균 OVR 1.5 차이로 봄
  return m.missingGk * 1e4 + m.ovrSpread + m.posSpread * 1.5;
}

/** 섞기 (rng 주입 가능) */
function shuffled(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 시작 배치: 포지션별로 묶어 OVR 순 스네이크 드래프트 (인원은 ±1로 맞춤) */
function initialDraft(players, teamCount, ovrOf, rng, byPos) {
  const teams = Array.from({ length: teamCount }, () => []);
  const order = byPos
    ? POSITIONS.flatMap((k) => shuffled(players.filter((p) => normPos(p) === k), rng).sort((a, b) => ovrOf(b) - ovrOf(a)))
    : shuffled(players, rng).sort((a, b) => ovrOf(b) - ovrOf(a));
  let i = Math.floor(rng() * teamCount);
  let dir = 1;
  order.forEach((p) => {
    teams[i].push(p);
    let next = i + dir;
    if (next < 0 || next >= teamCount) { dir = -dir; next = i; }
    i = next;
  });
  // 스네이크가 끝에서 쏠렸을 수 있으니 인원 맞추기
  for (;;) {
    teams.sort((a, b) => a.length - b.length);
    if (teams[teamCount - 1].length - teams[0].length <= 1) break;
    teams[0].push(teams[teamCount - 1].pop());
  }
  return shuffled(teams, rng);
}

/** 두 선수 맞바꾸기로 비용이 줄어드는 동안 계속 개선 (인원 수는 그대로 유지) */
function improve(teams, ovrOf, mode) {
  let cur = costOf(measureTeams(teams, ovrOf), mode);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let a = 0; a < teams.length; a++) {
      for (let b = a + 1; b < teams.length; b++) {
        for (let i = 0; i < teams[a].length; i++) {
          for (let j = 0; j < teams[b].length; j++) {
            const pa = teams[a][i];
            const pb = teams[b][j];
            if (normPos(pa) === normPos(pb) && ovrOf(pa) === ovrOf(pb)) continue;
            teams[a][i] = pb; teams[b][j] = pa;
            const c = costOf(measureTeams(teams, ovrOf), mode);
            if (c < cur - 1e-9) { cur = c; improved = true; }
            else { teams[a][i] = pa; teams[b][j] = pb; }
          }
        }
      }
    }
  }
  return cur;
}

/**
 * @param {object[]} players 출석한 선수
 * @param {number} teamCount 팀 수 (2~6)
 * @param {'position'|'ability'|'balanced'} mode
 * @param {{ ovrOf: (p) => number, rng?: () => number, tries?: number }} opts
 * @returns {{ teams: object[][], metrics: ReturnType<typeof measureTeams> }}
 */
export function buildTeams(players, teamCount, mode, opts) {
  const ovrOf = opts.ovrOf;
  const rng = opts.rng || Math.random;
  const tries = opts.tries || 24;
  const n = Math.max(1, Math.min(teamCount, players.length));
  let best = null;
  let bestCost = Infinity;
  const near = [];
  for (let t = 0; t < tries; t++) {
    const teams = initialDraft(players, n, ovrOf, rng, mode !== 'ability' || t % 2 === 1);
    const c = improve(teams, ovrOf, mode);
    if (c < bestCost - 1e-9) { bestCost = c; best = teams.map((x) => [...x]); near.length = 0; near.push(best); }
    else if (Math.abs(c - bestCost) < 1e-9) near.push(teams.map((x) => [...x]));
  }
  // 똑같이 좋은 편성이 여러 개면 그중 하나를 골라 '다시 짜기' 때마다 조합이 바뀌게
  const chosen = near.length ? near[Math.floor(rng() * near.length)] : best;
  const posRank = (p) => POSITIONS.indexOf(normPos(p));
  chosen.forEach((t) => t.sort((a, b) => posRank(a) - posRank(b) || ovrOf(b) - ovrOf(a)));
  return { teams: chosen, metrics: measureTeams(chosen, ovrOf) };
}

/** 출전 5명 고르기: 골레이로 1 · 픽소 1 · 아라 2 · 피보 1 자리를 가장 잘 맞는 선수로 채움 */
export const LINEUP_SLOTS = ['Goleiro', 'Fixo', 'Ala', 'Ala', 'Pivo'];

/**
 * @param {object[]} squad 팀 전체 선수
 * @param {(p, slotPos) => number} fitOf 그 자리에서의 OVR
 * @returns {{ starters: {player, role}[], bench: object[] }}
 */
export function pickLineup(squad, fitOf) {
  const pool = [...squad];
  const starters = [];
  const slots = LINEUP_SLOTS.slice(0, Math.min(5, pool.length));
  // 골레이로 자리부터: 원래 골레이로를 크게 우대
  slots.forEach((slot) => {
    if (!pool.length) return;
    let bi = 0;
    let bs = -Infinity;
    pool.forEach((p, i) => {
      const natural = normPos(p) === slot;
      // 골레이로가 아닌 선수가 골문에 서는 건 마지막 수단, 골레이로가 필드에 나가는 것도 피함
      let s = fitOf(p, slot) + (natural ? 8 : 0);
      if (slot === 'Goleiro' && !natural) s -= 30;
      if (slot !== 'Goleiro' && normPos(p) === 'Goleiro') s -= 30;
      if (s > bs) { bs = s; bi = i; }
    });
    starters.push({ player: pool[bi], role: slot });
    pool.splice(bi, 1);
  });
  return { starters, bench: pool };
}
