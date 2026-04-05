import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, writeBatch, getDocs, deleteDoc, deleteField } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import confetti from 'canvas-confetti';

// Vite 빌드 시 .env의 VITE_APP_ID 사용, 없으면 기본값 (기존 단일 HTML과 동일)
const appId = import.meta.env.VITE_APP_ID || (typeof globalThis.__app_id !== 'undefined' ? globalThis.__app_id : 'sambong-futsal-ultimate'); 

const INITIAL_PLAYERS = [
'김단엘', '김다래', '김라희', '김민지', '김사랑비', '김지훈', '노승희', '박소담', '박소윤', '박준수', '박하율', '박현수', '백시율', 
'석서영', '이가온', '이동해', '이시형', '이예주', '이준용', '이지안', '인시진', '임은영', '정의영', '정의정', '조이담', '최윤희', '함인솔', '황주하', '황훈태', '황혜민', '황혜윤'
];

let ALLOWED_PLAYERS = [...INITIAL_PLAYERS];

const getSafeDocId = (name) => {
if (!name) return 'unknown';
if(name === 'gm1' || name === 'gm2') return name;
return String(name).replace(/[^가-힣a-zA-Z0-9]/g, ''); 
};

const GENDER_MAP = {
'김단엘': 'M', '김다래': 'F', '김라희': 'F', '김민지': 'F', '김사랑비': 'F', '김지훈': 'M', '노승희': 'F', '박소담': 'M', '박소윤': 'F', '박준수': 'M', '박하율': 'F', '박현수': 'M', '백시율': 'M', 
'석서영': 'F', '이가온': 'F', '이동해': 'M', '이시형': 'M', '이예주': 'F', '이준용': 'M', '이지안': 'F', '인시진': 'M', '임은영': 'F', '정의영': 'M', '정의정': 'M', '조이담': 'M', '최윤희': 'F', '함인솔': 'F', '황주하': 'M', '황훈태': 'M', '황혜민': 'F', '황혜윤': 'F'
};

const POS_KR = { 'Pivo': '피보(FW)', 'Ala': '아라(MF)', 'Fixo': '픽소(DF)', 'Goleiro': '골레이로(GK)', '미정': '포지션 미정' };
const STAT_NAMES = { pac:'속력 (PAC)', sho:'슈팅 (SHO)', pas:'패스 (PAS)', dri:'드리블 (DRI)', def:'수비 (DEF)', phy:'피지컬 (PHY)', ref:'반사신경 (REF)', int:'가로채기 (INT)', pst:'위치선정 (PST)', dis:'볼배급 (DIS)', cmp:'평정심 (CMP)', wrk:'활동량 (WRK)' };

const POS_WEIGHTS = {
'Goleiro': { core: ['ref', 'dis', 'pst'], sub: ['cmp', 'phy'], coreW: 0.70, subW: 0.25, etcW: 0.05 },
'Fixo': { core: ['def', 'int', 'phy', 'pas'], sub: ['pst', 'wrk'], coreW: 0.70, subW: 0.25, etcW: 0.05 },
'Ala': { core: ['pac', 'dri', 'pas', 'wrk'], sub: ['int', 'sho'], coreW: 0.70, subW: 0.25, etcW: 0.05 },
'Pivo': { core: ['sho', 'pst', 'cmp', 'phy'], sub: ['pac', 'dri'], coreW: 0.70, subW: 0.25, etcW: 0.05 },
'미정': { core: [], sub: [], coreW: 0, subW: 0, etcW: 1.0 }
};

