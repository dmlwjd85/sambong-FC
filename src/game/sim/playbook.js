/**
 * 풋살 전술 플레이북 — 모의경기가 '진짜 풋살 공격 패턴'으로 흘러가게 해요.
 * 한 번 공을 잡으면 패턴 하나를 골라 단계(패스·드리블·슛)대로 진행하고, 단계마다 왜 그렇게 하는지 해설해요.
 *
 * 참고: 3-1(다이아)·4-0(콰트로) 공격 체계, 파랄렐라·대각선·피보 + 세 번째 선수, 원투, 스크린(블록),
 *       역습, 파워플레이(골키퍼가 다섯 번째 필드 선수) — FIFA Training Centre, UEFA 풋살 기술 분석, futsal.tech
 *
 * 역할 이름: fixo(뒤 가운데), alaBall(공 쪽 아라), alaFar(반대쪽 아라), pivo(앞), gk
 * 단계: { type: 'pass'|'dribble'|'shot', from, to?, run?, say, learn? }
 *   run: 받는 선수가 어떻게 뛰는지 (line=터치라인 따라, diag=대각선으로 골문 쪽, drop=피보가 내려와 등지고, box=골문 앞, back=수비 뒤로 침투)
 */

export const PLAYS = {
  eight: {
    name: '에이트 (8자 회전)',
    formation: '3-1',
    lesson: '뒤의 세 명이 8자를 그리며 자리를 바꿔요. 패스한 친구가 앞으로 달려 나가면 수비가 누구를 막을지 헷갈려요.',
    steps: [
      { type: 'pass', from: 'fixo', to: 'alaBall', say: '{from}이(가) 옆의 {to}에게 내줍니다.' },
      { type: 'pass', from: 'alaBall', to: 'pivo', run: 'drop', say: '{from} → 앞의 피보 {to}! 패스한 {fixo}은(는) 옆으로 나란히 달려 나가요.', learn: '패스하고 서 있지 않고, 바로 빈 곳으로 달리는 게 풋살의 기본이에요.' },
      { type: 'pass', from: 'pivo', to: 'fixo', run: 'box', say: '{from}이(가) 등지고 버틴 뒤, 달려 들어온 세 번째 선수 {to}에게!', learn: '두 명이 주고받는 사이 세 번째 선수가 달려 들어오는 게 \'세 번째 선수\' 움직임이에요.' },
      { type: 'shot', from: 'fixo' },
    ],
  },
  paralela: {
    name: '파랄렐라 (측면 평행 침투)',
    formation: '3-1',
    side: true,
    lesson: '공 가진 친구와 나란히, 터치라인을 따라 앞으로 달려요. 수비 뒤 넓은 측면 공간에서 공을 받아요.',
    steps: [
      { type: 'pass', from: 'fixo', to: 'alaBall', say: '{from}이(가) 측면의 {to}에게 벌려 줍니다.' },
      { type: 'pass', from: 'alaBall', to: 'pivo', run: 'line', say: '{from}, 터치라인을 따라 앞으로 찔러 줍니다! {to}이(가) 측면으로 빠져 받아요 — 파랄렐라!', learn: '측면은 수비가 한쪽(터치라인)밖에 못 막아요. 그래서 측면 공격이 많아요.' },
      { type: 'pass', from: 'pivo', to: 'alaFar', run: 'box', say: '{from}이(가) 골라인 근처에서 반대쪽에서 달려온 {to}에게 낮게 깔아 줍니다!', learn: '반대쪽 골대(먼 쪽 포스트)로 들어가는 친구는 수비가 잘 못 봐요.' },
      { type: 'shot', from: 'alaFar' },
    ],
  },
  diagonal: {
    name: '대각선 침투',
    formation: '3-1',
    lesson: '수비와 수비 사이로 비스듬히 달려 들어가면 골문 정면에서 공을 받을 수 있어요.',
    steps: [
      { type: 'pass', from: 'fixo', to: 'alaBall', say: '{from} → {to}, 측면으로 공을 돌립니다.' },
      { type: 'pass', from: 'alaBall', to: 'alaFar', run: 'diag', say: '반대쪽 {to}이(가) 대각선으로 수비 사이를 파고들고, {from}이(가) 그 길로 정확히 넣어 줍니다!', learn: '패스는 친구가 \'지금 있는 곳\'이 아니라 \'달려갈 곳\'으로 줘요.' },
      { type: 'shot', from: 'alaFar' },
    ],
  },
  pivot: {
    name: '피보 플레이 + 세 번째 선수',
    formation: '3-1',
    lesson: '피보가 골대를 등지고 공을 지켜 주면, 뒤에서 달려온 친구가 슈팅해요.',
    steps: [
      { type: 'pass', from: 'fixo', to: 'pivo', run: 'drop', say: '{from}, 중앙으로 한 번에 피보 {to}에게 찔러 줍니다!', learn: '피보는 등지고 공을 받아요. 몸으로 수비를 막고 공을 지켜요.' },
      { type: 'pass', from: 'pivo', to: 'alaBall', run: 'box', say: '{from}이(가) 수비를 등에 업고 버티다 옆으로 살짝 내줍니다 — 달려온 {to}!' },
      { type: 'shot', from: 'alaBall' },
    ],
  },
  onetwo: {
    name: '원투 (벽 패스)',
    formation: '3-1',
    lesson: '친구에게 패스하고 바로 수비 뒤로 달려요. 친구가 벽처럼 다시 돌려주면 수비 한 명을 지나가요.',
    steps: [
      { type: 'pass', from: 'alaBall', to: 'pivo', say: '{from} → {to}, 패스하고 바로 달립니다!' },
      { type: 'pass', from: 'pivo', to: 'alaBall', run: 'back', say: '{from}이(가) 원터치로 돌려줍니다 — 원투! {to}이(가) 수비 뒤로 빠져나가요.', learn: '패스하고 멈추면 수비가 편해요. 패스 후 바로 움직이기!' },
      { type: 'shot', from: 'alaBall' },
    ],
  },
  screen: {
    name: '스크린 (몸으로 길 막아 주기)',
    formation: '2-2',
    lesson: '동료가 수비 앞에 서서 길을 막아 주면, 공 가진 친구가 그 틈으로 드리블해 들어가요. (밀거나 잡으면 파울이에요!)',
    steps: [
      { type: 'pass', from: 'fixo', to: 'alaBall', say: '{from} → {to}. {pivo}이(가) 다가가 수비 앞에 섭니다.' },
      { type: 'dribble', from: 'alaBall', say: '{pivo}의 스크린! {from}이(가) 그 틈으로 가운데로 파고듭니다!', learn: '스크린은 부딪히는 게 아니라 \'서서 길만 막는\' 거예요.' },
      { type: 'shot', from: 'alaBall' },
    ],
  },
  quatro: {
    name: '4-0 로테이션 (콰트로)',
    formation: '4-0',
    lesson: '피보 없이 네 명이 한 줄로 서서 패스하며 돌아요. 비운 자리를 다른 친구가 채우고, 빈 뒷공간으로 뛰어 들어가요.',
    steps: [
      { type: 'pass', from: 'fixo', to: 'alaBall', say: '{from} → {to}. 네 명이 한 줄로 서서 공을 돌립니다.' },
      { type: 'pass', from: 'alaBall', to: 'fixo', say: '{from}이(가) 다시 뒤로 → {to}. 수비를 앞으로 끌어내요.', learn: '뒤로 주는 패스도 작전이에요. 수비를 끌어내 뒷공간을 만들어요.' },
      { type: 'pass', from: 'fixo', to: 'alaFar', run: 'back', say: '수비가 올라온 순간! 반대쪽 {to}이(가) 뒷공간으로 뛰고 {from}의 긴 패스!' },
      { type: 'shot', from: 'alaFar' },
    ],
  },
  counter: {
    name: '역습 2대1',
    formation: '역습',
    lesson: '공을 뺏자마자 빠르게! 수비가 한 명이면 공을 몰고 가다 수비가 다가오는 순간 옆 친구에게 줘요.',
    steps: [
      { type: 'dribble', from: 'alaBall', say: '{from}이(가) 공을 몰고 빠르게 전진! 2대1 상황입니다.' },
      { type: 'pass', from: 'alaBall', to: 'pivo', run: 'box', say: '수비가 {from}에게 붙는 순간 → 옆의 {to}에게!', learn: '수비가 공 가진 친구에게 오면, 그 수비가 비운 곳에 친구가 있어요.' },
      { type: 'shot', from: 'pivo' },
    ],
  },
  powerplay: {
    name: '파워플레이 (골키퍼까지 5명 공격)',
    formation: '5대4',
    lesson: '지고 있을 때 골키퍼도 공격에 나와 5명이 4명을 상대해요. 대신 골대가 비어서 공을 뺏기면 위험해요!',
    steps: [
      { type: 'pass', from: 'gk', to: 'alaBall', say: '골키퍼 {from}까지 올라와 5명이 공을 돌립니다. {to}에게!' },
      { type: 'pass', from: 'alaBall', to: 'alaFar', run: 'diag', say: '한 명이 남는 쪽을 찾아 {from} → {to}!', learn: '사람이 한 명 더 많으면, 수비가 없는 친구가 꼭 한 명 생겨요.' },
      { type: 'shot', from: 'alaFar' },
    ],
  },
};

