/** 선수 명단·능력치 이름·업적·상점 품목 같은 고정값 */


// Vite 빌드 시 .env의 VITE_APP_ID 사용, 없으면 기본값 (기존 단일 HTML과 동일)
export const appId = import.meta.env.VITE_APP_ID || (typeof globalThis.__app_id !== 'undefined' ? globalThis.__app_id : 'sambong-futsal-ultimate');

export const INITIAL_PLAYERS = [
'김단엘', '김다래', '김라희', '김민지', '김사랑비', '김지훈', '노승희', '박소담', '박소윤', '박준수', '박하율', '박현수', '백시율', 
'석서영', '이가온', '이동해', '이시형', '이예주', '이준용', '이지안', '인시진', '임은영', '정의영', '정의정', '조이담', '최윤희', '함인솔', '황주하', '황훈태', '황혜민', '황혜윤'
];

export let ALLOWED_PLAYERS = [...INITIAL_PLAYERS];

export const getSafeDocId = (name) => {
if (!name) return 'unknown';
if(name === 'gm1' || name === 'gm2') return name;
return String(name).replace(/[^가-힣a-zA-Z0-9]/g, ''); 
};

export const GENDER_MAP = {
'김단엘': 'M', '김다래': 'F', '김라희': 'F', '김민지': 'F', '김사랑비': 'F', '김지훈': 'M', '노승희': 'F', '박소담': 'M', '박소윤': 'F', '박준수': 'M', '박하율': 'F', '박현수': 'M', '백시율': 'M', 
'석서영': 'F', '이가온': 'F', '이동해': 'M', '이시형': 'M', '이예주': 'F', '이준용': 'M', '이지안': 'F', '인시진': 'M', '임은영': 'F', '정의영': 'M', '정의정': 'M', '조이담': 'M', '최윤희': 'F', '함인솔': 'F', '황주하': 'M', '황훈태': 'M', '황혜민': 'F', '황혜윤': 'F'
};

export const POS_KR = { 'Pivo': '피보(FW)', 'Ala': '아라(MF)', 'Fixo': '픽소(DF)', 'Goleiro': '골레이로(GK)', '미정': '포지션 미정' };
export const STAT_NAMES = { pac:'속력 (PAC)', sho:'슈팅 (SHO)', pas:'패스 (PAS)', dri:'드리블 (DRI)', def:'수비 (DEF)', phy:'피지컬 (PHY)', ref:'반사신경 (REF)', int:'가로채기 (INT)', pst:'위치선정 (PST)', dis:'볼배급 (DIS)', cmp:'평정심 (CMP)', wrk:'활동량 (WRK)' };

export const POS_WEIGHTS = {
'Goleiro': { core: ['ref', 'dis', 'pst'], sub: ['cmp', 'phy'], coreW: 0.70, subW: 0.25, etcW: 0.05 },
'Fixo': { core: ['def', 'int', 'phy', 'pas'], sub: ['pst', 'wrk'], coreW: 0.70, subW: 0.25, etcW: 0.05 },
'Ala': { core: ['pac', 'dri', 'pas', 'wrk'], sub: ['int', 'sho'], coreW: 0.70, subW: 0.25, etcW: 0.05 },
'Pivo': { core: ['sho', 'pst', 'cmp', 'phy'], sub: ['pac', 'dri'], coreW: 0.70, subW: 0.25, etcW: 0.05 },
'미정': { core: [], sub: [], coreW: 0, subW: 0, etcW: 1.0 }
};

/** 시즌 2 기본 능력치 · 일일 기록 한도 */
export const STAT_BASE = 55;
export const STAT_KEYS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy', 'ref', 'int', 'pst', 'dis', 'cmp', 'wrk'];
export const ACTIVITY_DAILY_CAP = { training: 1, matches: 1, goals: 4, assists: 4, keypass: 6, saves: 8 };
export const ACTIVITY_LABEL = { training: '개인 훈련', matches: '경기 출전', goals: '골', assists: '어시스트', keypass: '킬패스', saves: '세이브' };

