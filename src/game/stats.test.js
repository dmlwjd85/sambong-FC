import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionOVRs, recommendedPosition } from './stats.js';

const base = (o) => ({ pos: '미정', pac: 60, sho: 60, pas: 60, dri: 60, def: 60, phy: 60, ref: 60, int: 60, pst: 60, dis: 60, cmp: 60, wrk: 60, ...o });

test('포지션 4개 OVR을 모두 계산한다', () => {
  const list = positionOVRs(base({}));
  assert.deepEqual(list.map((x) => x.pos), ['Goleiro', 'Fixo', 'Ala', 'Pivo']);
  list.forEach((x) => assert.equal(x.ovr, 60));
});

test('슈팅·위치선정이 높으면 피보를 추천', () => {
  assert.equal(recommendedPosition(base({ sho: 85, pst: 82, cmp: 80, phy: 75 })).pos, 'Pivo');
});

test('수비·가로채기가 높으면 픽소를 추천', () => {
  assert.equal(recommendedPosition(base({ def: 85, int: 84, phy: 78, pas: 75 })).pos, 'Fixo');
});

test('골레이로는 확실히 높을 때만 추천', () => {
  assert.equal(recommendedPosition(base({ ref: 90, dis: 88, pst: 85 })).pos, 'Goleiro');
  assert.notEqual(recommendedPosition(base({ ref: 63, dis: 62 })).pos, 'Goleiro');
});
