/** config/season.startedAt → 화면용 날짜. 없으면 빈 문자열. */

export function parseStartedAt(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') {
    try {
      const d = value.toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
    } catch (e) {
      /* Timestamp가 아니면 아래 분기로 */
    }
  }
  if (typeof value === 'object') {
    const seconds = value.seconds ?? value._seconds;
    if (seconds != null && Number.isFinite(Number(seconds))) {
      const d = new Date(Number(seconds) * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = Math.abs(value) < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return parseStartedAt(Number(trimmed));
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const SEASON_STAT_KEYS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy', 'ref', 'int', 'pst', 'dis', 'cmp', 'wrk'];

export function seasonStartStatMap(base) {
  const start = Number(base);
  const out = {};
  SEASON_STAT_KEYS.forEach((key) => { out[key] = start; });
  return out;
}

export function formatSeasonStartLabel(value) {
  const d = parseStartedAt(value);
  if (!d) return '';
  const ymd = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
  const weekday = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
  }).format(d);
  return `${ymd}(${weekday})`;
}
