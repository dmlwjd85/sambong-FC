import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAttendanceDates, weekdayKr } from './attendanceDates.js';

test('출석부는 9월 말 이후 토요일도 오늘까지 보여 준다', () => {
  const dates = buildAttendanceDates([], '2026-11-22');
  assert.equal(dates[0], '2026-03-07');
  assert.ok(dates.includes('2026-10-03'));
  assert.ok(dates.includes('2026-11-21'));
  assert.ok(!dates.includes('2026-11-28'));
  assert.ok(dates.every((d) => weekdayKr(d) === '토'));
});

test('학기 초에도 30주는 미리 보여 준다', () => {
  const dates = buildAttendanceDates([], '2026-03-10');
  assert.equal(dates.length, 30);
  assert.equal(dates[29], '2026-09-26');
});

test('토요일이 아닌 날 저장한 출석도 표에 들어간다', () => {
  const dates = buildAttendanceDates([{ date: '2026-05-06' }, { date: 'bad' }, {}], '2026-06-01');
  assert.ok(dates.includes('2026-05-06'));
  assert.equal(weekdayKr('2026-05-06'), '수');
  assert.deepEqual([...dates].sort(), dates);
});
