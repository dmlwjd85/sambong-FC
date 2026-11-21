import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTeams, measureTeams, pickLineup } from './teamBuilder.js';

// 재현 가능한 난수
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

const POS = ['Goleiro', 'Fixo', 'Ala', 'Ala', 'Pivo', 'Ala', 'Fixo', '미정'];
function roster(n, seed = 7) {
  const r = seeded(seed);
  return Array.from({ length: n }, (_, i) => ({ id: 'p' + i, pos: POS[i % POS.length], ovr: 55 + Math.floor(r() * 30) }));
}
const ovrOf = (p) => p.ovr;

for (const mode of ['position', 'ability', 'balanced', 'random']) {
  test(`${mode}: 모든 출석자가 정확히 한 팀에 들어가고 인원은 ±1`, () => {
    for (const [n, k] of [[10, 2], [17, 3], [31, 6], [12, 4], [7, 2]]) {
      const players = roster(n, n * 3 + k);
      const { teams } = buildTeams(players, k, mode, { ovrOf, rng: seeded(n + k) });
      assert.equal(teams.length, k);
      const ids = teams.flat().map((p) => p.id).sort();
      assert.deepEqual(ids, players.map((p) => p.id).sort());
      const sizes = teams.map((t) => t.length);
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `${n}명 ${k}팀 인원 ${sizes}`);
    }
  });
}

test('포지션 우선: 포지션별 인원 차이가 팀마다 1 이하, 골레이로가 팀마다 있음', () => {
  const players = roster(20, 3); // 골레이로 3명, 2팀
  const { teams, metrics } = buildTeams(players, 2, 'position', { ovrOf, rng: seeded(1) });
  metrics.summaries.forEach((s) => assert.ok(s.counts.Goleiro >= 1));
  for (const k of ['Goleiro', 'Fixo', 'Ala', 'Pivo', '미정']) {
    const c = teams.map((t) => t.filter((p) => p.pos === k).length);
    assert.ok(Math.max(...c) - Math.min(...c) <= 1, `${k} ${c}`);
  }
});

test('능력치 우선은 OVR 차이가 포지션 우선보다 크지 않다', () => {
  const players = roster(18, 11);
  const a = buildTeams(players, 3, 'ability', { ovrOf, rng: seeded(2) }).metrics;
  const p = buildTeams(players, 3, 'position', { ovrOf, rng: seeded(2) }).metrics;
  assert.ok(a.ovrSpread <= p.ovrSpread + 1e-9, `ability ${a.ovrSpread} position ${p.ovrSpread}`);
  assert.ok(a.ovrSpread < 1.5, `ability spread ${a.ovrSpread}`);
});

test('밸런스형: 골레이로가 팀 수만큼 있으면 골레이로 없는 팀이 없다', () => {
  const players = roster(24, 5); // 골레이로 3명
  const { metrics } = buildTeams(players, 3, 'balanced', { ovrOf, rng: seeded(9) });
  assert.equal(metrics.missingGk, 0);
  assert.ok(metrics.ovrSpread < 3);
});

test('출석 인원이 팀 수보다 적으면 인원 수만큼만 팀을 만든다', () => {
  const { teams } = buildTeams(roster(3), 6, 'balanced', { ovrOf, rng: seeded(4) });
  assert.equal(teams.length, 3);
});

test('출전 5명: 골레이로가 골문, 나머지는 자리에 맞게, 남는 선수는 벤치', () => {
  const squad = [
    { id: 'g', pos: 'Goleiro', ovr: 60 }, { id: 'f', pos: 'Fixo', ovr: 70 }, { id: 'a1', pos: 'Ala', ovr: 72 },
    { id: 'a2', pos: 'Ala', ovr: 65 }, { id: 'v', pos: 'Pivo', ovr: 80 }, { id: 'x', pos: 'Ala', ovr: 50 }, { id: 'g2', pos: 'Goleiro', ovr: 55 },
  ];
  const { starters, bench } = pickLineup(squad, (p) => p.ovr);
  assert.equal(starters.find((s) => s.role === 'Goleiro').player.id, 'g');
  assert.deepEqual(starters.map((s) => s.player.id).sort(), ['a1', 'a2', 'f', 'g', 'v']);
  assert.deepEqual(bench.map((p) => p.id).sort(), ['g2', 'x']);
});