/** 수비 노트: 공을 뺏었을 때 왜 성공했는지 (수비 팀 압박 전술 기준) */
export const DEFENSE_NOTES = {
  high: ['전방 압박! 상대 진영부터 바짝 붙어서 패스 길을 좁혔어요.', '높은 압박은 상대 골대 가까이에서 공을 뺏을 수 있어요. 대신 뒤 공간이 비어요.'],
  mid: ['중간 블록: 하프라인 근처에서 기다리다 패스를 끊었어요. 풋살에서 가장 많이 쓰는 수비예요.', '수비는 공만 보지 않고 \'패스 길\'을 막아요.'],
  low: ['내려서기: 골대 앞을 촘촘하게 지켜서 들어올 길을 막았어요.', '수비 둘이 가까이 서서 서로 도와주는 걸 \'커버\'라고 해요.'],
};

/** 출전 선수 → 역할 */
export function resolveRoles(atk, channel) {
  const gk = atk.find((p) => p.pos === 'Goleiro') || null;
  const pool = atk.filter((p) => p !== gk);
  const take = (pred) => {
    const i = pool.findIndex(pred);
    return i >= 0 ? pool.splice(i, 1)[0] : null;
  };
  const fixo = take((p) => p.pos === 'Fixo') || take(() => true);
  const pivo = take((p) => p.pos === 'Pivo') || (pool.length > 2 ? take(() => true) : null) || pool[pool.length - 1] || fixo;
  const alas = pool.filter((p) => p !== pivo);
  // 공 쪽 아라: 오른쪽 공격이면 두 번째 아라
  const alaBall = (channel === 'right' ? alas[1] : alas[0]) || alas[0] || pivo;
  const alaFar = alas.find((p) => p !== alaBall) || pivo;
  return { gk, fixo, pivo, alaBall, alaFar };
}