export const STAT_DESC = {
'pac': '🏃‍♂️ 속력 (Pace)\n\n단거리 전력 질주 속도와 순간적인 가속도입니다.\n치고 달리기나 수비 복귀 시 가장 먼저 도착할 수 있게 해줍니다.',
'sho': '⚽ 슈팅 (Shooting)\n\n슈팅 파워와 정확도입니다.\n골대 구석을 찌르는 강력한 슛을 날리거나 골망을 찢을 듯한 파워가 강해집니다.',
'pas': '🤝 패스 (Passing)\n\n짧은 패스와 롱패스의 정확도입니다.\n좁은 풋살 경기장에서 가장 중요하며, 동료의 발밑에 택배처럼 공을 보낼 수 있습니다.',
'dri': '🪄 드리블 (Dribbling)\n\n발바닥 컨트롤, 방향 전환, 볼 키핑 능력입니다.\n수비수들 사이에서 요리조리 공을 지켜내며 상대를 벗겨내는 개인기 능력입니다.',
'def': '🛡️ 수비 (Defending)\n\n상대 공격수를 끈질기게 따라다니며 마크하고, 태클과 몸싸움으로 공을 빼앗는 능력입니다.',
'phy': '💪 피지컬 (Physical)\n\n어깨싸움에서 밀리지 않는 힘과 지치지 않는 체력입니다.\n등지고 버티는 피보(FW)에게 특히 중요한 능력치입니다.',
'ref': '⚡ 반사신경 (Reflexes)\n\n순간적인 반응 속도입니다.\n주로 골레이로(GK)가 빠른 슈팅을 동물적인 감각으로 막아낼 때 쓰입니다.',
'int': '👁️ 가로채기 (Interceptions)\n\n상대방의 패스 길 전개를 미리 읽고 중간에서 커트하는 지능적인 수비 능력입니다.',
'pst': '🎯 위치선정 (Positioning)\n\n공격 시 상대 수비가 없는 빈 공간을 찾아 들어가고, 수비 시에는 가장 위험한 곳을 미리 막아내는 전술적 지능입니다.',
'dis': '🚀 볼배급 (Distribution)\n\n수비를 성공하거나 골레이로가 공을 잡았을 때, 정확한 롱패스나 스루패스로 앞쪽 공격수에게 빠르게 전개해주는 빌드업 능력입니다.',
'cmp': '🧘 평정심 (Composure)\n\n상대가 강하게 압박하거나 골키퍼와 1:1 찬스가 왔을 때 당황하지 않고 침착하게 플레이하는 멘탈 능력입니다.',
'wrk': '🔥 활동량 (Work Rate)\n\n경기장 전 지역을 쉴 새 없이 뛰어다니는 체력과 투지입니다.\n공이 없을 때(오프더볼) 공간을 창출하고 팀을 돕는 헌신적인 능력입니다.'
};

export const DAILY_TIPS = [
{ title: "풋살과 축구의 가장 큰 차이점?", img: "⚽", category: "기본상식", desc: "풋살은 5인제 실내 축구입니다. 공이 밖으로 나가면 손으로 던지는 스로인이 아닌 '발로 차서 넣는 킥인'을 합니다!" },
{ title: "가장 중요한 '4초 룰'을 아시나요?", img: "⏱️", category: "기본규칙", desc: "킥인, 코너킥, 프리킥, 골클리어런스(골키퍼가 공을 던질 때)는 모두 공을 잡은 후 '4초' 안에 처리해야 합니다. 속도감이 생명이죠!" },
{ title: "거리 두기 5미터 원칙", img: "📏", category: "기본규칙", desc: "킥인, 코너킥, 프리킥 상황에서 수비수는 공으로부터 무조건 5미터 이상 떨어져 있어야 합니다. 방해하면 경고를 받을 수 있어요." },
{ title: "선수 교체는 무제한!", img: "🔄", category: "기본규칙", desc: "축구와 달리 풋살은 선수 교체 횟수에 제한이 없고, 언제든 코치의 지시로 교체 구역을 통해 자유롭게 들어오고 나갈 수 있습니다." },
{ title: "장비는 강화소에서 +5강까지", img: "🔨", category: "시즌2 성장", desc: "상점에서 산 장비는 같은 가격의 B로 강화합니다. 능력치 보너스는 조금씩만 오르니, 주급을 모아 신중하게 도전하세요!" },
{ title: "스킨은 능력치에 영향 없음", img: "🎨", category: "시즌2 성장", desc: "기본 스킨 3종은 무료입니다. 카드 킷·레전드 얼굴은 꾸미기용이고, 스탯 보너스는 머리·손·발 장비만 줍니다." }
];