const STAT_DESC = {
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

window.customAlert = (m) => new Promise(r => {
const d = document.createElement('div'); d.className = "fixed inset-0 z-[6000] flex items-center justify-center bg-black/80 px-4";
d.innerHTML = `<div class="bg-pitch-panel p-6 sm:p-8 rounded-3xl border-2 border-fut-gold max-w-sm w-full text-center space-y-4 shadow-2xl"><h3 class="text-xl font-display text-white">알림</h3><p class="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed break-keep">${m}</p><button id="bOk" class="bg-fut-gold text-slate-900 font-bold py-2.5 px-8 rounded-xl w-full hover:bg-yellow-400 transition mt-4">확인</button></div>`;
document.body.appendChild(d); document.getElementById('bOk').onclick = () => { d.remove(); r(true); };
});

window.customConfirm = (m) => new Promise(r => {
const d = document.createElement('div'); d.className = "fixed inset-0 z-[6000] flex items-center justify-center bg-black/80 px-4";
d.innerHTML = `<div class="bg-pitch-panel p-6 sm:p-8 rounded-3xl border-2 border-fut-gold max-w-sm w-full text-center space-y-4 shadow-2xl"><h3 class="text-xl font-display text-white">확인</h3><p class="text-sm text-slate-300 whitespace-pre-wrap">${m}</p><div class="flex gap-3 mt-6"><button id="bNo" class="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2.5 rounded-xl w-full transition">취소</button><button id="bYes" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl w-full transition">진행</button></div></div>`;
document.body.appendChild(d); document.getElementById('bYes').onclick = () => { d.remove(); r(true); }; document.getElementById('bNo').onclick = () => { d.remove(); r(false); };
});

const checkAuthReady = () => {
if (!auth || !auth.currentUser) {
throw new Error("서버와의 연결이 끊어졌거나 인증되지 않았습니다. 새로고침 해주세요.");
}
};

window.showStatDesc = (statKey) => {
const pId = window.selectedPlayerId;
const p = window.allPlayersData.find(x => x.id === pId);
let growthText = '';
if(p) {
const bonus = getBonusStats(p);
const baseChance = 10;
const itemGrowth = bonus.growth[statKey] || 0;
const totalChance = baseChance + itemGrowth;
growthText = `\n\n-----------------------------\n🌱 [현재 스탯 성장 확률: ${totalChance}%]\n(기본 10% ${itemGrowth > 0 ? `+ 장비 보너스 ${itemGrowth}%` : ''})`;
}
window.customAlert(`[${STAT_NAMES[statKey]}]\n\n${STAT_DESC[statKey]}${growthText}`);
};

function setupLoginFormDom() {
const nameSelect = document.getElementById('loginPlayerName');
if(nameSelect) {
ALLOWED_PLAYERS.forEach(name => {
const opt = document.createElement('option'); opt.value = name; opt.innerText = name; nameSelect.appendChild(opt);
});
}

const loginIdSelect = document.getElementById('loginId');
const nameInputContainer = document.getElementById('playerNameInputContainer');
if(loginIdSelect && nameInputContainer) {
loginIdSelect.addEventListener('change', (e) => {
if(e.target.value === 'player') {
nameInputContainer.classList.remove('hidden');
} else {
nameInputContainer.classList.add('hidden');
}
});
}
}
if (document.readyState === 'loading') {
window.addEventListener('DOMContentLoaded', setupLoginFormDom);
} else {
setupLoginFormDom();
}

const DAILY_TIPS = [
{ title: "풋살과 축구의 가장 큰 차이점?", img: "⚽", category: "기본상식", desc: "풋살은 5인제 실내 축구입니다. 공이 밖으로 나가면 손으로 던지는 스로인이 아닌 '발로 차서 넣는 킥인'을 합니다!" },
{ title: "가장 중요한 '4초 룰'을 아시나요?", img: "⏱️", category: "기본규칙", desc: "킥인, 코너킥, 프리킥, 골클리어런스(골키퍼가 공을 던질 때)는 모두 공을 잡은 후 '4초' 안에 처리해야 합니다. 속도감이 생명이죠!" },
{ title: "거리 두기 5미터 원칙", img: "📏", category: "기본규칙", desc: "킥인, 코너킥, 프리킥 상황에서 수비수는 공으로부터 무조건 5미터 이상 떨어져 있어야 합니다. 방해하면 경고를 받을 수 있어요." },
{ title: "선수 교체는 무제한!", img: "🔄", category: "기본규칙", desc: "축구와 달리 풋살은 선수 교체 횟수에 제한이 없고, 언제든 코치의 지시로 교체 구역을 통해 자유롭게 들어오고 나갈 수 있습니다." }
];

const ACHIEVEMENTS = [
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
{ id: 'goleiro_high', category: '골레이로(GK)', title: '삼봉의 야신', desc: '누적 150세이브 달성. 누구도 그의 골문을 뚫을 수 없습니다!', reqKey: 'saves', reqValue: 150, icon: '🐙', color: 'text-orange-600', bg: 'bg-orange-600', reward: 150 }
];

const ENHANCE_LEVELS = [
{ level: 0, chance: 100, statPlus: 0, growthMult: 1.0, css: 'eff-0', text: '+0', color: 'text-slate-400' },
{ level: 1, chance: 100, statPlus: 1, growthMult: 1.1, css: 'eff-1', text: '+1', color: 'text-white' },
{ level: 2, chance: 80,  statPlus: 2, growthMult: 1.2, css: 'eff-2', text: '+2', color: 'text-blue-400' },
{ level: 3, chance: 50,  statPlus: 4, growthMult: 1.5, css: 'eff-3', text: '+3', color: 'text-purple-400' },
{ level: 4, chance: 20,  statPlus: 7, growthMult: 2.0, css: 'eff-4', text: '+4', color: 'text-yellow-400' },
{ level: 5, chance: 10,  statPlus: 12, growthMult: 3.0, css: 'eff-5', text: '+5 MAX', color: 'text-red-400 drop-shadow-[0_0_5px_red]' }
];

const SHOP_ITEMS = [
{ id: 'head_tier1', name: '시야 확장 고글', type: 'head', price: 150, icon: '🥽', desc: '[1종 집중형] 공간 지각력을 높입니다.', baseStats: {pst: 1}, baseGrowth: {pst: 15} },
{ id: 'head_tier2', name: '와이드 비전 헤드밴드', type: 'head', price: 300, icon: '🪢', desc: '[2종 복합형] 패스 길을 읽는 헤드밴드.', baseStats: {pst: 1, pas: 1}, baseGrowth: {pst: 10, pas: 10} },
{ id: 'head_tier3', name: '삼봉 마스터 헬멧', type: 'head', price: 800, icon: '🪖', desc: '[3종 올라운더] 최상급 수비지휘 헬멧.', baseStats: {cmp: 1, dis: 1, def: 1}, baseGrowth: {cmp: 7, dis: 7, def: 7} },
{ id: 'handL_tier1', name: '라텍스 그립 장갑 [좌]', type: 'handL', price: 150, icon: '🧤', desc: '[1종 집중형] 반사신경을 극대화.', baseStats: {ref: 1}, baseGrowth: {ref: 15} },
{ id: 'handL_tier2', name: '테크니컬 암 슬리브 [좌]', type: 'handL', price: 300, icon: '🦾', desc: '[2종 복합형] 거친 몸싸움을 버티는 슬리브.', baseStats: {phy: 1, wrk: 1}, baseGrowth: {phy: 10, wrk: 10} },
{ id: 'handL_tier3', name: '전설의 황금 완장 [좌]', type: 'handL', price: 800, icon: '🎗️', desc: '[3종 올라운더] 팀을 이끄는 주장의 완장.', baseStats: {pas: 1, cmp: 1, wrk: 1}, baseGrowth: {pas: 7, cmp: 7, wrk: 7} },
{ id: 'handR_tier1', name: '거미줄 그립 장갑 [우]', type: 'handR', price: 150, icon: '🧤', desc: '[1종 집중형] 펀칭과 캐칭 능력 극대화.', baseStats: {ref: 1}, baseGrowth: {ref: 15} },
{ id: 'handR_tier2', name: '밸런스 암 슬리브 [우]', type: 'handR', price: 300, icon: '🦾', desc: '[2종 복합형] 흔들림 없는 피지컬 유지.', baseStats: {phy: 1, wrk: 1}, baseGrowth: {phy: 10, wrk: 10} },
{ id: 'handR_tier3', name: '명장의 호루라기 [우]', type: 'handR', price: 800, icon: '🏅', desc: '[3종 올라운더] 필드의 감독이 되어 조율.', baseStats: {dis: 1, int: 1, def: 1}, baseGrowth: {dis: 7, int: 7, def: 7} },
{ id: 'footL_tier1', name: '경량화 카본 풋살화 [좌]', type: 'footL', price: 150, icon: '👟', desc: '[1종 집중형] 폭발적인 스피드.', baseStats: {pac: 1}, baseGrowth: {pac: 15} },
{ id: 'footL_tier1_alt', name: '파워 임팩트 풋살화 [좌]', type: 'footL', price: 150, icon: '🥾', desc: '[1종 집중형] 대포알 슈팅 장착.', baseStats: {sho: 1}, baseGrowth: {sho: 15} },
{ id: 'footL_tier2', name: '마에스트로 풋살화 [좌]', type: 'footL', price: 300, icon: '👞', desc: '[2종 복합형] 우아한 드리블과 패스.', baseStats: {dri: 1, pas: 1}, baseGrowth: {dri: 10, pas: 10} },
{ id: 'footR_tier1', name: '강철 발목 보호대 [우]', type: 'footR', price: 150, icon: '🧦', desc: '[1종 집중형] 정확한 가로채기 타이밍.', baseStats: {int: 1}, baseGrowth: {int: 15} },
{ id: 'footR_tier1_alt', name: '터프 태클 풋살화 [우]', type: 'footR', price: 150, icon: '🥾', desc: '[1종 집중형] 끈질긴 대인 수비 전용.', baseStats: {def: 1}, baseGrowth: {def: 15} },
{ id: 'footR_tier2', name: '팬텀 드리블러 풋살화 [우]', type: 'footR', price: 300, icon: '👟', desc: '[2종 복합형] 보이지 않는 발놀림.', baseStats: {dri: 1, pac: 1}, baseGrowth: {dri: 10, pac: 10} },

// 얼굴 프레임: 장착 시 선수 카드/라커 아바타에 레전드·컨셉 이미지 표시 (스탯 보너스 없음) — 위키 URL은 Commons 직접 경로(404 방지)
{ id: 'face_legend_buffon', name: '레전드 얼굴: 부폰 (GK)', type: 'face', price: 300, icon: '🥅', desc: '[골키퍼] 이탈리아 전설 골키퍼 잔루이지 부폰.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/5f/Gianluigi_Buffon_%282014%29.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_neuer', name: '레전드 얼굴: 노이어 (GK)', type: 'face', price: 320, icon: '🧤', desc: '[골키퍼] 스위퍼 키퍼의 대명사, 마누엘 노이어.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/85/Manuel_Neuer%2C_Germany_national_football_team_%2804%29.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_maldini', name: '레전드 얼굴: 말디니 (DF)', type: 'face', price: 400, icon: '🛡️', desc: '[수비] 밀란의 영원한 캡틴, 파올로 말디니.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/38/Paolo_Maldini_2009.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_beckenbauer', name: '레전드 얼굴: 베켄바워 (DF)', type: 'face', price: 450, icon: '👑', desc: '[수비] 프리 키퍼의 창시자, 프란츠 베켄바워.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/56/Franz_Beckenbauer_%281975%29.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_modric', name: '레전드 얼굴: 모드리치 (MF)', type: 'face', price: 350, icon: '⚡', desc: '[미드] 발롱도르 미드필더, 루카 모드리치.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/55/Luka_Modri%C4%87_in_2018.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_iniesta', name: '레전드 얼굴: 이니에스타 (MF)', type: 'face', price: 380, icon: '🎻', desc: '[미드] 바르사의 마에스트로, 안드레스 이니에스타.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/eb/Andres_Iniesta_2018.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_zidane', name: '레전드 얼굴: 지단 (MF)', type: 'face', price: 420, icon: '✨', desc: '[미드] 우아한 플레이메이커, 지네딘 지단.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a0/Zinedine_Zidane_2018.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_pele', name: '레전드 얼굴: 펠레 (FW)', type: 'face', price: 390, icon: '⚽', desc: '[공격] 브라질의 황제, 펠레.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/88/Pele_celebrating_1970_%28cropped%29.jpg', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_ronaldo', name: '레전드 얼굴: 호나우두 (FW)', type: 'face', price: 480, icon: '🔥', desc: '[공격] 엘 프레노메노, 호나우두.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/dc/Ronaldo_%28brazil%29_%28cropped%29.JPG', baseStats: {}, baseGrowth: {} },
{ id: 'face_legend_messi', name: '레전드 얼굴: 메시 (FW)', type: 'face', price: 500, icon: '🐐', desc: '[공격] 아르헨티나의 전설, 리오넬 메시.', faceImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/b4/Lionel-Messi-Argentina-2022-FIFA-World-Cup_%28cropped%29.jpg', baseStats: {}, baseGrowth: {} },

// 여학생 추천: Dicebear 9 lorelei + 원형·그라데이션 배경 (무대 조명 느낌)
{ id: 'face_idol_rose', name: '스포트라이트 얼굴: 로즈 무대', type: 'face', price: 350, icon: '💗', desc: '[컨셉] 핑크 스포트라이트·로맨틱 무대 (여학생 추천).', faceImageUrl: 'https://api.dicebear.com/9.x/lorelei/png?seed=SambongStageRose&size=256&radius=50&scale=96&backgroundType=gradientLinear&backgroundRotation=0,180,360&backgroundColor=ffb7d5,ffc9e6,ffe0ec', baseStats: {}, baseGrowth: {} },
{ id: 'face_idol_sky', name: '스포트라이트 얼굴: 스카이 무대', type: 'face', price: 380, icon: '💙', desc: '[컨셉] 시원한 블루·실버 무대 라이트.', faceImageUrl: 'https://api.dicebear.com/9.x/lorelei/png?seed=SambongStageSky&size=256&radius=50&scale=96&backgroundType=gradientLinear&backgroundRotation=0,180,360&backgroundColor=a8d8ff,c7e3ff,e0f2fe', baseStats: {}, baseGrowth: {} },
{ id: 'face_idol_peach', name: '스포트라이트 얼굴: 피치 글로우', type: 'face', price: 400, icon: '🍑', desc: '[컨셉] 코랄·피치 톤 스포트라이트.', faceImageUrl: 'https://api.dicebear.com/9.x/lorelei/png?seed=SambongStagePeach&size=256&radius=50&scale=96&backgroundType=gradientLinear&backgroundRotation=0,180,360&backgroundColor=ffd6ba,ffe4d6,fff0e6', baseStats: {}, baseGrowth: {} },
{ id: 'face_idol_mint', name: '스포트라이트 얼굴: 민트 쉬머', type: 'face', price: 320, icon: '💚', desc: '[컨셉] 청량 민트·민트 그린 무대.', faceImageUrl: 'https://api.dicebear.com/9.x/lorelei/png?seed=SambongStageMint&size=256&radius=50&scale=96&backgroundType=gradientLinear&backgroundRotation=0,180,360&backgroundColor=9fe5d7,b8f2e6,d1faf0', baseStats: {}, baseGrowth: {} },
{ id: 'face_idol_lilac', name: '스포트라이트 얼굴: 라일락 드림', type: 'face', price: 420, icon: '💜', desc: '[컨셉] 라일락·라벤더 드림 무대.', faceImageUrl: 'https://api.dicebear.com/9.x/lorelei/png?seed=SambongStageLilac&size=256&radius=50&scale=96&backgroundType=gradientLinear&backgroundRotation=0,180,360&backgroundColor=d9c9ff,e9d5ff,f3e8ff', baseStats: {}, baseGrowth: {} },
];

window.playerState = { id: '', isGM: false, isGuest: false, name: '', inventory: [], itemLevels: {}, equipHead: null, equipHandL: null, equipHandR: null, equipFootL: null, equipFootR: null, equipFace: null };
window.allPlayersData = [];
window.checkedInPlayers = new Set();
window.selectedPlayerId = null;
window.targetTeamCount = 2; 
window.compareTargetId = null;
window.currentSortKey = 'ovr';

let db, auth, storage;

const isVisible = (id) => {
const el = document.getElementById(id);
return el && !el.classList.contains('hidden');
};

const getBonusStats = (p) => {
let flat = { pac: 0, sho: 0, pas: 0, dri: 0, def: 0, phy: 0, ref: 0, int: 0, pst: 0, dis: 0, cmp: 0, wrk: 0 };
let growth = { pac: 0, sho: 0, pas: 0, dri: 0, def: 0, phy: 0, ref: 0, int: 0, pst: 0, dis: 0, cmp: 0, wrk: 0 };

const equippedIds = [p.equipHead, p.equipHandL, p.equipHandR, p.equipFootL, p.equipFootR].filter(Boolean);
equippedIds.forEach(itemId => {
const item = SHOP_ITEMS.find(x => x.id === itemId);
const level = (p.itemLevels && typeof p.itemLevels === 'object' && !Array.isArray(p.itemLevels) && p.itemLevels[itemId]) ? Number(p.itemLevels[itemId]) : 0;
const enhData = ENHANCE_LEVELS[level] || ENHANCE_LEVELS[0];

if (item) {
for (const [key, baseVal] of Object.entries(item.baseStats || {})) { flat[key] += baseVal + enhData.statPlus; }
for (const [key, baseGrow] of Object.entries(item.baseGrowth || {})) { growth[key] += Math.floor(baseGrow * enhData.growthMult); }
}
});
return { flat, growth };
};

const getOVRForPos = (stats, pos) => {
if (pos === '미정' || !POS_WEIGHTS[pos]) {
let sum = 0;
Object.values(stats).forEach(v => sum += v);
return Math.min(99, Math.floor(sum / 12));
}
const w = POS_WEIGHTS[pos];
let coreSum = 0, subSum = 0, etcSum = 0;
let coreCount = w.core.length, subCount = w.sub.length, etcCount = 12 - coreCount - subCount;

for (const [key, val] of Object.entries(stats)) {
if (w.core.includes(key)) coreSum += val;
else if (w.sub.includes(key)) subSum += val;
else etcSum += val;
}

const coreAvg = coreCount > 0 ? coreSum / coreCount : 0;
const subAvg = subCount > 0 ? subSum / subCount : 0;
const etcAvg = etcCount > 0 ? etcSum / etcCount : 0;

const totalOVR = (coreAvg * w.coreW) + (subAvg * w.subW) + (etcAvg * w.etcW);
return Math.min(99, Math.floor(totalOVR));
};

const getOVR = (p) => {
const b = getBonusStats(p).flat;
const stats = {
pac: (Number(p.pac)||60)+b.pac, sho: (Number(p.sho)||60)+b.sho, pas: (Number(p.pas)||60)+b.pas,
dri: (Number(p.dri)||60)+b.dri, def: (Number(p.def)||60)+b.def, phy: (Number(p.phy)||60)+b.phy,
ref: (Number(p.ref)||60)+b.ref, int: (Number(p.int)||60)+b.int, pst: (Number(p.pst)||60)+b.pst,
dis: (Number(p.dis)||60)+b.dis, cmp: (Number(p.cmp)||60)+b.cmp, wrk: (Number(p.wrk)||60)+b.wrk
};
return getOVRForPos(stats, p.pos);
};

const getTierInfo = (ovr) => {
if(ovr < 70) return { name: '루키 (ROOKIE)', class: 'tier-badge-rookie', cardClass: 'card-rookie' };
if(ovr < 80) return { name: '세미프로 (SEMI-PRO)', class: 'tier-badge-semipro', cardClass: 'card-semipro' };
if(ovr < 90) return { name: '프로 (PRO)', class: 'tier-badge-pro', cardClass: 'card-pro' };
if(ovr < 95) return { name: '월드클래스 (WORLD CLASS)', class: 'tier-badge-worldclass', cardClass: 'card-worldclass' };
return { name: '챌린저 (CHALLENGER)', class: 'tier-badge-challenger', cardClass: 'card-challenger' };
};

const getWeeklyWage = (ovr) => { return Math.max(50, Math.min(200, Math.floor(50 + ((ovr - 50) / 49) * 150))); };
const getExpNeeded = (level) => Math.floor(40 + ((Number(level) || 1) * 3));

/** 기록 취소 등: 차감분만큼 EXP에서 빼고, 부족하면 레벨을 내리며 이전 구간 필요치를 보충함 (processExp와 역연산) */
function applyExpLoss(p, totalDeduct, updatesObj) {
let lv = Number(p.level) || 1;
let ex = Number(p.exp) || 0;
let d = Number(totalDeduct) || 0;
ex -= d;
while (ex < 0 && lv > 1) {
lv--;
ex += getExpNeeded(lv);
}
if (lv < 1) lv = 1;
if (ex < 0) ex = 0;
updatesObj.level = lv;
updatesObj.exp = ex;
}

function getWeekNumber(d) {
d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
let yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
return d.getUTCFullYear() + "-W" + Math.ceil((((d - yearStart) / 86400000) + 1)/7);
}

const getPosColor = (pos) => {
if(pos === 'Pivo') return 'text-red-500'; if(pos === 'Ala') return 'text-emerald-500';
if(pos === 'Fixo') return 'text-blue-500'; if(pos === 'Goleiro') return 'text-orange-500'; 
return 'text-yellow-400 animate-pulse';
};
const getPosBg = (pos) => {
if(pos === 'Pivo') return 'bg-red-500'; if(pos === 'Ala') return 'bg-emerald-500';
if(pos === 'Fixo') return 'bg-blue-500'; if(pos === 'Goleiro') return 'bg-orange-500'; 
return 'bg-yellow-500';
};
/** 속성값 이스케이프 (img src 등) */
function escapeAttr(u) {
return String(u).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** 장착한 얼굴 아이템 → 업로드 사진 → 이모지 순으로 표시용 URL */
function getPortraitUrl(p) {
const fid = p.equipFace;
if (fid) {
const it = SHOP_ITEMS.find(x => x.id === fid && x.type === 'face' && x.faceImageUrl);
if (it && String(it.faceImageUrl).trim()) return String(it.faceImageUrl).trim();
}
return (p.facePhotoUrl || '').trim();
}

/**
 * 선수 얼굴: 얼굴 아이템(레전드/스포트라이트) > 직접 업로드 > 이모지
 * variant: locker | detail | sm | md | xl
 */
function getAvatarHtml(p, variant) {
const url = getPortraitUrl(p);
const boxes = {
locker: { img: 'w-14 h-14 min-w-[3.5rem] min-h-[3.5rem]', emoji: 'text-3xl mt-4 mb-1 drop-shadow-md inline-flex items-center justify-center' },
detail: { img: 'w-[5rem] h-[5rem] min-w-[5rem] min-h-[5rem]', emoji: 'text-[5rem] drop-shadow-xl relative z-10 mb-2 inline-flex items-center justify-center leading-none' },
sm: { img: 'w-8 h-8 min-w-[2rem] min-h-[2rem]', emoji: 'text-base sm:text-lg inline-flex items-center justify-center' },
md: { img: 'w-10 h-10 min-w-[2.5rem] min-h-[2.5rem]', emoji: 'text-2xl inline-flex items-center justify-center' },
xl: { img: 'w-16 h-16 min-w-[4rem] min-h-[4rem]', emoji: 'text-4xl drop-shadow-md mb-2 inline-flex items-center justify-center' }
};
const b = boxes[variant] || boxes.md;
if (url) {
// 위키·외부 이미지는 Referer 미전송 시 차단되는 경우가 있어 기본 정책 사용
return `<img src="${escapeAttr(url)}" alt="" class="rounded-full object-cover border-2 border-white/25 shadow-md ${b.img}" loading="lazy" decoding="async"/>`;
}
const emoji = (p.gender || GENDER_MAP[p.name]) === 'F' ? '👧' : '👦';
return `<span class="${b.emoji}">${emoji}</span>`;
}

window.switchTab = (tabId) => {
['tabWorkspace', 'tabTips', 'tabShop', 'tabAchievements', 'tabRank', 'tabCompare', 'tabSim', 'tabGuide', 'tabMaster', 'tabMasterStats'].forEach(id => {
document.getElementById(id)?.classList.add('hidden');
document.getElementById('btn' + id.charAt(0).toUpperCase() + id.slice(1))?.classList.remove('active');
});
document.getElementById(tabId)?.classList.remove('hidden');
const targetBtn = document.getElementById('btn' + tabId.charAt(0).toUpperCase() + tabId.slice(1));
if(targetBtn) { targetBtn.classList.add('active'); targetBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); }

const leftPanel = document.getElementById('leftCardPanel');
const rightPanel = document.getElementById('rightContentPanel');

if (tabId === 'tabWorkspace' || tabId === 'tabAchievements') {
leftPanel?.classList.remove('hidden', 'lg:hidden'); rightPanel?.classList.remove('lg:col-span-12'); rightPanel?.classList.add('lg:col-span-8');
} else {
leftPanel?.classList.add('hidden', 'lg:hidden'); rightPanel?.classList.remove('lg:col-span-8'); rightPanel?.classList.add('lg:col-span-12');
}

if(tabId === 'tabTips') {
renderDailyTip(); 
const gmEditor = document.getElementById('gmAnnouncementEditor');
const gmShortsEditor = document.getElementById('gmShortsEditor');
if(window.playerState.isGM) { 
gmEditor?.classList.remove('hidden'); 
gmShortsEditor?.classList.remove('hidden');
} else { 
gmEditor?.classList.add('hidden');
gmShortsEditor?.classList.add('hidden');
}
}
if(tabId === 'tabShop') window.renderShop();
if(tabId === 'tabAchievements') window.renderAchievements();
if(tabId === 'tabRank') renderLeaderboard();
if(tabId === 'tabCompare') window.renderCompareList();
if(tabId === 'tabSim') window.renderSimMatchTab();
if(tabId === 'tabMaster') renderMasterDashboard();
if(tabId === 'tabMasterStats') window.renderMasterStats();
};

function renderDailyTip() {
const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
const tipIndex = Math.floor(dayOfYear / 3) % DAILY_TIPS.length;
const tip = DAILY_TIPS[tipIndex];

const container = document.getElementById('dailyTipContainer');
if(container) {
container.innerHTML = `
             <div class="h-64 bg-slate-800 flex items-center justify-center border-b border-slate-700 relative overflow-hidden group">
                 <p class="text-[6rem] z-0 absolute drop-shadow-lg transition-transform duration-700 group-hover:scale-125">${tip.img}</p>
                 <span class="absolute top-4 left-4 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded z-20 shadow-md">${tip.category}</span>
             </div>
             <div class="p-6">
                 <h4 class="text-2xl font-display text-white mb-4 leading-tight break-keep">${tip.title}</h4>
                 <p class="text-slate-300 text-sm sm:text-base leading-relaxed break-keep font-medium">${tip.desc}</p>
             </div>
         `;
}
}

window.renderLockerRoom = () => {
const grid = document.getElementById('lockerGrid');
if(!grid) return;
let html = '';
ALLOWED_PLAYERS.forEach(name => {
const safeDocId = getSafeDocId(name);
const p = window.allPlayersData.find(x => x.id === safeDocId);

if(p) {
const isChecked = window.checkedInPlayers.has(p.id);
const isSelected = window.selectedPlayerId === p.id;
const ovr = getOVR(p); const tier = getTierInfo(ovr);
let borderClass = 'border-slate-700';
if(ovr >= 90) borderClass = 'border-purple-500'; else if (ovr >= 80) borderClass = 'border-fut-gold'; else if (ovr >= 70) borderClass = 'border-gray-300';
const posText = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정';
const st = p.simTeam;
const canSimEdit = !window.playerState.isGuest && (window.playerState.isGM || window.playerState.id === p.id);
let simRow = '';
if (canSimEdit) {
simRow = `<div class="w-full mt-1 pt-1 border-t border-slate-700/60" onclick="event.stopPropagation()"><div class="flex gap-0.5 justify-center items-center">
<button type="button" class="text-[9px] px-1.5 py-0.5 rounded font-bold ${st === 'A' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-300'} border border-slate-600" onclick="window.setPlayerSimTeam('${p.id}','A')">A</button>
<button type="button" class="text-[9px] px-1.5 py-0.5 rounded font-bold ${st === 'B' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'} border border-slate-600" onclick="window.setPlayerSimTeam('${p.id}','B')">B</button>
<button type="button" class="text-[8px] px-1 py-0.5 rounded bg-slate-900 text-slate-500 border border-slate-700" onclick="window.setPlayerSimTeam('${p.id}',null)">해제</button>
</div><p class="text-[7px] text-center text-slate-500 mt-0.5 leading-tight">모의경기 팀</p></div>`;
} else if (st === 'A' || st === 'B') {
simRow = `<div class="mt-0.5 text-[9px] font-bold ${st === 'A' ? 'text-red-400' : 'text-blue-400'}" onclick="event.stopPropagation()">모의 ${st}</div>`;
}

html += `
                     <div class="mini-card flex flex-col items-center p-2 rounded-xl bg-pitch-panel border-2 ${borderClass} cursor-pointer ${isSelected ? 'selected' : ''} ${isChecked ? 'checked-in' : 'checked-out'}" onclick="window.selectPlayer('${p.id}')">
                         <input type="checkbox" class="locker-checkbox absolute top-1.5 left-1.5 w-5 h-5 shadow-lg z-10" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); window.toggleCheck('${p.id}')">
                         <div class="absolute top-1 right-1 ${tier.class} text-[9px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">${tier.name.split(' ')[0]}</div>
                         <div class="flex items-center justify-center min-h-[3.5rem]">${getAvatarHtml(p, 'locker')}</div>
                         <div class="font-oswald text-xl font-bold leading-none text-white">${ovr}</div>
                         <div class="flex items-center gap-1 mt-1"><span class="text-[10px] font-bold ${getPosColor(p.pos)}">${posText}</span><span class="text-xs font-bold text-slate-300 truncate max-w-[50px]">${p.name}</span></div>
                         ${simRow}
                     </div>`;
} else {
html += `<div class="flex flex-col items-center justify-center p-2 rounded-xl border border-slate-800 bg-slate-900/50 opacity-50"><i class="fa-solid fa-user-lock text-xl text-slate-700 mb-2"></i><span class="text-[10px] text-slate-600">${name}</span></div>`;
}
});
grid.innerHTML = html;
};

window.toggleCheck = (pId) => {
if(window.playerState.isGuest) return window.customAlert("게스트 모드에서는 출석 체크를 할 수 없습니다.");
if(window.checkedInPlayers.has(pId)) window.checkedInPlayers.delete(pId); else window.checkedInPlayers.add(pId);
window.renderLockerRoom(); renderActivePool();
};

/** 라커룸에서 모의경기 팀 A/B 지정 (Firestore simTeam, 팀당 최대 5명) */
window.setPlayerSimTeam = async (pId, team) => {
try {
checkAuthReady();
if (window.playerState.isGuest) return window.customAlert('게스트는 모의경기 팀을 설정할 수 없습니다.');
const target = window.allPlayersData.find((x) => x.id === pId);
if (!target) return;
const canEdit = window.playerState.isGM || window.playerState.id === pId;
if (!canEdit) return window.customAlert('본인 또는 감독만 팀을 변경할 수 있습니다.');
if (team === 'A' || team === 'B') {
const n = (window.allPlayersData || []).filter((x) => x.id !== pId && x.simTeam === team).length;
if (n >= 5) return window.customAlert('해당 팀은 이미 5명입니다. 다른 팀을 선택하거나 해제 후 다시 시도하세요.');
}
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(pId));
const payload = { updatedAt: new Date().toISOString() };
if (team === 'A' || team === 'B') payload.simTeam = team;
else payload.simTeam = deleteField();
await setDoc(docRef, payload, { merge: true });
const idx = window.allPlayersData.findIndex((x) => x.id === pId);
if (idx >= 0) {
if (team === 'A' || team === 'B') window.allPlayersData[idx] = { ...window.allPlayersData[idx], simTeam: team };
else {
const copy = { ...window.allPlayersData[idx] };
delete copy.simTeam;
window.allPlayersData[idx] = copy;
}
}
window.renderLockerRoom();
if (isVisible('tabSim')) window.renderSimMatchTab();
} catch (e) {
console.error(e);
window.customAlert('모의경기 팀 설정 저장에 실패했습니다.');
}
};

window.selectPlayer = (pId) => {
window.selectedPlayerId = pId;
window.renderLockerRoom(); window.renderSelectedCard(pId);
if(isVisible('tabAchievements')) window.renderAchievements();
if(isVisible('tabShop')) window.renderShop();
if(isVisible('tabCompare')) window.renderCompareList();
if(window.innerWidth < 1024) document.getElementById('detailPanelTitle')?.scrollIntoView();
};

function renderActivePool() {
const container = document.getElementById('activePool'); if(!container) return;
document.getElementById('activeCount')?.innerText && (document.getElementById('activeCount').innerText = `${window.checkedInPlayers.size} 명`);

if(window.checkedInPlayers.size === 0) { container.innerHTML = `<span class="text-xs text-slate-600 italic">라커룸에서 선수를 체크해주세요.</span>`; return; }
let html = '';
window.checkedInPlayers.forEach(id => {
const p = window.allPlayersData.find(x => x.id === id);
if(p) html += `<div class="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs font-bold text-white flex items-center gap-1 shadow-sm"><span class="w-2 h-2 rounded-full ${getPosBg(p.pos||'Ala')}"></span>${p.name}</div>`;
});
container.innerHTML = html;
}

window.renderShop = () => {
const targetId = window.playerState.isGM ? window.selectedPlayerId : window.playerState.id;
const p = window.allPlayersData.find(x => x.id === targetId) || null;
const bong = p ? (Number(p.bong) || 0) : 0;
const inventory = (p && Array.isArray(p.inventory)) ? p.inventory : [];
const itemLevels = (p && typeof p.itemLevels === 'object' && !Array.isArray(p.itemLevels)) ? p.itemLevels : {};

document.getElementById('shopBong') && (document.getElementById('shopBong').innerText = bong);
document.getElementById('shopWalletLabel') && (document.getElementById('shopWalletLabel').innerText = window.playerState.isGM ? (p ? `[${p.name}] 선수의 자산` : `학생 미등록`) : (window.playerState.isGuest ? `게스트 자산 없음` : `내 보유 자산`));

let html = '';
SHOP_ITEMS.forEach(item => {
const isOwned = inventory.includes(item.id);
const isEquipped = p ? (p.equipHead === item.id || p.equipHandL === item.id || p.equipHandR === item.id || p.equipFootL === item.id || p.equipFootR === item.id || p.equipFace === item.id) : false;
const level = Number(itemLevels[item.id]) || 0;
const enhData = ENHANCE_LEVELS[level] || ENHANCE_LEVELS[0];
const nextEnhData = ENHANCE_LEVELS[level + 1];

let statsHtml = '';
for (const [k, v] of Object.entries(item.baseStats || {})) { statsHtml += `<span class="inline-block bg-emerald-900/50 text-emerald-300 border border-emerald-500/50 text-[9px] px-1 rounded mr-1 mb-1">${STAT_NAMES[k].split(' ')[0]} +${v + enhData.statPlus}</span>`; }
let growthHtml = '';
for (const [k, v] of Object.entries(item.baseGrowth || {})) { growthHtml += `<span class="inline-block bg-purple-900/50 text-purple-300 border border-purple-500/50 text-[9px] px-1 rounded mr-1 mb-1">성장 +${Math.floor(v * enhData.growthMult)}%</span>`; }

let btnHtml = ''; let enhanceBtnHtml = '';
if(isOwned && nextEnhData && !window.playerState.isGuest && item.type !== 'face') {
const canEnhance = bong >= item.price;
enhanceBtnHtml = `
                     <div class="mt-2 pt-2 border-t border-slate-700 w-full">
                         <button onclick="window.enhanceItem('${item.id}')" class="w-full relative overflow-hidden group ${canEnhance ? 'bg-gradient-to-r from-purple-700 to-indigo-600 hover:from-purple-600 hover:to-indigo-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'bg-slate-800 text-slate-500 cursor-not-allowed'} text-xs font-bold py-2 rounded transition-all">
                             <span class="relative z-10 flex items-center justify-center gap-2"><i class="fa-solid fa-hammer ${canEnhance ? 'animate-bounce' : ''}"></i> 강화 도전 (${item.price} B) - 성공률 ${nextEnhData.chance}%</span>
                         </button>
                     </div>`;
} else if (isOwned && !nextEnhData && item.type !== 'face') {
enhanceBtnHtml = `<div class="mt-2 pt-2 border-t border-slate-700 w-full text-center text-[10px] font-bold text-red-400">MAX LEVEL 도달</div>`;
}

if(window.playerState.isGM) {
if (!p) { btnHtml = `<button disabled class="w-full mt-2 bg-slate-800 text-slate-500 text-xs font-bold py-1.5 rounded">데이터 없음</button>`; } 
else if(isOwned) { 
btnHtml = `
                         <div class="flex gap-1 mt-2">
                             <button onclick="window.equipItem('${item.id}', '${item.type}')" class="flex-1 ${isEquipped ? 'bg-slate-700 hover:bg-slate-600' : 'bg-emerald-700 hover:bg-emerald-600'} text-white text-[10px] font-bold py-1.5 rounded shadow">${isEquipped ? '장착 해제' : '대리 장착'}</button>
                             <button onclick="window.revokeItem('${item.id}')" class="flex-1 bg-red-800 hover:bg-red-700 text-white text-[10px] font-bold py-1.5 rounded shadow">🗑️ 회수</button>
                         </div>${enhanceBtnHtml}`; 
} else { btnHtml = `<button onclick="window.purchaseItem('${item.id}')" class="w-full mt-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-1.5 rounded shadow"><i class="fa-solid fa-gift mr-1"></i> 무료 선물하기</button>`; }
} else if(window.playerState.isGuest) {
btnHtml = `<button onclick="window.customAlert('게스트는 구매할 수 없습니다.')" class="w-full mt-2 bg-slate-800 hover:bg-slate-700 text-slate-500 text-xs font-bold py-1.5 rounded shadow cursor-not-allowed">구매 (${item.price} B)</button>`;
} else {
if(isOwned) { 
btnHtml = `<button onclick="window.equipItem('${item.id}', '${item.type}')" class="w-full mt-2 ${isEquipped ? 'bg-slate-700 border border-slate-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white text-xs font-bold py-1.5 rounded shadow">${isEquipped ? '장착 해제' : '장착하기'}</button>${enhanceBtnHtml}`; 
} else {
btnHtml = `<button onclick="window.purchaseItem('${item.id}')" class="w-full mt-2 ${bong >= item.price ? 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white shadow-lg' : 'bg-slate-800 text-slate-500 cursor-not-allowed'} text-xs font-bold py-1.5 rounded">구매 (${item.price} B)</button>`;
}
}

const slotKo = { 'head':'머리', 'handL':'왼손', 'handR':'오른손', 'footL':'왼발', 'footR':'오른발', 'face':'얼굴' }[item.type] || '기타';

let previewInner = item.faceImageUrl
? `<img src="${escapeAttr(item.faceImageUrl)}" alt="" class="w-full h-full object-cover rounded-lg"/>`
: `<span class="z-10 relative drop-shadow-md">${item.icon}</span>`;

html += `
                 <div class="bg-slate-900/80 border ${isOwned ? 'border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.2)]' : 'border-slate-700'} rounded-xl p-4 flex flex-col justify-between hover:border-purple-400 transition duration-300">
                     <div class="flex items-start gap-4">
                         <div class="text-4xl w-16 h-16 bg-slate-800 flex items-center justify-center rounded-lg shadow-inner flex-shrink-0 relative border overflow-hidden ${isOwned ? 'border-purple-500' : 'border-slate-600'} ${isOwned && item.type !== 'face' ? enhData.css : ''}">
                             ${previewInner}
                             <div class="absolute -top-2 -left-2 bg-slate-700 text-white text-[8px] px-1.5 py-0.5 rounded border border-slate-500 z-20">${slotKo}</div>
                             ${isOwned && level > 0 ? `<div class="absolute -bottom-2 -right-2 bg-black text-[9px] font-bold px-1.5 py-0.5 rounded border border-current z-20 ${enhData.color}">${enhData.text}</div>` : ''}
                         </div>
                         <div class="flex-grow">
                             <h5 class="font-bold text-white text-sm mb-1 line-clamp-1">${item.name}</h5>
                             <p class="text-[9px] sm:text-[10px] text-slate-400 mb-2 line-clamp-2 leading-tight">${item.desc}</p>
                             <div class="flex flex-wrap">${statsHtml}${growthHtml}</div>
                         </div>
                     </div>
                     <div class="mt-3">${btnHtml}</div>
                 </div>
             `;
});
const shopGrid = document.getElementById('shopGrid');
if(shopGrid) shopGrid.innerHTML = html;
};

window.renderSelectedCard = (pId) => {
const p = window.allPlayersData.find(x => x.id === pId);
if(!p) return;

const isMe = window.playerState.id === pId; const isGM = window.playerState.isGM;
const ovr = getOVR(p); const tier = getTierInfo(ovr); const lv = Number(p.level) || 1; const exp = Number(p.exp) || 0;
const expNeeded = getExpNeeded(lv); const expPercent = Math.min(100, Math.floor((exp / expNeeded) * 100));
const bonus = getBonusStats(p);

document.getElementById('detailPanelTitle') && (document.getElementById('detailPanelTitle').innerText = isMe ? '내 선수 정보' : `${p.name} 선수의 정보`);
document.getElementById('detailLevel') && (document.getElementById('detailLevel').innerText = lv);

const badge = document.getElementById('detailTierBadge');
if(badge) { badge.innerText = tier.name; badge.className = `px-2 py-1 rounded border text-[10px] font-bold shadow-md whitespace-nowrap ${tier.class}`; }

const card = document.getElementById('detailFutCard');
if(card) { card.className = `fut-card w-[300px] h-[460px] p-5 flex flex-col relative shadow-2xl z-10 mx-auto transition-all duration-300 ${tier.cardClass}`; }

const detailAv = document.getElementById('detailAvatar');
if (detailAv) detailAv.innerHTML = getAvatarHtml(p, 'detail');
const fc = document.getElementById('facePhotoControls');
if (fc) {
if (isMe && !isGM && !window.playerState.isGuest) {
fc.classList.remove('hidden');
fc.innerHTML = `
<input type="file" id="facePhotoInput" accept="image/jpeg,image/png,image/webp,image/gif" class="hidden" />
<div class="flex flex-wrap justify-center gap-1.5">
<button type="button" class="text-[10px] font-bold px-2 py-1 rounded bg-emerald-800/80 hover:bg-emerald-700 text-emerald-200 border border-emerald-600/50" onclick="document.getElementById('facePhotoInput').click()">얼굴 사진 올리기</button>
${(p.facePhotoUrl || '').trim() ? `<button type="button" class="text-[10px] font-bold px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600" onclick="window.clearFacePhoto()">사진 삭제</button>` : ''}
</div>
<p class="text-[9px] text-slate-500 text-center mt-1 leading-tight">본인만 등록 가능 · JPG·PNG·WebP·GIF, 최대 2MB</p>`;
const inp = document.getElementById('facePhotoInput');
if (inp) inp.onchange = (e) => window.uploadFacePhoto(e);
} else {
fc.classList.add('hidden');
fc.innerHTML = '';
}
}
document.getElementById('detailName') && (document.getElementById('detailName').innerText = p.name);
document.getElementById('detailAge') && (document.getElementById('detailAge').innerText = Number(p.age) || 13);
document.getElementById('detailOvr') && (document.getElementById('detailOvr').innerText = ovr);
document.getElementById('detailPos') && (document.getElementById('detailPos').innerText = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정');
document.getElementById('detailExpText') && (document.getElementById('detailExpText').innerText = `${exp} / ${expNeeded}`);
document.getElementById('detailExpBar') && (document.getElementById('detailExpBar').style.width = `${expPercent}%`);

const renderRecord = (id, key, val) => {
const el = document.getElementById(id); if(!el) return;
const safeVal = Number(val) || 0;
if (isGM) { el.innerHTML = `<input type="number" value="${safeVal}" class="w-full max-w-[50px] bg-transparent text-center border-b border-slate-600 focus:border-emerald-500 focus:outline-none transition-colors m-0 p-0 text-white font-bold text-lg" onchange="window.setRecord('${p.id}', '${key}', this.value)">`; } 
else { el.innerText = safeVal; }
};

renderRecord('recMatches', 'matches', p.matches); renderRecord('recTraining', 'training', p.training);
renderRecord('recGoals', 'goals', p.goals); renderRecord('recAssists', 'assists', p.assists);
renderRecord('recKeypass', 'keypass', p.keypass); renderRecord('recSaves', 'saves', p.saves);

const stats = [
{ id: 'pac', label: '속력' }, { id: 'sho', label: '슈팅' }, { id: 'pas', label: '패스' },
{ id: 'dri', label: '드리블' }, { id: 'def', label: '수비' }, { id: 'phy', label: '피지컬' },
{ id: 'ref', label: '반사' }, { id: 'int', label: '가로채기' }, { id: 'pst', label: '위치' },
{ id: 'dis', label: '볼배급' }, { id: 'cmp', label: '평정심' }, { id: 'wrk', label: '활동량' }
];

let gridHtml = '';
stats.forEach(s => {
const baseVal = Number(p[s.id]) || 60; const bVal = bonus.flat[s.id] || 0; const totalVal = Math.min(99, baseVal + bVal);
let bonusBadge = bVal > 0 ? `<span class="text-[9px] text-emerald-400 font-bold leading-none absolute -top-0.5 -right-3.5">+${bVal}</span>` : '';

const posConfig = POS_WEIGHTS[p.pos];
let highlightClass = '';
let labelIcon = '';
if (posConfig) {
if (posConfig.core.includes(s.id)) {
highlightClass = 'text-red-400 font-black scale-110 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)] z-10';
labelIcon = '<i class="fa-solid fa-fire text-red-500 text-[9px] ml-0.5 animate-pulse"></i>';
} else if (posConfig.sub.includes(s.id)) {
highlightClass = 'text-yellow-300 font-bold drop-shadow-md';
labelIcon = '<i class="fa-solid fa-star text-yellow-400 text-[8px] ml-0.5"></i>';
}
}

if(isGM) {
gridHtml += `
                     <div class="flex flex-col items-center justify-center text-current w-full group relative">
                         <div class="flex items-center justify-center gap-1 mb-0.5">
                             <button onclick="window.modStat('${p.id}', '${s.id}', -1)" class="w-3.5 h-3.5 rounded bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><i class="fa-solid fa-minus text-[7px]"></i></button>
                             <div class="relative flex items-center justify-center w-7">
                                 <input type="number" min="1" max="99" value="${baseVal}" class="font-oswald text-xl font-bold w-full text-center bg-transparent border-b border-transparent hover:border-current focus:outline-none transition cursor-text leading-none p-0 m-0 text-current ${highlightClass}" onchange="window.setStat('${p.id}', '${s.id}', this.value)">
                                 ${bonusBadge}
                             </div>
                             <button onclick="window.modStat('${p.id}', '${s.id}', 1)" class="w-3.5 h-3.5 rounded bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><i class="fa-solid fa-plus text-[7px]"></i></button>
                         </div>
                         <span class="font-bold text-[10px] tracking-tight whitespace-nowrap opacity-95 cursor-pointer hover:text-emerald-400 leading-none" onclick="window.showStatDesc('${s.id}')">${s.label} ${labelIcon}</span>
                     </div>`;
} else {
gridHtml += `
                     <div class="flex flex-col items-center justify-center text-current w-full">
                         <div class="relative flex items-center justify-center mb-0.5 ${highlightClass}">
                             <span class="font-oswald text-xl font-bold leading-none tracking-tight">${totalVal}</span>
                             ${bonusBadge}
                         </div>
                         <span class="font-bold text-[10px] sm:text-[11px] opacity-95 tracking-tight whitespace-nowrap cursor-pointer hover:text-emerald-400 transition leading-none" onclick="window.showStatDesc('${s.id}')">${s.label} ${labelIcon}</span>
                     </div>`;
}
});
const statsGridEl = document.getElementById('detailStatsGrid');
if(statsGridEl) statsGridEl.innerHTML = gridHtml;

drawRadarChart(p, bonus.flat);

const equipSlots = [
{ id: 'slotHead', equip: p.equipHead, empty: '🧢', label: '머리' }, { id: 'slotHandL', equip: p.equipHandL, empty: '🧤', label: '왼손' },
{ id: 'slotHandR', equip: p.equipHandR, empty: '📿', label: '오른손' }, { id: 'slotFootL', equip: p.equipFootL, empty: '👟', label: '왼발' }, { id: 'slotFootR', equip: p.equipFootR, empty: '🥾', label: '오른발' },
{ id: 'slotFace', equip: p.equipFace, empty: '😶', label: '얼굴' }
];

equipSlots.forEach(slot => {
const el = document.getElementById(slot.id);
if (!el) return;
if (slot.equip) {
const item = SHOP_ITEMS.find(x => x.id === slot.equip);
const level = (p.itemLevels && typeof p.itemLevels === 'object' && !Array.isArray(p.itemLevels) && p.itemLevels[slot.equip]) ? Number(p.itemLevels[slot.equip]) : 0;
const enhData = ENHANCE_LEVELS[level] || ENHANCE_LEVELS[0];

if (item) {
if (item.type === 'face' && item.faceImageUrl) {
el.innerHTML = `<img src="${escapeAttr(item.faceImageUrl)}" alt="" class="item-face-thumb"/><span class="item-label">${slot.label}</span>`;
el.className = 'item-slot-mini equipped eff-0';
} else {
el.innerHTML = `<span class="item-icon">${item.icon}</span><span class="item-label">${slot.label}</span>${level>0?`<span class="absolute -top-1 -right-1 text-[8px] font-bold ${enhData.color} z-10">${enhData.text}</span>`:''}`;
el.className = `item-slot-mini equipped ${enhData.css}`;
}
}
} else {
el.innerHTML = `<span class="opacity-30 text-lg">${slot.empty}</span><span class="item-label">${slot.label}</span>`;
el.className = 'item-slot-mini';
}
});

if(isMe && !isGM && !window.playerState.isGuest) {
document.getElementById('playerTrainingPanel')?.classList.remove('hidden');
document.getElementById('recBong') && (document.getElementById('recBong').innerText = Number(p.bong) || 0);
document.getElementById('expectedWageDisplay') && (document.getElementById('expectedWageDisplay').innerText = `OVR 주급: ${getWeeklyWage(ovr)} B`);
document.getElementById('iconEditPos')?.classList.remove('hidden');
const btnChangePos = document.getElementById('btnChangePos'); if(btnChangePos) btnChangePos.onclick = () => window.changePositionModal(p.id);
} else {
document.getElementById('playerTrainingPanel')?.classList.add('hidden');
document.getElementById('iconEditPos')?.classList.add('hidden');
const btnChangePos = document.getElementById('btnChangePos'); if(btnChangePos) btnChangePos.onclick = null;
}

if(isGM) {
document.getElementById('gmControls')?.classList.remove('hidden');
document.getElementById('gmWalletManager')?.classList.remove('hidden');
document.getElementById('gmAgeManager')?.classList.remove('hidden');
document.getElementById('gmInputAge') && (document.getElementById('gmInputAge').value = Number(p.age) || 13);
const gmViewBong = document.getElementById('gmViewBong');
if(gmViewBong) gmViewBong.innerHTML = `<input type="number" value="${Number(p.bong) || 0}" class="w-16 bg-transparent text-center border-b border-slate-600 focus:border-emerald-500 focus:outline-none transition-colors m-0 p-0 text-fut-gold font-display text-xl leading-none" onchange="window.setRecord('${p.id}', 'bong', this.value)">`;
} else {
document.getElementById('gmControls')?.classList.add('hidden');
document.getElementById('gmWalletManager')?.classList.add('hidden');
document.getElementById('gmAgeManager')?.classList.add('hidden');
}
};

async function processExp(p, expGained, docRef, updatesObj) {
let currentLv = Number(p.level) || 1;
let currentExp = (Number(p.exp) || 0) + Number(expGained);
let leveledUp = false; let increasedStats = [];

while(currentExp >= getExpNeeded(currentLv)) { currentExp -= getExpNeeded(currentLv); currentLv++; leveledUp = true; }
updatesObj.exp = currentExp;

if(leveledUp) {
updatesObj.level = currentLv;
const bonuses = getBonusStats(p); 
const statKeys = ['pac', 'sho', 'pas', 'dri', 'def', 'phy', 'ref', 'int', 'pst', 'dis', 'cmp', 'wrk'];

statKeys.forEach(s => {
const totalChance = 10 + (bonuses.growth[s] || 0);
if (Math.random() * 100 < totalChance) {
const nextVal = Math.min(99, (Number(p[s]) || 60) + 1);
updatesObj[s] = nextVal;
if (nextVal > (Number(p[s]) || 60)) increasedStats.push(STAT_NAMES[s].split(' ')[0]);
}
});

triggerConfetti(); 
const statsMsg = increasedStats.length > 0 ? `\n\n💪 스탯 성장 내역:\n${increasedStats.join(', ')} 능력이 +1 증가했습니다!` : `\n\n(이번 레벨업에서는 상승한 스탯이 없습니다. 아이템을 장착해보세요!)`;
setTimeout(() => window.customAlert(`🎉 축하합니다!\n[${p.name}] 선수가 레벨 ${currentLv} (으)로 올랐습니다!${statsMsg}`), 500);
}
await setDoc(docRef, updatesObj, { merge: true });
}

function drawRadarChart(p, bonusFlat) {
const canvas = document.getElementById('statRadar'); if(!canvas) return;
const ctx = canvas.getContext('2d');
const cw = canvas.width; const ch = canvas.height; const cx = cw / 2; const cy = ch / 2; const r = cw * 0.45;

ctx.clearRect(0,0,cw,ch);

ctx.beginPath();
for(let i=0; i<12; i++) {
const angle = (Math.PI * 2 / 12) * i - (Math.PI / 2);
ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
}
ctx.closePath(); 
ctx.fillStyle = 'rgba(10, 25, 15, 0.8)'; ctx.fill(); 

ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; ctx.lineWidth = 1;
for(let j=1; j<=3; j++) {
ctx.beginPath();
let ringR = r * (j/3);
for(let i=0; i<12; i++) {
const angle = (Math.PI * 2 / 12) * i - (Math.PI / 2);
ctx.lineTo(cx + ringR * Math.cos(angle), cy + ringR * Math.sin(angle));
}
ctx.closePath(); ctx.stroke();
}
ctx.beginPath();
for(let i=0; i<12; i++) {
const angle = (Math.PI * 2 / 12) * i - (Math.PI / 2);
ctx.moveTo(cx, cy);
ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
}
ctx.stroke();

const statVals = [
(Number(p.pac)||60)+bonusFlat.pac, (Number(p.sho)||60)+bonusFlat.sho, (Number(p.pas)||60)+bonusFlat.pas, 
(Number(p.dri)||60)+bonusFlat.dri, (Number(p.def)||60)+bonusFlat.def, (Number(p.phy)||60)+bonusFlat.phy,
(Number(p.ref)||60)+bonusFlat.ref, (Number(p.int)||60)+bonusFlat.int, (Number(p.pst)||60)+bonusFlat.pst, 
(Number(p.dis)||60)+bonusFlat.dis, (Number(p.cmp)||60)+bonusFlat.cmp, (Number(p.wrk)||60)+bonusFlat.wrk
];

ctx.beginPath();
for(let i=0; i<12; i++) {
const val = Math.max(1, Math.min(99, statVals[i])) / 99;
const angle = (Math.PI * 2 / 12) * i - (Math.PI / 2);
ctx.lineTo(cx + (r * val) * Math.cos(angle), cy + (r * val) * Math.sin(angle));
}
ctx.closePath();

const ovr = getOVR(p);
let color = '56, 255, 142'; if (ovr >= 90) color = '138, 43, 226'; else if (ovr >= 80) color = '232, 194, 113'; 

ctx.fillStyle = `rgba(${color}, 0.5)`; ctx.fill(); ctx.strokeStyle = `rgb(${color})`; ctx.lineWidth = 2; ctx.stroke();
}

window.addActivity = async (type) => {
try {
checkAuthReady();
if(!window.selectedPlayerId) return;
if(window.playerState.isGuest) return window.customAlert("게스트는 이용할 수 없는 기능입니다.");

const pId = window.selectedPlayerId;
if(!window.playerState.isGM && pId !== window.playerState.id) return window.customAlert("❌ 자신의 기록만 추가할 수 있습니다!");

const p = window.allPlayersData.find(x => x.id === pId);
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + pId);
let expGained = 0, updates = {};

if(type === 'matches') { expGained = 50; updates.matches = (Number(p.matches)||0) + 1; }
if(type === 'training') { expGained = 30; updates.training = (Number(p.training)||0) + 1; }
if(type === 'goals') { expGained = 20; updates.goals = (Number(p.goals)||0) + 1; updates.bong = (Number(p.bong)||0) + 3; }
if(type === 'assists') { expGained = 10; updates.assists = (Number(p.assists)||0) + 1; updates.bong = (Number(p.bong)||0) + 1; }
if(type === 'keypass') { expGained = 15; updates.keypass = (Number(p.keypass)||0) + 1; updates.bong = (Number(p.bong)||0) + 1; }
if(type === 'saves') { expGained = 15; updates.saves = (Number(p.saves)||0) + 1; updates.bong = (Number(p.bong)||0) + 2; }

animateFloatText(`+${expGained} EXP`, 'text-emerald-400', 'confettiOrigin');
await processExp(p, expGained, docRef, updates);
} catch (e) { console.error("addActivity Error:", e); window.customAlert(`서버 에러:\n${e.message}`); }
};

window.undoActivity = async (type) => {
try {
checkAuthReady();
if(!window.selectedPlayerId) return;
if(window.playerState.isGuest) return window.customAlert("게스트는 이용할 수 없는 기능입니다.");

const pId = window.selectedPlayerId;
if(!window.playerState.isGM && pId !== window.playerState.id) return window.customAlert("❌ 자신의 기록만 조작할 수 있습니다.");

const p = window.allPlayersData.find(x => x.id === pId);
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + pId);
let expDeduct = 1, updates = {}; 

if(type === 'matches' && (Number(p.matches) || 0) > 0) { expDeduct += 50; updates.matches = Number(p.matches) - 1; }
else if(type === 'training' && (Number(p.training) || 0) > 0) { expDeduct += 30; updates.training = Number(p.training) - 1; }
else if(type === 'goals' && (Number(p.goals) || 0) > 0) { expDeduct += 20; updates.goals = Number(p.goals) - 1; updates.bong = Math.max(0, (Number(p.bong)||0) - 3); }
else if(type === 'assists' && (Number(p.assists) || 0) > 0) { expDeduct += 10; updates.assists = Number(p.assists) - 1; updates.bong = Math.max(0, (Number(p.bong)||0) - 1); }
else if(type === 'keypass' && (Number(p.keypass) || 0) > 0) { expDeduct += 15; updates.keypass = Number(p.keypass) - 1; updates.bong = Math.max(0, (Number(p.bong)||0) - 1); }
else if(type === 'saves' && (Number(p.saves) || 0) > 0) { expDeduct += 15; updates.saves = Number(p.saves) - 1; updates.bong = Math.max(0, (Number(p.bong)||0) - 2); }
else return window.customAlert("❌ 차감할 해당 기록이 없습니다.");

if(!await window.customConfirm("방금 입력한 기록을 취소하시겠습니까?\n(해당 활동으로 받은 경험치와 같은 양이 차감되고, 1 EXP 페널티가 추가됩니다.\n부족 시 레벨이 함께 내려갑니다.)")) return;

animateFloatText(`-${expDeduct} EXP`, 'text-red-400', 'confettiOrigin');
applyExpLoss(p, expDeduct, updates);
await setDoc(docRef, updates, { merge: true });
} catch (e) { console.error("undoActivity Error:", e); window.customAlert(`서버 에러:\n${e.message}`); }
};

window.purchaseItem = async (itemId) => {
try {
checkAuthReady();
if(window.playerState.isGuest) return window.customAlert("게스트는 이용할 수 없는 기능입니다.");

const targetId = window.playerState.isGM ? window.selectedPlayerId : window.playerState.id;
const p = window.allPlayersData.find(x => x.id === targetId);
const item = SHOP_ITEMS.find(x => x.id === itemId);
if(!p || !item) return;

let updates = {};
if(window.playerState.isGM) {
if(!await window.customConfirm(`감독 권한으로 [${p.name}] 선수에게 [${item.name}]을 선물하시겠습니까?`)) return;
} else {
if((Number(p.bong) || 0) < item.price) return window.customAlert("자산(B)이 부족합니다!");
if(!await window.customConfirm(`[${item.name}] 아이템을 ${item.price} B에 구매하시겠습니까?`)) return;
updates.bong = (Number(p.bong) || 0) - item.price;
}

const currentInventory = Array.isArray(p.inventory) ? p.inventory : [];
const currentItemLevels = (typeof p.itemLevels === 'object' && !Array.isArray(p.itemLevels)) ? p.itemLevels : {};

updates.inventory = [...currentInventory, itemId];
updates.itemLevels = { ...currentItemLevels, [itemId]: 0 };

const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id));
await setDoc(docRef, updates, { merge: true });

triggerConfetti();
window.customAlert(window.playerState.isGM ? `🎁 [${item.name}] 선물 완료!` : `🎉 [${item.name}] 구매 완료! 장착하기를 눌러보세요.`);
window.renderShop();
} catch (e) { console.error("purchaseItem Error:", e); window.customAlert(`구매 에러:\n${e.message}`); }
};

