// 개발용 시작 데이터: 선수 31명 (포지션·능력치 다양하게), 감독 계정 gm1 (PIN 1234)
const NAMES = ['김단엘', '김다래', '김라희', '김민지', '김사랑비', '김지훈', '노승희', '박소담', '박소윤', '박준수', '박하율', '박현수', '백시율',
  '석서영', '이가온', '이동해', '이시형', '이예주', '이준용', '이지안', '인시진', '임은영', '정의영', '정의정', '조이담', '최윤희', '함인솔', '황주하', '황훈태', '황혜민', '황혜윤'];
const POS = ['Goleiro', 'Fixo', 'Ala', 'Ala', 'Pivo', 'Fixo', 'Ala', 'Pivo', '미정', 'Ala'];
const KEYS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy', 'ref', 'int', 'pst', 'dis', 'cmp', 'wrk'];

export function seed() {
  let s = 20261122;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const base = 'artifacts/sambong-futsal-ultimate/public/data';
  const out = {};
  NAMES.forEach((name, i) => {
    const pos = POS[i % POS.length];
    const lv = 1 + Math.floor(rnd() * 8);
    const p = { name, pos, level: lv, exp: 0, age: 13, season: 2, pin: '1111' };
    KEYS.forEach((k) => { p[k] = 52 + Math.floor(rnd() * 22) + (pos === 'Goleiro' && (k === 'ref' || k === 'dis') ? 10 : 0); });
    out[`${base}/players/player_${name}`] = p;
  });
  out[`${base}/players/player_gm1`] = { name: '선생님', pin: '1234' };
  out[`${base}/config/season`] = { season: 2, started: true, startedAt: '2026-09-01T00:00:00.000Z' };
  out[`${base}/config/announcement`] = { text: '', updatedAt: '' };
  return out;
}
