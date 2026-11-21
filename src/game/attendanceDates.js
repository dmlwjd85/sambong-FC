/** 출석부 날짜 계산 (화면·Firebase와 무관해서 테스트할 수 있음) */

/** 출석부 첫 주(토요스포츠데이 시작일) */
const ATTENDANCE_FIRST_DAY = '2026-03-07';

function ymd(d) {
return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function weekdayKr(dateStr) {
const [y, m, dd] = dateStr.split('-').map(Number);
return '일월화수목금토'[new Date(y, m - 1, dd).getDay()];
}

/** 첫 토요일부터 매주 토요일을 오늘(또는 저장된 마지막 날)까지 이어 붙이고, 토요일이 아닌 날 저장된 출석도 넣음.
 *  예전에는 30주(9월 말)까지만 보여서 그 뒤 출석이 표에 안 나왔어요. */
export function buildAttendanceDates(logs, todayStr) {
const saved = (logs || []).map((l) => l && l.date).filter((x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x));
const last = [todayStr, ...saved].sort().pop();
const set = new Set(saved.filter((x) => x >= ATTENDANCE_FIRST_DAY));
const [y, m, dd] = ATTENDANCE_FIRST_DAY.split('-').map(Number);
const d = new Date(y, m - 1, dd);
for (let i = 0; i < 30 || ymd(d) <= last; i++) { set.add(ymd(d)); d.setDate(d.getDate() + 7); }
return [...set].sort();
}