window.enhanceItem = async (itemId) => {
try {
checkAuthReady();
if(window.playerState.isGuest) return window.customAlert("게스트는 이용할 수 없는 기능입니다.");

const pId = window.playerState.isGM ? window.selectedPlayerId : window.playerState.id;
const p = window.allPlayersData.find(x => x.id === pId);
const item = SHOP_ITEMS.find(x => x.id === itemId);
if(!p || !item) return;
if (item.type === 'face') return window.customAlert('얼굴 프레임 아이템은 강화할 수 없습니다.');

const cost = item.price;
if(!window.playerState.isGM && (Number(p.bong) || 0) < cost) return window.customAlert(`자산이 부족합니다. (필요 자산: ${cost} B)`);

const safeItemLevels = (typeof p.itemLevels === 'object' && !Array.isArray(p.itemLevels)) ? p.itemLevels : {};
const currentLevel = Number(safeItemLevels[itemId]) || 0;
const nextEnhData = ENHANCE_LEVELS[currentLevel + 1];
if(!nextEnhData) return window.customAlert("이미 최대 레벨입니다.");

if(!await window.customConfirm(`[${item.name}] 장비를 +${currentLevel+1}강으로 강화하시겠습니까?\n비용: ${cost} B / 성공 확률: ${nextEnhData.chance}%\n(실패 시 강화 단계가 1단계 하락합니다!)`)) return;

let updates = {};
if(!window.playerState.isGM) updates.bong = (Number(p.bong) || 0) - cost;

const roll = Math.random() * 100;
const isSuccess = roll < nextEnhData.chance;
const newItemLevels = { ...safeItemLevels };

if (isSuccess) {
newItemLevels[itemId] = currentLevel + 1;
updates.itemLevels = newItemLevels;
triggerConfetti();

if (currentLevel + 1 >= 4) {
const eventRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'latest_event');
await setDoc(eventRef, { text: `🎉 전설 탄생! [${p.name}] 학생이 [${item.name}] +${currentLevel+1}강 강화에 성공했습니다! 🎉`, timestamp: Date.now() });
window.customAlert(`🔥 대성공!!🔥\n[${item.name}] 장비가 +${currentLevel+1}강이 되었습니다!\n(전광판에 공지되었습니다!)`);
} else { window.customAlert(`✨ 강화 성공!\n[${item.name}] 장비가 +${currentLevel+1}강이 되었습니다.`); }
} else {
newItemLevels[itemId] = Math.max(0, currentLevel - 1);
updates.itemLevels = newItemLevels;
window.customAlert(`💥 앗! 강화에 실패했습니다...\n장비의 강화 단계가 +${newItemLevels[itemId]}강으로 하락했습니다.`);
}

const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id));
await setDoc(docRef, updates, { merge: true });
window.renderShop(); window.renderSelectedCard(pId);
} catch (e) { console.error("enhanceItem Error:", e); window.customAlert(`강화 에러:\n${e.message}`); }
};