export const ACHIEVEMENTS = [
{ id: 'goal_1', category: '개인 기록', title: '마수걸이 골', desc: '풋살화 끈을 꽉 묶고 첫 골을 기록하세요.', reqKey: 'goals', reqValue: 1, icon: '⚽', color: 'text-yellow-400', bg: 'bg-yellow-400', reward: 5 },
{ id: 'goal_50', category: '개인 기록', title: '득점 폭격기', desc: '누적 50골 달성! 상대 팀이 가장 두려워하는 선수입니다.', reqKey: 'goals', reqValue: 50, icon: '🚀', color: 'text-red-500', bg: 'bg-red-500', reward: 50 },
{ id: 'ast_1', category: '팀 플레이', title: '이타적인 플레이', desc: '첫 어시스트를 기록하세요.', reqKey: 'assists', reqValue: 1, icon: '🤝', color: 'text-emerald-400', bg: 'bg-emerald-400', reward: 5 },
{ id: 'save_30', category: '수비/헌신', title: '통곡의 벽', desc: '누적 30세이브 달성!', reqKey: 'saves', reqValue: 30, icon: '🧱', color: 'text-slate-300', bg: 'bg-slate-300', reward: 30 },
{ id: 'match_50', category: '꾸준함', title: '심장 두 개 (강철 체력)', desc: '50경기 출전! 지치지 않는 체력.', reqKey: 'matches', reqValue: 50, icon: '🫀', color: 'text-pink-500', bg: 'bg-pink-500', reward: 50 },
{ id: 'lv_50', category: '레벨업', title: '레전드의 시작', desc: '레벨 50 달성. 명예의 전당에 오를 자격이 충분합니다.', reqKey: 'level', reqValue: 50, icon: '👑', color: 'text-fut-gold', bg: 'bg-fut-gold', reward: 100 },

// [추가된 포지션별 트로피 12종]
{ id: 'pivo_low', category: '피보(FW)', title: '타겟맨의 싹', desc: '누적 10골 달성. 최전방 공격수의 자질이 보입니다.', reqKey: 'goals', reqValue: 10, icon: '🎯', color: 'text-red-400', bg: 'bg-red-400', reward: 10 },
{ id: 'pivo_med', category: '피보(FW)', title: '페널티 박스의 여우', desc: '누적 30골 달성. 찬스를 놓치지 않는 확실한 해결사!', reqKey: 'goals', reqValue: 30, icon: '🦊', color: 'text-red-500', bg: 'bg-red-500', reward: 30 },
{ id: 'pivo_high', category: '피보(FW)', title: '전설의 피보', desc: '누적 100골 달성. 삼봉 FC 역사에 남을 최고의 공격수!', reqKey: 'goals', reqValue: 100, icon: '🔥', color: 'text-red-600', bg: 'bg-red-600', reward: 100 },

{ id: 'ala_low', category: '아라(MF)', title: '윙어의 첫걸음', desc: '누적 10어시스트 달성. 동료를 활용할 줄 압니다.', reqKey: 'assists', reqValue: 10, icon: '👟', color: 'text-emerald-400', bg: 'bg-emerald-400', reward: 10 },
{ id: 'ala_med', category: '아라(MF)', title: '정확한 택배기사', desc: '누적 30어시스트 달성. 완벽한 찬스를 만들어냅니다.', reqKey: 'assists', reqValue: 30, icon: '📦', color: 'text-emerald-500', bg: 'bg-emerald-500', reward: 30 },
{ id: 'ala_high', category: '아라(MF)', title: '중원의 마에스트로', desc: '누적 100어시스트 달성. 팀의 공격을 지휘하는 완벽한 아라!', reqKey: 'assists', reqValue: 100, icon: '🪄', color: 'text-emerald-600', bg: 'bg-emerald-600', reward: 100 },

{ id: 'fixo_low', category: '픽소(DF)', title: '후방 빌드업', desc: '누적 10킬패스 달성. 수비수지만 공격의 시발점입니다.', reqKey: 'keypass', reqValue: 10, icon: '👁️', color: 'text-blue-400', bg: 'bg-blue-400', reward: 10 },
{ id: 'fixo_med', category: '픽소(DF)', title: '사령관의 시야', desc: '누적 30킬패스 달성. 대지를 가르는 패스의 달인!', reqKey: 'keypass', reqValue: 30, icon: '🔭', color: 'text-blue-500', bg: 'bg-blue-500', reward: 30 },
{ id: 'fixo_high', category: '픽소(DF)', title: '베켄바워의 재림', desc: '누적 100킬패스 달성. 완벽한 수비 조율과 최고의 패스마스터!', reqKey: 'keypass', reqValue: 100, icon: '🛡️', color: 'text-blue-600', bg: 'bg-blue-600', reward: 100 },

{ id: 'goleiro_low', category: '골레이로(GK)', title: '든든한 수문장', desc: '누적 10세이브 달성. 팀의 뒷문을 책임집니다.', reqKey: 'saves', reqValue: 10, icon: '🧤', color: 'text-orange-400', bg: 'bg-orange-400', reward: 10 },
{ id: 'goleiro_med', category: '골레이로(GK)', title: '반사신경의 달인', desc: '누적 50세이브 달성. 동물적인 감각으로 실점을 막아냅니다.', reqKey: 'saves', reqValue: 50, icon: '🐆', color: 'text-orange-500', bg: 'bg-orange-500', reward: 50 },
{ id: 'goleiro_high', category: '골레이로(GK)', title: '삼봉의 야신', desc: '누적 150세이브 달성. 누구도 그의 골문을 뚫을 수 없습니다!', reqKey: 'saves', reqValue: 150, icon: '🐙', color: 'text-orange-600', bg: 'bg-orange-600', reward: 150 },
{ id: 'train_8', category: '시즌2 성장', title: '토요의 땀', desc: '개인 훈련 8회. 하루 한 번이지만 매주 나온 선수가 강해집니다.', reqKey: 'training', reqValue: 8, icon: '💪', color: 'text-lime-400', bg: 'bg-lime-400', reward: 20 },
{ id: 'lv_10', category: '시즌2 성장', title: '커리어의 첫 도약', desc: '레벨 10. 시즌 2 능력치 55에서 천천히 올라온 증표입니다.', reqKey: 'level', reqValue: 10, icon: '🌟', color: 'text-amber-300', bg: 'bg-amber-300', reward: 25 },
{ id: 'match_8', category: '시즌2 성장', title: '라커룸 단골', desc: '출전 8회. 토요스포츠데이에 꾸준히 나온 선수입니다.', reqKey: 'matches', reqValue: 8, icon: '📅', color: 'text-sky-400', bg: 'bg-sky-400', reward: 20 }
];

