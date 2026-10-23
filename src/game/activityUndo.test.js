import test from 'node:test';
import assert from 'node:assert/strict';
import { diffStatChanges, pushUndo, popUndo, revertStatMap } from './activityUndo.js';
import { formatSeasonStartLabel, parseStartedAt, seasonStartStatMap } from './seasonDate.js';

const KEYS = ['sho', 'pac'];

test('훈련과 레벨업으로 오른 능력치는 취소하면 원래대로', () => {
  let stats = { sho: 58, pac: 55 };
  let stack = [];
  const original = { ...stats };
  const add = (partial) => {
    const before = { ...stats };
    Object.assign(stats, partial);
    const updates = {};
    KEYS.forEach((k) => {
      if (stats[k] !== before[k]) updates[k] = stats[k];
    });
    stack = pushUndo(stack, { type: 'training', stats: diffStatChanges(KEYS, before, updates) });
  };
  const undo = () => {
    const popped = popUndo(stack, 'training');
    stack = popped.stack;
    Object.assign(stats, revertStatMap(stats, popped.entry.stats));
  };
  for (let i = 0; i < 8; i += 1) {
    add({ sho: stats.sho + 1, pac: stats.pac + 1 });
    undo();
    assert.deepEqual(stats, original);
  }
});

test('종류가 다르면 마지막 같은 기록만 되돌린다', () => {
  const stack = pushUndo(pushUndo([], { type: 'training', stats: { sho: 1 } }), { type: 'goals', stats: { pac: 1 } });
  const popped = popUndo(stack, 'goals');
  assert.deepEqual(popped.entry.stats, { pac: 1 });
  assert.equal(popped.stack.length, 1);
  assert.equal(popped.stack[0].type, 'training');
});

test('startedAt이 없으면 날짜를 만들지 않는다', () => {
  assert.equal(formatSeasonStartLabel(null), '');
  assert.equal(formatSeasonStartLabel(''), '');
  assert.equal(formatSeasonStartLabel(undefined), '');
  assert.equal(formatSeasonStartLabel('아직 몰라요'), '');
});

test('신규 카드 능력치는 모두 같은 출발값이다', () => {
  const stats = seasonStartStatMap(55);
  assert.equal(Object.keys(stats).length, 12);
  Object.values(stats).forEach((value) => assert.equal(value, 55));
});

test('Timestamp, 초, 밀리초, 문자열을 같은 날로 읽는다', () => {
  const iso = '2026-10-23T03:00:00.000Z';
  const ms = Date.parse(iso);
  const seconds = Math.floor(ms / 1000);
  const samples = [
    iso,
    ms,
    String(ms),
    seconds,
    { seconds, nanoseconds: 0 },
    { _seconds: seconds, _nanoseconds: 0 },
    { toDate: () => new Date(ms) },
  ];
  samples.forEach((value) => {
    const label = formatSeasonStartLabel(value);
    assert.match(label, /2026년 10월 23일\(금\)/);
    assert.ok(parseStartedAt(value) instanceof Date);
  });
});