window.equipItem = async (itemId, type) => {
try {
checkAuthReady();
if(window.playerState.isGuest) return window.customAlert("게스트는 이용할 수 없는 기능입니다.");
const targetId = window.playerState.isGM ? window.selectedPlayerId : window.playerState.id;
const p = window.allPlayersData.find(x => x.id === targetId);
if(!p) return;

const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id));
let updates = {};
const fieldMap = { 'head':'equipHead', 'handL':'equipHandL', 'handR':'equipHandR', 'footL':'equipFootL', 'footR':'equipFootR', 'face':'equipFace' };
const field = fieldMap[type];
if(field) { updates[field] = p[field] === itemId ? null : itemId; }

await setDoc(docRef, updates, { merge: true });
window.renderShop(); window.renderLockerRoom(); window.renderSelectedCard(targetId);
} catch (e) { console.error("equipItem Error:", e); window.customAlert(`장착 에러:\n${e.message}`); }
};

window.revokeItem = async (itemId) => {
try {
checkAuthReady();
if(!window.playerState.isGM) return;
const targetId = window.selectedPlayerId;
const p = window.allPlayersData.find(x => x.id === targetId);
const item = SHOP_ITEMS.find(x => x.id === itemId);
if(!p || !item) return;

if(!await window.customConfirm(`[${p.name}] 선수의 [${item.name}] 아이템을 회수하시겠습니까?`)) return;

const currentInventory = Array.isArray(p.inventory) ? p.inventory : [];
let updates = { inventory: currentInventory.filter(id => id !== itemId) };

const safeItemLevels = (typeof p.itemLevels === 'object' && !Array.isArray(p.itemLevels)) ? p.itemLevels : {};
const newItemLevels = { ...safeItemLevels }; delete newItemLevels[itemId]; updates.itemLevels = newItemLevels;

if(p.equipHead === itemId) updates.equipHead = null; if(p.equipHandL === itemId) updates.equipHandL = null;
if(p.equipHandR === itemId) updates.equipHandR = null; if(p.equipFootL === itemId) updates.equipFootL = null; if(p.equipFootR === itemId) updates.equipFootR = null;
if(p.equipFace === itemId) updates.equipFace = null;

const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id));
await setDoc(docRef, updates, { merge: true });
window.customAlert(`🗑️ 아이템이 회수되었습니다.`);
window.renderShop(); window.renderLockerRoom(); window.renderSelectedCard(targetId);
} catch (e) { console.error("revokeItem Error:", e); window.customAlert(`회수 에러:\n${e.message}`); }
};

window.modStat = async (pId, statKey, change) => {
try {
checkAuthReady();
if(!window.playerState.isGM) return;
const p = window.allPlayersData.find(x => x.id === pId);
const newVal = Math.max(1, Math.min(99, (Number(p[statKey]) || 60) + change));
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + pId);
await setDoc(docRef, { [statKey]: newVal }, { merge: true });
} catch (e) { console.error("modStat Error:", e); window.customAlert(`스탯 수정 에러:\n${e.message}`); }
};

window.setStat = async (pId, statKey, value) => {
try {
checkAuthReady();
if(!window.playerState.isGM) return;
const newVal = Math.max(1, Math.min(99, parseInt(value) || 60));
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + pId);
await setDoc(docRef, { [statKey]: newVal }, { merge: true });
} catch (e) { console.error("setStat Error:", e); window.customAlert(`스탯 설정 에러:\n${e.message}`); }
};

window.setRecord = async (pId, statKey, value) => {
try {
checkAuthReady();
if(!window.playerState.isGM) return;
const newVal = Math.max(0, parseInt(value) || 0);
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(pId));
await setDoc(docRef, { [statKey]: newVal }, { merge: true });
} catch (e) { console.error("setRecord Error:", e); window.customAlert(`기록 수정 에러:\n${e.message}`); }
};

window.claimWage = async () => {
try {
checkAuthReady();
if(!window.playerState.id || window.playerState.isGM) return;
if(window.playerState.isGuest) return window.customAlert("게스트는 이용할 수 없는 기능입니다.");

const p = window.allPlayersData.find(x => x.id === window.playerState.id);
const weekNum = getWeekNumber(new Date());
if(p.lastWageWeek === weekNum) return window.customAlert("❌ 이번 주 주급은 이미 수령했습니다!\n다음 주에 다시 받아주세요.");
const wage = getWeeklyWage(getOVR(p));
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id));
await setDoc(docRef, { bong: (Number(p.bong) || 0) + wage, lastWageWeek: weekNum }, { merge: true });
triggerConfetti(); window.customAlert(`💰 주급 수령 완료!\n현재 능력치에 맞춰 [${wage} B]가 지급되었습니다.`);
} catch (e) { console.error("claimWage Error:", e); window.customAlert(`주급 수령 에러:\n${e.message}`); }
};