/** 강화: 평타는 느껴지되 +5에서 능력치가 폭주하지 않게 보너스를 완만히 */
export const ENHANCE_LEVELS = [
{ level: 0, chance: 100, statPlus: 0, growthMult: 1.0, css: 'eff-0', text: '+0', color: 'text-slate-400' },
{ level: 1, chance: 90,  statPlus: 1, growthMult: 1.05, css: 'eff-1', text: '+1', color: 'text-white' },
{ level: 2, chance: 70,  statPlus: 1, growthMult: 1.1, css: 'eff-2', text: '+2', color: 'text-blue-400' },
{ level: 3, chance: 45,  statPlus: 2, growthMult: 1.2, css: 'eff-3', text: '+3', color: 'text-purple-400' },
{ level: 4, chance: 25,  statPlus: 2, growthMult: 1.3, css: 'eff-4', text: '+4', color: 'text-yellow-400' },
{ level: 5, chance: 12,  statPlus: 3, growthMult: 1.4, css: 'eff-5', text: '+5 MAX', color: 'text-red-400 drop-shadow-[0_0_5px_red]' }
];

export const SHOP_ITEMS = [
{ id: 'head_tier1', name: '시야 확장 고글', type: 'head', price: 500, icon: '🥽', desc: '[1종 집중형] 공간 지각력을 높입니다.', baseStats: {pst: 1}, baseGrowth: {pst: 15} },
{ id: 'head_tier2', name: '와이드 비전 헤드밴드', type: 'head', price: 620, icon: '🪢', desc: '[2종 복합형] 패스 길을 읽는 헤드밴드.', baseStats: {pst: 1, pas: 1}, baseGrowth: {pst: 10, pas: 10} },
{ id: 'head_tier3', name: '삼봉 마스터 헬멧', type: 'head', price: 800, icon: '🪖', desc: '[3종 올라운더] 최상급 수비지휘 헬멧.', baseStats: {cmp: 1, dis: 1, def: 1}, baseGrowth: {cmp: 7, dis: 7, def: 7} },
{ id: 'handL_tier1', name: '라텍스 그립 장갑 [좌]', type: 'handL', price: 500, icon: '🧤', desc: '[1종 집중형] 반사신경을 극대화.', baseStats: {ref: 1}, baseGrowth: {ref: 15} },
{ id: 'handL_tier2', name: '테크니컬 암 슬리브 [좌]', type: 'handL', price: 620, icon: '🦾', desc: '[2종 복합형] 거친 몸싸움을 버티는 슬리브.', baseStats: {phy: 1, wrk: 1}, baseGrowth: {phy: 10, wrk: 10} },
{ id: 'handL_tier3', name: '전설의 황금 완장 [좌]', type: 'handL', price: 800, icon: '🎗️', desc: '[3종 올라운더] 팀을 이끄는 주장의 완장.', baseStats: {pas: 1, cmp: 1, wrk: 1}, baseGrowth: {pas: 7, cmp: 7, wrk: 7} },
{ id: 'handR_tier1', name: '거미줄 그립 장갑 [우]', type: 'handR', price: 500, icon: '🧤', desc: '[1종 집중형] 펀칭과 캐칭 능력 극대화.', baseStats: {ref: 1}, baseGrowth: {ref: 15} },
{ id: 'handR_tier2', name: '밸런스 암 슬리브 [우]', type: 'handR', price: 620, icon: '🦾', desc: '[2종 복합형] 흔들림 없는 피지컬 유지.', baseStats: {phy: 1, wrk: 1}, baseGrowth: {phy: 10, wrk: 10} },
{ id: 'handR_tier3', name: '명장의 호루라기 [우]', type: 'handR', price: 800, icon: '🏅', desc: '[3종 올라운더] 필드의 감독이 되어 조율.', baseStats: {dis: 1, int: 1, def: 1}, baseGrowth: {dis: 7, int: 7, def: 7} },
{ id: 'footL_tier1', name: '경량화 카본 풋살화 [좌]', type: 'footL', price: 500, icon: '👟', desc: '[1종 집중형] 폭발적인 스피드.', baseStats: {pac: 1}, baseGrowth: {pac: 15} },
{ id: 'footL_tier1_alt', name: '파워 임팩트 풋살화 [좌]', type: 'footL', price: 500, icon: '🥾', desc: '[1종 집중형] 대포알 슈팅 장착.', baseStats: {sho: 1}, baseGrowth: {sho: 15} },
{ id: 'footL_tier2', name: '마에스트로 풋살화 [좌]', type: 'footL', price: 620, icon: '👞', desc: '[2종 복합형] 우아한 드리블과 패스.', baseStats: {dri: 1, pas: 1}, baseGrowth: {dri: 10, pas: 10} },
{ id: 'footR_tier1', name: '강철 발목 보호대 [우]', type: 'footR', price: 500, icon: '🧦', desc: '[1종 집중형] 정확한 가로채기 타이밍.', baseStats: {int: 1}, baseGrowth: {int: 15} },
{ id: 'footR_tier1_alt', name: '터프 태클 풋살화 [우]', type: 'footR', price: 500, icon: '🥾', desc: '[1종 집중형] 끈질긴 대인 수비 전용.', baseStats: {def: 1}, baseGrowth: {def: 15} },
{ id: 'footR_tier2', name: '팬텀 드리블러 풋살화 [우]', type: 'footR', price: 620, icon: '👟', desc: '[2종 복합형] 보이지 않는 발놀림.', baseStats: {dri: 1, pac: 1}, baseGrowth: {dri: 10, pac: 10} },
{ id: 'footL_tier3', name: '삼봉 골든 부스트 [좌]', type: 'footL', price: 800, icon: '🥇', desc: '[3종 올라운더] 최상급 왼발. 속력·슈팅·드리블.', baseStats: {pac: 1, sho: 1, dri: 1}, baseGrowth: {pac: 7, sho: 7, dri: 7} },
{ id: 'footR_tier3', name: '삼봉 아이언 앵클 [우]', type: 'footR', price: 800, icon: '🛡️', desc: '[3종 올라운더] 최상급 오른발. 수비·가로채기·피지컬.', baseStats: {def: 1, int: 1, phy: 1}, baseGrowth: {def: 7, int: 7, phy: 7} },
{ id: 'head_band_wrk', name: '땀밴드 플라이', type: 'head', price: 520, icon: '🎽', desc: '[1종 집중형] 활동량을 끌어올리는 헤어밴드.', baseStats: {wrk: 1}, baseGrowth: {wrk: 15} },
{ id: 'handL_gk_pro', name: '슈퍼세이브 글러브 [좌]', type: 'handL', price: 740, icon: '🥅', desc: '[2종 복합형] 골레이로 전용 그립과 반사.', baseStats: {ref: 1, cmp: 1}, baseGrowth: {ref: 12, cmp: 8} },
{ id: 'handR_gk_pro', name: '슈퍼세이브 글러브 [우]', type: 'handR', price: 740, icon: '🥅', desc: '[2종 복합형] 펀칭과 볼배급.', baseStats: {ref: 1, dis: 1}, baseGrowth: {ref: 12, dis: 8} },
{ id: 'head_cap_int', name: '리딩 캡', type: 'head', price: 550, icon: '🧢', desc: '[2종 복합형] 패스 길과 가로채기를 읽습니다.', baseStats: {int: 1, pst: 1}, baseGrowth: {int: 10, pst: 10} },
{ id: 'footL_ctrl', name: '터치 마스터 [좌]', type: 'footL', price: 600, icon: '🩰', desc: '[2종 복합형] 드리블과 슈팅 터치.', baseStats: {dri: 1, sho: 1}, baseGrowth: {dri: 10, sho: 10} },
{ id: 'footR_engine', name: '엔진 부츠 [우]', type: 'footR', price: 600, icon: '⚙️', desc: '[2종 복합형] 속력과 활동량.', baseStats: {pac: 1, wrk: 1}, baseGrowth: {pac: 10, wrk: 10} },

{ id: 'skin_m1', name: '기본 스킨: 그린 스파이크', type: 'skin', price: 0, icon: '💚', gender: 'M', desc: '[무료] 남학생 기본 3종 ① 증명사진 비율.', faceImageUrl: 'faces/skin-m1.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_m2', name: '기본 스킨: 네이비 사이드', type: 'skin', price: 0, icon: '💙', gender: 'M', desc: '[무료] 남학생 기본 3종 ② 증명사진 비율.', faceImageUrl: 'faces/skin-m2.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_m3', name: '기본 스킨: 크림슨 실버', type: 'skin', price: 0, icon: '❤️', gender: 'M', desc: '[무료] 남학생 기본 3종 ③ 증명사진 비율.', faceImageUrl: 'faces/skin-m3.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_f1', name: '기본 스킨: 퍼플 포니', type: 'skin', price: 0, icon: '💜', gender: 'F', desc: '[무료] 여학생 기본 3종 ① 증명사진 비율.', faceImageUrl: 'faces/skin-f1.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_f2', name: '기본 스킨: 민트 보브', type: 'skin', price: 0, icon: '💚', gender: 'F', desc: '[무료] 여학생 기본 3종 ② 증명사진 비율.', faceImageUrl: 'faces/skin-f2.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_f3', name: '기본 스킨: 코랄 헤드밴드', type: 'skin', price: 0, icon: '🧡', gender: 'F', desc: '[무료] 여학생 기본 3종 ③ 증명사진 비율.', faceImageUrl: 'faces/skin-f3.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_hero_m', name: '히어로 스킨: 클로즈업 남', type: 'skin', price: 600, icon: '⚡', desc: '[유료] 경기 직전 클로즈업 연출 (남).', faceImageUrl: 'faces/sfc-manga-boy.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_hero_f', name: '히어로 스킨: 클로즈업 여', type: 'skin', price: 600, icon: '✨', desc: '[유료] 경기 직전 클로즈업 연출 (여).', faceImageUrl: 'faces/sfc-manga-girl.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_close_m1', name: '클로즈업: 레드 스파이크 (남)', type: 'skin', price: 650, icon: '⚡', gender: 'M', desc: '[유료] 경기 직전 클로즈업. 빨간 홈킷.', faceImageUrl: 'faces/closeup-m1.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_close_m2', name: '클로즈업: 블루 사이드 (남)', type: 'skin', price: 650, icon: '⚡', gender: 'M', desc: '[유료] 경기 직전 클로즈업. 파란 킷.', faceImageUrl: 'faces/closeup-m2.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_close_m3', name: '클로즈업: 화이트 라이트닝 (남)', type: 'skin', price: 680, icon: '⚡', gender: 'M', desc: '[유료] 경기 직전 클로즈업. 흰 어웨이킷.', faceImageUrl: 'faces/closeup-m3.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_close_m4', name: '클로즈업: 나이트 실버 (남)', type: 'skin', price: 720, icon: '⚡', gender: 'M', desc: '[유료] 경기 직전 클로즈업. 블랙 킷.', faceImageUrl: 'faces/closeup-m4.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_close_m5', name: '클로즈업: 선셋 파이어 (남)', type: 'skin', price: 700, icon: '⚡', gender: 'M', desc: '[유료] 경기 직전 클로즈업. 오렌지 킷.', faceImageUrl: 'faces/closeup-m5.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_close_f1', name: '클로즈업: 마젠타 포니 (여)', type: 'skin', price: 650, icon: '✨', gender: 'F', desc: '[유료] 경기 직전 클로즈업. 마젠타 킷.', faceImageUrl: 'faces/closeup-f1.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_close_f2', name: '클로즈업: 스카이 트윈 (여)', type: 'skin', price: 650, icon: '✨', gender: 'F', desc: '[유료] 경기 직전 클로즈업. 스카이 킷.', faceImageUrl: 'faces/closeup-f2.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_close_f3', name: '클로즈업: 골드 보브 (여)', type: 'skin', price: 680, icon: '✨', gender: 'F', desc: '[유료] 경기 직전 클로즈업. 골드 킷.', faceImageUrl: 'faces/closeup-f3.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_close_f4', name: '클로즈업: 에메랄드 사이드 (여)', type: 'skin', price: 700, icon: '✨', gender: 'F', desc: '[유료] 경기 직전 클로즈업. 초록 킷.', faceImageUrl: 'faces/closeup-f4.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_close_f5', name: '클로즈업: 크림슨 헤드밴드 (여)', type: 'skin', price: 720, icon: '✨', gender: 'F', desc: '[유료] 경기 직전 클로즈업. 흰·빨강 킷.', faceImageUrl: 'faces/closeup-f5.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_m4', name: '킷 스킨: 골드 홈 (남)', type: 'skin', price: 510, icon: '💛', gender: 'M', desc: '[유료] 노란 홈킷 · 증명사진 비율.', faceImageUrl: 'faces/skin-m4.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_m5', name: '킷 스킨: 화이트 어웨이 (남)', type: 'skin', price: 510, icon: '🤍', gender: 'M', desc: '[유료] 흰 어웨이킷 · 증명사진 비율.', faceImageUrl: 'faces/skin-m5.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_f4', name: '킷 스킨: 레드 스트라이프 (여)', type: 'skin', price: 510, icon: '❤️', gender: 'F', desc: '[유료] 빨간 홈킷 · 증명사진 비율.', faceImageUrl: 'faces/skin-f4.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'skin_f5', name: '킷 스킨: 민트 어웨이 (여)', type: 'skin', price: 510, icon: '💚', gender: 'F', desc: '[유료] 민트 어웨이킷 · 증명사진 비율.', faceImageUrl: 'faces/skin-f5.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'kit_emerald', name: '카드 킷: 에메랄드 피치', type: 'kit', price: 520, icon: '🌿', kitClass: 'card-skin-emerald', desc: '[킷] 카드에 초록 스포트라이트.', baseStats: {}, baseGrowth: {} },
{ id: 'kit_gold', name: '카드 킷: 골든 포일', type: 'kit', price: 580, icon: '🥇', kitClass: 'card-skin-gold', desc: '[킷] 금박 포일 테두리.', baseStats: {}, baseGrowth: {} },
{ id: 'kit_crimson', name: '카드 킷: 크림슨 플레어', type: 'kit', price: 550, icon: '🔥', kitClass: 'card-skin-crimson', desc: '[킷] 레드 플레어 아우라.', baseStats: {}, baseGrowth: {} },
{ id: 'kit_midnight', name: '카드 킷: 미드나잇', type: 'kit', price: 540, icon: '🌙', kitClass: 'card-skin-midnight', desc: '[킷] 야간 경기 조명.', baseStats: {}, baseGrowth: {} },
{ id: 'kit_sakura', name: '카드 킷: 사쿠라', type: 'kit', price: 560, icon: '🌸', kitClass: 'card-skin-sakura', desc: '[킷] 핑크 하이라이트.', baseStats: {}, baseGrowth: {} },
{ id: 'kit_ice', name: '카드 킷: 아이스 블루', type: 'kit', price: 540, icon: '❄️', kitClass: 'card-skin-ice', desc: '[킷] 냉정한 블루 글로우.', baseStats: {}, baseGrowth: {} },
{ id: 'kit_sun', name: '카드 킷: 선샤인', type: 'kit', price: 530, icon: '☀️', kitClass: 'card-skin-sun', desc: '[킷] 밝은 햇살 골드.', baseStats: {}, baseGrowth: {} },
{ id: 'kit_void', name: '카드 킷: 보이드', type: 'kit', price: 570, icon: '🖤', kitClass: 'card-skin-void', desc: '[킷] 검은 보이드 테두리.', baseStats: {}, baseGrowth: {} },

// 얼굴 프레임: 장착 시 선수 카드/라커 아바타에 레전드·컨셉 이미지 표시 (스탯 보너스 없음) — 위키 URL은 Commons 직접 경로(404 방지)
{ id: 'face_legend_buffon', name: '레전드 얼굴: 부폰 (GK)', type: 'face', price: 620, icon: '🥅', desc: '[골키퍼] 이탈리아 전설 골키퍼 잔루이지 부폰.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/5f/Gianluigi_Buffon_%282014%29.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_neuer', name: '레전드 얼굴: 노이어 (GK)', type: 'face', price: 640, icon: '🧤', desc: '[골키퍼] 스위퍼 키퍼의 대명사, 마누엘 노이어.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/85/Manuel_Neuer%2C_Germany_national_football_team_%2804%29.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_maldini', name: '레전드 얼굴: 말디니 (DF)', type: 'face', price: 720, icon: '🛡️', desc: '[수비] 밀란의 영원한 캡틴, 파올로 말디니.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/38/Paolo_Maldini_2009.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_beckenbauer', name: '레전드 얼굴: 베켄바워 (DF)', type: 'face', price: 760, icon: '👑', desc: '[수비] 프리 키퍼의 창시자, 프란츠 베켄바워.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/56/Franz_Beckenbauer_%281975%29.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_modric', name: '레전드 얼굴: 모드리치 (MF)', type: 'face', price: 660, icon: '⚡', desc: '[미드] 발롱도르 미드필더, 루카 모드리치.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/55/Luka_Modri%C4%87_in_2018.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_iniesta', name: '레전드 얼굴: 이니에스타 (MF)', type: 'face', price: 680, icon: '🎻', desc: '[미드] 바르사의 마에스트로, 안드레스 이니에스타.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/eb/Andres_Iniesta_2018.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_zidane', name: '레전드 얼굴: 지단 (MF)', type: 'face', price: 740, icon: '✨', desc: '[미드] 우아한 플레이메이커, 지네딘 지단.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a0/Zinedine_Zidane_2018.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_pele', name: '레전드 얼굴: 펠레 (FW)', type: 'face', price: 700, icon: '⚽', desc: '[공격] 브라질의 황제, 펠레.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/88/Pele_celebrating_1970_%28cropped%29.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_ronaldo', name: '레전드 얼굴: 호나우두 (FW)', type: 'face', price: 780, icon: '🔥', desc: '[공격] 엘 프레노메노, 호나우두.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/dc/Ronaldo_%28brazil%29_%28cropped%29.JPG', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_messi', name: '레전드 얼굴: 메시 (FW)', type: 'face', price: 800, icon: '🐐', desc: '[공격] 아르헨티나의 전설, 리오넬 메시.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/b4/Lionel-Messi-Argentina-2022-FIFA-World-Cup_%28cropped%29.jpg', baseStats: {}, baseGrowth: {} },

// 여학생 추천: Dicebear 9 lorelei + 원형·그라데이션 배경 (무대 조명 느낌)
{ id: 'face_idol_rose', name: '스포트라이트 얼굴: 로즈 무대', type: 'face', price: 660, icon: '💗', desc: '[컨셉] 핑크 스포트라이트·로맨틱 무대 (여학생 추천).', faceImageUrl: 'https://api.dicebear.com/9.x/lorelei/png?seed=SambongStageRose&size=256&radius=50&scale=96&backgroundType=gradientLinear&backgroundRotation=0,180,360&backgroundColor=ffb7d5,ffc9e6,ffe0ec', baseStats: {}, baseGrowth: {} },
{ id: 'face_idol_sky', name: '스포트라이트 얼굴: 스카이 무대', type: 'face', price: 680, icon: '💙', desc: '[컨셉] 시원한 블루·실버 무대 라이트.', faceImageUrl: 'https://api.dicebear.com/9.x/lorelei/png?seed=SambongStageSky&size=256&radius=50&scale=96&backgroundType=gradientLinear&backgroundRotation=0,180,360&backgroundColor=a8d8ff,c7e3ff,e0f2fe', baseStats: {}, baseGrowth: {} },
{ id: 'face_idol_peach', name: '스포트라이트 얼굴: 피치 글로우', type: 'face', price: 720, icon: '🍑', desc: '[컨셉] 코랄·피치 톤 스포트라이트.', faceImageUrl: 'https://api.dicebear.com/9.x/lorelei/png?seed=SambongStagePeach&size=256&radius=50&scale=96&backgroundType=gradientLinear&backgroundRotation=0,180,360&backgroundColor=ffd6ba,ffe4d6,fff0e6', baseStats: {}, baseGrowth: {} },
{ id: 'face_idol_mint', name: '스포트라이트 얼굴: 민트 쉬머', type: 'face', price: 640, icon: '💚', desc: '[컨셉] 청량 민트·민트 그린 무대.', faceImageUrl: 'https://api.dicebear.com/9.x/lorelei/png?seed=SambongStageMint&size=256&radius=50&scale=96&backgroundType=gradientLinear&backgroundRotation=0,180,360&backgroundColor=9fe5d7,b8f2e6,d1faf0', baseStats: {}, baseGrowth: {} },
{ id: 'face_idol_lilac', name: '스포트라이트 얼굴: 라일락 드림', type: 'face', price: 740, icon: '💜', desc: '[컨셉] 라일락·라벤더 드림 무대.', faceImageUrl: 'https://api.dicebear.com/9.x/lorelei/png?seed=SambongStageLilac&size=256&radius=50&scale=96&backgroundType=gradientLinear&backgroundRotation=0,180,360&backgroundColor=d9c9ff,e9d5ff,f3e8ff', baseStats: {}, baseGrowth: {} },
];

export const LOCKER_POS_ORDER = ['Goleiro', 'Fixo', 'Ala', 'Pivo', '미정'];
export const LOCKER_POS_HEAD = { Goleiro: '골레이로 (GK)', Fixo: '픽소 (DF)', Ala: '아라 (MF)', Pivo: '피보 (FW)', '미정': '포지션 미정' };
export const SHOP_GEAR_TYPES = ['head', 'handL', 'handR', 'footL', 'footR'];
export const SHOP_SKIN_TYPES = ['skin', 'kit'];
/** 모의경기·팀 분류표의 팀 (최대 6팀). Firestore simTeam 값은 key('A'~'F') */
export const SIM_TEAMS = [
  { key: 'A', pick: 'peer-checked:bg-red-600 peer-checked:border-red-400', name: '레드팀', short: '레드', text: 'text-red-300', head: 'text-red-400', zone: 'border-red-800/50 bg-red-950/30', chip: 'bg-red-600 border-red-400', dot: 'bg-red-500', bar: 'border-t-red-500', hex: '#ef4444' },
  { key: 'B', pick: 'peer-checked:bg-blue-600 peer-checked:border-blue-400', name: '블루팀', short: '블루', text: 'text-blue-300', head: 'text-blue-400', zone: 'border-blue-800/50 bg-blue-950/30', chip: 'bg-blue-600 border-blue-400', dot: 'bg-blue-500', bar: 'border-t-blue-500', hex: '#3b82f6' },
  { key: 'C', pick: 'peer-checked:bg-emerald-600 peer-checked:border-emerald-400', name: '그린팀', short: '그린', text: 'text-emerald-300', head: 'text-emerald-400', zone: 'border-emerald-800/50 bg-emerald-950/30', chip: 'bg-emerald-600 border-emerald-400', dot: 'bg-emerald-500', bar: 'border-t-emerald-500', hex: '#10b981' },
  { key: 'D', pick: 'peer-checked:bg-yellow-500 peer-checked:border-yellow-300 peer-checked:!text-slate-900', name: '옐로팀', short: '옐로', text: 'text-yellow-200', head: 'text-yellow-300', zone: 'border-yellow-700/50 bg-yellow-950/25', chip: 'bg-yellow-500 border-yellow-300 text-slate-900', dot: 'bg-yellow-400', bar: 'border-t-yellow-400', hex: '#facc15' },
  { key: 'E', pick: 'peer-checked:bg-purple-600 peer-checked:border-purple-400', name: '퍼플팀', short: '퍼플', text: 'text-purple-300', head: 'text-purple-400', zone: 'border-purple-800/50 bg-purple-950/30', chip: 'bg-purple-600 border-purple-400', dot: 'bg-purple-500', bar: 'border-t-purple-500', hex: '#a855f7' },
  { key: 'F', pick: 'peer-checked:bg-orange-600 peer-checked:border-orange-400', name: '오렌지팀', short: '오렌지', text: 'text-orange-300', head: 'text-orange-400', zone: 'border-orange-800/50 bg-orange-950/30', chip: 'bg-orange-600 border-orange-400', dot: 'bg-orange-500', bar: 'border-t-orange-500', hex: '#f97316' },
];
export const SIM_TEAM_KEYS = SIM_TEAMS.map((t) => t.key);
export const isSimTeamKey = (k) => SIM_TEAM_KEYS.includes(k);
export const simTeamInfo = (k) => SIM_TEAMS.find((t) => t.key === k) || SIM_TEAMS[0];
/** 한 팀 최대 인원 (풋살 5명 + 교체) */
export const MAX_SIM_TEAM_SIZE = 12;
/** 예전 이름 (중계 기본값) */
export const SIM_TEAM_A_NAME = '레드팀';
export const SIM_TEAM_B_NAME = '블루팀';
