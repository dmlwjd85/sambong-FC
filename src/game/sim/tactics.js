/** 팀 전술 (전술판에서 고름, 기기에 저장). 팀 키('A'~'F')별로 따로 */
export const TACTIC_OPTIONS = {
  press: { label: '압박', opts: { high: '전방 압박', mid: '중간', low: '내려서기' } },
  width: { label: '폭', opts: { wide: '넓게', normal: '보통', narrow: '좁게' } },
  focus: { label: '공격 방향', opts: { side: '측면', balanced: '균형', center: '중앙' } },
};
export const DEFAULT_TACTIC = { press: 'mid', width: 'wide', focus: 'side' };

function load() {
  try { const o = JSON.parse(localStorage.getItem('sfc_sim_tactics_v1') || 'null'); if (o && typeof o === 'object') return o; } catch (e) { /* 무시 */ }
  return {};
}
window.simTactics = window.simTactics || load();

export function getTactic(teamKey) {
  return { ...DEFAULT_TACTIC, ...(window.simTactics[teamKey] || {}) };
}
export function setTactic(teamKey, key, value) {
  if (!TACTIC_OPTIONS[key] || !TACTIC_OPTIONS[key].opts[value]) return;
  window.simTactics[teamKey] = { ...getTactic(teamKey), [key]: value };
  try { localStorage.setItem('sfc_sim_tactics_v1', JSON.stringify(window.simTactics)); } catch (e) { /* 무시 */ }
}

/** 공격 방향 고르기: 측면 위주가 기본 (풋살은 사이드 전개가 많아요) */
export function channelWeights(t) {
  let side = 0.4;
  if (t.focus === 'side') side += 0.06; else if (t.focus === 'center') side -= 0.12;
  if (t.width === 'wide') side += 0.03; else if (t.width === 'narrow') side -= 0.08;
  side = Math.max(0.2, Math.min(0.47, side));
  return { left: side, right: side, center: 1 - side * 2 };
}