window.giveAll = async (type, amount) => {
try {
checkAuthReady();
if(!window.playerState.isGM) return;
const msg = type === 'exp' ? `모든 학생에게 [${amount} EXP]를 일괄 지급하시겠습니까?` : `모든 학생에게 [${amount} B]를 일괄 지급하시겠습니까?`;
if(!await window.customConfirm(msg)) return;

const batch = writeBatch(db);
window.allPlayersData.forEach(p => {
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id));
if (type === 'exp') {
let currentLv = Number(p.level) || 1; let currentExp = (Number(p.exp) || 0) + Number(amount); let leveledUp = false;
while(currentExp >= getExpNeeded(currentLv)) { currentExp -= getExpNeeded(currentLv); currentLv++; leveledUp = true; }
let updatesObj = { exp: currentExp };
if(leveledUp) {
updatesObj.level = currentLv;
if(currentLv % 3 === 0) { ['pac', 'sho', 'pas', 'dri', 'def', 'phy', 'ref', 'int', 'pst', 'dis', 'cmp', 'wrk'].forEach(s => updatesObj[s] = Math.min(99, (Number(p[s])||60) + 1)); }
}
batch.set(docRef, updatesObj, { merge: true });
} else if (type === 'bong') { batch.set(docRef, { bong: (Number(p.bong) || 0) + Number(amount) }, { merge: true }); }
});
await batch.commit(); triggerConfetti(); window.customAlert(`✅ 모든 학생에게 성공적으로 지급되었습니다!`);
} catch (e) { console.error("giveAll Error:", e); window.customAlert(`지급 에러:\n${e.message}`); }
};

window.gmRollbackLevel = async () => {
try {
checkAuthReady();
if(!window.playerState.isGM || !window.selectedPlayerId) return;
const p = window.allPlayersData.find(x => x.id === window.selectedPlayerId);
if(!p) return;
const L = Number(p.level) || 1;
if(L <= 1) return window.customAlert("더 이상 내릴 레벨이 없습니다.");
if(!await window.customConfirm(`[${p.name}] 선수의 레벨을 ${L} → ${L - 1}로 한 단계 롤백하시겠습니까?\n(경험치 바는 낮아진 레벨 구간 상한에 맞게 조정됩니다.)`)) return;
const newLv = L - 1;
const cap = Math.max(0, getExpNeeded(newLv) - 1);
const newExp = Math.min(Number(p.exp) || 0, cap);
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id));
await setDoc(docRef, { level: newLv, exp: newExp }, { merge: true });
window.customAlert(`레벨이 ${newLv}로 조정되었습니다.`);
} catch (e) { console.error("gmRollbackLevel Error:", e); window.customAlert(`레벨 롤백 에러:\n${e.message}`); }
};

/** 본인 프로필 사진 업로드 (Firebase Storage + Firestore facePhotoUrl) */
window.uploadFacePhoto = async (ev) => {
try {
checkAuthReady();
if (!storage) return window.customAlert('스토리지가 준비되지 않았습니다. 잠시 후 다시 시도하세요.');
const file = ev.target?.files?.[0];
if (!file) return;
if (!file.type.startsWith('image/')) return window.customAlert('이미지 파일(JPG·PNG·WebP·GIF)만 올릴 수 있습니다.');
if (file.size > 2 * 1024 * 1024) return window.customAlert('파일 크기는 2MB 이하여야 합니다.');
const pId = window.playerState.id;
if (!pId || window.playerState.isGM || window.playerState.isGuest) return;
const safeId = getSafeDocId(pId);
const path = `artifacts/${appId}/public/player_avatars/${safeId}/face`;
const sref = ref(storage, path);
await uploadBytes(sref, file, { contentType: file.type || 'image/jpeg' });
const url = await getDownloadURL(sref);
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + safeId);
await setDoc(docRef, { facePhotoUrl: url, updatedAt: new Date().toISOString() }, { merge: true });
window.customAlert('프로필 사진이 저장되었습니다.');
ev.target.value = '';
} catch (e) {
console.error('uploadFacePhoto', e);
window.customAlert(`업로드 실패:\n${e.message}\n\nFirebase Console → Storage 규칙에서 인증된 사용자의 쓰기를 허용했는지 확인하세요.`);
}
};

/** 본인 프로필 사진 삭제 */
window.clearFacePhoto = async () => {
try {
checkAuthReady();
if (!storage) return window.customAlert('스토리지가 준비되지 않았습니다.');
if (!await window.customConfirm('등록한 얼굴 사진을 삭제하고 기본 이모지로 돌아갈까요?')) return;
const pId = window.playerState.id;
if (!pId || window.playerState.isGM || window.playerState.isGuest) return;
const safeId = getSafeDocId(pId);
const path = `artifacts/${appId}/public/player_avatars/${safeId}/face`;
try { await deleteObject(ref(storage, path)); } catch (err) { /* 객체 없음 등은 무시 */ }
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + safeId);
await setDoc(docRef, { facePhotoUrl: deleteField(), updatedAt: new Date().toISOString() }, { merge: true });
window.customAlert('사진이 삭제되었습니다.');
} catch (e) {
console.error('clearFacePhoto', e);
window.customAlert(`삭제 실패:\n${e.message}`);
}
};

window.resetAllLevels = async () => {
try {
checkAuthReady();
if(!window.playerState.isGM) return;
if(!await window.customConfirm(`⚠️ 경고: 모든 학생의 레벨과 경험치를 0으로 초기화하시겠습니까?\n(스탯과 자산, 누적 기록은 그대로 유지됩니다)`)) return;

const batch = writeBatch(db);
window.allPlayersData.forEach(p => {
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id));
batch.set(docRef, { exp: 0, level: 0 }, { merge: true });
});
await batch.commit(); triggerConfetti(); window.customAlert("✅ 모든 학생의 레벨과 경험치가 0으로 초기화되었습니다!");
} catch (e) { console.error("resetAll Error:", e); window.customAlert(`초기화 에러:\n${e.message}`); }
};

window.manualAddBong = async (amount) => {
try {
checkAuthReady();
if(!window.playerState.isGM || !window.selectedPlayerId) return;
const p = window.allPlayersData.find(x => x.id === window.selectedPlayerId);
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id));
await setDoc(docRef, { bong: Math.max(0, (Number(p.bong)||0) + Number(amount)) }, { merge: true });
animateFloatText(`${amount>0?'+':''}${amount} B`, amount>0?'text-fut-gold':'text-red-500', 'confettiOrigin');
} catch (e) { console.error("manualBong Error:", e); window.customAlert(`자산 수정 에러:\n${e.message}`); }
};

window.saveAttendance = async () => {
try {
checkAuthReady();
if (!window.playerState.isGM) return;
if (window.checkedInPlayers.size === 0) return window.customAlert("체크된 선수가 없습니다.");

const today = new Date(); const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const attendees = Array.from(window.checkedInPlayers);
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'attendance', dateStr);
await setDoc(docRef, { date: dateStr, count: attendees.length, players: attendees, timestamp: new Date().toISOString() }, { merge: true });

triggerConfetti(); window.customAlert(`✅ ${dateStr}\n총 ${attendees.length}명의 출석부가 저장되었습니다!`);
} catch (e) { console.error("saveAttendance Error:", e); window.customAlert(`출석부 저장 에러:\n${e.message}`); }
};

window.viewAttendance = async () => {
try {
checkAuthReady();
if (!window.playerState.isGM) return;
const attRef = collection(db, 'artifacts', appId, 'public', 'data', 'attendance');
const snap = await getDocs(attRef);
let logs = []; snap.forEach(doc => logs.push(doc.data()));

const dates = []; let d = new Date(2026, 2, 7); 
for(let i=0; i<30; i++) {
dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); d.setDate(d.getDate() + 7);
}

let modalHtml = `<div class="bg-pitch-panel p-4 sm:p-6 rounded-3xl border-2 border-emerald-500 w-full sm:w-[95vw] max-w-7xl shadow-2xl max-h-[90vh] flex flex-col font-sans text-white relative">
                 <h2 class="text-2xl sm:text-3xl font-display text-center text-emerald-400 mb-2 tracking-widest drop-shadow-lg flex items-center justify-center gap-3"><i class="fa-solid fa-calendar-check"></i> 삼봉 풋살클럽 출석부 (2026)</h2>
                 <p class="text-xs text-emerald-200 mb-4 mt-2 text-center">토요스포츠데이 (3~6학년) / 9:20~12:30 / 좌우로 스크롤하여 30주차 전체 일정을 확인하세요!</p>
                 <div class="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 border border-emerald-800/50 rounded-xl bg-slate-900/80">
                     <table class="w-full text-center whitespace-nowrap text-xs border-collapse">
                         <thead>
                             <tr class="bg-slate-800 border-b border-emerald-800 sticky top-0 z-20 shadow-md">
                                 <th rowspan="2" class="p-2 border-r border-slate-700 w-10 sticky left-0 bg-slate-800 z-30">연번</th>
                                 <th rowspan="2" class="p-2 border-r border-slate-700 w-24 sticky left-10 bg-slate-800 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">성명</th>
                                 <th class="p-2 border-r border-slate-700 bg-emerald-900/80 text-emerald-300 w-12 sticky left-[136px] z-30 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">누계</th>
                                 ${dates.map((_, i) => `<th class="p-1 border-r border-slate-700 font-normal text-[10px] text-slate-400 w-12">${i+1}주차</th>`).join('')}
                             </tr>
                             <tr class="bg-slate-800 border-b border-emerald-800 sticky top-8 z-10 shadow-md">
                                 <th class="p-1 border-r border-slate-700 text-[10px] bg-emerald-900/80 sticky left-[136px] z-30 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">출석</th>
                                 ${dates.map(d => `<th class="p-1 border-r border-slate-700 text-[10px]"><div class="text-emerald-400 font-bold">${d.substring(5).replace('-','/')}</div><div class="text-emerald-500/70 mt-0.5 font-bold">(토)</div></th>`).join('')}
                             </tr>
                         </thead><tbody>`;

ALLOWED_PLAYERS.forEach((name, idx) => {
const safeDocId = getSafeDocId(name); const p = window.allPlayersData.find(x => x.id === safeDocId); const pId = p ? p.id : null; let attCount = 0;
let rowCells = dates.map(targetDate => {
const log = logs.find(l => l.date === targetDate);
if(log && pId && log.players.includes(pId)) { attCount++; return `<td class="p-1 border-r border-b border-slate-700/50"><div class="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500 flex items-center justify-center mx-auto text-[10px] font-bold shadow-[0_0_5px_rgba(56,255,142,0.5)]">O</div></td>`; }
return `<td class="p-1 border-r border-b border-slate-700/50 text-slate-700">-</td>`;
}).join('');

modalHtml += `<tr class="hover:bg-slate-800/60 transition group"><td class="p-2 border-r border-b border-slate-700/50 text-slate-500 sticky left-0 bg-slate-900 group-hover:bg-slate-800">${idx+1}</td><td class="p-2 border-r border-b border-slate-700/50 font-bold text-white tracking-widest sticky left-10 bg-slate-900 group-hover:bg-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">${name}</td><td class="p-2 border-r border-b border-slate-700/50 bg-emerald-900/20 font-bold text-emerald-300 sticky left-[136px] group-hover:bg-emerald-900/40 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">${attCount}</td>${rowCells}</tr>`;
});

modalHtml += `</tbody></table></div><button onclick="this.parentElement.parentElement.remove()" class="mt-6 bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-3 px-6 rounded-xl w-full sm:w-64 mx-auto transition shadow-lg text-lg">닫기</button></div>`;
const modal = document.createElement('div'); modal.className = "fixed inset-0 z-[6000] flex items-center justify-center bg-black/90 px-2 sm:px-4 backdrop-blur-sm"; modal.innerHTML = modalHtml; document.body.appendChild(modal);
} catch (e) { console.error("조회 에러:", e); window.customAlert("데이터를 불러오는데 실패했습니다."); }
};

window.changePositionModal = (pId) => {
const p = window.allPlayersData.find(x => x.id === pId);
const b = getBonusStats(p).flat;
const stats = {
pac: (Number(p.pac)||60)+b.pac, sho: (Number(p.sho)||60)+b.sho, pas: (Number(p.pas)||60)+b.pas,
dri: (Number(p.dri)||60)+b.dri, def: (Number(p.def)||60)+b.def, phy: (Number(p.phy)||60)+b.phy,
ref: (Number(p.ref)||60)+b.ref, int: (Number(p.int)||60)+b.int, pst: (Number(p.pst)||60)+b.pst,
dis: (Number(p.dis)||60)+b.dis, cmp: (Number(p.cmp)||60)+b.cmp, wrk: (Number(p.wrk)||60)+b.wrk
};
const currentOvr = getOVRForPos(stats, p.pos);

const modal = document.createElement('div'); modal.className = "fixed inset-0 z-[6000] flex items-center justify-center bg-black/80 px-4";
const posList = [
{ id: 'Pivo', name: '피보(FW)', desc: '최전방 공격수: 등지고 버티거나 골을 넣는 타겟맨!', core: '슈팅, 위치, 평정, 피지컬' }, 
{ id: 'Ala', name: '아라(MF)', desc: '측면 윙어: 양옆을 부지런히 오가며 공수를 연결하는 살림꾼!', core: '속력, 드리블, 패스, 활동량' },
{ id: 'Fixo', name: '픽소(DF)', desc: '최후방 수비수: 수비를 지휘하고 패스를 시작하는 사령관!', core: '수비, 가로채기, 피지컬, 패스' }, 
{ id: 'Goleiro', name: '골레이로(GK)', desc: '골키퍼: 손과 발을 모두 써서 최후의 방어를 해내는 수호신!', core: '반사, 볼배급, 위치선정' }
];

const btns = posList.map(pos => {
const potentialOvr = getOVRForPos(stats, pos.id);
const ovrDiff = potentialOvr - currentOvr;
const diffStr = ovrDiff > 0 ? `<span class="text-emerald-400 animate-pulse drop-shadow-md">▲ +${ovrDiff}</span>` : (ovrDiff < 0 ? `<span class="text-red-400 drop-shadow-md">▼ ${ovrDiff}</span>` : `<span class="text-slate-500">-</span>`);
const ovrColor = potentialOvr >= 90 ? 'text-purple-400' : (potentialOvr >= 80 ? 'text-fut-gold' : 'text-white');

return `<button onclick="window.confirmChangePos('${pId}', '${pos.id}')" class="bg-slate-800 hover:bg-emerald-900 border border-slate-600 hover:border-emerald-500 p-3 rounded-xl text-left transition group flex flex-col gap-1 relative overflow-hidden">
      <div class="flex justify-between items-center w-full relative z-10">
          <div class="font-bold text-lg text-emerald-400 group-hover:text-white">${pos.name}</div>
          <div class="flex flex-col items-end">
              <div class="text-[10px] text-slate-400 mb-0.5">선택 시 예상 OVR</div>
              <div class="font-oswald text-2xl ${ovrColor} leading-none flex items-center gap-2">${potentialOvr} <span class="text-sm">${diffStr}</span></div>
          </div>
      </div>
      <div class="text-[11px] text-slate-400 mt-1 relative z-10">${pos.desc}</div>
      <div class="text-[9px] text-red-300 mt-1 bg-red-900/30 w-fit px-1.5 py-0.5 rounded border border-red-800/50">🔥 핵심 스탯: ${pos.core} (70% 반영)</div>
  </button>`;
}).join('');

modal.innerHTML = `<div class="bg-pitch-bg p-6 rounded-3xl border-2 border-emerald-500 max-w-sm w-full sm:max-w-md shadow-2xl">
  <h3 class="text-xl font-display text-white mb-2 text-center">선호 포지션 변경</h3>
  <p class="text-[10px] text-emerald-400 mb-4 text-center leading-relaxed">포지션별로 요구하는 <b>핵심 스탯(70%), 보조 스탯(25%)</b>이 다릅니다.<br>나의 강점을 극대화할 수 있는 포지션을 찾아보세요!</p>
  <div class="bg-slate-900 p-3 rounded-xl mb-4 border border-slate-700 flex justify-between items-center shadow-inner">
      <span class="text-sm text-slate-300 font-bold">현재 내 OVR (${POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정'})</span>
      <span class="font-oswald text-2xl text-fut-gold">${currentOvr}</span>
  </div>
  <div class="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">${btns}</div>
  <button onclick="this.parentElement.parentElement.remove()" class="mt-4 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-xl w-full transition shadow-md">닫기</button>
</div>`;
document.body.appendChild(modal); window.posModalInstance = modal;
};

window.confirmChangePos = async (pId, newPos) => {
try {
checkAuthReady();
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(pId));
await setDoc(docRef, { pos: newPos }, { merge: true });
if(window.posModalInstance) window.posModalInstance.remove();
window.customAlert(`포지션이 [${POS_KR[newPos]}] (으)로 변경되었습니다.`);
} catch (e) { console.error("posChange Error:", e); window.customAlert(`포지션 변경 에러:\n${e.message}`); }
};

window.sortMasterStats = (key) => { window.currentSortKey = key; window.renderMasterStats(); window.renderMasterDashboard(); };

window.renderMasterStats = () => {
if(!window.playerState.isGM) return;
const statsTbody = document.getElementById('masterStatsTableBodyOnly'); if(!statsTbody) return;
let statsHtml = '';

const players = [...window.allPlayersData].sort((a,b) => {
if(window.currentSortKey === 'age') {
const ageA = Number(a.age) || 13;
const ageB = Number(b.age) || 13;
if (ageB !== ageA) return ageB - ageA; // 나이 많은 순 (내림차순)
return getOVR(b) - getOVR(a);
}
if(window.currentSortKey === 'ovr') return getOVR(b) - getOVR(a);
const bBonus = getBonusStats(b).flat; const aBonus = getBonusStats(a).flat;
const bVal = (Number(b[window.currentSortKey])||60) + (bBonus[window.currentSortKey]||0);
const aVal = (Number(a[window.currentSortKey])||60) + (aBonus[window.currentSortKey]||0);
if (bVal !== aVal) return bVal - aVal;
return getOVR(b) - getOVR(a);
});

players.forEach(p => {
const ovr = getOVR(p); const posText = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정'; const b = getBonusStats(p).flat;
const ageVal = Number(p.age) || 13;
const getCell = (key) => {
const base = Number(p[key])||60; const bonus = b[key]||0; const total = Math.min(99, base + bonus);
const isHighlight = window.currentSortKey === key;
return `<td class="py-3 text-center font-oswald text-sm sm:text-base ${isHighlight ? 'text-white font-bold bg-slate-800/50' : 'text-slate-300'}">${total} ${bonus>0 ? `<span class="text-[9px] text-emerald-400 ml-0.5 absolute mt-0.5">+${bonus}</span>`:''}</td>`;
};
statsHtml += `<tr class="hover:bg-slate-800/80 transition cursor-pointer" onclick="window.switchTab('tabWorkspace'); window.selectPlayer('${p.id}')"><td class="py-3 pl-4 text-left font-bold text-white flex items-center gap-2 whitespace-nowrap"><span class="inline-flex items-center justify-center align-middle">${getAvatarHtml(p, 'sm')}</span><span>${p.name}</span></td><td class="py-3 text-center whitespace-nowrap"><span class="text-[12px] font-bold text-emerald-400 px-1.5 py-0.5 leading-none">${ageVal}</span></td><td class="py-3 text-center whitespace-nowrap"><span class="text-[10px] font-bold ${getPosColor(p.pos)} border border-slate-600 px-1.5 py-0.5 rounded leading-none">${posText}</span></td><td class="py-3 text-center font-oswald text-base sm:text-lg ${window.currentSortKey==='ovr' ? 'text-white bg-slate-800/50' : 'text-fut-gold'} font-bold">${ovr}</td>${getCell('pac')}${getCell('sho')}${getCell('pas')}${getCell('dri')}${getCell('def')}${getCell('phy')}${getCell('ref')}${getCell('int')}${getCell('pst')}${getCell('dis')}${getCell('cmp')}${getCell('wrk')}</tr>`;
});
statsTbody.innerHTML = statsHtml;
};