test('골레이로가 없으면 필드 선수 중 가장 맞는 선수가 골문에 선다', () => {
  const squad = [{ id: 'a', pos: 'Ala', ovr: 70 }, { id: 'b', pos: 'Fixo', ovr: 60 }];
  const { starters } = pickLineup(squad, (p, slot) => (slot === 'Goleiro' && p.id === 'b' ? 90 : p.ovr));
  assert.equal(starters[0].role, 'Goleiro');
  assert.equal(starters[0].player.id, 'b');
});

test('measureTeams 계산', () => {
  const m = measureTeams([[{ pos: 'Ala', ovr: 60 }], [{ pos: 'Ala', ovr: 70 }]], ovrOf);
  assert.equal(m.ovrSpread, 10);
  assert.equal(m.posSpread, 0);
});

test('피할 수 없는 포지션 차이는 쏠림으로 세지 않는다', () => {
  const m = measureTeams([[{ pos: 'Goleiro', ovr: 60 }, { pos: 'Ala', ovr: 60 }], [{ pos: 'Ala', ovr: 60 }, { pos: 'Ala', ovr: 60 }]], ovrOf);
  assert.equal(m.posExcess, 0);
  const bad = measureTeams([[{ pos: 'Ala', ovr: 60 }, { pos: 'Ala', ovr: 60 }], [{ pos: 'Fixo', ovr: 60 }, { pos: 'Fixo', ovr: 60 }]], ovrOf);
  assert.equal(bad.posExcess, 4);
});

test('포지션 우선은 쓸데없는 쏠림이 없다', () => {
  const players = roster(16, 21);
  const { metrics } = buildTeams(players, 3, 'position', { ovrOf, rng: seeded(3) });
  assert.equal(metrics.posExcess, 0);
});

test('완전 랜덤: 누를 때마다 조합이 달라진다', () => {
  const players = roster(16, 2);
  const a = buildTeams(players, 2, 'random', { ovrOf, rng: seeded(1) }).teams.map((t) => t.map((p) => p.id).sort().join());
  const b = buildTeams(players, 2, 'random', { ovrOf, rng: seeded(99) }).teams.map((t) => t.map((p) => p.id).sort().join());
  assert.notDeepEqual(a, b);
});

for (const mode of ['position', 'ability', 'balanced', 'random']) {
  test(`${mode}: 고정한 선수는 정한 팀에 그대로, 나머지로 인원 ±1`, () => {
    const players = roster(15, 8);
    const fixed = new Map([['p0', 0], ['p1', 0], ['p2', 0], ['p3', 1], ['p4', 2]]);
    const { teams, fixedIds } = buildTeams(players, 3, mode, { ovrOf, rng: seeded(5), fixed });
    assert.equal(fixedIds.size, 5);
    fixed.forEach((ti, id) => assert.ok(teams[ti].some((p) => p.id === id), `${id} → ${ti}`));
    const sizes = teams.map((t) => t.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `${sizes}`);
    assert.equal(teams.flat().length, 15);
  });
}

test('고정 선수가 팀 수보다 뒤 팀에 있으면 그 팀까지 만든다', () => {
  const players = roster(9, 4);
  const { teams } = buildTeams(players, 2, 'balanced', { ovrOf, rng: seeded(2), fixed: new Map([['p0', 2]]) });
  assert.equal(teams.length, 3);
  assert.ok(teams[2].some((p) => p.id === 'p0'));
});

test('고정 인원이 한쪽에 몰려 있어도 나머지를 적은 팀에 먼저 채운다', () => {
  const players = roster(10, 6);
  const fixed = new Map([['p0', 0], ['p1', 0], ['p2', 0], ['p3', 0]]);
  const { teams } = buildTeams(players, 2, 'ability', { ovrOf, rng: seeded(3), fixed });
  assert.deepEqual(teams.map((t) => t.length), [5, 5]);
});