/** 이번 공격 패턴 고르기 (팀 전술·상황 반영) */
export function choosePlay({ tactic = {}, counter = false, powerplay = false, rnd = Math.random }) {
  if (powerplay) return 'powerplay';
  if (counter) return 'counter';
  const w = { eight: 3, paralela: 3, diagonal: 2, pivot: 2, onetwo: 2, screen: 1.5, quatro: 1.2 };
  if (tactic.focus === 'side') { w.paralela += 2.5; w.eight += 1; w.diagonal += 0.5; w.pivot -= 0.8; }
  if (tactic.focus === 'center') { w.pivot += 2.5; w.screen += 1.5; w.onetwo += 1; w.paralela -= 1.5; }
  if (tactic.width === 'wide') { w.paralela += 1; w.quatro += 0.8; }
  if (tactic.width === 'narrow') { w.screen += 1; w.pivot += 1; w.quatro -= 0.6; }
  const entries = Object.entries(w).map(([k, v]) => [k, Math.max(0.2, v)]);
  const sum = entries.reduce((s, [, v]) => s + v, 0);
  let r = rnd() * sum;
  for (const [k, v] of entries) { r -= v; if (r <= 0) return k; }
  return entries[0][0];
}

/** '{from} → {to}' 같은 자리 채우기 */
export function fillSay(text, roles, step) {
  const nm = (k) => (roles[k] && roles[k].name) || '';
  return josa(String(text || '')
    .replace(/\{from\}/g, nm(step.from))
    .replace(/\{to\}/g, nm(step.to))
    .replace(/\{(fixo|pivo|alaBall|alaFar|gk)\}/g, (_, k) => nm(k)));
}

/** 받침에 맞게 조사 고르기: '민준이(가)' → '민준이', '지호이(가)' → '지호가' */
export function josa(text) {
  const PAIRS = { '이(가)': ['이', '가'], '은(는)': ['은', '는'], '을(를)': ['을', '를'], '와(과)': ['과', '와'], '(으)로': ['으로', '로'], '이(가)\u0020': ['이 ', '가 '] };
  return String(text || '').replace(/([가-힣A-Za-z0-9])(이\(가\)|은\(는\)|을\(를\)|와\(과\)|\(으\)로)/g, (_, ch, j) => {
    const code = ch.charCodeAt(0);
    let batchim;
    if (code >= 0xac00 && code <= 0xd7a3) batchim = (code - 0xac00) % 28 !== 0;
    else batchim = /[013678lmnLMN]$/.test(ch);
    const [withB, noB] = PAIRS[j];
    if (j === '(으)로' && code >= 0xac00 && (code - 0xac00) % 28 === 8) return ch + '로'; // ㄹ받침
    return ch + (batchim ? withB : noB);
  });
}