function renderLeaderboard() {
const players = window.allPlayersData.filter(p => (Number(p.level) || 1) >= 0); 
const categories = [
{ id: 'goals', name: '득점왕', icon: '⚽', color: 'text-yellow-400', border: 'border-yellow-400/50' }, { id: 'assists', name: '어시왕', icon: '🤝', color: 'text-blue-400', border: 'border-blue-400/50' },
{ id: 'matches', name: '최다 출전', icon: '🏃‍♂️', color: 'text-emerald-400', border: 'border-emerald-400/50' }, { id: 'saves', name: '수문장 (세이브)', icon: '🧤', color: 'text-orange-400', border: 'border-orange-400/50' },
{ id: 'keypass', name: '킬패스 마스터', icon: '🎯', color: 'text-purple-400', border: 'border-purple-400/50' }, { id: 'training', name: '성실왕 (훈련)', icon: '💦', color: 'text-fut-rare', border: 'border-fut-rare/50' }
];

let html = '';
categories.forEach(cat => {
const sorted = [...players].sort((a, b) => { const diff = (Number(b[cat.id]) || 0) - (Number(a[cat.id]) || 0); if (diff !== 0) return diff; return getOVR(b) - getOVR(a); }).filter(p => (Number(p[cat.id]) || 0) > 0).slice(0, 3);
let listHtml = '';
if (sorted.length === 0) { listHtml = `<p class="text-xs text-slate-500 text-center py-4">아직 기록이 없습니다.</p>`; } 
else {
const medals = ['🥇', '🥈', '🥉'];
sorted.forEach((p, idx) => {
const tier = getTierInfo(getOVR(p)); const posText = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정';
listHtml += `<div class="flex items-center justify-between bg-slate-800/50 p-2 rounded-lg mb-1 border border-slate-700"><div class="flex items-center gap-2"><span class="text-lg w-6 text-center">${medals[idx]}</span><span class="inline-flex items-center justify-center">${getAvatarHtml(p, 'md')}</span><div><p class="text-sm font-bold text-white leading-none">${p.name}</p><div class="flex items-center gap-1 mt-1"><span class="text-[8px] ${tier.class} px-1 rounded border leading-none py-0.5">${tier.name.split(' ')[0]}</span><span class="text-[9px] ${cat.color} font-bold">${posText}</span></div></div></div><div class="font-oswald text-xl font-bold ${cat.color} bg-black/30 px-3 py-1 rounded-lg border ${cat.border}">${Number(p[cat.id])||0}</div></div>`;
});
}
html += `<div class="bg-slate-900/60 rounded-2xl border border-slate-700 overflow-hidden shadow-lg hover:border-slate-500 transition duration-300"><div class="bg-slate-800 p-3 border-b border-slate-700 flex items-center justify-between"><h4 class="font-display text-lg text-white flex items-center gap-2"><span class="text-2xl">${cat.icon}</span> ${cat.name}</h4></div><div class="p-3">${listHtml}</div></div>`;
});
document.getElementById('leaderboardGrid') && (document.getElementById('leaderboardGrid').innerHTML = html);
}

function renderMasterDashboard() {
if(!window.playerState.isGM) return;
const tbody = document.getElementById('masterTableBody'); if(!tbody) return;
let html = '';
const players = [...window.allPlayersData].sort((a,b) => {
if(window.currentSortKey === 'age') {
const ageA = Number(a.age) || 13;
const ageB = Number(b.age) || 13;
if (ageB !== ageA) return ageB - ageA;
}
return getOVR(b) - getOVR(a);
});

players.forEach(p => {
const ovr = getOVR(p); const tier = getTierInfo(ovr); const posText = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정';
const ageVal = Number(p.age) || 13;
html += `<tr class="hover:bg-slate-800/80 transition cursor-pointer" onclick="window.switchTab('tabWorkspace'); window.selectPlayer('${p.id}')"><td class="py-3 pl-4 text-left font-bold text-white flex items-center gap-2 whitespace-nowrap"><span class="inline-flex items-center justify-center">${getAvatarHtml(p, 'sm')}</span><span>${p.name}</span></td><td class="py-3 text-center whitespace-nowrap"><span class="text-[12px] font-bold text-emerald-400 px-1.5 py-0.5 leading-none">${ageVal}</span></td><td class="py-3 text-center whitespace-nowrap"><span class="text-[10px] font-bold ${getPosColor(p.pos)} border border-slate-600 px-1.5 py-0.5 rounded leading-none">${posText}</span></td><td class="py-3 text-center whitespace-nowrap"><span class="text-[10px] font-bold ${tier.class} border px-1.5 py-0.5 rounded shadow-sm">${tier.name.split(' ')[0]}</span></td><td class="py-3 text-center font-oswald text-base text-fut-gold font-bold">${ovr}</td><td class="py-3 text-center text-slate-300">${Number(p.matches)||0}</td><td class="py-3 text-center text-slate-300">${Number(p.goals)||0}</td><td class="py-3 text-center text-slate-300">${Number(p.assists)||0}</td><td class="py-3 text-center text-slate-300">${Number(p.saves)||0}</td><td class="py-3 text-center text-slate-300">${Number(p.training)||0}</td><td class="py-3 text-center font-oswald text-orange-400 text-sm">${Number(p.exp)||0}</td><td class="py-3 pr-4 text-right font-oswald text-emerald-400 font-bold text-sm">${Number(p.bong)||0} B</td><td class="py-3 px-2 text-center"><button onclick="event.stopPropagation(); window.deletePlayer('${p.id}', '${p.name}')" class="text-red-400 hover:text-white transition bg-red-900/40 hover:bg-red-600 px-2 py-1 rounded text-[10px] border border-red-800/50"><i class="fa-solid fa-trash"></i> 삭제</button></td></tr>`;
});
tbody.innerHTML = html;
}

window.renderCompareList = () => {
const listContainer = document.getElementById('comparePlayerList'); if(!listContainer) return;
let html = ''; const myId = window.selectedPlayerId; const players = [...window.allPlayersData].sort((a,b) => getOVR(b) - getOVR(a));
players.forEach(p => {
if(p.id === myId) return; 
const ovr = getOVR(p); const posText = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정';
html += `<div class="flex items-center justify-between p-3 rounded-xl cursor-pointer transition ${window.compareTargetId === p.id ? 'bg-pink-900/40 border-pink-500' : 'bg-slate-800 hover:bg-slate-700 border-slate-600'} border" onclick="window.selectCompareTarget('${p.id}')"><div class="flex items-center gap-3"><div class="flex items-center justify-center">${getAvatarHtml(p, 'md')}</div><div><div class="font-bold text-white text-sm">${p.name}</div><div class="text-[10px] font-bold ${getPosColor(p.pos)}">${posText}</div></div></div><div class="font-oswald text-lg text-fut-gold font-bold">${ovr}</div></div>`;
});
listContainer.innerHTML = html; window.renderCompareView();
};

window.selectCompareTarget = (pId) => { window.compareTargetId = pId; window.renderCompareList(); };

window.renderCompareView = () => {
const view = document.getElementById('compareViewArea'); if(!view) return;
const myId = window.selectedPlayerId; const myP = window.allPlayersData.find(x => x.id === myId); const tgP = window.allPlayersData.find(x => x.id === window.compareTargetId);

if(!myP || !tgP) {
view.innerHTML = `<div class="text-center text-slate-500 py-10 flex flex-col items-center"><i class="fa-solid fa-users text-4xl mb-3 text-slate-700"></i><span>우측 (또는 하단) 명단에서 비교할 대상을 선택하세요.</span></div>`; return;
}

const myOvr = getOVR(myP); const tgOvr = getOVR(tgP);
const myBonus = getBonusStats(myP).flat; const tgBonus = getBonusStats(tgP).flat;
const stats = [ { id: 'pac', label: '속력 (PAC)' }, { id: 'sho', label: '슈팅 (SHO)' }, { id: 'pas', label: '패스 (PAS)' }, { id: 'dri', label: '드리블 (DRI)' }, { id: 'def', label: '수비 (DEF)' }, { id: 'phy', label: '피지컬 (PHY)' }, { id: 'ref', label: '반사신경 (REF)' }, { id: 'int', label: '가로채기 (INT)' }, { id: 'pst', label: '위치선정 (PST)' }, { id: 'dis', label: '볼배급 (DIS)' }, { id: 'cmp', label: '평정심 (CMP)' }, { id: 'wrk', label: '활동량 (WRK)' } ];

let statRows = '';
stats.forEach(s => {
const myVal = Math.min(99, (Number(myP[s.id])||60) + myBonus[s.id]); const tgVal = Math.min(99, (Number(tgP[s.id])||60) + tgBonus[s.id]);
const myColor = myVal > tgVal ? 'text-emerald-400' : (myVal < tgVal ? 'text-slate-500' : 'text-slate-300');
const tgColor = tgVal > myVal ? 'text-pink-400' : (tgVal < myVal ? 'text-slate-500' : 'text-slate-300');
const myW = (myVal / 99) * 100; const tgW = (tgVal / 99) * 100;

statRows += `<div class="mb-2.5"><div class="flex justify-between items-center text-[10px] sm:text-xs font-bold mb-1 px-1"><span class="${myColor} font-oswald text-sm sm:text-base drop-shadow-sm">${myVal}</span><span class="text-slate-400 font-sans tracking-tight">${s.label.split(' ')[0]}</span><span class="${tgColor} font-oswald text-sm sm:text-base drop-shadow-sm">${tgVal}</span></div><div class="flex gap-1 h-2 sm:h-2.5"><div class="flex-1 bg-slate-800 rounded-l-full overflow-hidden flex justify-end shadow-inner"><div class="${myVal > tgVal ? 'bg-emerald-500' : 'bg-slate-500'} h-full transition-all duration-700 ease-out" style="width: ${myW}%"></div></div><div class="flex-1 bg-slate-800 rounded-r-full overflow-hidden shadow-inner"><div class="${tgVal > myVal ? 'bg-pink-500' : 'bg-slate-500'} h-full transition-all duration-700 ease-out" style="width: ${tgW}%"></div></div></div></div>`;
});

view.innerHTML = `<div class="flex justify-between items-center mb-6 px-4"><div class="flex flex-col items-center"><span class="inline-flex items-center justify-center mb-2">${getAvatarHtml(myP, 'xl')}</span><span class="font-bold text-white text-sm sm:text-base">${myP.name}</span><span class="font-oswald text-2xl text-emerald-400 mt-1">${myOvr}</span></div><div class="font-display text-2xl text-slate-500 px-4">VS</div><div class="flex flex-col items-center"><span class="inline-flex items-center justify-center mb-2">${getAvatarHtml(tgP, 'xl')}</span><span class="font-bold text-white text-sm sm:text-base">${tgP.name}</span><span class="font-oswald text-2xl text-pink-400 mt-1">${tgOvr}</span></div></div><div class="flex-1 bg-slate-900/50 p-4 sm:p-5 rounded-xl border border-slate-700 shadow-inner overflow-y-auto custom-scrollbar">${statRows}</div>`;
};

window.renderAchievements = () => {
const grid = document.getElementById('achievementsGrid'); if(!grid) return;
const pId = window.selectedPlayerId; const p = window.allPlayersData.find(x => x.id === pId);

if(!p) { grid.innerHTML = '<div class="col-span-full text-center text-slate-500 py-10">라커룸에서 선수를 선택해주세요.</div>'; return; }
document.getElementById('achievementTargetName') && (document.getElementById('achievementTargetName').innerText = `${p.name} 달성률`);

const claimedAchievements = Array.isArray(p.claimedAchievements) ? p.claimedAchievements : [];
let achievedCount = 0; let html = '';

ACHIEVEMENTS.forEach(ach => {
const currentVal = Number(p[ach.reqKey]) || 0; const isAchieved = currentVal >= ach.reqValue;
const isClaimed = claimedAchievements.includes(ach.id);
if(isAchieved) achievedCount++; const percent = Math.min(100, Math.floor((currentVal / ach.reqValue) * 100));

let claimBtnHtml = '';
if (isAchieved && !isClaimed) {
claimBtnHtml = `<button onclick="window.claimAchievement('${ach.id}')" class="mt-3 w-full bg-gradient-to-r from-fut-gold-dark to-fut-gold hover:from-fut-gold hover:to-yellow-200 text-slate-900 font-bold py-1.5 rounded-lg shadow-md transition text-xs flex items-center justify-center gap-1.5 active:scale-95"><i class="fa-solid fa-gift text-sm"></i> 보상 받기 (${ach.reward} B)</button>`;
} else if (isClaimed) {
claimBtnHtml = `<div class="mt-3 w-full bg-slate-800 text-slate-500 font-bold py-1.5 rounded-lg border border-slate-700 text-xs flex items-center justify-center gap-1.5"><i class="fa-solid fa-check text-sm"></i> 보상 수령 완료</div>`;
} else {
claimBtnHtml = `<div class="mt-3 w-full bg-slate-800/40 text-slate-600 py-1.5 rounded-lg border border-slate-700/50 text-xs flex items-center justify-center gap-1.5"><i class="fa-solid fa-lock text-[10px]"></i> 달성 시 ${ach.reward} B 지급</div>`;
}

html += `<div class="bg-slate-900/80 rounded-xl p-4 border transition duration-300 ${isAchieved ? 'achieved-card' : 'unachieved-card'} flex gap-4 items-center relative overflow-hidden">${isAchieved ? '<div class="absolute -right-4 -top-4 bg-fut-gold text-black text-[10px] font-bold py-1 px-8 rotate-45 shadow-md z-10">CLEARED</div>' : ''}<div class="text-4xl w-14 flex-shrink-0 text-center drop-shadow-md ${isAchieved ? '' : 'opacity-50 grayscale'}">${ach.icon}</div><div class="flex-grow flex flex-col justify-between"><div class="flex justify-between items-start mb-1"><div><span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 ${ach.color}">${ach.category}</span><h5 class="font-bold text-white text-sm sm:text-base mt-1 ${isAchieved ? 'text-fut-gold' : ''}">${ach.title}</h5></div></div><p class="text-[10px] sm:text-xs text-slate-400 mb-2 leading-tight break-keep">${ach.desc}</p><div class="flex justify-between text-[10px] font-bold text-slate-500 mb-1"><span>진행도</span><span class="${isAchieved ? 'text-fut-gold' : 'text-slate-400'}">${currentVal} / ${ach.reqValue}</span></div><div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden"><div class="h-1.5 rounded-full transition-all duration-1000 ${isAchieved ? ach.bg : 'bg-slate-500'}" style="width: ${percent}%"></div></div>${claimBtnHtml}</div></div>`;
});
grid.innerHTML = html;
const progressPercent = Math.floor((achievedCount / ACHIEVEMENTS.length) * 100);
document.getElementById('achievementProgressText') && (document.getElementById('achievementProgressText').innerText = `${progressPercent}%`);
document.getElementById('achievementProgressBar') && (document.getElementById('achievementProgressBar').style.width = `${progressPercent}%`);
};

window.claimAchievement = async (achId) => {
try {
checkAuthReady();
if(window.playerState.isGuest) return window.customAlert("게스트는 이용할 수 없는 기능입니다.");

const pId = window.selectedPlayerId;
if(!window.playerState.isGM && pId !== window.playerState.id) return window.customAlert("❌ 자신의 보상만 받을 수 있습니다.");

const p = window.allPlayersData.find(x => x.id === pId);
const ach = ACHIEVEMENTS.find(x => x.id === achId);
if(!p || !ach) return;

const claimedAchievements = Array.isArray(p.claimedAchievements) ? p.claimedAchievements : [];
if (claimedAchievements.includes(achId)) return window.customAlert("이미 수령한 보상입니다.");

const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id));
const newBong = (Number(p.bong) || 0) + ach.reward;
const newClaimed = [...claimedAchievements, achId];

await setDoc(docRef, { bong: newBong, claimedAchievements: newClaimed }, { merge: true });

triggerConfetti();
window.customAlert(`🎉 [${ach.title}] 트로피 달성!\n보상으로 ${ach.reward} B가 지급되었습니다.`);
window.renderAchievements();
window.renderSelectedCard(pId); // 좌측 프로필 자산 즉시 갱신
window.renderSelectedCard(pId);
} catch(e) {
console.error("claimAch err:", e);
window.customAlert(`보상 수령 에러:\n${e.message}`);
}
};

window.changeTeamCount = (change) => {
window.targetTeamCount = Math.max(2, Math.min(6, window.targetTeamCount + change));
document.getElementById('targetTeamCount') && (document.getElementById('targetTeamCount').innerText = window.targetTeamCount);
};

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/** 모의경기: 팀별 라커 소속 인원 수 */
function countSimTeam(team) {
return (window.allPlayersData || []).filter((p) => p.simTeam === team).length;
}
/** 출전 5인: OVR 상위 5명 */
function getSimMatchRoster(team) {
return (window.allPlayersData || [])
.filter((p) => p.simTeam === team)
.sort((a, b) => getOVR(b) - getOVR(a))
.slice(0, 5);
}

/** 모의경기 탭: 라커 simTeam 기준 로스터 미리보기 */
window.renderSimMatchTab = () => {
const na = countSimTeam('A');
const nb = countSimTeam('B');
const ca = document.getElementById('simCountA');
const cb = document.getElementById('simCountB');
if (ca) ca.textContent = `소속 ${na}명 · 출전 OVR 상위 5명`;
if (cb) cb.textContent = `소속 ${nb}명 · 출전 OVR 상위 5명`;
const rosterA = getSimMatchRoster('A');
const rosterB = getSimMatchRoster('B');
const elA = document.getElementById('simRosterPreviewA');
const elB = document.getElementById('simRosterPreviewB');
const line = (p) => {
const pt = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정';
return `<div class="flex justify-between gap-2 border-b border-white/5 pb-0.5"><span class="truncate">${p.name}</span><span class="text-fut-gold shrink-0">${getOVR(p)}</span><span class="text-slate-500 text-[10px] shrink-0">${pt}</span></div>`;
};
if (elA) elA.innerHTML = rosterA.length ? rosterA.map(line).join('') : '<span class="text-slate-500">팀 A 소속 없음 — 라커룸에서 A를 눌러주세요.</span>';
if (elB) elB.innerHTML = rosterB.length ? rosterB.map(line).join('') : '<span class="text-slate-500">팀 B 소속 없음 — 라커룸에서 B를 눌러주세요.</span>';
};

/** 중계 문장을 자동 줄바꿈 (캔버스 폭 기준) */
function wrapSimBroadcastLines(ctx, text, maxWidth) {
const lines = [];
let line = '';
for (let i = 0; i < text.length; i++) {
const ch = text[i];
const test = line + ch;
if (ctx.measureText(test).width > maxWidth && line.length > 0) {
lines.push(line);
line = ch;
} else {
line = test;
}
}
if (line.length) lines.push(line);
return lines.length ? lines : [''];
}

/** 중계 한 줄을 방송용 이미지(img)로 렌더링 */
function simBroadcastTextToImage(text) {
return new Promise((resolve) => {
const logBox = document.getElementById('simMatchLog');
const maxCssW = Math.min(720, Math.max(260, (logBox?.clientWidth || 560) - 8));
const pad = 14;
const lineHeight = 22;
const fontSize = 14;
const dpr = Math.min(2, typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1);

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
if (!ctx) {
const fallback = document.createElement('div');
fallback.className = 'text-slate-200 text-xs p-2 rounded-lg bg-slate-900/90 border border-amber-800/40';
fallback.textContent = text;
resolve(fallback);
return;
}

ctx.font = `600 ${fontSize}px "Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif`;
const innerW = maxCssW - pad * 2 - 6;
const lines = wrapSimBroadcastLines(ctx, text, innerW);
const isGoal = text.includes('⚽');
const isTitle = text.includes('━━');
const isHalftime = text.includes('하프타임') || text.includes('[휴식]');

let cssH = pad * 2 + lines.length * lineHeight + 6;
const cssW = maxCssW;

canvas.width = Math.floor(cssW * dpr);
canvas.height = Math.floor(cssH * dpr);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const grd = ctx.createLinearGradient(0, 0, cssW, cssH);
if (isGoal) {
grd.addColorStop(0, '#14532d');
grd.addColorStop(1, '#052e16');
} else if (isTitle) {
grd.addColorStop(0, '#1e293b');
grd.addColorStop(1, '#0f172a');
} else if (isHalftime) {
grd.addColorStop(0, '#312e81');
grd.addColorStop(1, '#1e1b4b');
} else {
grd.addColorStop(0, '#132447');
grd.addColorStop(1, '#0a1628');
}
ctx.fillStyle = grd;
if (typeof ctx.roundRect === 'function') {
ctx.beginPath();
ctx.roundRect(0, 0, cssW, cssH, 10);
ctx.fill();
} else {
ctx.fillRect(0, 0, cssW, cssH);
}

ctx.fillStyle = isGoal ? '#fbbf24' : isHalftime ? '#a5b4fc' : '#e8c271';
ctx.fillRect(0, 0, 5, cssH);

ctx.fillStyle = isGoal ? '#fef9c3' : '#f1f5f9';
ctx.font = `600 ${fontSize}px "Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif`;
ctx.textBaseline = 'top';
lines.forEach((ln, i) => {
ctx.fillText(ln, pad + 8, pad + i * lineHeight);
});

const img = new Image();
img.className = 'sim-broadcast-img w-full h-auto rounded-lg shadow-md border border-amber-900/30 select-none';
img.alt = text;
img.draggable = false;
img.src = canvas.toDataURL('image/png');
if (img.complete) resolve(img);
else {
img.onload = () => resolve(img);
img.onerror = () => resolve(img);
}
});
}

window.simClearLog = () => {
const log = document.getElementById('simMatchLog');
if (log) log.innerHTML = '';
document.getElementById('simScoreBar')?.classList.add('hidden');
document.getElementById('simClockWrap')?.classList.add('hidden');
};

/** 풋살 5vs5 · 시뮬 전·후반 각 20분을 실제 시청 전·후반 각 2분에 비례 압축 중계 */
window.runSimMatch = async () => {
if (countSimTeam('A') < 5 || countSimTeam('B') < 5) {
return window.customAlert('팀 A·팀 B 각각 라커룸에서 5명이 소속되어야 합니다. (경기 출전은 OVR 상위 5명)');
}
const plA = getSimMatchRoster('A');
const plB = getSimMatchRoster('B');
if (plA.length !== 5 || plB.length !== 5) return window.customAlert('출전 선수를 구성할 수 없습니다.');

const teamAName = (document.getElementById('simTeamAName')?.value || '').trim() || '팀 A';
const teamBName = (document.getElementById('simTeamBName')?.value || '').trim() || '팀 B';

const btn = document.getElementById('btnSimStart');
if (btn) { btn.disabled = true; btn.classList.add('opacity-50', 'cursor-not-allowed'); }

const logEl = document.getElementById('simMatchLog');
const scoreBar = document.getElementById('simScoreBar');
const scoreNums = document.getElementById('simScoreNums');
const nameAEl = document.getElementById('simScoreAName');
const nameBEl = document.getElementById('simScoreBName');
const clockWrap = document.getElementById('simClockWrap');
if (logEl) logEl.innerHTML = '';
if (scoreBar) scoreBar.classList.remove('hidden');
if (clockWrap) clockWrap.classList.remove('hidden');
if (nameAEl) nameAEl.textContent = teamAName;
if (nameBEl) nameBEl.textContent = teamBName;
let sa = 0;
let sb = 0;
const updScore = () => { if (scoreNums) scoreNums.textContent = `${sa} - ${sb}`; };
updScore();

const strA = plA.reduce((s, p) => s + getOVR(p), 0);
const strB = plB.reduce((s, p) => s + getOVR(p), 0);
const ratio = strA + strB > 0 ? strA / (strA + strB) : 0.5;

/** 시뮬레이터 한 하프 길이(초): 20분 */
const SIM_HALF_SEC = 20 * 60;
/** 실제로 한 하프를 보는 시간(ms): 2분 → 시뮬 1초당 실제 경과 */
const MS_PER_SIM_SEC = (2 * 60 * 1000) / SIM_HALF_SEC;
/** 하프당 중계 이벤트 기대치 유지(구 2분하프·초당 0.16과 동일 스케일) */
const SIM_EVENT_PROB_PER_SEC = (120 * 0.16) / SIM_HALF_SEC;

const setMatchClock = (halfIdx, simSec) => {
const el = document.getElementById('simMatchClock');
const halfLabel = halfIdx === 0 ? '전반' : '후반';
const m = Math.floor(simSec / 60);
const s = simSec % 60;
if (el) el.textContent = `${halfLabel} ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const append = async (line) => {
if (!logEl) return;
const node = await simBroadcastTextToImage(line);
logEl.appendChild(node);
logEl.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' });
await sleep(42);
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const gkOf = (arr) => arr.find((p) => p.pos === 'Goleiro') || arr[0];

const trySecondEvent = async (halfIdx, simSec) => {
const halfLabel = halfIdx === 0 ? '전반' : '후반';
const mm = String(Math.floor(simSec / 60)).padStart(2, '0');
const ss = String(simSec % 60).padStart(2, '0');
const prefix = `[${halfLabel} ${mm}:${ss}]`;
if (Math.random() > SIM_EVENT_PROB_PER_SEC) return;
const attackA = Math.random() < ratio + (Math.random() * 0.08 - 0.04);
const atk = attackA ? plA : plB;
const def = attackA ? plB : plA;
const atkName = attackA ? teamAName : teamBName;
const defName = attackA ? teamBName : teamAName;
const r = Math.random();

if (r < 0.28) {
const p1 = pick(atk);
const p2 = pick(atk);
if (p1.id === p2.id) {
await append(`${prefix} ${atkName}: ${p1.name}이(가) 공을 끌고 전진합니다.`);
} else {
await append(`${prefix} ${atkName}: ${p1.name} → ${p2.name}. 패스로 지역을 넓힙니다.`);
}
} else if (r < 0.48) {
const p = pick(atk);
await append(`${prefix} ${atkName}: ${p.name}이(가) 좁은 공간에서 드리블 돌파를 노립니다.`);
} else if (r < 0.68) {
const p = pick(atk);
const gk = gkOf(def);
const shot = getOVR(p) + Math.random() * 15;
const save = getOVR(gk) * 1.08 + Math.random() * 12;
const bias = (attackA ? strA - strB : strB - strA) * 0.018;
if (shot + bias > save + 7) {
if (attackA) sa++; else sb++;
updScore();
await append(`${prefix} ⚽ 골! ${atkName} — ${p.name}의 슛이 골망을 흔듭니다! (${sa}-${sb})`);
} else {
await append(`${prefix} ${defName} ${gk.name}, 선방! ${p.name}의 슛을 막아냅니다.`);
}
} else if (r < 0.88) {
await append(`${prefix} ${atkName}: 터치라인 근처 킥인. 패스 템포를 유지합니다.`);
} else {
await append(`${prefix} ${defName}: 피벗 앞 압박으로 공간을 좁힙니다.`);
}
};

try {
await append(`━━ ${teamAName} vs ${teamBName} · 모의 풋살 (5vs5, 시뮬 전·후반 각 20분 — 시청은 각 2분 비례) ━━`);
await append(`[감독 모드] 전력 요약: ${teamAName} 출전 OVR 합 ${strA}  |  ${teamBName} 출전 OVR 합 ${strB}`);
await append(`[전반 00:00] 킥오프 — 좁은 풋살 코트에서 공이 굴러갑니다.`);

for (let halfIdx = 0; halfIdx < 2; halfIdx++) {
setMatchClock(halfIdx, 0);
for (let simSec = 0; simSec < SIM_HALF_SEC; simSec++) {
setMatchClock(halfIdx, simSec);
await trySecondEvent(halfIdx, simSec);
await sleep(MS_PER_SIM_SEC);
}
setMatchClock(halfIdx, SIM_HALF_SEC);
const hl = halfIdx === 0 ? '전반' : '후반';
await append(`[${hl} 20:00] ${hl} 종료 휘슬`);
if (halfIdx === 0) {
await append(`[휴식] 하프타임 — 전술을 가다듬습니다.`);
}
}

await append(`━━ 최종 스코어 ${teamAName} ${sa} : ${sb} ${teamBName} ━━`);
await append(`(모의 시뮬레이션 종료 · 서버 기록·EXP 미반영)`);
} finally {
if (btn) { btn.disabled = false; btn.classList.remove('opacity-50', 'cursor-not-allowed'); }
}
};

window.generateBalancedTeams = () => {
const resultEl = document.getElementById('teamResult');
if(window.checkedInPlayers.size < window.targetTeamCount) { window.customAlert(`선택된 선수가 ${window.targetTeamCount}명보다 적습니다.`); return; }

const activePlayers = Array.from(window.checkedInPlayers).map(id => window.allPlayersData.find(p => p.id === id)).filter(Boolean);
const teams = Array.from({ length: window.targetTeamCount }, () => ({ players: [], totalOvr: 0 }));

// 1. 포지션별 그룹화
const posGroups = { 'Goleiro': [], 'Fixo': [], 'Pivo': [], 'Ala': [], '미정': [] };
activePlayers.forEach(p => {
const pos = p.pos && posGroups[p.pos] ? p.pos : '미정';
posGroups[pos].push(p);
});

// 2. 골레이로(GK) 우선 고정 배치 (각 팀에 1명씩 최대한 보장되도록 라운드로빈 배분)
posGroups['Goleiro'].sort((a, b) => getOVR(b) - getOVR(a));
let teamIdx = 0;
posGroups['Goleiro'].forEach(p => {
if (teamIdx < window.targetTeamCount) {
teams[teamIdx].players.push(p);
teams[teamIdx].totalOvr += getOVR(p);
teamIdx++;
} else {
teams.sort((a, b) => a.totalOvr - b.totalOvr);
teams[0].players.push(p);
teams[0].totalOvr += getOVR(p);
}
});

// 3. 픽소(DF) 다음으로 밸런스 분배
posGroups['Fixo'].sort((a, b) => getOVR(b) - getOVR(a));
posGroups['Fixo'].forEach(p => {
teams.sort((a, b) => a.totalOvr - b.totalOvr);
teams[0].players.push(p);
teams[0].totalOvr += getOVR(p);
});

// 4. 나머지 포지션(Pivo, Ala, 미정) 밸런스 분배
const posOrder = ['Pivo', 'Ala', '미정'];
posOrder.forEach(pos => {
posGroups[pos].sort((a, b) => getOVR(b) - getOVR(a));
posGroups[pos].forEach(p => {
teams.sort((a, b) => a.totalOvr - b.totalOvr);
teams[0].players.push(p);
teams[0].totalOvr += getOVR(p);
});
});

let html = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">';
teams.forEach((team, idx) => {
const avgOvr = Math.round(team.totalOvr / team.players.length);
let pList = team.players.map(p => {
const posColor = getPosColor(p.pos); const posText = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정';
return `<div class="flex justify-between items-center text-sm py-1 border-b border-slate-700/50 last:border-0"><span class="flex items-center gap-2"><span class="inline-flex w-8 justify-center">${getAvatarHtml(p, 'sm')}</span> <span class="text-white font-bold">${p.name}</span></span> <div class="flex items-center gap-2"><span class="text-[9px] ${posColor} border border-slate-700 px-1 rounded font-bold">${posText}</span><span class="font-oswald text-fut-gold">${getOVR(p)}</span></div></div>`;
}).join('');

html += `<div class="bg-slate-900/80 p-4 rounded-xl border-t-4 border-emerald-500 shadow-lg"><div class="flex justify-between items-center mb-3 pb-2 border-b border-emerald-900/50"><h4 class="font-display text-emerald-400 text-lg">TEAM ${idx + 1}</h4><span class="text-xs bg-emerald-900/50 text-emerald-300 px-2 py-1 rounded font-bold shadow-inner">평균 OVR ${avgOvr}</span></div><div class="space-y-1">${pList}</div></div>`;
});
html += '</div>';
if(resultEl) { resultEl.innerHTML = html; resultEl.classList.remove('hidden'); resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
triggerConfetti();
};

window.saveAnnouncement = async () => {
try {
checkAuthReady();
if(!window.playerState.isGM) return;
const text = document.getElementById('announcementInput')?.value.trim();
if(!text) return window.customAlert('내용을 입력하세요.');
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'announcement');
await setDoc(docRef, { text, updatedAt: new Date().toISOString() }, { merge: true });
window.customAlert('공지사항이 등록되었습니다.');
} catch(e) { console.error(e); window.customAlert('공지사항 저장 실패'); }
};

window.saveShorts = async () => {
try {
checkAuthReady();
if(!window.playerState.isGM) return;
const url = document.getElementById('shortsInput')?.value.trim();
if(!url) return window.customAlert('유튜브 쇼츠 링크를 입력하세요.');

// 유튜브 주소에서 고유 비디오 ID만 깔끔하게 추출하는 마법의 정규식!
let videoId = "";
const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|\/shorts\/)([^#&?]*).*/;
const match = url.match(regExp);

if (match && match[2].length === 11) {
videoId = match[2];
} else {
return window.customAlert('올바른 유튜브 영상 링크가 아닙니다.\n(11자리 영상 ID를 찾을 수 정규식 없습니다.)');
}

const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'shorts');
await setDoc(docRef, { videoId, updatedAt: new Date().toISOString() }, { merge: true });
window.customAlert('⚽ 쇼츠 영상이 성공적으로 세팅되었습니다!\n모든 학생의 화면에서 자동 재생됩니다.');
} catch(e) { 
console.error(e); 
window.customAlert(`쇼츠 등록 에러:\n${e.message}`); 
}
};

const triggerConfetti = () => {
const el = document.getElementById('confettiOrigin');
if(el) {
const rect = el.getBoundingClientRect();
const x = (rect.left + rect.width / 2) / window.innerWidth;
const y = (rect.top + rect.height / 2) / window.innerHeight;
confetti({ particleCount: 60, spread: 70, origin: { x, y }, colors: ['#e8c271', '#38ff8e', '#ffffff'], zIndex: 9999, disableForReducedMotion: true });
}
};

const animateFloatText = (text, colorClass, originId) => {
const el = document.getElementById(originId); if(!el) return;
const floatEl = document.createElement('div'); floatEl.className = `floating-text ${colorClass}`; floatEl.innerText = text;
el.appendChild(floatEl); setTimeout(() => floatEl.remove(), 1200);
};

window.logout = () => { localStorage.removeItem('sfc_pid'); localStorage.removeItem('sfc_pin'); location.reload(); };

// ==============================================
// 🛠️ 신규 캐릭터 수동 등록 및 삭제
// ==============================================
window.addNewPlayer = async () => {
try {
checkAuthReady();
if(!window.playerState.isGM) return;

const nameInput = document.getElementById('newPlayerName');
const ageInput = document.getElementById('newPlayerAge');
const genderInput = document.getElementById('newPlayerGender');

const name = nameInput.value.trim();
const age = Number(ageInput.value) || 13;
const gender = genderInput.value;

if(!name) return window.customAlert('추가할 학생의 이름을 입력해주세요.');

const safeDocId = getSafeDocId(name);
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + safeDocId);

const snap = await getDoc(docRef);
if(snap.exists()) return window.customAlert('이미 등록되어 있는 이름입니다.');

const r = () => Math.floor(Math.random() * 6) + 55;
const baseData = {
name: name, pos: '미정', age: age, gender: gender,
pac: r(), sho: r(), pas: r(), dri: r(), def: r(), phy: r(), ref: r(), int: r(), pst: r(), dis: r(), cmp: r(), wrk: r(),
level: 1, exp: 0, goals: 0, assists: 0, matches: 0, training: 0, saves: 0, keypass: 0, bong: 0, lastWageWeek: '',
inventory: [], itemLevels: {}, equipHead: null, equipHandL: null, equipHandR: null, equipFootL: null, equipFootR: null, equipFace: null,
updatedAt: new Date().toISOString()
};

await setDoc(docRef, baseData);
nameInput.value = '';
triggerConfetti();
window.customAlert(`🎉 [${name}] 선수가 신규 등록되었습니다!\n라커룸과 현황판에 즉시 반영됩니다.`);
} catch (e) {
console.error("추가 에러:", e);
window.customAlert(`선수 등록 에러:\n${e.message}`);
}
};

window.deletePlayer = async (pId, pName) => {
try {
checkAuthReady();
if(!window.playerState.isGM) return;

if(!await window.customConfirm(`정말 [${pName}] 선수의 데이터를 완전히 삭제하시겠습니까?\n이 작업은 절대 되돌릴 수 없습니다.`)) return;

const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(pId));
await deleteDoc(docRef);

const index = ALLOWED_PLAYERS.indexOf(pName);
if(index > -1) ALLOWED_PLAYERS.splice(index, 1);
delete GENDER_MAP[pName];

window.customAlert(`🗑️ [${pName}] 선수의 정보가 삭제되었습니다.`);
        
        if (window.selectedPlayerId === pId) {
            window.selectedPlayerId = ALLOWED_PLAYERS.length > 0 ? getSafeDocId(ALLOWED_PLAYERS[0]) : null;
            if(window.selectedPlayerId) window.selectPlayer(window.selectedPlayerId);
        }
} catch (e) {
console.error("삭제 에러:", e);
window.customAlert(`삭제 에러:\n${e.message}`);
}
};


// ==============================================
// 🚀 앱 코어 인증 및 초기화
// ==============================================
window.handleLogin = async (pId, pin, isAuto = false) => {
if(!pId) return window.customAlert("입장 권한을 선택하세요.");

const isGuest = pId === 'guest';
const isGM = pId === 'gm1' || pId === 'gm2';

if(!isGuest && (!pin || pin.length !== 4)) {
if(isAuto) { localStorage.clear(); location.reload(); return; }
return window.customAlert("4자리 숫자로 된 PIN 번호를 입력하세요.");
}

if (!auth.currentUser) {
try {
console.log("인증 정보가 없어 재접속을 시도합니다...");
if (typeof globalThis.__initial_auth_token !== 'undefined' && globalThis.__initial_auth_token) { 
await signInWithCustomToken(auth, globalThis.__initial_auth_token); 
} else { 
await signInAnonymously(auth); 
}
} catch(e) {
return window.customAlert(`서버와 연결할 수 없습니다.\n\n💡 팁: 학교 와이파이(교육망) 환경에서는 방화벽으로 차단될 수 있습니다. 스마트폰 핫스팟이나 데이터를 이용해주세요!\n(상세: ${e.message})`);
}
}

if(isGuest) {
window.playerState = { id: 'guest', isGM: false, isGuest: true, name: '게스트' };
window.selectedPlayerId = ALLOWED_PLAYERS[0];
} else {
const safeDocId = getSafeDocId(pId);
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + safeDocId);

try {
const snap = await getDoc(docRef);
const r = () => Math.floor(Math.random() * 6) + 55;

if(snap.exists()) {
const data = snap.data();
if(!data.pin) {
if(isAuto) { localStorage.clear(); location.reload(); return; }
if(!await window.customConfirm(`PIN [${pin}]으로 초기 등록하시겠습니까?`)) return;

const updateData = {
pin, pos: data.pos || '미정', pac: data.pac || r(), sho: data.sho || r(), pas: data.pas || r(),
dri: data.dri || r(), def: data.def || r(), phy: data.phy || r(), ref: data.ref || r(), int: data.int || r(), pst: data.pst || r(),
dis: data.dis || r(), cmp: data.cmp || r(), wrk: data.wrk || r(), level: data.level || 1, exp: data.exp || 0, goals: data.goals || 0,
assists: data.assists || 0, matches: data.matches || 0, training: data.training || 0, saves: data.saves || 0, keypass: data.keypass || 0, bong: data.bong || 0,
age: data.age || 13,
inventory: data.inventory || [], itemLevels: data.itemLevels || {}
};
await setDoc(docRef, { ...updateData, updatedAt: new Date().toISOString() }, { merge: true });
window.playerState = { id: safeDocId, isGM, isGuest: false, ...data, ...updateData };
} else if(data.pin !== pin) {
if(isAuto) { localStorage.clear(); location.reload(); return; }
return window.customAlert("❌ 비밀번호가 틀렸습니다.");
} else { window.playerState = { id: safeDocId, isGM, isGuest: false, ...data }; }
} else {
if(isAuto) { localStorage.clear(); location.reload(); return; }
if(!await window.customConfirm(`신규 카드 발급! PIN [${pin}]으로 등록하시겠습니까?`)) return;
const baseData = { 
name: isGM ? (pId==='gm1'?'감독 J':'수석코치 J') : pId, pin, pos: isGM ? 'Fixo' : '미정', 
pac: r(), sho: r(), pas: r(), dri: r(), def: r(), phy: r(), ref: r(), int: r(), pst: r(), dis: r(), cmp: r(), wrk: r(),
level: 1, exp: 0, goals: 0, assists: 0, matches: 0, training: 0, saves: 0, keypass: 0, bong: 0, lastWageWeek: '',
age: (pId === '신무호' || pId === '신무호') ? 12 : 13,
inventory: [], itemLevels: {}, equipHead: null, equipHandL: null, equipHandR: null, equipFootL: null, equipFootR: null, equipFace: null, equipAvatar: null,
updatedAt: new Date().toISOString()
};
await setDoc(docRef, baseData, { merge: true });
window.playerState = { id: safeDocId, isGM, isGuest: false, ...baseData };
}
localStorage.setItem('sfc_pid', pId); localStorage.setItem('sfc_pin', pin);
} catch(e) { 
console.error("Login err:", e); 
let errMsg = e.message || "원인 불명";
if(errMsg.includes("offline") || errMsg.includes("permissions") || errMsg.includes("Failed to get")) {
return window.customAlert(`서버 접속이 차단되었습니다.\n\n💡 팁: 학교 와이파이(교육망) 환경에서는 보안 방화벽으로 인해 접속이 막힐 수 있습니다. 스마트폰 핫스팟으로 잠시 연결해 보세요!\n(상세: ${errMsg})`);
}
return window.customAlert(`로그인 처리 중 에러가 발생했습니다.\n(상세: ${errMsg})`); 
}
}

if(!isGuest && !isGM) { window.selectedPlayerId = getSafeDocId(pId); }
else if (isGM && !window.selectedPlayerId) { window.selectedPlayerId = getSafeDocId(ALLOWED_PLAYERS[0]); }

document.getElementById('loginOverlay')?.style.setProperty('opacity', '0');
setTimeout(() => { document.getElementById('loginOverlay')?.classList.add('hidden'); }, 500);
document.getElementById('mainUI')?.classList.remove('hidden');

document.getElementById('saveStatus')?.classList.remove('hidden');
const roleEl = document.getElementById('playerRoleDisplay');
const nameEl = document.getElementById('playerNameDisplay');

if(isGuest) {
if(roleEl) { roleEl.innerText = "👀 게스트 모드 (관전 전용)"; roleEl.className = "text-slate-400 font-bold"; }
if(nameEl) nameEl.innerText = "손님";
} else if(isGM) {
if(roleEl) { roleEl.innerText = "👑 코칭 스태프 권한 활성화"; roleEl.className = "text-fut-gold font-bold"; }
if(nameEl) nameEl.innerText = window.playerState.name;
document.getElementById('btnTabMaster')?.classList.remove('hidden');
document.getElementById('btnTabMasterStats')?.classList.remove('hidden');
document.getElementById('gmAttendanceTools')?.classList.remove('hidden');
document.getElementById('gmAttendanceTools')?.classList.add('flex');
} else {
if(roleEl) { roleEl.innerText = "✅ 선수 등록 완료"; roleEl.className = "text-emerald-400 font-bold"; }
if(nameEl) nameEl.innerText = window.playerState.name;
}

if(isGM) window.switchTab('tabMaster');
else {
window.switchTab('tabWorkspace');
if(window.selectedPlayerId && window.allPlayersData.length > 0) window.selectPlayer(window.selectedPlayerId);
}

// 🔔 초기 공지사항 팝업 (본문이 비어 있거나 공백만 있으면 표시하지 않음)
if(!isGuest && !window.hasShownAnnouncement) {
const annRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'announcement');
getDoc(annRef).then(snap => {
const raw = snap.exists() ? snap.data().text : '';
const annText = typeof raw === 'string' ? raw.trim() : '';
if (annText) {
setTimeout(() => {
window.customAlert(`📢 [감독님 공지사항]\n\n${annText}`);
}, 800);
window.hasShownAnnouncement = true;
}
});
}
};

const initApp = async () => {
try {
// 🚨 환경 하이브리드 자동 감지 (Vite .env / 캔버스 주입 / 기본값)
let firebaseConfig;

if (import.meta.env.VITE_FIREBASE_API_KEY) {
firebaseConfig = {
apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
appId: import.meta.env.VITE_FIREBASE_APP_ID,
measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined
};
} else if (typeof globalThis.__firebase_config !== 'undefined') {
firebaseConfig = typeof globalThis.__firebase_config === 'string' ? JSON.parse(globalThis.__firebase_config) : globalThis.__firebase_config;
} else {
firebaseConfig = {
apiKey: "AIzaSyAsih-sfnIZ_gX_1l7SAVZHCAhk3KzmiP8",
authDomain: "sambong-world-2026.firebaseapp.com",
projectId: "sambong-world-2026",
storageBucket: "sambong-world-2026.firebasestorage.app",
messagingSenderId: "728320769100",
appId: "1:728320769100:web:7510c9a77cca6b87a788e9",
measurementId: "G-H1RGMJHGTV"
};
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
auth = getAuth(app);
db = getFirestore(app);
storage = getStorage(app);

const initAuth = async () => {
try {
// 캔버스 환경 전용 인증 토큰이 있으면 최우선 사용
if (typeof globalThis.__initial_auth_token !== 'undefined' && globalThis.__initial_auth_token) {
await signInWithCustomToken(auth, globalThis.__initial_auth_token);
} else {
// 깃허브 환경이거나 토큰이 없으면 익명 로그인 시도
await signInAnonymously(auth);
}
} catch (authErr) {
console.warn("권한 토큰 만료. 익명 로그인으로 전환합니다.", authErr);
try {
await signInAnonymously(auth);
} catch(anonErr) {
console.error("익명 로그인 최종 실패:", anonErr);
// 🔥 여기가 핵심입니다! 깃허브에서 이 에러가 난다면 파이어베이스 콘솔에서 '익명 로그인'을 켜주셔야 합니다.
window.customAlert(`서버 인증에 실패했습니다.\n\n💡 깃허브 환경이라면 파이어베이스 콘솔에서 [Authentication] -> [Sign-in method] -> [익명(Anonymous)] 로그인이 '사용 설정' 되어있는지 꼭 확인해주세요!\n(에러: ${anonErr.message})`);
}
}
};
await initAuth();

onAuthStateChanged(auth, (user) => {
document.getElementById('loadingOverlay')?.classList.add('hidden');

if (user) {
onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'players'), (snapshot) => {
const dbPlayers = new Map();
snapshot.forEach(d => { 
try {
if(!d.id.includes('gm')) {
const data = d.data();
const cleanId = d.id.replace('player_', '');
dbPlayers.set(cleanId, { id: cleanId, name: data.name || cleanId, ...data }); 

// 🔥 수동으로 등록된 플레이어 배열에 동기화
if (data.name && !ALLOWED_PLAYERS.includes(data.name)) {
ALLOWED_PLAYERS.push(data.name);
}
if (data.name && data.gender) {
GENDER_MAP[data.name] = data.gender;
}
}
} catch(e) { console.error("Parse err", e); }
});

// 🔥 삭제된 플레이어를 로컬 배열에서도 제거 동기화 (초기 명단 보호)
for (let i = ALLOWED_PLAYERS.length - 1; i >= 0; i--) {
const name = ALLOWED_PLAYERS[i];
const safeId = getSafeDocId(name);
if (!INITIAL_PLAYERS.includes(name) && !dbPlayers.has(safeId)) {
ALLOWED_PLAYERS.splice(i, 1);
delete GENDER_MAP[name];
}
}

// 🔥 로그인 창 플레이어 이름 선택 드롭다운 갱신
const nameSelect = document.getElementById('loginPlayerName');
if(nameSelect) {
const currentVal = nameSelect.value;
nameSelect.innerHTML = '<option value="" disabled selected>내 이름 선택하기</option>';
[...ALLOWED_PLAYERS].sort().forEach(name => {
const opt = document.createElement('option'); opt.value = name; opt.innerText = name;
if(name === currentVal) opt.selected = true;
nameSelect.appendChild(opt);
});
}

const players = [];
ALLOWED_PLAYERS.forEach(name => {
const safeId = getSafeDocId(name);
if(dbPlayers.has(safeId)) { players.push(dbPlayers.get(safeId)); } 
else {
players.push({
id: safeId, name: name, pos: '미정', pac: 60, sho: 60, pas: 60, dri: 60, def: 60, phy: 60, ref: 60, int: 60, pst: 60, dis: 60, cmp: 60, wrk: 60,
level: 1, exp: 0, goals: 0, assists: 0, matches: 0, training: 0, saves: 0, keypass: 0, bong: 0, age: 13, inventory: [], itemLevels: {}
});
}
});

window.allPlayersData = players.sort((a,b) => {
if(window.currentSortKey === 'age') {
const ageA = Number(a.age) || 13;
const ageB = Number(b.age) || 13;
if (ageB !== ageA) return ageB - ageA;
}
const lvDiff = (b.level ?? 1) - (a.level ?? 1);
if(lvDiff !== 0) return lvDiff; return getOVR(b) - getOVR(a);
});

// 로그인 상태에 따른 자동 선택 로직
if(window.playerState.id && !window.playerState.isGuest) {
if(!window.selectedPlayerId || !window.allPlayersData.find(x => x.id === window.selectedPlayerId)) {
window.selectedPlayerId = window.playerState.isGM ? getSafeDocId(ALLOWED_PLAYERS[0]) : window.playerState.id;
}
}

window.renderLockerRoom();
if(window.selectedPlayerId) window.renderSelectedCard(window.selectedPlayerId);
renderActivePool();

if(isVisible('tabAchievements')) window.renderAchievements();
if(isVisible('tabRank')) renderLeaderboard();
if(isVisible('tabMaster')) renderMasterDashboard();
if(isVisible('tabCompare')) window.renderCompareList();
if(isVisible('tabSim')) window.renderSimMatchTab();
if(isVisible('tabMasterStats')) window.renderMasterStats();
}, (error) => console.error("Players Listen Error:", error));

onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'announcement'), (docSnap) => {
const data = docSnap.data();
const el = document.getElementById('announcementContent');
if(el) el.innerText = data?.text || '새로운 공지사항이 없습니다.';
const input = document.getElementById('announcementInput');
if(input && data?.text) input.value = data.text;
}, (error) => console.error("Announcement Listen Error:", error));

onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'shorts'), (docSnap) => {
const data = docSnap.data();
const container = document.getElementById('shortsPlayerContainer');
if(container && data?.videoId) {
container.innerHTML = `<iframe class="w-full h-full rounded-2xl pointer-events-none" src="https://www.youtube.com/embed/${data.videoId}?autoplay=1&mute=1&loop=1&playlist=${data.videoId}&controls=0&modestbranding=1&rel=0&playsinline=1" title="YouTube shorts" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
}
const input = document.getElementById('shortsInput');
if(input && data?.videoId) input.value = `https://youtube.com/shorts/${data.videoId}`;
}, (error) => console.error("Shorts Listen Error:", error));

onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'latest_event'), (docSnap) => {
const data = docSnap.data();
const marqueeContainer = document.getElementById('globalMarqueeContainer');
const marqueeText = document.getElementById('globalMarqueeText');
if(data && data.text && marqueeContainer && marqueeText) {
const isRecent = (Date.now() - (data.timestamp || 0)) < 1000 * 60 * 60 * 24; 
if(isRecent) {
marqueeText.innerText = `[긴급 속보] ${data.text}`;
marqueeContainer.classList.remove('hidden');
} else { marqueeContainer.classList.add('hidden'); }
}
}, (error) => console.error("Event Listen Error:", error));

document.getElementById('loadingOverlay')?.classList.add('hidden');

try {
const savedPid = localStorage.getItem('sfc_pid');
const savedPin = localStorage.getItem('sfc_pin');
if(savedPid && savedPin) {
setTimeout(() => { 
const loginIdEl = document.getElementById('loginId');
const loginPinEl = document.getElementById('loginPin');
if(loginIdEl) loginIdEl.value = savedPid.includes('gm') ? savedPid : 'player'; 
if(loginPinEl) loginPinEl.value = savedPin; 
window.handleLogin(savedPid, savedPin, true); 
}, 100);
} else {
document.getElementById('loginOverlay')?.classList.remove('hidden');
}
} catch(lsErr) { 
console.warn("자동로그인 확인 불가:", lsErr); 
document.getElementById('loginOverlay')?.classList.remove('hidden');
}
} else {
document.getElementById('loadingOverlay')?.classList.add('hidden');
document.getElementById('loginOverlay')?.classList.remove('hidden');
}
});

} catch (error) {
console.error("Init Error:", error);
window.customAlert("앱 초기화 중 오류가 발생했습니다. 새로고침 해주세요.\n(에러 상세: " + error.message + ")");
document.getElementById('loadingOverlay')?.classList.add('hidden');
document.getElementById('loginOverlay')?.classList.remove('hidden');
}
};

document.getElementById('btnLogin')?.addEventListener('click', () => {
const role = document.getElementById('loginId').value;
let pId = role;
if(role === 'player') pId = document.getElementById('loginPlayerName').value;
const pin = document.getElementById('loginPin').value;
window.handleLogin(pId, pin);
});

// 이벤트 리스너 세팅 등 모든 준비가 끝난 후 마지막에 시동
initApp();
