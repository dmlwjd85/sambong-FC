import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, writeBatch, getDocs, deleteDoc, deleteField, increment } from 'firebase/firestore';
import confetti from 'canvas-confetti';
import { getMangaFaceHtml, resolveFaceSrc, getDefaultSkinRel } from './mangaFace.js';

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

/** 시즌 2 기본 능력치 · 일일 기록 한도 */
const STAT_BASE = 55;
const STAT_KEYS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy', 'ref', 'int', 'pst', 'dis', 'cmp', 'wrk'];
const SEASON2_KICKOFF = '2026-09-05';
const ACTIVITY_DAILY_CAP = { training: 1, matches: 1, goals: 4, assists: 4, keypass: 6, saves: 8 };
const ACTIVITY_LABEL = { training: '개인 훈련', matches: '경기 출전', goals: '골', assists: '어시스트', keypass: '킬패스', saves: '세이브' };
window.seasonInfo = window.seasonInfo || { season: 1, started: false, startedAt: null };

const getStat = (p, key) => {
const n = Number(p?.[key]);
return Number.isFinite(n) && n > 0 ? Math.min(99, n) : STAT_BASE;
};

function getKstDateStr() {
return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function emptyActivityCounts() {
return { training: 0, matches: 0, goals: 0, assists: 0, keypass: 0, saves: 0 };
}

function getTodayActivityCounts(p) {
const today = getKstDateStr();
const raw = (p && typeof p.activityCounts === 'object' && !Array.isArray(p.activityCounts)) ? p.activityCounts : {};
if (!p || p.activityDay !== today) return emptyActivityCounts();
const out = emptyActivityCounts();
Object.keys(out).forEach((k) => { out[k] = Number(raw[k]) || 0; });
return out;
}

function applySeasonChrome() {
const info = window.seasonInfo || {};
const started = !!info.started;
const sub = document.getElementById('loginSeasonSub');
if (sub) {
sub.textContent = started
? 'SEASON 2 개막 · 전원 능력치 55부터 커리어를 키우세요'
: `시즌 2 개막 예정 · 9월 5일(토) · 전원 능력치 ${STAT_BASE} 스타트`;
}
const badge = document.getElementById('navSeasonBadge');
if (badge) badge.textContent = started ? 'S2 ON' : 'S2';
const master = document.getElementById('seasonMasterStatus');
if (master) {
master.textContent = started
? `시즌 2가 ${info.startedAt ? new Date(info.startedAt).toLocaleString('ko-KR') : ''}에 개막했습니다. 다시 누르면 전원 55로 한 번 더 리셋됩니다.`
: `예정일: 2026년 9월 5일(토). 버튼을 누르면 전원이 능력치 ${STAT_BASE}로 다시 시작합니다.`;
}
}

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

/** 금액 입력 모달 (스마트폰 퀵칩) */
window.pickBongStake = ({ title, label, odds, wallet, max }) => new Promise((r) => {
const cap = Math.max(0, Math.min(Number(max) || 0, Number(wallet) || 0));
const d = document.createElement('div');
d.className = 'fixed inset-0 z-[6000] flex items-center justify-center bg-black/80 px-4';
const chips = [10, 20, 50, 100].filter((n) => n <= cap);
d.innerHTML = `<div class="bg-pitch-panel p-6 rounded-3xl border-2 border-red-500/70 max-w-sm w-full text-center space-y-3 shadow-2xl">
<h3 class="text-xl font-display text-white">${title || '베팅'}</h3>
<p class="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed break-keep">${label}<br>배당 <b class="text-fut-gold">${Number(odds).toFixed(2)}x</b> · 보유 <b class="text-fut-gold">${wallet}</b> B</p>
<div class="flex flex-wrap justify-center gap-2">${chips.map((n) => `<button type="button" data-chip="${n}" class="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-xs font-black text-white">${n} B</button>`).join('')}${cap > 0 ? `<button type="button" data-chip="${cap}" class="px-3 py-1.5 rounded-lg bg-red-900/70 border border-red-500 text-xs font-black text-white">전액</button>` : ''}</div>
<input id="stakeAmt" type="number" min="1" max="${cap}" inputmode="numeric" value="${Math.min(10, cap)}" class="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2.5 text-center text-white font-black text-lg"/>
<p id="stakePayoutHint" class="text-[11px] text-emerald-300"></p>
<div class="flex gap-3 pt-1"><button id="bNo" class="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2.5 rounded-xl w-full">취소</button><button id="bYes" class="bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl w-full">걸기</button></div>
</div>`;
document.body.appendChild(d);
const inp = d.querySelector('#stakeAmt');
const hint = d.querySelector('#stakePayoutHint');
const paintHint = () => {
const n = Math.floor(Number(inp.value) || 0);
hint.textContent = n > 0 ? `적중 시 약 ${Math.floor(n * Number(odds))} B 지급` : '금액을 입력하세요';
};
paintHint();
inp.addEventListener('input', paintHint);
d.querySelectorAll('[data-chip]').forEach((btn) => {
btn.onclick = () => { inp.value = btn.getAttribute('data-chip'); paintHint(); };
});
d.querySelector('#bYes').onclick = () => {
const n = Math.floor(Number(inp.value));
d.remove();
r(Number.isFinite(n) && n > 0 ? n : 0);
};
d.querySelector('#bNo').onclick = () => { d.remove(); r(0); };
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
window.addEventListener('DOMContentLoaded', () => { setupLoginFormDom(); applySeasonChrome(); });
} else {
setupLoginFormDom();
applySeasonChrome();
}

const DAILY_TIPS = [
{ title: "풋살과 축구의 가장 큰 차이점?", img: "⚽", category: "기본상식", desc: "풋살은 5인제 실내 축구입니다. 공이 밖으로 나가면 손으로 던지는 스로인이 아닌 '발로 차서 넣는 킥인'을 합니다!" },
{ title: "가장 중요한 '4초 룰'을 아시나요?", img: "⏱️", category: "기본규칙", desc: "킥인, 코너킥, 프리킥, 골클리어런스(골키퍼가 공을 던질 때)는 모두 공을 잡은 후 '4초' 안에 처리해야 합니다. 속도감이 생명이죠!" },
{ title: "거리 두기 5미터 원칙", img: "📏", category: "기본규칙", desc: "킥인, 코너킥, 프리킥 상황에서 수비수는 공으로부터 무조건 5미터 이상 떨어져 있어야 합니다. 방해하면 경고를 받을 수 있어요." },
{ title: "선수 교체는 무제한!", img: "🔄", category: "기본규칙", desc: "축구와 달리 풋살은 선수 교체 횟수에 제한이 없고, 언제든 코치의 지시로 교체 구역을 통해 자유롭게 들어오고 나갈 수 있습니다." },
{ title: "장비는 강화소에서 +5강까지", img: "🔨", category: "시즌2 성장", desc: "상점에서 산 장비는 같은 가격의 B로 강화합니다. 실패하면 1단계 내려가니, 주급을 모아 신중하게 도전하세요!" },
{ title: "스킨은 능력치에 영향 없음", img: "🎨", category: "시즌2 성장", desc: "기본 스킨 3종은 무료입니다. 카드 킷·레전드 얼굴은 꾸미기용이고, 스탯 보너스는 머리·손·발 장비만 줍니다." }
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
{ id: 'goleiro_high', category: '골레이로(GK)', title: '삼봉의 야신', desc: '누적 150세이브 달성. 누구도 그의 골문을 뚫을 수 없습니다!', reqKey: 'saves', reqValue: 150, icon: '🐙', color: 'text-orange-600', bg: 'bg-orange-600', reward: 150 },
{ id: 'train_8', category: '시즌2 성장', title: '토요의 땀', desc: '개인 훈련 8회. 하루 한 번이지만 매주 나온 선수가 강해집니다.', reqKey: 'training', reqValue: 8, icon: '💪', color: 'text-lime-400', bg: 'bg-lime-400', reward: 20 },
{ id: 'lv_10', category: '시즌2 성장', title: '커리어의 첫 도약', desc: '레벨 10. 시즌 2 능력치 55에서 천천히 올라온 증표입니다.', reqKey: 'level', reqValue: 10, icon: '🌟', color: 'text-amber-300', bg: 'bg-amber-300', reward: 25 },
{ id: 'match_8', category: '시즌2 성장', title: '라커룸 단골', desc: '출전 8회. 토요스포츠데이에 꾸준히 나온 선수입니다.', reqKey: 'matches', reqValue: 8, icon: '📅', color: 'text-sky-400', bg: 'bg-sky-400', reward: 20 }
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

window.playerState = { id: '', isGM: false, isGuest: false, name: '', inventory: [], itemLevels: {}, equipHead: null, equipHandL: null, equipHandR: null, equipFootL: null, equipFootR: null, equipFace: null, equipSkin: null, equipKit: null };
window.allPlayersData = [];
window.checkedInPlayers = new Set();
window.selectedPlayerId = null;
window.targetTeamCount = 2; 
window.compareTargetId = null;
window.currentSortKey = 'ovr';
window.lockerViewMode = 'default';

let db, auth;

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
pac: getStat(p, 'pac')+b.pac, sho: getStat(p, 'sho')+b.sho, pas: getStat(p, 'pas')+b.pas,
dri: getStat(p, 'dri')+b.dri, def: getStat(p, 'def')+b.def, phy: getStat(p, 'phy')+b.phy,
ref: getStat(p, 'ref')+b.ref, int: getStat(p, 'int')+b.int, pst: getStat(p, 'pst')+b.pst,
dis: getStat(p, 'dis')+b.dis, cmp: getStat(p, 'cmp')+b.cmp, wrk: getStat(p, 'wrk')+b.wrk
};
return getOVRForPos(stats, p.pos);
};

const getTierInfo = (ovr) => {
if(ovr < 65) return { name: '루키 (ROOKIE)', class: 'tier-badge-rookie', cardClass: 'card-rookie' };
if(ovr < 75) return { name: '세미프로 (SEMI-PRO)', class: 'tier-badge-semipro', cardClass: 'card-semipro' };
if(ovr < 85) return { name: '프로 (PRO)', class: 'tier-badge-pro', cardClass: 'card-pro' };
if(ovr < 92) return { name: '월드클래스 (WORLD CLASS)', class: 'tier-badge-worldclass', cardClass: 'card-worldclass' };
return { name: '챌린저 (CHALLENGER)', class: 'tier-badge-challenger', cardClass: 'card-challenger' };
};

const getWeeklyWage = (ovr) => { return Math.max(40, Math.min(160, Math.floor(40 + ((ovr - 50) / 49) * 120))); };
/** 시즌 2: 레벨당 필요 EXP를 높여 연타 성장 억제 */
const getExpNeeded = (level) => Math.floor(70 + ((Number(level) || 1) * 8));

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
/** 텍스트 노드용 HTML 이스케이프 */
function escapeHtml(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 프로필 얼굴 URL: 업로드 사진 > 장착 얼굴 아이템 > 장착 스킨 > 기본 3종 */
function getPortraitUrl(p) {
if (p && p.facePhotoUrl && String(p.facePhotoUrl).trim()) return String(p.facePhotoUrl).trim();
const fid = p.equipFace;
if (fid) {
const it = SHOP_ITEMS.find(x => x.id === fid && x.type === 'face' && x.faceImageUrl);
if (it && String(it.faceImageUrl).trim()) return resolveFaceSrc(it.faceImageUrl);
}
const sid = p.equipSkin;
if (sid) {
const it = SHOP_ITEMS.find(x => x.id === sid && x.type === 'skin' && x.faceImageUrl);
if (it && String(it.faceImageUrl).trim()) return resolveFaceSrc(it.faceImageUrl);
}
return resolveFaceSrc(getDefaultSkinRel({ ...p, gender: (p.gender || GENDER_MAP[p.name]) === 'F' ? 'F' : 'M' }));
}

/**
 * 선수 얼굴: 업로드 사진·얼굴 아이템·스킨 > 축구만화 기본 스킨
 * variant: locker | detail | sm | md | xl
 */
function getAvatarHtml(p, variant) {
const url = getPortraitUrl(p);
const gender = (p.gender || GENDER_MAP[p.name]) === 'F' ? 'F' : 'M';
return getMangaFaceHtml({ ...p, gender }, variant, url);
}

window.switchTab = (tabId) => {
['tabWorkspace', 'tabTips', 'tabShop', 'tabAchievements', 'tabRank', 'tabCompare', 'tabSim', 'tabGuide', 'tabMaster', 'tabMasterStats'].forEach(id => {
document.getElementById(id)?.classList.add('hidden');
});
document.getElementById(tabId)?.classList.remove('hidden');

const leftPanel = document.getElementById('leftCardPanel');
const rightPanel = document.getElementById('rightContentPanel');

if (tabId === 'tabWorkspace' || tabId === 'tabAchievements' || tabId === 'tabShop') {
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
updateNavBongChip();
};

window.appNav = { hub: 'home', sub: null };

function getAppHubChips(hub) {
if (hub === 'career') {
return [
{ id: 'tabAchievements', label: '트로피' },
{ id: 'tabCompare', label: '비교' }
];
}
if (hub === 'more') {
const chips = [
{ id: 'tabTips', label: '소식' },
{ id: 'tabRank', label: '전당' },
{ id: 'tabGuide', label: '안내' }
];
if (window.playerState && window.playerState.isGM) {
chips.push({ id: 'tabMaster', label: '현황판' });
chips.push({ id: 'tabMasterStats', label: '스탯' });
}
return chips;
}
return [];
}

window.switchAppTab = (hub, subTabId) => {
const defaults = { home: 'tabWorkspace', match: 'tabSim', shop: 'tabShop', career: 'tabAchievements', more: (window.playerState && window.playerState.isGM) ? 'tabMaster' : 'tabTips' };
const hubKey = hub || 'home';
if (window.appNav.hub !== hubKey) window.appNav.sub = null;
window.appNav.hub = hubKey;
const chips = getAppHubChips(hubKey);
let page = subTabId || null;
if (!page && window.appNav.sub && chips.some((c) => c.id === window.appNav.sub)) page = window.appNav.sub;
if (!page) page = defaults[hubKey];
window.appNav.sub = chips.length ? page : null;

document.querySelectorAll('#appBottomNav .app-tab').forEach((btn) => {
btn.classList.toggle('active', btn.getAttribute('data-app-hub') === hubKey);
});
const subNav = document.getElementById('subHubNav');
const subChips = document.getElementById('subHubChips');
if (chips.length && subNav && subChips) {
subNav.classList.remove('hidden');
subChips.innerHTML = chips.map((c) => `<button type="button" class="subhub-chip ${c.id === page ? 'active' : ''}" onclick="window.switchAppTab('${hubKey}','${c.id}')">${c.label}</button>`).join('');
} else {
subNav?.classList.add('hidden');
if (subChips) subChips.innerHTML = '';
}
window.switchTab(page);
};

function updateNavBongChip() {
const pid = window.playerState && !window.playerState.isGuest && !window.playerState.isGM ? window.playerState.id : (window.selectedPlayerId || '');
const p = (window.allPlayersData || []).find((x) => x.id === pid);
const bong = p ? (Number(p.bong) || 0) : (window.playerState && Number(window.playerState.bong) || 0);
const chip = document.getElementById('navBongChip');
const val = document.getElementById('navBongValue');
if (val) val.textContent = String(bong);
if (chip) {
if (window.playerState && !window.playerState.isGuest) chip.classList.remove('hidden');
else chip.classList.add('hidden');
}
}

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

/** 라커룸 한 선수 카드 HTML */
function lockerPlayerCardHtml(p) {
const isChecked = window.checkedInPlayers.has(p.id);
const isSelected = window.selectedPlayerId === p.id;
const ovr = getOVR(p); const tier = getTierInfo(ovr);
let borderClass = 'border-slate-700';
if(ovr >= 85) borderClass = 'border-purple-500'; else if (ovr >= 75) borderClass = 'border-fut-gold'; else if (ovr >= 65) borderClass = 'border-gray-300';
const posText = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정';
const st = p.simTeam;
const canSimEdit = !window.playerState.isGuest;
let simRow = '';
if (canSimEdit) {
simRow = `<div class="w-full mt-1 pt-1 border-t border-slate-700/60" onclick="event.stopPropagation()"><div class="flex gap-0.5 justify-center items-center">
<button type="button" class="text-[9px] px-1.5 py-0.5 rounded font-bold ${st === 'A' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-300'} border border-slate-600" onclick="window.setPlayerSimTeam('${p.id}','A')">레드</button>
<button type="button" class="text-[9px] px-1.5 py-0.5 rounded font-bold ${st === 'B' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'} border border-slate-600" onclick="window.setPlayerSimTeam('${p.id}','B')">블루</button>
<button type="button" class="text-[8px] px-1 py-0.5 rounded bg-slate-900 text-slate-500 border border-slate-700" onclick="window.setPlayerSimTeam('${p.id}',null)">해제</button>
</div><p class="text-[7px] text-center text-slate-500 mt-0.5 leading-tight">모의경기 팀</p></div>`;
} else if (st === 'A' || st === 'B') {
simRow = `<div class="mt-0.5 text-[9px] font-bold ${st === 'A' ? 'text-red-400' : 'text-blue-400'}" onclick="event.stopPropagation()">모의 ${st === 'A' ? '레드팀' : '블루팀'}</div>`;
}
return `
                     <div class="mini-card fut-mini ${tier.cardClass} flex flex-col items-center p-2 rounded-xl border-2 ${borderClass} cursor-pointer ${isSelected ? 'selected' : ''} ${isChecked ? 'checked-in' : 'checked-out'}" onclick="window.selectPlayer('${p.id}')">
                         <input type="checkbox" class="locker-checkbox absolute top-1.5 left-1.5 w-5 h-5 shadow-lg z-10" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); window.toggleCheck('${p.id}')">
                         <div class="absolute top-1 right-1 ${tier.class} text-[8px] font-black px-1.5 py-0.5 rounded shadow whitespace-nowrap tracking-wide">${tier.name.split(' ')[0]}</div>
                         <div class="flex items-center justify-center min-h-[4.4rem] mt-3">${getAvatarHtml(p, 'locker')}</div>
                         <div class="fut-mini-ovr-plate fut-mini-ovr text-[1.55rem] font-bold leading-none text-current drop-shadow mt-1">${ovr}</div>
                         <div class="flex flex-col items-center mt-0.5 w-full px-0.5">
                         <span class="text-[9px] font-black ${getPosColor(p.pos)} tracking-wider">${posText}</span>
                         <span class="text-[11px] font-black text-current truncate max-w-[72px] drop-shadow">${p.name}</span>
                         </div>
                         ${simRow}
                     </div>`;
}

function lockerLockedSlotHtml(name) {
return `<div class="flex flex-col items-center justify-center p-2 rounded-xl border border-slate-800 bg-slate-900/50 opacity-50"><i class="fa-solid fa-user-lock text-xl text-slate-700 mb-2"></i><span class="text-[10px] text-slate-600">${name}</span></div>`;
}

const LOCKER_POS_ORDER = ['Goleiro', 'Fixo', 'Ala', 'Pivo', '미정'];
const LOCKER_POS_HEAD = { Goleiro: '골레이로 (GK)', Fixo: '픽소 (DF)', Ala: '아라 (MF)', Pivo: '피보 (FW)', '미정': '포지션 미정' };

/** 모의경기 팀 분류 라디오 name (라커·모의경기 탭 간 충돌 방지) */
function getSimTeamBoardRadioName(boardKey) {
return `simBoardPick_${boardKey}`;
}

/** 라디오로 선택한 목표 팀 (라커·탭 각각 유지) */
window.simBoardPreferredTarget = window.simBoardPreferredTarget || { locker: 'A', sim: 'A' };

/** 팀 분류 보드 HTML (삭제·DnD·하단 레드/블루 라디오) */
function buildSimTeamBoardHtml(boardKey) {
const listA = (window.allPlayersData || []).filter((p) => p.simTeam === 'A').sort((a, b) => getOVR(b) - getOVR(a));
const listB = (window.allPlayersData || []).filter((p) => p.simTeam === 'B').sort((a, b) => getOVR(b) - getOVR(a));
const pref = window.simBoardPreferredTarget[boardKey] === 'B' ? 'B' : 'A';
const rname = getSimTeamBoardRadioName(boardKey);
const simTools = !window.playerState.isGuest;
const clearColA = simTools
? `<button type="button" class="sim-team-clear-btn text-[10px] px-2 py-0.5 rounded bg-slate-900/80 text-amber-200 border border-amber-800/50 hover:bg-slate-800 shrink-0" data-sim-clear-team="A" title="레드 팀 전원 해제">전체 삭제</button>`
: '';
const clearColB = simTools
? `<button type="button" class="sim-team-clear-btn text-[10px] px-2 py-0.5 rounded bg-slate-900/80 text-amber-200 border border-amber-800/50 hover:bg-slate-800 shrink-0" data-sim-clear-team="B" title="블루 팀 전원 해제">전체 삭제</button>`
: '';
const randomFillA = simTools
? `<button type="button" class="sim-team-random-fill-btn text-[10px] px-2 py-0.5 rounded bg-emerald-900/55 text-emerald-200 border border-emerald-700/45 hover:bg-emerald-900/90 shrink-0" data-sim-random-team="A" title="골레이로→픽소 우선, 이후 아라·피보·미정 골고루">랜덤 보강</button>`
: '';
const randomFillB = simTools
? `<button type="button" class="sim-team-random-fill-btn text-[10px] px-2 py-0.5 rounded bg-emerald-900/55 text-emerald-200 border border-emerald-700/45 hover:bg-emerald-900/90 shrink-0" data-sim-random-team="B" title="골레이로→픽소 우선, 이후 아라·피보·미정 골고루">랜덤 보강</button>`
: '';
const rowHtml = (p, team) => {
const canEdit = simTools;
const canDrag = canEdit;
const posText = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정';
const delBtn = canEdit
? `<button type="button" class="sim-team-remove-btn shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-red-300 border border-red-800/60 hover:bg-red-950" data-player-id="${escapeAttr(p.id)}" title="팀에서 제외">삭제</button>`
: '';
const dragAttr = canDrag ? 'true' : 'false';
return `<div class="sim-team-row flex items-center gap-1.5 text-xs py-1 px-1 border-b border-white/5 rounded hover:bg-white/5" draggable="${dragAttr}" data-player-id="${escapeAttr(p.id)}" data-sim-team="${team}" data-sim-board="${boardKey}">
<span class="text-slate-500 select-none shrink-0" title="드래그">${canDrag ? '<i class="fa-solid fa-grip-vertical text-[10px]"></i>' : ''}</span>
<span class="text-white truncate flex-1 min-w-0">${escapeHtml(p.name)}</span>
<span class="text-[9px] ${getPosColor(p.pos)} shrink-0">${posText}</span>
<span class="text-fut-gold font-oswald shrink-0">${getOVR(p)}</span>
${delBtn}
</div>`;
};
const emptyHint = '<p class="text-[10px] text-slate-500 py-2 pointer-events-none">빈 곳에 놓으면 이동</p>';
return `
<p class="text-xs font-bold text-slate-400 mb-2 flex flex-wrap items-center gap-2"><i class="fa-solid fa-futbol text-amber-400"></i> 모의경기 팀 분류 <span class="text-[10px] font-normal text-slate-500">누구나 편집 · 삭제 · 드래그 · 맞교체 · 랜덤 보강(골레이로·픽소 우선)</span></p>
<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
<div class="sim-team-drop-zone rounded-xl border border-red-800/40 bg-red-950/25 p-3 min-h-[6rem]" data-sim-drop="A">
<div class="font-display text-red-400 text-sm mb-1.5 flex justify-between items-center gap-2 flex-wrap">
<span>레드팀</span>
<div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
${randomFillA}
${clearColA}
<span class="text-[10px] text-slate-500 font-sans">${listA.length}명</span>
</div>
</div>
${listA.length ? listA.map((p) => rowHtml(p, 'A')).join('') : emptyHint}
</div>
<div class="sim-team-drop-zone rounded-xl border border-blue-800/40 bg-blue-950/25 p-3 min-h-[6rem]" data-sim-drop="B">
<div class="font-display text-blue-400 text-sm mb-1.5 flex justify-between items-center gap-2 flex-wrap">
<span>블루팀</span>
<div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
${randomFillB}
${clearColB}
<span class="text-[10px] text-slate-500 font-sans">${listB.length}명</span>
</div>
</div>
${listB.length ? listB.map((p) => rowHtml(p, 'B')).join('') : emptyHint}
</div>
</div>
<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-slate-700/50">
<span class="text-[10px] text-slate-500">목표 팀 선택 후 행을 더블클릭하면 해당 팀으로 이동합니다.</span>
<div class="flex items-center justify-between gap-6 sm:justify-end">
<label class="flex items-center gap-2 text-xs text-red-300 cursor-pointer">
<input type="radio" name="${rname}" value="A" class="accent-red-500" data-sim-board="${boardKey}" ${pref === 'A' ? 'checked' : ''} />
레드팀
</label>
<label class="flex items-center gap-2 text-xs text-blue-300 cursor-pointer">
<input type="radio" name="${rname}" value="B" class="accent-blue-500" data-sim-board="${boardKey}" ${pref === 'B' ? 'checked' : ''} />
블루팀
</label>
</div>
</div>`;
}

/** 라커 하단 + 모의경기 탭 팀 분류창 동시 갱신 */
window.renderSimTeamBoards = () => {
const elLocker = document.getElementById('lockerSimTeamsPreview');
const elTab = document.getElementById('simTeamBoardTab');
if (elLocker) elLocker.innerHTML = buildSimTeamBoardHtml('locker');
if (elTab) elTab.innerHTML = buildSimTeamBoardHtml('sim');
};

/** 서로 다른 팀 소속 두 선수 맞교체 (로그인 학생 전원) */
window.swapSimTeamPlayers = async (id1, id2) => {
try {
checkAuthReady();
if (window.playerState.isGuest) return window.customAlert('게스트는 사용할 수 없습니다.');
const p1 = window.allPlayersData.find((x) => x.id === id1);
const p2 = window.allPlayersData.find((x) => x.id === id2);
if (!p1 || !p2) return;
const t1 = p1.simTeam;
const t2 = p2.simTeam;
if (!t1 || !t2 || t1 === t2) return;
await window.setPlayerSimTeam(id1, null, true);
await window.setPlayerSimTeam(id2, null, true);
await window.setPlayerSimTeam(id1, t2, true);
await window.setPlayerSimTeam(id2, t1, true);
window.renderLockerRoom();
if (isVisible('tabSim')) window.renderSimMatchTab();
if (window.selectedPlayerId) window.renderSelectedCard(window.selectedPlayerId);
} catch (e) {
console.error(e);
window.customAlert('팀 교체에 실패했습니다.');
}
};

/** 해당 팀(레드/블루)에 속한 모든 선수 팀 해제 */
window.clearSimTeamColumn = async (team) => {
try {
checkAuthReady();
if (window.playerState.isGuest) return window.customAlert('게스트는 사용할 수 없습니다.');
if (team !== 'A' && team !== 'B') return;
const ids = (window.allPlayersData || []).filter((p) => p.simTeam === team).map((p) => p.id);
for (let i = 0; i < ids.length; i++) {
await window.setPlayerSimTeam(ids[i], null, i < ids.length - 1);
}
} catch (e) {
console.error(e);
window.customAlert('팀 비우기에 실패했습니다.');
}
};

/** 팀 인원이 5명 미만일 때: 미배정 우선 → 부족 시 상대팀에서 보강. 포지션: 골레이로 1순위, 픽소 2순위, 이후 아라·피보·미정을 순환해 골고루 */
window.fillSimTeamRandomPos = async (team) => {
try {
checkAuthReady();
if (window.playerState.isGuest) return window.customAlert('게스트는 사용할 수 없습니다.');
if (team !== 'A' && team !== 'B') return;
const other = team === 'A' ? 'B' : 'A';
const onTeam = (window.allPlayersData || []).filter((p) => p.simTeam === team);
const need = 5 - onTeam.length;
if (need <= 0) return window.customAlert('이미 5명입니다.');
const shuffle = (arr) => {
const a = [...arr];
for (let i = a.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[a[i], a[j]] = [a[j], a[i]];
}
return a;
};
/** n번째 보강(0부터)에 맞는 선호 포지션 */
const preferredPosForPick = (n) => {
if (n === 0) return 'Goleiro';
if (n === 1) return 'Fixo';
const restCycle = ['Ala', 'Pivo', '미정'];
return restCycle[(n - 2) % restCycle.length];
};
/** 풀에서 선호 포지션 우선, 없으면 대체 순서로 1명 인덱스 */
const findBestIndexForPos = (pool, prefer) => {
let idx = pool.findIndex((p) => p.pos === prefer);
if (idx >= 0) return idx;
if (prefer === 'Ala') {
idx = pool.findIndex((p) => p.pos === '미정');
if (idx >= 0) return idx;
}
const fallbackByPrefer = {
Goleiro: ['Fixo', 'Ala', 'Pivo', '미정'],
Fixo: ['Goleiro', 'Ala', 'Pivo', '미정'],
Ala: ['Pivo', '미정', 'Fixo', 'Goleiro'],
Pivo: ['Ala', '미정', 'Fixo', 'Goleiro'],
미정: ['Ala', 'Pivo', 'Fixo', 'Goleiro']
};
const chain = fallbackByPrefer[prefer] || ['Goleiro', 'Fixo', 'Ala', 'Pivo', '미정'];
for (let c = 0; c < chain.length; c++) {
idx = pool.findIndex((p) => p.pos === chain[c]);
if (idx >= 0) return idx;
}
return 0;
};
const unassigned = (window.allPlayersData || []).filter((p) => !p.simTeam);
const fromOther = (window.allPlayersData || []).filter((p) => p.simTeam === other);
let pool = [...shuffle(unassigned), ...shuffle(fromOther)];
if (!pool.length) return window.customAlert('보강할 다른 선수가 없습니다.');
const picks = [];
for (let n = 0; n < need && pool.length; n++) {
const prefer = preferredPosForPick(n);
const idx = findBestIndexForPos(pool, prefer);
picks.push(pool[idx]);
pool.splice(idx, 1);
}
if (!picks.length) return window.customAlert('선택할 선수가 없습니다.');
for (let i = 0; i < picks.length; i++) {
await window.setPlayerSimTeam(picks[i].id, team, i < picks.length - 1);
}
} catch (e) {
console.error(e);
window.customAlert('랜덤 보강에 실패했습니다.');
}
};

window.setLockerViewMode = (mode) => {
window.lockerViewMode = mode === 'byPos' ? 'byPos' : 'default';
window.renderLockerRoom();
};

window.renderLockerRoom = () => {
const grid = document.getElementById('lockerGrid');
if(!grid) return;
const mode = window.lockerViewMode || 'default';
const bd = document.getElementById('btnLockerViewDefault');
const bp = document.getElementById('btnLockerViewPos');
const tabOn = 'text-xs font-bold px-3 py-2 rounded-lg border transition shadow bg-emerald-700 text-white border-emerald-500';
const tabOff = 'text-xs font-bold px-3 py-2 rounded-lg border transition bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700';
if (bd) bd.className = mode === 'byPos' ? tabOff : tabOn;
if (bp) bp.className = mode === 'byPos' ? tabOn : tabOff;

if (mode === 'byPos') {
const buckets = { Goleiro: [], Fixo: [], Ala: [], Pivo: [], '미정': [] };
const pendingNames = [];
ALLOWED_PLAYERS.forEach(name => {
const safeDocId = getSafeDocId(name);
const p = window.allPlayersData.find(x => x.id === safeDocId);
if (p) {
const k = ['Goleiro', 'Fixo', 'Ala', 'Pivo'].includes(p.pos) ? p.pos : '미정';
buckets[k].push(p);
} else pendingNames.push(name);
});
let html = '';
LOCKER_POS_ORDER.forEach(pos => {
const list = buckets[pos];
if (!list.length) return;
html += `<div class="col-span-full flex items-center gap-2 pt-3 first:pt-0 border-t border-slate-700/50 first:border-0"><span class="text-emerald-400 font-bold text-sm">${LOCKER_POS_HEAD[pos]}</span><span class="text-[10px] text-slate-500">${list.length}명</span></div>`;
html += `<div class="col-span-full grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 sm:gap-4">`;
list.forEach(p => { html += lockerPlayerCardHtml(p); });
html += `</div>`;
});
if (pendingNames.length) {
html += `<div class="col-span-full flex items-center gap-2 pt-3 border-t border-slate-700/50"><span class="text-slate-500 font-bold text-sm">등록 대기</span><span class="text-[10px] text-slate-600">${pendingNames.length}명</span></div>`;
html += `<div class="col-span-full grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 sm:gap-4">`;
pendingNames.forEach(n => { html += lockerLockedSlotHtml(n); });
html += `</div>`;
}
grid.innerHTML = html || '<div class="col-span-full text-center text-slate-500 py-8">표시할 선수가 없습니다.</div>';
window.renderSimTeamBoards();
return;
}

let html = '';
ALLOWED_PLAYERS.forEach(name => {
const safeDocId = getSafeDocId(name);
const p = window.allPlayersData.find(x => x.id === safeDocId);
if(p) html += lockerPlayerCardHtml(p);
else html += lockerLockedSlotHtml(name);
});
grid.innerHTML = html;
window.renderSimTeamBoards();
};

window.toggleCheck = (pId) => {
if(window.playerState.isGuest) return window.customAlert("게스트 모드에서는 출석 체크를 할 수 없습니다.");
if(window.checkedInPlayers.has(pId)) window.checkedInPlayers.delete(pId); else window.checkedInPlayers.add(pId);
window.renderLockerRoom(); renderActivePool();
};

/** 라커룸에서 모의경기 팀 A/B 지정 (Firestore simTeam, 팀당 최대 5명) */
/** @param skipRefresh 일괄 처리 시 true로 중간 렌더 생략 */
window.setPlayerSimTeam = async (pId, team, skipRefresh) => {
try {
checkAuthReady();
if (window.playerState.isGuest) return window.customAlert('게스트는 모의경기 팀을 설정할 수 없습니다.');
const target = window.allPlayersData.find((x) => x.id === pId);
if (!target) return;
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
if (!skipRefresh) {
window.renderLockerRoom();
if (isVisible('tabSim')) window.renderSimMatchTab();
if (window.selectedPlayerId) window.renderSelectedCard(window.selectedPlayerId);
}
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

window.shopCat = 'all';
const SHOP_GEAR_TYPES = ['head', 'handL', 'handR', 'footL', 'footR'];
const SHOP_SKIN_TYPES = ['skin', 'kit'];
function isCosmeticItem(item) {
return item && (item.type === 'face' || item.type === 'skin' || item.type === 'kit');
}
function itemMatchesShopCat(item, cat) {
if (!cat || cat === 'all') return true;
if (cat === 'gear') return SHOP_GEAR_TYPES.includes(item.type);
if (cat === 'skin') return SHOP_SKIN_TYPES.includes(item.type);
if (cat === 'face') return item.type === 'face';
return true;
}
window.setShopCat = (cat) => {
window.shopCat = cat || 'all';
document.querySelectorAll('#shopCatBar .shop-cat-chip').forEach((btn) => {
btn.classList.toggle('active', btn.getAttribute('data-shop-cat') === window.shopCat);
});
window.renderShop();
};

window.renderShop = () => {
const targetId = window.playerState.isGM ? window.selectedPlayerId : window.playerState.id;
const p = window.allPlayersData.find(x => x.id === targetId) || null;
const bong = p ? (Number(p.bong) || 0) : 0;
const inventory = (p && Array.isArray(p.inventory)) ? p.inventory : [];
const itemLevels = (p && typeof p.itemLevels === 'object' && !Array.isArray(p.itemLevels)) ? p.itemLevels : {};

document.getElementById('shopBong') && (document.getElementById('shopBong').innerText = bong);
document.getElementById('shopWalletLabel') && (document.getElementById('shopWalletLabel').innerText = window.playerState.isGM ? (p ? `[${p.name}] 선수의 자산` : `학생 미등록`) : (window.playerState.isGuest ? `게스트 자산 없음` : `내 보유 자산`));

let html = '';
SHOP_ITEMS.filter((item) => itemMatchesShopCat(item, window.shopCat)).forEach(item => {
const isOwned = item.price === 0 || inventory.includes(item.id);
const isEquipped = p ? (p.equipHead === item.id || p.equipHandL === item.id || p.equipHandR === item.id || p.equipFootL === item.id || p.equipFootR === item.id || p.equipFace === item.id || p.equipSkin === item.id || p.equipKit === item.id) : false;
const level = Number(itemLevels[item.id]) || 0;
const enhData = ENHANCE_LEVELS[level] || ENHANCE_LEVELS[0];
const nextEnhData = ENHANCE_LEVELS[level + 1];

let statsHtml = '';
for (const [k, v] of Object.entries(item.baseStats || {})) { statsHtml += `<span class="inline-block bg-emerald-900/50 text-emerald-300 border border-emerald-500/50 text-[9px] px-1 rounded mr-1 mb-1">${STAT_NAMES[k].split(' ')[0]} +${v + enhData.statPlus}</span>`; }
let growthHtml = '';
for (const [k, v] of Object.entries(item.baseGrowth || {})) { growthHtml += `<span class="inline-block bg-purple-900/50 text-purple-300 border border-purple-500/50 text-[9px] px-1 rounded mr-1 mb-1">성장 +${Math.floor(v * enhData.growthMult)}%</span>`; }

let btnHtml = ''; let enhanceBtnHtml = '';
if(isOwned && nextEnhData && !window.playerState.isGuest && !isCosmeticItem(item)) {
const canEnhance = bong >= item.price;
enhanceBtnHtml = `
                     <div class="mt-2 pt-2 border-t border-slate-700 w-full">
                         <button onclick="window.enhanceItem('${item.id}')" class="w-full relative overflow-hidden group ${canEnhance ? 'bg-gradient-to-r from-purple-700 to-indigo-600 hover:from-purple-600 hover:to-indigo-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'bg-slate-800 text-slate-500 cursor-not-allowed'} text-xs font-bold py-2 rounded transition-all">
                             <span class="relative z-10 flex items-center justify-center gap-2"><i class="fa-solid fa-hammer ${canEnhance ? 'animate-bounce' : ''}"></i> 강화 도전 (${item.price} B) - 성공률 ${nextEnhData.chance}%</span>
                         </button>
                     </div>`;
} else if (isOwned && !nextEnhData && !isCosmeticItem(item)) {
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

const slotKo = { 'head':'머리', 'handL':'왼손', 'handR':'오른손', 'footL':'왼발', 'footR':'오른발', 'face':'얼굴', 'skin':'스킨', 'kit':'킷' }[item.type] || '기타';

let previewInner = item.faceImageUrl
? `<img src="${escapeAttr(resolveFaceSrc(item.faceImageUrl))}" alt="" class="w-full h-full object-contain rounded-lg bg-slate-950"/>`
: `<span class="z-10 relative drop-shadow-md">${item.icon}</span>`;

html += `
                 <div class="bg-slate-900/80 border ${isOwned ? 'border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.2)]' : 'border-slate-700'} rounded-xl p-4 flex flex-col justify-between hover:border-purple-400 transition duration-300">
                     <div class="flex items-start gap-4">
                         <div class="text-4xl w-16 h-16 bg-slate-800 flex items-center justify-center rounded-lg shadow-inner flex-shrink-0 relative border overflow-hidden ${isOwned ? 'border-purple-500' : 'border-slate-600'} ${isOwned && !isCosmeticItem(item) ? enhData.css : ''}">
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
const kitItem = SHOP_ITEMS.find((x) => x.id === p.equipKit && x.type === 'kit');

document.getElementById('detailPanelTitle') && (document.getElementById('detailPanelTitle').innerText = isMe ? '내 선수 정보' : `${p.name} 선수의 정보`);
document.getElementById('detailLevel') && (document.getElementById('detailLevel').innerText = lv);

const badge = document.getElementById('detailTierBadge');
if(badge) { badge.innerText = tier.name; badge.className = `px-2 py-1 rounded border text-[10px] font-bold shadow-md whitespace-nowrap ${tier.class}`; }

const card = document.getElementById('detailFutCard');
if(card) { card.className = `fut-card fut-career-card w-[320px] h-[530px] p-0 flex flex-col relative shadow-2xl z-10 mx-auto transition-all duration-300 overflow-hidden ${tier.cardClass} ${kitItem?.kitClass || ''}`.trim(); }
const aura = document.getElementById('cardAuraWrapper');
if (aura) {
const auraTier = (tier.cardClass || 'card-rookie').replace('card-', 'card-aura-');
aura.className = `card-aura ${auraTier} mx-auto w-fit transition-all duration-500 z-10 relative`;
}

const detailAv = document.getElementById('detailAvatar');
if (detailAv) detailAv.innerHTML = getAvatarHtml(p, 'detail');
document.getElementById('detailName') && (document.getElementById('detailName').innerText = p.name);
document.getElementById('detailAge') && (document.getElementById('detailAge').innerText = Number(p.age) || 13);
document.getElementById('detailOvr') && (document.getElementById('detailOvr').innerText = ovr);
document.getElementById('detailPos') && (document.getElementById('detailPos').innerText = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정');
document.getElementById('detailExpText') && (document.getElementById('detailExpText').innerText = `${exp} / ${expNeeded}`);
document.getElementById('detailExpBar') && (document.getElementById('detailExpBar').style.width = `${expPercent}%`);

const simTeamPanel = document.getElementById('detailSimTeamPanel');
if (simTeamPanel) {
if (window.playerState.isGuest) {
simTeamPanel.innerHTML = '';
simTeamPanel.classList.add('hidden');
} else {
simTeamPanel.classList.remove('hidden');
const st = p.simTeam;
const canSimPick = !window.playerState.isGuest;
const dis = canSimPick ? '' : 'disabled';
const cA = st === 'A' ? 'checked' : '';
const cB = st === 'B' ? 'checked' : '';
const pidAttr = escapeAttr(p.id);
simTeamPanel.innerHTML = `
<div class="mt-4 pt-3 border-t border-slate-700/80">
<p class="text-[10px] font-bold text-amber-400/90 mb-2 flex items-center gap-1"><i class="fa-solid fa-futbol"></i> 모의경기 팀 (프로필에서 선택)</p>
<div class="flex items-center justify-between gap-3 text-xs flex-wrap">
<label class="flex items-center gap-2 ${canSimPick ? 'cursor-pointer text-red-300' : 'text-slate-500 cursor-default'}">
<input type="checkbox" class="accent-red-500 rounded border-slate-600 sim-profile-cb" ${cA} ${dis} data-sim-profile-team="A" data-player-id="${pidAttr}" />
레드팀
</label>
<label class="flex items-center gap-2 ${canSimPick ? 'cursor-pointer text-blue-300' : 'text-slate-500 cursor-default'}">
<input type="checkbox" class="accent-blue-500 rounded border-slate-600 sim-profile-cb" ${cB} ${dis} data-sim-profile-team="B" data-player-id="${pidAttr}" />
블루팀
</label>
</div>
<p class="text-[9px] text-slate-500 mt-1.5 leading-snug">한쪽만 선택됩니다. 체크 해제 시 팀에서 빠집니다. 로그인한 학생은 누구나 팀을 구성할 수 있습니다.</p>
</div>`;
}
}

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
const baseVal = getStat(p, s.id); const bVal = bonus.flat[s.id] || 0; const totalVal = Math.min(99, baseVal + bVal);
let bonusBadge = bVal > 0 ? `<span class="text-[9px] text-emerald-400 font-bold leading-none absolute -top-0.5 -right-3.5">+${bVal}</span>` : '';
const barW = Math.max(8, Math.min(100, totalVal));

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
                         <div class="stat-mini-bar w-10"><i style="width:${barW}%"></i></div>
                     </div>`;
} else {
gridHtml += `
                     <div class="flex flex-col items-center justify-center text-current w-full">
                         <div class="relative flex items-center justify-center mb-0.5 ${highlightClass}">
                             <span class="font-bebas text-[1.45rem] font-normal leading-none tracking-tight">${totalVal}</span>
                             ${bonusBadge}
                         </div>
                         <span class="font-bold text-[10px] sm:text-[11px] opacity-95 tracking-tight whitespace-nowrap cursor-pointer hover:text-emerald-400 transition leading-none" onclick="window.showStatDesc('${s.id}')">${s.label} ${labelIcon}</span>
                         <div class="stat-mini-bar w-10"><i style="width:${barW}%"></i></div>
                     </div>`;
}
});
const statsGridEl = document.getElementById('detailStatsGrid');
if(statsGridEl) statsGridEl.innerHTML = gridHtml;

drawRadarChart(p, bonus.flat);

const equipSlots = [
{ id: 'slotHead', equip: p.equipHead, empty: '🪖', label: '머리' },
{ id: 'slotHandL', equip: p.equipHandL, empty: '🧤', label: '왼손' },
{ id: 'slotFace', equip: p.equipFace || p.equipSkin, empty: '😶', label: '얼굴' },
{ id: 'slotHandR', equip: p.equipHandR, empty: '🧤', label: '오른손' },
{ id: 'slotFootL', equip: p.equipFootL, empty: '👟', label: '왼발' },
{ id: 'slotFootR', equip: p.equipFootR, empty: '👟', label: '오른발' }
];

equipSlots.forEach(slot => {
const el = document.getElementById(slot.id);
if (!el) return;
if (slot.equip) {
const item = SHOP_ITEMS.find(x => x.id === slot.equip);
const level = (p.itemLevels && typeof p.itemLevels === 'object' && !Array.isArray(p.itemLevels) && p.itemLevels[slot.equip]) ? Number(p.itemLevels[slot.equip]) : 0;
const enhData = ENHANCE_LEVELS[level] || ENHANCE_LEVELS[0];

if (item) {
if (item.type === 'face' || item.type === 'skin') {
el.innerHTML = `<img src="${escapeAttr(resolveFaceSrc(item.faceImageUrl || ''))}" alt="" class="item-face-thumb"/><span class="item-label">${slot.label}</span>`;
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
const counts = getTodayActivityCounts(p);
const hint = document.getElementById('activityQuotaHint');
if (hint) {
hint.innerHTML = `오늘 남은 한도 — 훈련 ${counts.training}/${ACTIVITY_DAILY_CAP.training} · 출전 ${counts.matches}/${ACTIVITY_DAILY_CAP.matches} · 골 ${counts.goals}/${ACTIVITY_DAILY_CAP.goals} · 어시 ${counts.assists}/${ACTIVITY_DAILY_CAP.assists}`;
}
['training','matches','goals','assists','keypass','saves'].forEach((k) => {
const btn = document.getElementById('btnAct' + k.charAt(0).toUpperCase() + k.slice(1));
if (!btn) return;
const left = Math.max(0, ACTIVITY_DAILY_CAP[k] - (counts[k] || 0));
btn.classList.toggle('opacity-40', left <= 0);
btn.classList.toggle('cursor-not-allowed', left <= 0);
});
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
const nextVal = Math.min(99, getStat(p, s) + 1);
updatesObj[s] = nextVal;
if (nextVal > getStat(p, s)) increasedStats.push(STAT_NAMES[s].split(' ')[0]);
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

const statVals = STAT_KEYS.map((k) => getStat(p, k) + (bonusFlat[k] || 0));

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
ctx.shadowColor = `rgba(${color}, 0.55)`;
ctx.shadowBlur = 12;
ctx.stroke();
ctx.shadowBlur = 0;
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

if (!window.playerState.isGM) {
const cap = ACTIVITY_DAILY_CAP[type];
if (cap != null) {
const today = getKstDateStr();
const counts = getTodayActivityCounts(p);
if ((counts[type] || 0) >= cap) {
return window.customAlert(`오늘은 [${ACTIVITY_LABEL[type] || type}] 한도(${cap}회)를 모두 사용했습니다.\n시즌 2에서는 매일 조금씩 성장합니다. 내일 다시 기록해주세요!`);
}
counts[type] = (counts[type] || 0) + 1;
updates.activityDay = today;
updates.activityCounts = counts;
}
}

if(type === 'matches') { expGained = 50; updates.matches = (Number(p.matches)||0) + 1; }
if(type === 'training') { expGained = 25; updates.training = (Number(p.training)||0) + 1; }
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
else if(type === 'training' && (Number(p.training) || 0) > 0) { expDeduct += 25; updates.training = Number(p.training) - 1; }
else if(type === 'goals' && (Number(p.goals) || 0) > 0) { expDeduct += 20; updates.goals = Number(p.goals) - 1; updates.bong = Math.max(0, (Number(p.bong)||0) - 3); }
else if(type === 'assists' && (Number(p.assists) || 0) > 0) { expDeduct += 10; updates.assists = Number(p.assists) - 1; updates.bong = Math.max(0, (Number(p.bong)||0) - 1); }
else if(type === 'keypass' && (Number(p.keypass) || 0) > 0) { expDeduct += 15; updates.keypass = Number(p.keypass) - 1; updates.bong = Math.max(0, (Number(p.bong)||0) - 1); }
else if(type === 'saves' && (Number(p.saves) || 0) > 0) { expDeduct += 15; updates.saves = Number(p.saves) - 1; updates.bong = Math.max(0, (Number(p.bong)||0) - 2); }
else return window.customAlert("❌ 차감할 해당 기록이 없습니다.");

if(!await window.customConfirm("방금 입력한 기록을 취소하시겠습니까?\n(해당 활동으로 받은 경험치와 같은 양이 차감되고, 1 EXP 페널티가 추가됩니다.\n부족 시 레벨이 함께 내려갑니다.)")) return;

const today = getKstDateStr();
if (p.activityDay === today) {
const counts = getTodayActivityCounts(p);
if ((counts[type] || 0) > 0) {
counts[type] -= 1;
updates.activityDay = today;
updates.activityCounts = counts;
}
}

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
if (item.price > 0) {
if(!await window.customConfirm(`[${item.name}] 아이템을 ${item.price} B에 구매하시겠습니까?`)) return;
updates.bong = (Number(p.bong) || 0) - item.price;
}
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
if (item.type === 'face' || item.type === 'skin' || item.type === 'kit') return window.customAlert('스킨·얼굴·킷은 강화할 수 없습니다.');

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
const fieldMap = { 'head':'equipHead', 'handL':'equipHandL', 'handR':'equipHandR', 'footL':'equipFootL', 'footR':'equipFootR', 'face':'equipFace', 'skin':'equipSkin', 'kit':'equipKit' };
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
if(p.equipFace === itemId) updates.equipFace = null; if(p.equipSkin === itemId) updates.equipSkin = null; if(p.equipKit === itemId) updates.equipKit = null;

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
const newVal = Math.max(1, Math.min(99, getStat(p, statKey) + change));
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + pId);
await setDoc(docRef, { [statKey]: newVal }, { merge: true });
} catch (e) { console.error("modStat Error:", e); window.customAlert(`스탯 수정 에러:\n${e.message}`); }
};

window.setStat = async (pId, statKey, value) => {
try {
checkAuthReady();
if(!window.playerState.isGM) return;
const newVal = Math.max(1, Math.min(99, parseInt(value) || STAT_BASE));
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
if(currentLv % 3 === 0) { STAT_KEYS.forEach(s => updatesObj[s] = Math.min(99, getStat(p, s) + 1)); }
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

window.startSeason2 = async () => {
try {
checkAuthReady();
if(!window.playerState.isGM) return;
if(!await window.customConfirm(`시즌 2를 개막할까요?\n\n• 모든 학생 능력치 → ${STAT_BASE}\n• 레벨·EXP·골/어시/훈련/출전 기록 → 0\n• 자산(B)·장비·강화 → 초기화\n• 이름·포지션·나이·얼굴 사진은 유지\n\n예정 개막일: ${SEASON2_KICKOFF} (토)\n이 작업은 되돌릴 수 없습니다.`)) return;
if(!await window.customConfirm('정말로 시즌 2를 시작합니까?\n전원 데이터가 리셋됩니다.')) return;

const batch = writeBatch(db);
const resetStats = {};
STAT_KEYS.forEach((k) => { resetStats[k] = STAT_BASE; });
window.allPlayersData.forEach((p) => {
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id));
batch.set(docRef, {
...resetStats,
level: 1,
exp: 0,
goals: 0,
assists: 0,
matches: 0,
training: 0,
saves: 0,
keypass: 0,
bong: 0,
lastWageWeek: '',
inventory: [],
itemLevels: {},
equipHead: null,
equipHandL: null,
equipHandR: null,
equipFootL: null,
equipFootR: null,
equipFace: null,
claimedAchievements: [],
activityDay: '',
activityCounts: emptyActivityCounts(),
season: 2,
simTeam: deleteField(),
updatedAt: new Date().toISOString()
}, { merge: true });
});
const seasonRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'season');
batch.set(seasonRef, {
season: 2,
title: 'SEASON 2',
started: true,
startedAt: new Date().toISOString(),
kickoffLabel: SEASON2_KICKOFF,
resetNote: `stats ${STAT_BASE}, records cleared`
}, { merge: true });
const eventRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'latest_event');
batch.set(eventRef, {
text: '삼봉 FC 시즌 2 개막! 전원 능력치 55부터 다시 성장합니다.',
timestamp: Date.now()
}, { merge: true });
const annRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'announcement');
batch.set(annRef, {
text: `🏆 삼봉 FC 시즌 2 개막!\n\n모든 선수가 능력치 ${STAT_BASE}에서 다시 시작합니다.\n개인 훈련·출전은 하루 1회만 기록되고, 골·어시 등에도 일일 한도가 있습니다.\n이번 시즌은 매주 조금씩 성장하는 커리어 모드입니다. 화이팅!`,
updatedAt: new Date().toISOString()
}, { merge: true });
await batch.commit();
triggerConfetti();
window.customAlert(`시즌 2가 시작되었습니다!\n전원 능력치 ${STAT_BASE} · 기록 초기화 완료.`);
} catch (e) {
console.error('startSeason2 Error:', e);
window.customAlert(`시즌 2 개막 에러:\n${e.message}`);
}
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

view.innerHTML = `<div class="flex justify-between items-center mb-6 px-2 sm:px-4"><div class="compare-fut-mini ${getTierInfo(myOvr).cardClass} flex flex-col items-center"><span class="inline-flex items-center justify-center mb-1">${getAvatarHtml(myP, 'xl')}</span><span class="font-bold text-current text-sm truncate max-w-[6.5rem]">${escapeHtml(myP.name)}</span><span class="fut-mini-ovr text-2xl mt-0.5">${myOvr}</span></div><div class="sim-vs-badge px-2">VS</div><div class="compare-fut-mini ${getTierInfo(tgOvr).cardClass} flex flex-col items-center"><span class="inline-flex items-center justify-center mb-1">${getAvatarHtml(tgP, 'xl')}</span><span class="font-bold text-current text-sm truncate max-w-[6.5rem]">${escapeHtml(tgP.name)}</span><span class="fut-mini-ovr text-2xl mt-0.5">${tgOvr}</span></div></div><div class="flex-1 bg-slate-900/50 p-4 sm:p-5 rounded-xl border border-slate-700 shadow-inner overflow-y-auto custom-scrollbar">${statRows}</div>`;
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
const SIM_TEAM_A_NAME = '레드팀';
const SIM_TEAM_B_NAME = '블루팀';

function getSimMatchRoster(team) {
return (window.allPlayersData || [])
.filter((p) => p.simTeam === team)
.sort((a, b) => getOVR(b) - getOVR(a))
.slice(0, 5);
}

/** 모의경기 탭: 인원 수 + 팀 분류 보드(라커와 동일 UI) */
window.renderSimMatchTab = () => {
const na = countSimTeam('A');
const nb = countSimTeam('B');
const ca = document.getElementById('simCountA');
const cb = document.getElementById('simCountB');
if (ca) ca.textContent = `소속 ${na}명 · 출전 OVR 상위 5명 (팀당 1명 이상이면 연습 경기 가능)`;
if (cb) cb.textContent = `소속 ${nb}명 · 출전 OVR 상위 5명 (팀당 1명 이상이면 연습 경기 가능)`;
window.renderSimTeamBoards();
window.renderOfficialBetPanel();
const rawTA = getSimMatchRoster('A');
const rawTB = getSimMatchRoster('B');
const padTA = padSimRosterWithBots(rawTA, 'A');
const padTB = padSimRosterWithBots(rawTB, 'B');
ensureSimFieldPositions(padTA.roster, padTB.roster);
window.renderSimTacticalStrips();
window.drawSimTacticalBoard();
const slog = document.getElementById('simMatchLog');
if (slog && slog.children.length === 0) resetSimPitchCanvas();
const brief = document.getElementById('simPrematchBrief');
if (brief && padTA.roster.length && padTB.roster.length) {
const oa = Math.round(padTA.roster.reduce((s, p) => s + getOVR(p), 0) / padTA.roster.length);
const ob = Math.round(padTB.roster.reduce((s, p) => s + getOVR(p), 0) / padTB.roster.length);
const starA = [...padTA.roster].sort((a, b) => getOVR(b) - getOVR(a))[0];
const starB = [...padTB.roster].sort((a, b) => getOVR(b) - getOVR(a))[0];
const fav = oa === ob ? '팽팽한 전력' : (oa > ob ? `레드팀이 OVR ${oa - ob} 우세` : `블루팀이 OVR ${ob - oa} 우세`);
brief.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-2 mb-2"><span class="text-[10px] font-black tracking-widest text-amber-300">PRE-MATCH · 레드팀 VS 블루팀</span><span class="text-[10px] text-slate-400">${fav}</span></div>
<div class="grid grid-cols-3 gap-2 text-center mb-2">
<div><div class="text-red-300 font-black text-lg">${oa}</div><div class="text-[9px] text-slate-500">레드팀 평균</div></div>
<div class="text-[10px] text-slate-400 self-center">VS</div>
<div><div class="text-blue-300 font-black text-lg">${ob}</div><div class="text-[9px] text-slate-500">블루팀 평균</div></div>
</div>
<p class="text-[11px] text-slate-300">핵심 매치업: <b class="text-red-200">${escapeHtml(starA.name)}</b> (OVR ${getOVR(starA)}) vs <b class="text-blue-200">${escapeHtml(starB.name)}</b> (OVR ${getOVR(starB)}). 슈팅은 슈팅/반사신경, 패스는 패스/가로채기 맞대결로 판정됩니다.</p>`;
}
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

/** 모의경기 이펙트용 confetti 발사 위치 (피치 캔버스 기준) */
function getSimFxOrigin(side) {
const canvas = document.getElementById('simPitchCanvas');
if (!canvas || typeof window === 'undefined') return { x: 0.5, y: 0.38 };
const rect = canvas.getBoundingClientRect();
const nx = side === 'left' ? 0.12 : side === 'right' ? 0.88 : 0.5;
return {
x: (rect.left + rect.width * nx) / window.innerWidth,
y: (rect.top + rect.height * 0.42) / window.innerHeight
};
}

/** 골·슈퍼세이브·킬패스 — confetti + 피치 패널 펄스 */
function runSimBroadcastFx(fx, pitchOpts) {
if (!fx || typeof confetti !== 'function') return;
const attackA = !!pitchOpts?.attackA;
const origin = getSimFxOrigin(
fx === 'goal' ? (attackA ? 'right' : 'left')
: fx === 'superSave' ? (attackA ? 'left' : 'right')
: 'center'
);
const base = { origin, zIndex: 9999, disableForReducedMotion: true };
if (fx === 'goal') {
confetti({ ...base, particleCount: 130, spread: 88, startVelocity: 54, colors: ['#fbbf24', '#22c55e', '#fef08a', '#ffffff', '#fde047'] });
setTimeout(() => confetti({ ...base, particleCount: 85, spread: 105, startVelocity: 40, scalar: 1.15, colors: ['#eab308', '#4ade80', '#fde047'] }), 160);
setTimeout(() => confetti({ ...base, particleCount: 55, spread: 65, origin: { x: origin.x, y: Math.max(0.05, origin.y - 0.06) }, colors: ['#ffffff', '#fbbf24', '#86efac'] }), 340);
} else if (fx === 'superSave') {
confetti({ ...base, particleCount: 95, spread: 58, startVelocity: 44, scalar: 0.98, colors: ['#22d3ee', '#67e8f9', '#e0f2fe', '#ffffff', '#06b6d4'] });
setTimeout(() => confetti({ ...base, particleCount: 65, spread: 72, angle: 90, startVelocity: 32, colors: ['#0891b2', '#a5f3fc', '#ffffff'] }), 200);
} else if (fx === 'keyPass') {
confetti({ ...base, particleCount: 50, spread: 52, startVelocity: 32, scalar: 0.88, colors: ['#c084fc', '#a78bfa', '#fbbf24', '#ffffff', '#e9d5ff'] });
setTimeout(() => confetti({ ...base, particleCount: 28, spread: 40, startVelocity: 22, scalar: 0.75, colors: ['#ddd6fe', '#fcd34d'] }), 180);
}
}

function pulseSimPitchCanvas(fx) {
const canvas = document.getElementById('simPitchCanvas');
const wrap = canvas?.parentElement;
if (!wrap) return;
wrap.classList.remove('sim-pitch-fx-goal', 'sim-pitch-fx-save', 'sim-pitch-fx-kp');
const cls = fx === 'goal' ? 'sim-pitch-fx-goal' : fx === 'superSave' ? 'sim-pitch-fx-save' : fx === 'keyPass' ? 'sim-pitch-fx-kp' : null;
if (cls) {
wrap.classList.add(cls);
setTimeout(() => wrap.classList.remove(cls), 1500);
}
}

/** 상단 피치·하단 중계가 공유하는 상황 요약 */
function buildSimSituationMeta(opts, plAll) {
if (!opts) return null;
const sideMap = { left: '왼쪽 측면', center: '중앙', right: '오른쪽 측면' };
const phaseMap = { danger: '페널티 인근', progress: '중앙 전개', build: '빌드업' };
const outcomeMap = { success: '성공', fail: '실패', neutral: '중립' };
const dir = opts.attackA ? 'A→B' : 'B→A';
const sideHint = sideMap[opts.channel] || '중앙';
const cap = phaseMap[opts.phase] || '빌드업';
const out = outcomeMap[opts.outcome] || '중립';
let holderName = '';
let holderPos = '';
if (opts.ballHolderId && plAll && plAll.length) {
const hp = plAll.find((x) => x.id === opts.ballHolderId);
if (hp) {
holderName = hp.name || '';
holderPos = simPosShort(hp);
}
}
let eventTag = '';
if (opts.broadcastFx === 'goal') eventTag = '⚽ GOAL';
else if (opts.broadcastFx === 'superSave') eventTag = '🧤 SUPER SAVE';
else if (opts.broadcastFx === 'keyPass') eventTag = '🎯 KEY PASS';
const holderPart = holderName ? `볼 ${holderName}${holderPos ? `(${holderPos})` : ''}` : '볼 —';
const captionLine = `${dir} · ${sideHint} · ${cap} · ${holderPart} · ${out}${eventTag ? ` · ${eventTag}` : ''}`;
return { dir, sideHint, cap, out, holderName, holderPos, eventTag, captionLine, outcome: opts.outcome, broadcastFx: opts.broadcastFx };
}

function applySimPitchCaptionMeta(meta) {
const capEl = document.getElementById('simPitchCaption');
if (!capEl) return;
if (!meta || !meta.captionLine) {
capEl.textContent = '경기 시작 시 상황 요약이 표시됩니다';
capEl.className = 'text-[10px] sm:text-[11px] text-slate-400 font-semibold leading-snug break-keep';
return;
}
capEl.textContent = meta.captionLine;
const oc = meta.outcome === 'success' ? 'text-emerald-300'
: meta.outcome === 'fail' ? 'text-red-300'
: 'text-amber-200';
capEl.className = `text-[10px] sm:text-[11px] ${oc} font-semibold leading-snug break-keep`;
}

/** 피치 캔버스 위 하이라이트 오버레이 (선수 아래 레이어 — 코너·골대 위주) */
function drawSimPitchFxOverlay(ctx, px0, py0, pw, ph, ballX, ballY, fx, flow, attackA) {
ctx.save();
if (fx === 'goal') {
const gx = attackA ? px0 + pw - 6 : px0 + 6;
const gy = py0 + ph / 2;
const grd = ctx.createRadialGradient(gx, gy, 4, gx, gy, Math.max(pw, ph) * 0.42);
grd.addColorStop(0, 'rgba(250, 204, 21, 0.38)');
grd.addColorStop(0.45, 'rgba(34, 197, 94, 0.16)');
grd.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = grd;
ctx.fillRect(px0, py0, pw, ph);
ctx.strokeStyle = 'rgba(254, 240, 138, 0.75)';
ctx.lineWidth = 2.2;
for (let r = 0; r < 3; r++) {
ctx.beginPath();
ctx.arc(gx, gy, 10 + r * 10, 0, Math.PI * 2);
ctx.stroke();
}
for (let i = 0; i < 6; i++) {
const a = (Math.PI * 2 * i) / 6 + 0.2;
ctx.fillStyle = i % 2 === 0 ? 'rgba(253, 224, 71, 0.85)' : 'rgba(254, 249, 195, 0.75)';
ctx.font = 'bold 10px sans-serif';
ctx.fillText('✦', gx + Math.cos(a) * 22 - 4, gy + Math.sin(a) * 18 + 4);
}
} else if (fx === 'superSave') {
const gx = attackA ? px0 + 8 : px0 + pw - 8;
const gy = py0 + ph / 2;
const grd = ctx.createRadialGradient(gx, gy, 2, gx, gy, pw * 0.28);
grd.addColorStop(0, 'rgba(34, 211, 238, 0.38)');
grd.addColorStop(0.5, 'rgba(6, 182, 212, 0.14)');
grd.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = grd;
ctx.fillRect(px0, py0, pw, ph);
ctx.strokeStyle = 'rgba(103, 232, 249, 0.72)';
ctx.lineWidth = 2.2;
for (let i = 0; i < 4; i++) {
ctx.beginPath();
ctx.arc(gx, gy, 14 + i * 10, -Math.PI * 0.62, Math.PI * 0.62, !attackA);
ctx.stroke();
}
ctx.font = 'bold 20px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
ctx.fillText('🧤', gx - 12, gy + 8);
} else if (fx === 'keyPass') {
if (flow && flow.length >= 2) {
const a = flow[flow.length - 2];
const b = flow[flow.length - 1];
const ax = px0 + a.nx * pw;
const ay = py0 + a.ny * ph;
const bx = px0 + b.nx * pw;
const by = py0 + b.ny * ph;
ctx.strokeStyle = 'rgba(192, 132, 252, 0.55)';
ctx.lineWidth = 3;
ctx.setLineDash([6, 4]);
ctx.beginPath();
ctx.moveTo(ax, ay);
ctx.lineTo(bx, by);
ctx.stroke();
ctx.setLineDash([]);
}
ctx.font = 'bold 14px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
ctx.fillText('🎯', px0 + pw - 22, py0 + 16);
}
ctx.restore();
}

/** 중계 한 줄을 방송용 이미지(img)로 렌더링 — fx: goal | superSave | keyPass, meta: 상단 피치와 동일 요약 */
function simBroadcastTextToImage(text, fx, meta) {
return new Promise((resolve) => {
const logBox = document.getElementById('simMatchLog');
const maxCssW = Math.min(720, Math.max(260, (logBox?.clientWidth || 560) - 8));
const pad = 14;
const lineHeight = 22;
const metaLineHeight = 18;
const fontSize = 14;
const dpr = Math.min(2, typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1);
const fxGoal = fx === 'goal' || (!fx && text.includes('⚽'));
const fxSave = fx === 'superSave' || text.includes('SUPER SAVE') || text.includes('슈퍼 세이브');
const fxKp = fx === 'keyPass';
const hasMeta = !!(meta && meta.captionLine);

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
const isGoal = fxGoal;
const isSuperSave = fxSave;
const isKeyPass = fxKp;
const isTitle = text.includes('━━');
const isHalftime = text.includes('하프타임') || text.includes('[휴식]');
const hasFxBanner = isGoal || isSuperSave || isKeyPass;

let cssH = pad * 2 + lines.length * lineHeight + 6 + (hasFxBanner ? 10 : 0) + (hasMeta ? metaLineHeight + 6 : 0);
const cssW = maxCssW;

canvas.width = Math.floor(cssW * dpr);
canvas.height = Math.floor(cssH * dpr);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const grd = ctx.createLinearGradient(0, 0, cssW, cssH);
if (isGoal) {
grd.addColorStop(0, '#166534');
grd.addColorStop(0.45, '#14532d');
grd.addColorStop(1, '#052e16');
} else if (isSuperSave) {
grd.addColorStop(0, '#0e7490');
grd.addColorStop(0.5, '#164e63');
grd.addColorStop(1, '#083344');
} else if (isKeyPass) {
grd.addColorStop(0, '#5b21b6');
grd.addColorStop(0.5, '#4c1d95');
grd.addColorStop(1, '#2e1065');
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

if (hasFxBanner) {
ctx.strokeStyle = isGoal ? 'rgba(250, 204, 21, 0.75)' : isSuperSave ? 'rgba(34, 211, 238, 0.75)' : 'rgba(192, 132, 252, 0.75)';
ctx.lineWidth = 2;
if (typeof ctx.roundRect === 'function') {
ctx.beginPath();
ctx.roundRect(1, 1, cssW - 2, cssH - 2, 9);
ctx.stroke();
}
for (let i = 0; i < 6; i++) {
const sx = 8 + (i * (cssW - 16)) / 5;
ctx.fillStyle = isGoal ? 'rgba(253, 224, 71, 0.55)' : isSuperSave ? 'rgba(165, 243, 252, 0.5)' : 'rgba(216, 180, 254, 0.5)';
ctx.beginPath();
ctx.arc(sx, cssH - 6, 2.2, 0, Math.PI * 2);
ctx.fill();
}
}

const barColor = isGoal ? '#fbbf24' : isSuperSave ? '#22d3ee' : isKeyPass ? '#c084fc' : isHalftime ? '#a5b4fc' : '#e8c271';
ctx.fillStyle = barColor;
ctx.fillRect(0, 0, 6, cssH);

if (hasFxBanner) {
const badge = isGoal ? '⚽ GOAL!' : isSuperSave ? '🧤 SUPER SAVE' : '🎯 KEY PASS';
ctx.font = `800 11px "Malgun Gothic","Noto Sans KR",sans-serif`;
ctx.fillStyle = isGoal ? '#fef08a' : isSuperSave ? '#cffafe' : '#ede9fe';
ctx.fillText(badge, pad + 8, pad - 2);
}

ctx.fillStyle = isGoal ? '#fef9c3' : isSuperSave ? '#ecfeff' : isKeyPass ? '#f3e8ff' : '#f1f5f9';
ctx.font = `600 ${fontSize}px "Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif`;
ctx.textBaseline = 'top';
const textY = pad + (hasFxBanner ? 12 : 0);
lines.forEach((ln, i) => {
ctx.fillText(ln, pad + 8, textY + i * lineHeight);
});

if (hasMeta) {
const metaY = textY + lines.length * lineHeight + 4;
ctx.fillStyle = 'rgba(0,0,0,0.42)';
if (typeof ctx.roundRect === 'function') {
ctx.beginPath();
ctx.roundRect(pad + 4, metaY, cssW - (pad + 4) * 2, metaLineHeight + 2, 6);
ctx.fill();
} else {
ctx.fillRect(pad + 4, metaY, cssW - (pad + 4) * 2, metaLineHeight + 2);
}
const metaColor = meta.outcome === 'success' ? '#86efac'
: meta.outcome === 'fail' ? '#fca5a5'
: '#fdba74';
ctx.fillStyle = metaColor;
ctx.font = `700 10px "Malgun Gothic","Noto Sans KR",sans-serif`;
ctx.fillText(meta.captionLine, pad + 10, metaY + 4);
}

const img = new Image();
const imgCls = isGoal ? 'sim-broadcast-img sim-broadcast-img--goal'
: isSuperSave ? 'sim-broadcast-img sim-broadcast-img--save'
: isKeyPass ? 'sim-broadcast-img sim-broadcast-img--kp'
: 'sim-broadcast-img';
img.className = `${imgCls} w-full h-auto rounded-lg shadow-md border select-none`;
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

/** 풋살 코트 마킹 · 네트 · 페널티 스팟 */
function drawFutsalPitchMarkings(ctx, px0, py0, pw, ph, midX) {
ctx.save();
ctx.strokeStyle = 'rgba(255,255,255,0.72)';
ctx.lineWidth = 1.8;
ctx.strokeRect(px0 + 0.5, py0 + 0.5, pw - 1, ph - 1);
ctx.beginPath();
ctx.moveTo(midX, py0);
ctx.lineTo(midX, py0 + ph);
ctx.stroke();
ctx.strokeStyle = 'rgba(255,255,255,0.28)';
ctx.lineWidth = 1.2;
ctx.beginPath();
ctx.arc(midX, py0 + ph / 2, Math.min(ph, pw) * 0.15, 0, Math.PI * 2);
ctx.stroke();
ctx.fillStyle = 'rgba(255,255,255,0.85)';
ctx.beginPath();
ctx.arc(midX, py0 + ph / 2, 2.4, 0, Math.PI * 2);
ctx.fill();
const gaW = pw * 0.14;
const gaH = ph * 0.46;
const gaY = py0 + (ph - gaH) / 2;
ctx.strokeStyle = 'rgba(255,255,255,0.5)';
ctx.lineWidth = 1.3;
ctx.strokeRect(px0, gaY, gaW, gaH);
ctx.strokeRect(px0 + pw - gaW, gaY, gaW, gaH);
const paW = pw * 0.22;
const paH = ph * 0.62;
const paY = py0 + (ph - paH) / 2;
ctx.strokeStyle = 'rgba(255,255,255,0.22)';
ctx.strokeRect(px0, paY, paW, paH);
ctx.strokeRect(px0 + pw - paW, paY, paW, paH);
const spotR = 2.1;
ctx.fillStyle = 'rgba(255,255,255,0.8)';
ctx.beginPath();
ctx.arc(px0 + gaW + 8, py0 + ph / 2, spotR, 0, Math.PI * 2);
ctx.fill();
ctx.beginPath();
ctx.arc(px0 + pw - gaW - 8, py0 + ph / 2, spotR, 0, Math.PI * 2);
ctx.fill();
const gmouthW = 7;
const gmouthH = gaH * 0.4;
const gmouthY = py0 + ph / 2 - gmouthH / 2;
const drawNet = (x, flip) => {
ctx.fillStyle = 'rgba(15,23,42,0.88)';
ctx.fillRect(x, gmouthY, gmouthW, gmouthH);
ctx.strokeStyle = 'rgba(250,204,21,0.92)';
ctx.lineWidth = 1.6;
ctx.strokeRect(x, gmouthY, gmouthW, gmouthH);
ctx.strokeStyle = 'rgba(226,232,240,0.35)';
ctx.lineWidth = 0.7;
for (let i = 1; i < 4; i++) {
const nx = x + (gmouthW * i) / 4;
ctx.beginPath();
ctx.moveTo(nx, gmouthY);
ctx.lineTo(nx, gmouthY + gmouthH);
ctx.stroke();
}
for (let i = 1; i < 5; i++) {
const ny = gmouthY + (gmouthH * i) / 5;
ctx.beginPath();
ctx.moveTo(x, ny);
ctx.lineTo(x + gmouthW, ny);
ctx.stroke();
}
if (flip) { /* 좌우 대칭용 자리 */ }
};
drawNet(px0 - 2, false);
drawNet(px0 + pw - gmouthW + 2, true);
ctx.restore();
}

/** 스타디움 바닥 · 줄무늬 잔디 · 사이드보드 · 레드/블루 코너 */
function paintFutsalPitchSurface(ctx, W, H, px0, py0, pw, ph) {
ctx.fillStyle = '#071018';
ctx.fillRect(0, 0, W, H);
const flood = ctx.createRadialGradient(W / 2, H * 0.28, 12, W / 2, H * 0.42, Math.max(W, H) * 0.7);
flood.addColorStop(0, 'rgba(255,255,230,0.1)');
flood.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = flood;
ctx.fillRect(0, 0, W, H);
ctx.fillStyle = '#7f1d1d';
ctx.fillRect(px0 - 7, py0 - 5, 7, ph + 10);
ctx.fillStyle = '#1e3a8a';
ctx.fillRect(px0 + pw, py0 - 5, 7, ph + 10);
ctx.fillStyle = '#0f172a';
ctx.fillRect(px0 - 7, py0 - 5, pw + 14, 5);
ctx.fillRect(px0 - 7, py0 + ph, pw + 14, 5);
const stripeN = 12;
const stripeW = pw / stripeN;
for (let i = 0; i < stripeN; i++) {
ctx.fillStyle = i % 2 === 0 ? '#168a3f' : '#127536';
ctx.fillRect(px0 + i * stripeW, py0, stripeW + 0.6, ph);
}
const gloss = ctx.createLinearGradient(px0, py0, px0, py0 + ph);
gloss.addColorStop(0, 'rgba(255,255,255,0.1)');
gloss.addColorStop(0.45, 'rgba(255,255,255,0)');
gloss.addColorStop(1, 'rgba(0,0,0,0.22)');
ctx.fillStyle = gloss;
ctx.fillRect(px0, py0, pw, ph);
const midX = px0 + pw / 2;
drawFutsalPitchMarkings(ctx, px0, py0, pw, ph, midX);
ctx.fillStyle = 'rgba(185,28,28,0.22)';
ctx.beginPath();
ctx.moveTo(px0, py0);
ctx.lineTo(px0 + 28, py0);
ctx.lineTo(px0, py0 + 22);
ctx.fill();
ctx.fillStyle = 'rgba(37,99,235,0.22)';
ctx.beginPath();
ctx.moveTo(px0 + pw, py0);
ctx.lineTo(px0 + pw - 28, py0);
ctx.lineTo(px0 + pw, py0 + 22);
ctx.fill();
ctx.font = '800 10px "Bebas Neue","Oswald","Malgun Gothic",sans-serif';
ctx.fillStyle = 'rgba(254,226,226,0.92)';
ctx.fillText('RED', px0 + 6, py0 + ph - 7);
ctx.fillStyle = 'rgba(219,234,254,0.92)';
ctx.textAlign = 'right';
ctx.fillText('BLUE', px0 + pw - 6, py0 + ph - 7);
ctx.textAlign = 'left';
}

/** 상단 고정 캔버스: 경기장·위험지역·골대·페널티·볼·공격 방향 화살표(성공=초록/실패=빨강/중립=주황) */
async function drawSimPitchLive(opts) {
const canvas = document.getElementById('simPitchCanvas');
const badge = document.getElementById('simPitchBadge');
if (!canvas || !canvas.getContext) return;
const ctx = canvas.getContext('2d');
const wrap = canvas.parentElement;
const maxCssW = typeof window !== 'undefined' ? Math.min(window.innerWidth - 20, 720) : 720;
const cssW = Math.max(260, Math.min(maxCssW, wrap?.clientWidth || maxCssW));
const cssH = Math.max(188, Math.min(380, Math.floor(cssW * 0.5)));
const dpr = Math.min(2, typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1);
canvas.width = Math.floor(cssW * dpr);
canvas.height = Math.floor(cssH * dpr);
canvas.style.width = `${cssW}px`;
canvas.style.height = `${cssH}px`;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const W = cssW;
const H = cssH;
const px0 = 16;
const py0 = 12;
const pw = W - 32;
const ph = H - 44;

paintFutsalPitchSurface(ctx, W, H, px0, py0, pw, ph);

const dzW = pw * 0.2;
ctx.fillStyle = 'rgba(220, 38, 38, 0.18)';
ctx.fillRect(px0, py0, dzW, ph);
ctx.fillRect(px0 + pw - dzW, py0, dzW, ph);
ctx.font = '600 9px "Malgun Gothic","Noto Sans KR",sans-serif';
ctx.fillStyle = 'rgba(254, 242, 242, 0.88)';
ctx.fillText('BOX', px0 + 8, py0 + 22);
ctx.fillText('BOX', px0 + pw - dzW + 8, py0 + 22);

ctx.fillStyle = 'rgba(0,0,0,0.5)';
ctx.fillRect(px0 - 3, py0 + ph * 0.32, 3, ph * 0.36);
ctx.fillRect(px0 + pw, py0 + ph * 0.32, 3, ph * 0.36);

const chY = { left: 0.22, center: 0.5, right: 0.78 };
const lane = chY[opts.channel] ?? 0.5;
const attackA = opts.attackA;
let baseBallNx;
if (opts.phase === 'build') baseBallNx = attackA ? 0.28 : 0.72;
else if (opts.phase === 'progress') baseBallNx = attackA ? 0.55 : 0.45;
else baseBallNx = attackA ? 0.82 : 0.18;
const baseBallNy = lane;
let ballNx = baseBallNx;
let ballNy = baseBallNy;
const plAll = [...(opts.plA || []), ...(opts.plB || [])];
if (opts.ballHolderId && plAll.length) {
const hp = plAll.find((x) => x.id === opts.ballHolderId);
if (hp) {
const teamIsA = opts.plA.some((x) => x.id === hp.id);
const base = window.simFieldPositions[teamIsA ? 'A' : 'B'][hp.id] || { nx: teamIsA ? 0.25 : 0.75, ny: 0.5 };
const hPos = simPlayerLiveNorm(hp, teamIsA, base, { ...opts, ballNx: baseBallNx, ballNy: baseBallNy });
const towardGoal = teamIsA ? 1 : -1;
ballNx = Math.max(0.03, Math.min(0.97, hPos.nx + towardGoal * 0.007));
ballNy = Math.max(0.06, Math.min(0.94, hPos.ny));
}
}
const portraitMap = plAll.length ? await buildSimPitchPortraitMap(plAll) : new Map();
const ballX = px0 + pw * ballNx;
const ballY = py0 + ph * ballNy;

const flow = opts.ballFlowTrail || [];
if (flow.length >= 2) {
ctx.save();
ctx.globalAlpha = 0.42;
ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
ctx.lineWidth = 2;
ctx.lineJoin = 'round';
ctx.setLineDash([5, 5]);
ctx.beginPath();
flow.forEach((pt, i) => {
const tx = px0 + pt.nx * pw;
const ty = py0 + pt.ny * ph;
if (i === 0) ctx.moveTo(tx, ty);
else ctx.lineTo(tx, ty);
});
ctx.stroke();
ctx.setLineDash([]);
flow.forEach((pt) => {
ctx.beginPath();
ctx.arc(px0 + pt.nx * pw, py0 + pt.ny * ph, 2.4, 0, Math.PI * 2);
ctx.fillStyle = 'rgba(251, 191, 36, 0.75)';
ctx.fill();
});
ctx.restore();
}

if (opts.broadcastFx) {
drawSimPitchFxOverlay(ctx, px0, py0, pw, ph, ballX, ballY, opts.broadcastFx, flow, attackA);
}

const oc = opts.outcome === 'success' ? '#4ade80' : opts.outcome === 'fail' ? '#f87171' : '#fb923c';
const gaW = pw * 0.13;
const goalTargetX = attackA ? px0 + pw - gaW * 0.45 : px0 + gaW * 0.45;
const laneT = chY[opts.channel] ?? 0.5;
const goalTargetY = py0 + ph * (0.35 + laneT * 0.3);
let ang = Math.atan2(goalTargetY - ballY, goalTargetX - ballX);
const arrowLen = Math.min(88, pw * 0.28);
let tipX = ballX + Math.cos(ang) * arrowLen;
let tipY = ballY + Math.sin(ang) * arrowLen;
ctx.save();
ctx.globalAlpha = 0.5;
ctx.strokeStyle = oc;
ctx.lineWidth = 2;
ctx.setLineDash([4, 3]);
ctx.beginPath();
ctx.moveTo(ballX, ballY);
ctx.lineTo(tipX, tipY);
ctx.stroke();
ctx.setLineDash([]);
ctx.globalAlpha = 0.65;
ctx.fillStyle = oc;
const head = 9;
const backAng = ang + Math.PI;
ctx.beginPath();
ctx.moveTo(tipX, tipY);
ctx.lineTo(tipX + Math.cos(backAng + 0.35) * head, tipY + Math.sin(backAng + 0.35) * head);
ctx.lineTo(tipX + Math.cos(backAng - 0.35) * head, tipY + Math.sin(backAng - 0.35) * head);
ctx.closePath();
ctx.fill();
ctx.restore();

drawSoccerBallSprite(ctx, ballX, ballY, Math.max(6, Math.min(9, pw * 0.015)), oc);

if (opts.plA && opts.plB && opts.plA.length && opts.plB.length) {
drawSimPlayersOnPitch(ctx, px0, py0, pw, ph, { ...opts, ballNx, ballNy, portraitMap, ballHolderId: opts.ballHolderId });
}

const plAllMeta = plAll;
const meta = buildSimSituationMeta(opts, plAllMeta);
applySimPitchCaptionMeta(meta);

ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
ctx.fillRect(px0, py0 + ph + 1, pw, 14);
if (meta && meta.captionLine) {
const metaColor = opts.outcome === 'success' ? 'rgba(134, 239, 172, 0.95)'
: opts.outcome === 'fail' ? 'rgba(252, 165, 165, 0.95)'
: 'rgba(253, 186, 116, 0.95)';
ctx.fillStyle = metaColor;
ctx.font = '700 9px "Malgun Gothic","Noto Sans KR",sans-serif';
let shown = meta.captionLine;
for (let s = meta.captionLine.length; s >= 8; s--) {
shown = s < meta.captionLine.length ? `${meta.captionLine.slice(0, s)}…` : meta.captionLine;
if (ctx.measureText(shown).width <= pw - 8) break;
}
ctx.fillText(shown, px0 + 4, py0 + ph + 11);
}

if (badge) {
if (opts.broadcastFx === 'goal') {
badge.textContent = '⚽ GOAL!';
badge.className = 'text-[11px] font-black px-2.5 py-0.5 rounded-md bg-yellow-900/90 text-yellow-100 border border-yellow-400/70 sim-badge-pulse';
} else if (opts.broadcastFx === 'superSave') {
badge.textContent = '🧤 SUPER SAVE';
badge.className = 'text-[11px] font-black px-2.5 py-0.5 rounded-md bg-cyan-900/90 text-cyan-100 border border-cyan-400/70 sim-badge-pulse';
} else if (opts.broadcastFx === 'keyPass') {
badge.textContent = '🎯 KEY PASS';
badge.className = 'text-[11px] font-black px-2.5 py-0.5 rounded-md bg-purple-900/90 text-purple-100 border border-purple-400/70 sim-badge-pulse';
} else {
const out = opts.outcome === 'success' ? '성공' : opts.outcome === 'fail' ? '실패' : '중립';
badge.textContent = `진행: ${out}`;
badge.className = opts.outcome === 'success'
? 'text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-emerald-900/80 text-emerald-200 border border-emerald-600/50'
: opts.outcome === 'fail'
? 'text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-red-900/80 text-red-200 border border-red-600/50'
: 'text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-amber-900/70 text-amber-100 border border-amber-600/40';
}
}
}

/** 경기 전·중계 지움 후 상단 패널 초기화 */
function resetSimPitchCanvas() {
const canvas = document.getElementById('simPitchCanvas');
const badge = document.getElementById('simPitchBadge');
if (!canvas || !canvas.getContext) return;
const ctx = canvas.getContext('2d');
const wrap = canvas.parentElement;
const maxCssW = typeof window !== 'undefined' ? Math.min(window.innerWidth - 20, 720) : 720;
const cssW = Math.max(260, Math.min(maxCssW, wrap?.clientWidth || maxCssW));
const cssH = Math.max(188, Math.min(380, Math.floor(cssW * 0.5)));
const dpr = Math.min(2, window.devicePixelRatio || 1);
canvas.width = Math.floor(cssW * dpr);
canvas.height = Math.floor(cssH * dpr);
canvas.style.width = `${cssW}px`;
canvas.style.height = `${cssH}px`;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
const px0 = 16;
const py0 = 12;
const pw = cssW - 32;
const ph = cssH - 44;
paintFutsalPitchSurface(ctx, cssW, cssH, px0, py0, pw, ph);
ctx.fillStyle = 'rgba(254, 240, 138, 0.95)';
ctx.font = '800 14px "Bebas Neue","Oswald","Malgun Gothic",sans-serif';
ctx.textAlign = 'center';
ctx.fillText('RED  vs  BLUE', cssW / 2, py0 + ph / 2 - 10);
ctx.font = '600 11px "Malgun Gothic","Noto Sans KR",sans-serif';
ctx.fillStyle = 'rgba(226, 232, 240, 0.92)';
ctx.fillText('레드팀 vs 블루팀 · 경기 시작 시 공의 방향이 표시됩니다', cssW / 2, py0 + ph / 2 + 10);
ctx.textAlign = 'left';
if (badge) {
badge.textContent = '대기';
badge.className = 'text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300';
}
applySimPitchCaptionMeta(null);
}

const SIM_FIELD_LS_KEY = 'sfc_sim_field_v2';
/** @type {{ A: Record<string, { nx: number, ny: number }>, B: Record<string, { nx: number, ny: number }> }} */
window.simFieldPositions = window.simFieldPositions || { A: {}, B: {} };

function loadSimFieldPositionsFromStorage() {
try {
const raw = localStorage.getItem(SIM_FIELD_LS_KEY);
if (!raw) return;
const o = JSON.parse(raw);
if (o && o.A && o.B) window.simFieldPositions = { A: o.A, B: o.B };
} catch (e) { console.warn('sim field load', e); }
}
function saveSimFieldPositionsToStorage() {
try {
localStorage.setItem(SIM_FIELD_LS_KEY, JSON.stringify(window.simFieldPositions));
} catch (e) { console.warn('sim field save', e); }
}
loadSimFieldPositionsFromStorage();

/** 기본 포메이션: 레드 기준 — 골키퍼·픽소·양 측면·피보가 서로 겹치지 않게 간격을 둠 */
const SIM_DEFAULT_SLOTS_A = [
{ nx: 0.08, ny: 0.50 },
{ nx: 0.26, ny: 0.50 },
{ nx: 0.32, ny: 0.16 },
{ nx: 0.32, ny: 0.84 },
{ nx: 0.40, ny: 0.50 }
];
const SIM_DEFAULT_SLOTS_B = SIM_DEFAULT_SLOTS_A.map((s) => ({ nx: 1 - s.nx, ny: s.ny }));

function assignDefaultFormationNorm(plList, team) {
const slots = team === 'A' ? SIM_DEFAULT_SLOTS_A : SIM_DEFAULT_SLOTS_B;
const order = [...plList].sort((a, b) => {
const pr = (p) => ({ Goleiro: 0, Fixo: 1, Ala: 2, Pivo: 3, 미정: 4 }[p.pos] ?? 4);
return pr(a) - pr(b);
});
const out = {};
order.forEach((p, i) => {
const s = slots[Math.min(i, slots.length - 1)];
out[p.id] = { nx: s.nx, ny: s.ny };
});
return out;
}

/** 출전 명단 기준으로 미저장 좌표만 기본 포메이션으로 채움 */
function ensureSimFieldPositions(plA, plB) {
const defA = assignDefaultFormationNorm(plA, 'A');
const defB = assignDefaultFormationNorm(plB, 'B');
window.simFieldPositions.A = window.simFieldPositions.A || {};
window.simFieldPositions.B = window.simFieldPositions.B || {};
plA.forEach((p) => {
if (!window.simFieldPositions.A[p.id]) window.simFieldPositions.A[p.id] = { ...defA[p.id] };
});
plB.forEach((p) => {
if (!window.simFieldPositions.B[p.id]) window.simFieldPositions.B[p.id] = { ...defB[p.id] };
});
Object.keys(window.simFieldPositions.A).forEach((id) => {
if (!plA.some((p) => p.id === id)) delete window.simFieldPositions.A[id];
});
Object.keys(window.simFieldPositions.B).forEach((id) => {
if (!plB.some((p) => p.id === id)) delete window.simFieldPositions.B[id];
});
saveSimFieldPositionsToStorage();
}

/** 공격/수비·공 위치·채널에 따라 홈에서 벗어나 상대 진영과 섞이는 실시간 좌표(정규화 0~1) */
function simPlayerLiveNorm(p, teamIsA, home, o) {
const pos = p.pos || '미정';
const ballNx = typeof o.ballNx === 'number' ? o.ballNx : 0.5;
const ballNy = typeof o.ballNy === 'number' ? o.ballNy : 0.5;
const attackA = o.attackA;
const channel = o.channel || 'center';
const phase = o.phase || 'build';
const t = ((o.halfIdx || 0) * 1200 + (o.simSec || 0)) * 0.09 + (String(p.id).length % 11) * 0.37;
const weAttack = (attackA && teamIsA) || (!attackA && !teamIsA);
const phZ = phase === 'danger' ? 1.35 : phase === 'progress' ? 1.05 : 0.82;
const cyShift = channel === 'left' ? -0.14 : channel === 'right' ? 0.14 : 0;
let nx = home.nx;
let ny = home.ny;
const wBall = pos === 'Goleiro' ? 0.05 : pos === 'Fixo' ? 0.12 : pos === 'Ala' ? 0.18 : pos === 'Pivo' ? 0.2 : 0.14;
nx += (ballNx - nx) * wBall * 0.22 * phZ;
ny += (ballNy - ny) * wBall * 0.14 * phZ;
ny += cyShift * 0.16 * (weAttack ? 1 : 0.55);
if (weAttack) {
const push = (pos === 'Goleiro' ? 0.02 : pos === 'Fixo' ? 0.05 : pos === 'Pivo' ? 0.12 : 0.1) * phZ;
nx += teamIsA ? push : -push;
if (pos === 'Fixo') {
const hold = teamIsA ? 0.36 : 0.64;
nx += (hold - nx) * 0.28 * phZ;
ny += (0.5 - ny) * 0.12 * phZ;
} else if (pos !== 'Goleiro') {
const wingSpread = 0.34 * phZ;
ny += (home.ny - 0.5) * wingSpread;
const sideBias = Math.abs(home.ny - 0.5);
nx += (teamIsA ? 1 : -1) * (0.1 * phZ + sideBias * 0.09 * phZ);
if (pos === 'Ala' || pos === 'Pivo') {
nx += (teamIsA ? 1 : -1) * 0.06 * phZ;
}
}
} else {
const drop = (pos === 'Goleiro' ? 0.02 : pos === 'Fixo' ? 0.1 : 0.07) * phZ;
nx += teamIsA ? -drop : drop;
ny += (0.5 - ny) * 0.26 * phZ;
if (pos !== 'Goleiro' && pos !== 'Fixo') {
nx += (teamIsA ? -1 : 1) * 0.03 * phZ;
}
}
if (phase === 'danger' && pos !== 'Goleiro') {
nx += (ballNx - nx) * 0.1;
ny += (ballNy - ny) * 0.08;
}
const ovrJ = (getOVR(p) / 99) * 0.022;
nx += Math.sin(t + (teamIsA ? 0 : 2)) * ovrJ;
ny += Math.cos(t * 0.85 + (pos === 'Ala' ? 1 : 0)) * ovrJ * 1.05;
nx += Math.sin(t * 0.4) * 0.012;
ny += Math.cos(t * 0.55) * 0.01;
nx = Math.max(0.03, Math.min(0.97, nx));
ny = Math.max(0.06, Math.min(0.94, ny));
return { nx, ny };
}

/** 볼 소유자 정규화 좌표(중계 캔버스·연속 공 흐름 점과 동일 기준) */
function simHolderBallNorm(holder, opts) {
if (!holder || !opts.plA || !opts.plB) return { nx: 0.5, ny: 0.5 };
const teamIsA = opts.plA.some((x) => x.id === holder.id);
const base = window.simFieldPositions[teamIsA ? 'A' : 'B'][holder.id] || { nx: teamIsA ? 0.25 : 0.75, ny: 0.5 };
const chY = { left: 0.22, center: 0.5, right: 0.78 };
const lane = chY[opts.channel] ?? 0.5;
const attackA = opts.attackA;
let baseBallNx;
if (opts.phase === 'build') baseBallNx = attackA ? 0.28 : 0.72;
else if (opts.phase === 'progress') baseBallNx = attackA ? 0.55 : 0.45;
else baseBallNx = attackA ? 0.82 : 0.18;
const baseBallNy = lane;
return simPlayerLiveNorm(holder, teamIsA, base, { ...opts, ballNx: baseBallNx, ballNy: baseBallNy });
}

/** 시뮬 피치: 프로필 이미지 URL별 로드 캐시 */
const simPitchPortraitByUrl = new Map();

function preloadSimPitchPortraitUrl(url) {
if (!url) return Promise.resolve(null);
if (simPitchPortraitByUrl.has(url)) return simPitchPortraitByUrl.get(url);
const p = new Promise((resolve) => {
const im = new Image();
im.crossOrigin = 'anonymous';
im.onload = () => resolve(im.naturalWidth ? im : null);
im.onerror = () => resolve(null);
im.src = url;
});
simPitchPortraitByUrl.set(url, p);
return p;
}

/** 출전 선수별 프로필 캔버스용 Image (없으면 null → 이모지 대체) */
async function buildSimPitchPortraitMap(players) {
const map = new Map();
await Promise.all(
players.map(async (p) => {
const url = getPortraitUrl(p);
const img = await preloadSimPitchPortraitUrl(url);
map.set(p.id, img);
})
);
return map;
}

/** 캔버스용 축구공 스프라이트(원형·패널 패턴) */
function drawSoccerBallSprite(ctx, x, y, radius, ringColor) {
ctx.save();
ctx.beginPath();
ctx.arc(x, y, radius, 0, Math.PI * 2);
const grd = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius * 1.2);
grd.addColorStop(0, '#ffffff');
grd.addColorStop(0.55, '#f1f5f9');
grd.addColorStop(1, '#cbd5e1');
ctx.fillStyle = grd;
ctx.fill();
ctx.strokeStyle = '#334155';
ctx.lineWidth = Math.max(1, radius * 0.12);
ctx.stroke();
ctx.fillStyle = '#0f172a';
for (let i = 0; i < 5; i++) {
const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + 0.4;
ctx.beginPath();
ctx.arc(x + Math.cos(a) * radius * 0.42, y + Math.sin(a) * radius * 0.42, radius * 0.2, 0, Math.PI * 2);
ctx.fill();
}
ctx.beginPath();
ctx.arc(x + radius * 0.15, y - radius * 0.35, radius * 0.12, 0, Math.PI * 2);
ctx.fillStyle = 'rgba(15,23,42,0.75)';
ctx.fill();
ctx.beginPath();
ctx.arc(x, y, radius + 2.5, 0, Math.PI * 2);
ctx.strokeStyle = ringColor || 'rgba(251,146,60,0.9)';
ctx.lineWidth = 2;
ctx.stroke();
ctx.restore();
}

/** 피치 위 선수끼리 겹치지 않도록 타원 거리로 밀어냄 */
function separateSimLivePositions(items, minNx, minNy) {
const n = items.length;
const clampItem = (it) => {
it.nx = Math.max(0.05, Math.min(0.95, it.nx));
it.ny = Math.max(0.12, Math.min(0.88, it.ny));
};
for (let iter = 0; iter < 20; iter++) {
for (let i = 0; i < n; i++) {
for (let j = i + 1; j < n; j++) {
let dx = (items[j].nx - items[i].nx) / minNx;
let dy = (items[j].ny - items[i].ny) / minNy;
let dist = Math.hypot(dx, dy);
if (dist < 0.0008) {
items[j].nx += minNx * 0.55;
items[j].ny += minNy * (j % 2 === 0 ? 0.45 : -0.45);
dx = (items[j].nx - items[i].nx) / minNx;
dy = (items[j].ny - items[i].ny) / minNy;
dist = Math.hypot(dx, dy);
}
if (dist < 1) {
const push = ((1 - dist) / 2) * 1.12;
let ux = dx / dist;
let uy = dy / dist;
// 가로로 거의 겹치면 이름표가 가려지지 않게 세로로 더 밀어냄
if (Math.abs(dx) < 0.55) {
uy += (uy >= 0 ? 1 : -1) * 0.35;
const nrm = Math.hypot(ux, uy) || 1;
ux /= nrm;
uy /= nrm;
}
items[i].nx -= ux * push * minNx;
items[i].ny -= uy * push * minNy;
items[j].nx += ux * push * minNx;
items[j].ny += uy * push * minNy;
}
}
}
items.forEach(clampItem);
}
}

function drawSimPlayersOnPitch(ctx, px0, py0, pw, ph, opts) {
const plA = opts.plA;
const plB = opts.plB;
if (!plA || !plB || !plA.length || !plB.length) return;
const portraitMap = opts.portraitMap;
const holderId = opts.ballHolderId || null;
const maxNameW = Math.max(34, Math.min(52, pw * 0.13));
const prRef = Math.max(11, Math.min(16, pw * 0.028));
const placed = [];
[...plA.map((p) => ({ p, team: 'A' })), ...plB.map((p) => ({ p, team: 'B' }))].forEach(({ p, team }) => {
const teamIsA = team === 'A';
const base = window.simFieldPositions[team][p.id] || { nx: teamIsA ? 0.25 : 0.75, ny: 0.5 };
const live = opts.useHomeOnly ? { nx: base.nx, ny: base.ny } : simPlayerLiveNorm(p, teamIsA, base, opts);
placed.push({ p, team, nx: live.nx, ny: live.ny });
});
// 유니폼 폭·이름표 높이까지 포함해 최소 간격을 확보
separateSimLivePositions(
placed,
Math.max(0.11, Math.max(prRef * 2.4, maxNameW * 0.92) / pw),
Math.max(0.22, (prRef * 4.8) / ph)
);
const drawOne = (p, team, nx, ny) => {
const teamIsA = team === 'A';
const x = px0 + nx * pw;
const y = py0 + ny * ph;
const isHolder = holderId && p.id === holderId;
const kitTop = teamIsA ? '#ef4444' : '#3b82f6';
const kitBot = teamIsA ? '#7f1d1d' : '#1e3a8a';
const colRing = isHolder ? 'rgba(250, 204, 21, 0.98)' : teamIsA ? 'rgba(254,202,202,0.95)' : 'rgba(191,219,254,0.95)';
const pr = Math.max(11, Math.min(16, pw * 0.028)) * (isHolder ? 1.12 : 1);
const img = portraitMap && portraitMap.get(p.id);
ctx.save();
ctx.fillStyle = 'rgba(0,0,0,0.35)';
ctx.beginPath();
ctx.ellipse(x, y + pr + 3, pr * 0.85, pr * 0.28, 0, 0, Math.PI * 2);
ctx.fill();
if (isHolder) {
ctx.beginPath();
ctx.arc(x, y, pr + 5, 0, Math.PI * 2);
ctx.fillStyle = 'rgba(250, 204, 21, 0.2)';
ctx.fill();
}
const jw = pr * 1.72;
const jh = pr * 2.15;
ctx.beginPath();
if (typeof ctx.roundRect === 'function') ctx.roundRect(x - jw / 2, y - pr * 1.05, jw, jh, 5);
else ctx.rect(x - jw / 2, y - pr * 1.05, jw, jh);
const kit = ctx.createLinearGradient(x, y - pr, x, y + pr);
kit.addColorStop(0, kitTop);
kit.addColorStop(1, kitBot);
ctx.fillStyle = kit;
ctx.fill();
ctx.save();
ctx.beginPath();
ctx.arc(x, y - 1, pr * 0.92, 0, Math.PI * 2);
ctx.clip();
if (img && img.naturalWidth) {
ctx.drawImage(img, x - pr, y - pr - 2, pr * 2, pr * 2);
} else {
ctx.fillStyle = kitTop;
ctx.fillRect(x - pr, y - pr - 2, pr * 2, pr * 2);
const emoji = (p.gender || GENDER_MAP[p.name]) === 'F' ? '👧' : '👦';
ctx.font = `${Math.floor(pr * 1.4)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(emoji, x, y);
}
ctx.restore();
ctx.beginPath();
ctx.arc(x, y - 1, pr * 0.92, 0, Math.PI * 2);
ctx.strokeStyle = colRing;
ctx.lineWidth = isHolder ? 2.8 : 2;
ctx.stroke();
ctx.restore();
ctx.textAlign = 'center';
ctx.textBaseline = 'alphabetic';
ctx.font = '800 8px "Bebas Neue","Oswald","Malgun Gothic",sans-serif';
ctx.fillStyle = 'rgba(15,23,42,0.72)';
ctx.fillRect(x - 10, y - pr - 13, 20, 10);
ctx.fillStyle = isHolder ? '#fef08a' : '#f8fafc';
ctx.fillText(String(getOVR(p)), x, y - pr - 5);
const fullName = String(p.name || '?').trim();
ctx.font = isHolder ? '800 8px "Malgun Gothic","Noto Sans KR",sans-serif' : '700 7px "Malgun Gothic","Noto Sans KR",sans-serif';
let shown = fullName;
for (let s = fullName.length; s >= 1; s--) {
shown = s < fullName.length ? `${fullName.slice(0, s)}…` : fullName;
if (ctx.measureText(shown).width <= maxNameW) break;
}
const nw = Math.min(maxNameW, ctx.measureText(shown).width + 8);
ctx.fillStyle = teamIsA ? 'rgba(127,29,29,0.82)' : 'rgba(30,58,138,0.82)';
if (typeof ctx.roundRect === 'function') {
ctx.beginPath();
ctx.roundRect(x - nw / 2, y + pr + 3, nw, 11, 4);
ctx.fill();
} else {
ctx.fillRect(x - nw / 2, y + pr + 3, nw, 11);
}
ctx.fillStyle = isHolder ? 'rgba(254, 249, 195, 0.98)' : 'rgba(248,250,252,0.96)';
ctx.fillText(shown, x, y + pr + 12);
ctx.textAlign = 'left';
};
placed.sort((a, b) => {
if (Math.abs(a.ny - b.ny) > 0.002) return a.ny - b.ny;
const ah = a.p.id === holderId ? 1 : 0;
const bh = b.p.id === holderId ? 1 : 0;
return ah - bh;
});
placed.forEach(({ p, team, nx, ny }) => drawOne(p, team, nx, ny));
}

/** 전술 보드 캔버스: 배치 전용(공 없음) */
window.drawSimTacticalBoard = async () => {
const canvas = document.getElementById('simTacticalCanvas');
if (!canvas || !canvas.getContext) return;
const rawA = getSimMatchRoster('A');
const rawB = getSimMatchRoster('B');
const padA = padSimRosterWithBots(rawA, 'A');
const padB = padSimRosterWithBots(rawB, 'B');
ensureSimFieldPositions(padA.roster, padB.roster);
const plAll = [...padA.roster, ...padB.roster];
const portraitMap = plAll.length ? await buildSimPitchPortraitMap(plAll) : new Map();
const ctx = canvas.getContext('2d');
const wrap = canvas.parentElement;
const cssW = Math.min(720, Math.max(260, wrap?.clientWidth || 320));
const cssH = Math.max(200, Math.min(380, Math.floor(cssW * 0.5)));
const dpr = Math.min(2, window.devicePixelRatio || 1);
canvas.width = Math.floor(cssW * dpr);
canvas.height = Math.floor(cssH * dpr);
canvas.style.width = `${cssW}px`;
canvas.style.height = `${cssH}px`;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
const W = cssW;
const H = cssH;
const px0 = 12;
const py0 = 10;
const pw = W - 24;
const ph = H - 36;
paintFutsalPitchSurface(ctx, W, H, px0, py0, pw, ph);
ctx.strokeStyle = 'rgba(250,204,21,0.28)';
ctx.setLineDash([6, 4]);
ctx.beginPath();
ctx.moveTo(px0 + pw / 2, py0);
ctx.lineTo(px0 + pw / 2, py0 + ph);
ctx.stroke();
ctx.setLineDash([]);
ctx.fillStyle = 'rgba(254,240,138,0.9)';
ctx.font = '700 10px "Malgun Gothic","Noto Sans KR",sans-serif';
ctx.fillText('레드팀 ←  |  → 블루팀', px0 + 4, py0 + ph + 14);
drawSimPlayersOnPitch(ctx, px0, py0, pw, ph, {
plA: padA.roster,
plB: padB.roster,
useHomeOnly: true,
attackA: true,
channel: 'center',
phase: 'build',
outcome: 'neutral',
halfIdx: 0,
simSec: 0,
ballNx: 0.5,
ballNy: 0.5,
portraitMap
});
};

window.renderSimTacticalStrips = () => {
const elA = document.getElementById('simTacticalStripA');
const elB = document.getElementById('simTacticalStripB');
if (!elA || !elB) return;
const rawA = getSimMatchRoster('A');
const rawB = getSimMatchRoster('B');
const padA = padSimRosterWithBots(rawA, 'A');
const padB = padSimRosterWithBots(rawB, 'B');
const chip = (p, team) => {
const br = team === 'A' ? 'border-red-700/60 bg-red-950/50 text-red-100' : 'border-blue-700/60 bg-blue-950/50 text-blue-100';
const pt = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정';
return `<button type="button" draggable="true" class="sim-tactical-chip text-[10px] font-bold px-2 py-1 rounded-lg border ${br} whitespace-nowrap shrink-0" data-sim-chip-team="${team}" data-sim-chip-id="${escapeAttr(p.id)}">${escapeHtml(p.name)} <span class="opacity-70">${pt}</span></button>`;
};
elA.innerHTML = padA.roster.map((p) => chip(p, 'A')).join('') || '<span class="text-[10px] text-slate-500">레드 인원 없음</span>';
elB.innerHTML = padB.roster.map((p) => chip(p, 'B')).join('') || '<span class="text-[10px] text-slate-500">블루 인원 없음</span>';
};

/** 모의경기 포지션 약칭 (중계용) */
function simPosShort(p) {
const m = { Goleiro: '골키퍼', Fixo: '픽소', Ala: '아라', Pivo: '피보', 미정: '미정' };
return m[p.pos] || '미정';
}

function simPickTwoDistinct(players) {
if (players.length < 2) return [players[0], players[0]];
const a = players[Math.floor(Math.random() * players.length)];
let b = players[Math.floor(Math.random() * players.length)];
let guard = 0;
while (b.id === a.id && guard++ < 12) b = players[Math.floor(Math.random() * players.length)];
return [a, b];
}

/** 실제 소속 선수만으로 5명 미만일 때 시뮬용 가상 팀원으로 채움 (서버·기록 없음) */
function padSimRosterWithBots(realRoster, teamLetter) {
const sorted = [...realRoster].sort((a, b) => getOVR(b) - getOVR(a)).slice(0, 5);
const need = Math.max(0, 5 - sorted.length);
let bots = 0;
const posCycle = ['Goleiro', 'Fixo', 'Ala', 'Pivo', 'Ala'];
const avgOvr = sorted.length
? Math.round(sorted.reduce((s, p) => s + getOVR(p), 0) / sorted.length)
: 72;
for (let i = 0; i < need; i++) {
bots++;
const idx = sorted.length;
const v = Math.max(58, Math.min(82, avgOvr + Math.floor(Math.random() * 7) - 3));
const pos = posCycle[idx % posCycle.length];
const bot = {
id: `__sim_bot_${teamLetter}_${idx}`,
name: `자동 보조 ${bots}`,
pos,
age: 15,
level: 1,
pac: v, sho: v, pas: v, dri: v, def: v, phy: v, ref: v, int: v, pst: v, dis: v, cmp: v, wrk: v,
inventory: [],
itemLevels: {},
equipHead: null, equipHandL: null, equipHandR: null, equipFootL: null, equipFootR: null, equipFace: null
};
sorted.push(bot);
}
return { roster: sorted, bots };
}

/** 모의경기 종료 후 평점·xG·골·어시·킬패스·세이브 요약 (FM 스타일) */
function renderSimPostMatchStats(plA, plB, teamAName, teamBName, simStats, live, ratings) {
const el = document.getElementById('simPostMatchStats');
if (!el) return;
const goals = simStats.goals || {};
const assists = simStats.assists || {};
const keypass = simStats.keypass || {};
const saves = simStats.saves || {};
const all = [...plA, ...plB];
const rows = all.map((p) => {
const g = goals[p.id] || 0;
const a = assists[p.id] || 0;
const k = keypass[p.id] || 0;
const s = saves[p.id] || 0;
const rating = Number((ratings && ratings[p.id]) || 6.5);
const inA = plA.some((x) => x.id === p.id);
return { p, g, a, k, s, rating, teamTag: inA ? teamAName : teamBName, teamCls: inA ? 'text-red-400' : 'text-blue-400' };
});
rows.sort((x, y) => y.rating - x.rating || y.g - x.g || String(x.p.name).localeCompare(String(y.p.name), 'ko'));
const motm = rows[0];
const tot = (live?.possA || 0) + (live?.possB || 0) || 1;
const pa = Math.round((100 * (live?.possA || 0)) / tot);
const hudLine = live
? `<div class="grid grid-cols-3 gap-2 text-center mb-3 text-[10px]">
<div class="rounded-lg bg-black/40 py-1.5"><div class="text-slate-500">점유</div><div class="font-black text-emerald-300">${pa}-${100 - pa}</div></div>
<div class="rounded-lg bg-black/40 py-1.5"><div class="text-slate-500">슈팅(유효)</div><div class="font-black text-amber-200">${live.shotA || 0}-${live.shotB || 0} (${live.onA || 0}-${live.onB || 0})</div></div>
<div class="rounded-lg bg-black/40 py-1.5"><div class="text-slate-500">xG</div><div class="font-black text-cyan-200">${(live.xgA || 0).toFixed(2)}-${(live.xgB || 0).toFixed(2)}</div></div>
</div>`
: '';
const motmHtml = motm ? `<p class="text-[11px] text-fut-gold mb-2">MOTM <b>${escapeAttr(motm.p.name)}</b> · 평점 ${motm.rating.toFixed(1)}</p>` : '';
const head = `<div class="flex flex-wrap items-center gap-2 mb-2 border-b border-amber-700/30 pb-2"><i class="fa-solid fa-chart-simple text-amber-400"></i><span class="text-sm font-bold text-amber-200">풀타임 분석</span><span class="text-[10px] text-slate-500">(모의 시뮬 · 서버 미반영)</span></div>`;
const table = `<div class="overflow-x-auto"><table class="w-full text-[11px] sm:text-xs text-left border-collapse"><thead><tr class="text-slate-400 border-b border-slate-700"><th class="py-1.5 pr-2">팀</th><th class="py-1.5 pr-2">선수</th><th class="py-1.5 text-center">평점</th><th class="py-1.5 text-center" title="골">⚽</th><th class="py-1.5 text-center" title="어시스트">🅰️</th><th class="py-1.5 text-center" title="킬패스">KP</th><th class="py-1.5 text-center" title="세이브">🧤</th></tr></thead><tbody>${rows.map((r) => `<tr class="border-b border-slate-800/80 hover:bg-slate-800/40"><td class="py-1.5 pr-2 font-bold ${r.teamCls} truncate max-w-[5.5rem]">${escapeAttr(r.teamTag)}</td><td class="py-1.5 pr-2 text-white font-bold truncate max-w-[8rem]">${escapeAttr(r.p.name)}</td><td class="py-1.5 text-center font-black ${r.rating >= 8 ? 'text-fut-gold' : (r.rating >= 7 ? 'text-emerald-300' : 'text-slate-300')}">${r.rating.toFixed(1)}</td><td class="py-1.5 text-center text-fut-gold font-oswald">${r.g || ''}</td><td class="py-1.5 text-center text-emerald-300">${r.a || ''}</td><td class="py-1.5 text-center text-cyan-300">${r.k || ''}</td><td class="py-1.5 text-center text-orange-300">${r.s || ''}</td></tr>`).join('')}</tbody></table></div>`;
el.innerHTML = head + motmHtml + hudLine + table;
el.classList.remove('hidden');
}

window.simClearLog = () => {
const log = document.getElementById('simMatchLog');
if (log) log.innerHTML = '';
document.getElementById('simScoreBar')?.classList.add('hidden');
document.getElementById('simClockWrap')?.classList.add('hidden');
document.getElementById('simLiveHud')?.classList.add('hidden');
const post = document.getElementById('simPostMatchStats');
if (post) {
post.classList.add('hidden');
post.innerHTML = '';
}
resetSimPitchCanvas();
};

/** 풋살 5vs5 · 시뮬 전·후반 각 20분을 실제 시청 전·후반 각 2분에 비례 압축 중계 */
window.runSimMatch = async () => {
if (window.playerState.isGuest) {
return window.customAlert('게스트는 모의경기를 실행할 수 없습니다. 학생 계정으로 로그인해 주세요.');
}
if (countSimTeam('A') < 1 || countSimTeam('B') < 1) {
return window.customAlert('레드팀과 블루팀에 각각 최소 1명 이상 배정되어야 합니다.\n프로필의 체크박스 또는 라커/팀 분류에서 팀을 선택하세요.');
}
const rawA = getSimMatchRoster('A');
const rawB = getSimMatchRoster('B');
const padA = padSimRosterWithBots(rawA, 'A');
const padB = padSimRosterWithBots(rawB, 'B');
const plA = padA.roster;
const plB = padB.roster;
const usedBots = padA.bots > 0 || padB.bots > 0;
if (plA.length !== 5 || plB.length !== 5) return window.customAlert('출전 선수를 구성할 수 없습니다.');
ensureSimFieldPositions(plA, plB);
document.getElementById('simTacticalSection')?.classList.add('hidden');

const teamAName = SIM_TEAM_A_NAME;
const teamBName = SIM_TEAM_B_NAME;

const btn = document.getElementById('btnSimStart');
if (btn) { btn.disabled = true; btn.classList.add('opacity-50', 'cursor-not-allowed'); }
const omKick = window.officialMatch || {};
const gmOfficialKick = !!(window.playerState && window.playerState.isGM && document.getElementById('simOfficialKickoff')?.checked && (omKick.status === 'open' || omKick.status === 'live'));

const logEl = document.getElementById('simMatchLog');
const scoreBar = document.getElementById('simScoreBar');
const scoreNums = document.getElementById('simScoreNums');
const nameAEl = document.getElementById('simScoreAName');
const nameBEl = document.getElementById('simScoreBName');
const clockWrap = document.getElementById('simClockWrap');
const postStatsEl = document.getElementById('simPostMatchStats');
if (postStatsEl) {
postStatsEl.classList.add('hidden');
postStatsEl.innerHTML = '';
}
if (logEl) logEl.innerHTML = '';
resetSimPitchCanvas();
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
const mentA = document.getElementById('simMentalityA')?.value || 'balanced';
const mentB = document.getElementById('simMentalityB')?.value || 'balanced';
const mentDelta = (code) => (code === 'attack' ? 0.07 : code === 'defend' ? -0.06 : 0);
const live = { possA: 0, possB: 0, shotA: 0, shotB: 0, onA: 0, onB: 0, xgA: 0, xgB: 0 };
const ratings = {};
const bumpRating = (id, d) => { if (!id) return; ratings[id] = Math.max(5.2, Math.min(9.8, (ratings[id] || 6.5) + d)); };
const teamMean = (arr, key) => arr.length ? arr.reduce((s, p) => s + getStat(p, key), 0) / arr.length : STAT_BASE;
const clash = (atkV, defV) => {
const a = Number(atkV) / 99;
const d = Number(defV) / 99;
return Math.max(0.16, Math.min(0.84, 0.47 + (a - d) * 0.44 + (Math.random() * 0.1 - 0.05)));
};
const paintHud = () => {
const hud = document.getElementById('simLiveHud');
if (hud) hud.classList.remove('hidden');
const tot = live.possA + live.possB || 1;
const pa = Math.round((100 * live.possA) / tot);
const possEl = document.getElementById('simHudPoss');
if (possEl) possEl.textContent = `${pa}-${100 - pa}`;
const shEl = document.getElementById('simHudShots');
if (shEl) shEl.textContent = `${live.shotA}-${live.shotB} (${live.onA}-${live.onB})`;
const xgEl = document.getElementById('simHudXg');
if (xgEl) xgEl.textContent = `${live.xgA.toFixed(2)}-${live.xgB.toFixed(2)}`;
};
paintHud();

const simStats = { goals: {}, assists: {}, keypass: {}, saves: {} };
const bumpStat = (cat, id) => {
if (!id) return;
simStats[cat][id] = (simStats[cat][id] || 0) + 1;
};

/** 시뮬레이터 한 하프 길이(초): 20분 */
const SIM_HALF_SEC = 20 * 60;
/** 한 하프 실제 시청 시간 2분 — 상황은 5초마다 1회 */
const SITUATION_INTERVAL_MS = 5000;
const SITUATIONS_PER_HALF = Math.max(1, Math.floor((2 * 60 * 1000) / SITUATION_INTERVAL_MS));

const setMatchClock = (halfIdx, simSec) => {
const el = document.getElementById('simMatchClock');
const halfLabel = halfIdx === 0 ? '전반' : '후반';
const m = Math.floor(simSec / 60);
const s = simSec % 60;
if (el) el.textContent = `${halfLabel} ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/** 중계 텍스트(하단) + 상단 경기장 캔버스 갱신 */
const append = async (line, pitchOpts) => {
if (!logEl) return;
const fx = pitchOpts?.broadcastFx || null;
const plAll = pitchOpts ? [...(pitchOpts.plA || []), ...(pitchOpts.plB || [])] : [];
const meta = pitchOpts ? buildSimSituationMeta(pitchOpts, plAll) : null;
if (pitchOpts) {
applySimChainAndFlow(pitchOpts);
await drawSimPitchLive({ ...pitchOpts, ballFlowTrail: [...simBallFlowTrail] });
if (pitchOpts.isGoalShot) simBallFlowTrail = [];
if (fx) {
pulseSimPitchCanvas(fx);
runSimBroadcastFx(fx, pitchOpts);
}
}
const tImg = await simBroadcastTextToImage(line, fx, meta);
logEl.appendChild(tImg);
logEl.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' });
await sleep(fx ? 120 : 42);
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const gkOf = (arr) => arr.find((p) => p.pos === 'Goleiro') || arr[0];

/** 풋살: 사이드 전개 비중↑ (좌·우 약 38%씩) */
const pickSimChannel = () => {
const u = Math.random();
if (u < 0.38) return 'left';
if (u < 0.76) return 'right';
return 'center';
};
/** 공격 측 연속 성공 — 2·3·4연속일 때 골 확률 가중 */
let simChainSuccess = 0;
/** 연속 패스·드리블 궤적(정규화 좌표, 캔버스 점선) */
let simBallFlowTrail = [];
/** 공격 실패 시 다음 이벤트 공격 방향(상대 턴) */
let possessionNextAttackA = null;

function applySimChainAndFlow(opts) {
if (opts.isGoalShot) {
if (opts.ballHolderId && opts.plA && opts.plB) {
const gHolder = [...opts.plA, ...opts.plB].find((p) => p.id === opts.ballHolderId);
if (gHolder) {
const { nx, ny } = simHolderBallNorm(gHolder, opts);
simBallFlowTrail.push({ nx, ny });
if (simBallFlowTrail.length > 12) simBallFlowTrail.shift();
}
}
simChainSuccess = 0;
return;
}
if (!opts.ballHolderId || !opts.plA || !opts.plB) return;
const holder = [...opts.plA, ...opts.plB].find((p) => p.id === opts.ballHolderId);
if (!holder) return;
const atk = opts.attackA ? opts.plA : opts.plB;
const atkSet = new Set(atk.map((p) => p.id));
const holderIsAtk = atkSet.has(holder.id);
if (opts.outcome === 'success' && holderIsAtk) {
simChainSuccess++;
const { nx, ny } = simHolderBallNorm(holder, opts);
simBallFlowTrail.push({ nx, ny });
if (simBallFlowTrail.length > 12) simBallFlowTrail.shift();
return;
}
if (opts.outcome === 'neutral' && holderIsAtk) {
const { nx, ny } = simHolderBallNorm(holder, opts);
simBallFlowTrail.push({ nx, ny });
if (simBallFlowTrail.length > 12) simBallFlowTrail.shift();
return;
}
if (opts.outcome === 'fail') {
simChainSuccess = 0;
const { nx, ny } = simHolderBallNorm(holder, opts);
simBallFlowTrail = [{ nx, ny }];
possessionNextAttackA = !opts.attackA;
return;
}
if (opts.outcome === 'neutral' && !holderIsAtk) {
simChainSuccess = 0;
const { nx, ny } = simHolderBallNorm(holder, opts);
simBallFlowTrail = [{ nx, ny }];
}
}

/** 5초마다 1회: 패스/가로채기·드리블/수비·슈팅/반사신경 맞대결. 연속 성공 시 슈팅 기회와 xG가 올라갑니다. */
const tryOneSituation = async (halfIdx, simSec) => {
const halfLabel = halfIdx === 0 ? '전반' : '후반';
const mm = String(Math.floor(simSec / 60)).padStart(2, '0');
const ss = String(simSec % 60).padStart(2, '0');
const prefix = `[${halfLabel} ${mm}:${ss}]`;

const wrkBias = (teamMean(plA, 'wrk') - teamMean(plB, 'wrk')) / (halfIdx === 1 ? 550 : 750);
let pAtk = ratio + mentDelta(mentA) - mentDelta(mentB) + wrkBias;
let attackA = Math.random() < Math.max(0.28, Math.min(0.72, pAtk + (Math.random() * 0.06 - 0.03)));
if (possessionNextAttackA !== null) {
attackA = possessionNextAttackA;
possessionNextAttackA = null;
}
if (attackA) live.possA++; else live.possB++;
paintHud();
const atk = attackA ? plA : plB;
const def = attackA ? plB : plA;
const atkName = attackA ? teamAName : teamBName;
const defName = attackA ? teamBName : teamAName;

let ch = pickSimChannel();
const pitch = (phase, outcome, chOverride, ballHolder, extra) => ({
attackA,
channel: chOverride !== undefined ? chOverride : ch,
phase,
outcome: outcome || 'neutral',
plA,
plB,
halfIdx,
simSec,
ballHolderId: ballHolder && ballHolder.id ? ballHolder.id : null,
isGoalShot: !!(extra && extra.isGoalShot),
broadcastFx: extra && extra.broadcastFx ? extra.broadcastFx : null
});

const atkField = atk.filter((p) => p.pos !== 'Goleiro');
const pickAtk = () => {
const pool = atkField.length ? atkField : atk;
const weights = pool.map((p) => {
let w = 1 + getStat(p, 'wrk') / 90;
if (p.pos === 'Pivo') w += 1.35;
else if (p.pos === 'Ala') w += 0.55;
else if (p.pos === 'Fixo') w += 0.12;
return w;
});
const sum = weights.reduce((a, b) => a + b, 0) || 1;
let r = Math.random() * sum;
for (let i = 0; i < pool.length; i++) {
r -= weights[i];
if (r <= 0) return pool[i];
}
return pool[pool.length - 1];
};
const actor = pickAtk();
const gk = gkOf(def);

const sideHint = ch === 'left' ? '왼쪽 측면' : ch === 'right' ? '오른쪽 측면' : '중앙';
const atkCtrl = teamMean(atk, 'pas') * 0.55 + teamMean(atk, 'dri') * 0.45 + (mentDelta(attackA ? mentA : mentB) * 40);
const defCtrl = teamMean(def, 'int') * 0.5 + teamMean(def, 'def') * 0.5 - (mentDelta(attackA ? mentB : mentA) * 20);
const success = Math.random() < clash(atkCtrl, defCtrl);

if (!success) {
const intr = pick(def);
const marker = pick(def.filter((p) => p.id !== intr.id)) || intr;
bumpRating(intr.id, 0.22);
bumpRating(actor.id, -0.06);
const failKinds = [
`${prefix} ${atkName} ${sideHint}. ${intr.name}(${simPosShort(intr)})가 발끝으로 끊어냅니다. ${atkName} 연결 아쉽게 무산.`,
`${prefix} ${defName} ${intr.name}, 상대 패스 루트 읽고 인터셉트! ${atkName}는 한 템포 늦었습니다.`,
`${prefix} 좁은 코트 ${sideHint}. ${marker.name}에게 시선이 갔다가 ${intr.name}에게 공이 넘어갑니다. ${atkName} 공격 흐름 끊깁니다.`,
`${prefix} ${atkName} 전진 시도 — ${intr.name}가 몸을 싣고 막아냅니다. 아쉽게 놓치고 맙니다.`,
`${prefix} ${intr.name}(${simPosShort(intr)}) 스틸 성공. ${defName} 볼 회수, ${atkName}는 다시 빌드업부터.`,
`${prefix} ${sideHint} 2대1 압박! ${intr.name}가 가로채기에 성공합니다. ${atkName} 패스 타이밍이 살짝 빗나갔습니다.`
];
await append(failKinds[Math.floor(Math.random() * failKinds.length)], pitch('progress', 'fail', ch, intr));
return;
}

const nextChain = simChainSuccess + 1;
const shotChance = nextChain >= 4 ? 0.70 : nextChain === 3 ? 0.48 : nextChain === 2 ? 0.28 : 0;
const isShot = shotChance > 0 && Math.random() < shotChance;

if (isShot) {
const actorSho = getStat(actor, 'sho') + getStat(actor, 'cmp') * 0.25 + getStat(actor, 'pst') * 0.15;
const gkRef = getStat(gk, 'ref') + getStat(gk, 'pst') * 0.2;
const shotQuality = clash(actorSho + nextChain * 3, gkRef);
let xg = (nextChain >= 4 ? 0.36 : nextChain === 3 ? 0.24 : 0.14) * shotQuality;
if ((attackA ? mentA : mentB) === 'attack') xg *= 1.12;
if ((attackA ? mentB : mentA) === 'defend') xg *= 0.88;
xg = Math.max(0.05, Math.min(0.48, xg));
if (attackA) { live.shotA++; live.xgA += xg; } else { live.shotB++; live.xgB += xg; }
paintHud();
const rollGoal = Math.random() < xg;

if (rollGoal) {
if (attackA) { sa++; live.onA++; } else { sb++; live.onB++; }
updScore();
paintHud();
bumpStat('goals', actor.id);
bumpRating(actor.id, 1.05);
bumpRating(gk.id, -0.28);
const mates = atk.filter((x) => x.id !== actor.id);
const assi = mates.length ? pick(mates) : null;
if (assi) {
bumpStat('assists', assi.id);
bumpRating(assi.id, 0.38);
}
const df = pick(def.filter((p) => p.id !== gk.id)) || pick(def);
const goalLines = assi
? [
`${prefix} ⚽ 골! ${atkName} ${actor.name}, 페널티 호라이즌에서 마무리! 어시스트 ${assi.name}. ${defName} ${gk.name} 손끝에 닿았지만 들어갑니다. ${sa}-${sb}`,
`${prefix} ⚽ 들어갑니다! ${assi.name}→${actor.name} 원터치 연결 끝에 골. ${defName} ${df.name}는 막지 못했습니다. ${sa}-${sb}`
]
: [
`${prefix} ⚽ 골! ${actor.name}가 골 앞 혼전을 가르며 강슛. ${defName} ${gk.name} 반응했으나 꺾이지 않습니다. ${sa}-${sb}`,
`${prefix} ⚽ ${actor.name} 결정적 한 방! 풋살 골문 앞 각도 좁혔는데도 넣습니다. ${gk.name} 아쉬운 실점. ${sa}-${sb}`
];
await append(goalLines[Math.floor(Math.random() * goalLines.length)], pitch('danger', 'success', ch, actor, { isGoalShot: true, broadcastFx: 'goal' }));
return;
}

const saveProb = Math.max(0.18, Math.min(0.62, clash(gkRef, actorSho)));
if (Math.random() < saveProb) {
if (attackA) live.onA++; else live.onB++;
paintHud();
bumpStat('saves', gk.id);
bumpRating(gk.id, 0.72);
bumpRating(actor.id, 0.12);
const saveLines = [
`${prefix} 🧤 SUPER SAVE! ${defName} ${gk.name}가 ${actor.name}의 결정적 슈팅을 막아냅니다! (xG ${xg.toFixed(2)})`,
`${prefix} 🧤 슈퍼 세이브! ${gk.name} 리플렉스로 ${actor.name} 강슛을 걷어냈습니다.`,
`${prefix} 🧤 ${gk.name}의 기적 같은 선방! ${atkName} ${actor.name} — ${gk.name}가 코트를 살렸습니다.`
];
await append(saveLines[Math.floor(Math.random() * saveLines.length)], pitch('danger', 'neutral', ch, gk, { broadcastFx: 'superSave' }));
return;
}

bumpRating(actor.id, -0.08);
const missLines = [
`${prefix} ${actor.name}의 슈팅! 골문을 살짝 벗어납니다. (xG ${xg.toFixed(2)})`,
`${prefix} ${sideHint}에서 ${actor.name} 감아차기 — ${gk.name}가 손 쓸 필요 없이 아웃.`,
`${prefix} ${actor.name} vs ${gk.name}, 각도는 좋았으나 빗맞습니다. ${defName} 한숨 돌립니다.`
];
await append(missLines[Math.floor(Math.random() * missLines.length)], pitch('danger', 'fail', ch, actor));
return;
}

const kind = Math.floor(Math.random() * 5);
const d1 = pick(def);

if (kind === 0) {
const [p1, p2] = simPickTwoDistinct(atk);
const z1 = simPosShort(p1);
const z2 = simPosShort(p2);
const mark = pick(def);
bumpStat('keypass', p1.id);
bumpRating(p1.id, 0.12);
const passOkLines = [
`${prefix} ${atkName} ${sideHint}. ${p1.name}(${z1})가 ${mark.name}(${simPosShort(mark)}) 압박을 등지고 ${p2.name}(${z2})에게 연결 성공.`,
`${prefix} 원터치 교환! ${p1.name}→${p2.name}, ${defName} ${d1.name}가 붙기 전에 라인 통과합니다.`,
`${prefix} ${p1.name}가 ${d1.name}와의 간격 벌리며 ${p2.name}에게. 좁은 코트에서 시야 좋습니다.`
];
await append(passOkLines[Math.floor(Math.random() * passOkLines.length)], pitch('progress', 'success', ch, p2, { broadcastFx: 'keyPass' }));
} else if (kind === 1) {
const duel = pick(def);
const wonDuel = Math.random() < clash(getStat(actor, 'dri') + getStat(actor, 'pac') * 0.2, getStat(duel, 'def') + getStat(duel, 'phy') * 0.2);
if (!wonDuel) {
bumpRating(duel.id, 0.2);
bumpRating(actor.id, -0.05);
await append(`${prefix} 1대1! ${actor.name} vs ${duel.name} — ${duel.name}가 몸으로 막아 돌파를 차단합니다.`, pitch('progress', 'fail', ch, duel));
return;
}
bumpStat('keypass', actor.id);
bumpRating(actor.id, 0.14);
const dribLines = [
`${prefix} ${atkName} ${sideHint}. ${actor.name}가 ${duel.name}(${simPosShort(duel)})를 제치고 돌파합니다. 발재간 살아 있습니다.`,
`${prefix} 1대1! ${actor.name} vs ${duel.name} — ${actor.name}가 몸으로 버티며 전진 성공.`,
`${prefix} ${duel.name}의 태클 타이밍을 피해 ${actor.name}가 빗겨 나갑니다. ${defName} 수비 한 수 무력화.`
];
await append(dribLines[Math.floor(Math.random() * dribLines.length)], pitch('progress', 'success', ch, actor, { broadcastFx: 'keyPass' }));
} else if (kind === 2) {
const w = atk.filter((x) => x.pos === 'Ala' || x.pos === '미정' || x.pos === 'Pivo');
const wx = w.length ? pick(w) : actor;
const others = atk.filter((x) => x.id !== wx.id);
const tgt = others.length ? pick(others) : wx;
const back = pick(def);
bumpStat('keypass', wx.id);
bumpRating(wx.id, 0.12);
const cutLines = [
`${prefix} ${sideHint} ${wx.name}가 엔드라인 쪽으로 끌고 갔다가 ${back.name}를 앞에 두고 컷백! ${tgt.name}가 받아 전개합니다.`,
`${prefix} 크로스형 컷백 — ${wx.name}→${tgt.name}. ${defName} ${back.name}가 막으려 했으나 연결됐습니다.`,
`${prefix} 풋살식 사이드 연계. ${wx.name}가 골라인 근처에서 띄워주고 ${tgt.name}가 중앙에서 이어받습니다.`
];
await append(cutLines[Math.floor(Math.random() * cutLines.length)], pitch('danger', 'success', ch, tgt, { broadcastFx: 'keyPass' }));
} else if (kind === 3) {
const gkA = gkOf(atk);
const lonPool = atk.filter((x) => x.id !== gkA.id);
const lon = lonPool.length ? pick(lonPool) : actor;
const high = pick(def);
bumpStat('keypass', gkA.id);
bumpRating(gkA.id, 0.1);
const longLines = [
`${prefix} 골레이로 ${gkA.name} 롱킥! ${high.name} 라인 위로 넘겨 ${lon.name}가 잡았습니다. 상대 압박 한 번에 벗어납니다.`,
`${prefix} ${gkA.name}가 손으로 배급 — ${lon.name}에게 직접. ${defName} ${high.name}는 높이 못 올렸습니다.`,
`${prefix} 풋살에서 보는 롱 드로잉. ${gkA.name}→${lon.name} 연결 성공, 전환 타이밍 좋습니다.`
];
await append(longLines[Math.floor(Math.random() * longLines.length)], pitch('build', 'success', ch, lon, { broadcastFx: 'keyPass' }));
} else {
const press = pick(def);
bumpStat('keypass', actor.id);
bumpRating(actor.id, 0.08);
const keepLines = [
`${prefix} ${atkName} ${sideHint}. ${actor.name}가 ${press.name}의 압박 속에서도 볼 지키며 링으로 연계합니다.`,
`${prefix} ${press.name}가 붙었지만 ${actor.name}가 몸싸움 이깁니다. 볼 소유 유지 성공.`,
`${prefix} 좁은 공간, ${actor.name} 침착하게 터치 한 번 줄여서 팀 동료 쪽으로. ${defName} ${press.name} 아쉬운 압박.`
];
await append(keepLines[Math.floor(Math.random() * keepLines.length)], pitch('progress', 'success', ch, actor, { broadcastFx: 'keyPass' }));
}
};

const kickPitch = { attackA: true, channel: 'center', phase: 'build', outcome: 'neutral', plA, plB, halfIdx: 0, simSec: 0, ballHolderId: null };
const mentLabel = (code) => (code === 'attack' ? '공격적' : code === 'defend' ? '수비적' : '밸런스');
try {
await append(`━━ ${teamAName} vs ${teamBName} · 모의 풋살 (5vs5, 시뮬 전·후반 각 20분 — 시청은 각 2분 비례) ━━`, kickPitch);
if (usedBots) {
await append(`[연습 모드] 실제 소속 인원이 5명 미만인 팀은 자동 보조 선수로 채워 5vs5로 진행합니다. (가상 인원은 기록에 반영되지 않습니다)`, kickPitch);
}
await append(`전력 요약: ${teamAName} 출전 OVR 합 ${strA} (${mentLabel(mentA)})  |  ${teamBName} 출전 OVR 합 ${strB} (${mentLabel(mentB)})`, kickPitch);
await append(`[전반 00:00] 킥오프 — 패스 vs 가로채기, 드리블 vs 수비, 슈팅 vs 반사신경으로 판정합니다. 공격적 템포는 슈팅을 늘리고, 수비적은 실점을 줄입니다.`, kickPitch);
if (gmOfficialKick) {
try {
await closeOfficialBettingForKickoff();
await append('[공식 경기] 베팅을 마감했습니다. 종료 후 삼봉FC 봉으로 정산합니다.');
} catch (kickBetErr) {
console.error('closeOfficialBettingForKickoff', kickBetErr);
await append(`[공식 경기] 베팅 마감에 실패했습니다: ${kickBetErr && kickBetErr.message ? kickBetErr.message : kickBetErr}`);
}
}

for (let halfIdx = 0; halfIdx < 2; halfIdx++) {
setMatchClock(halfIdx, 0);
for (let si = 0; si < SITUATIONS_PER_HALF; si++) {
const simSec = Math.min(SIM_HALF_SEC - 1, Math.floor(((si + 1) / SITUATIONS_PER_HALF) * SIM_HALF_SEC));
setMatchClock(halfIdx, simSec);
await tryOneSituation(halfIdx, simSec);
await sleep(SITUATION_INTERVAL_MS);
}
setMatchClock(halfIdx, SIM_HALF_SEC);
const hl = halfIdx === 0 ? '전반' : '후반';
await append(`[${hl} 20:00] ${hl} 종료 휘슬`);
if (halfIdx === 0) {
const totH = live.possA + live.possB || 1;
const paH = Math.round((100 * live.possA) / totH);
await append(`[하프타임] 점유 ${paH}-${100 - paH} · 슈팅 ${live.shotA}-${live.shotB} (${live.onA}-${live.onB}) · xG ${live.xgA.toFixed(2)}-${live.xgB.toFixed(2)} · 스코어 ${sa}-${sb}`);
await append(`[휴식] 하프타임 — 전술을 가다듬습니다.`);
}
}

await append(`━━ 최종 스코어 ${teamAName} ${sa} : ${sb} ${teamBName} ━━`);
await append(`(모의 시뮬레이션 종료 · 서버 기록·EXP 미반영)`);
renderSimPostMatchStats(plA, plB, teamAName, teamBName, simStats, live, ratings);
await maybeSettleOfficialBetsAfterSim(sa, sb, teamAName, teamBName, gmOfficialKick);
} finally {
if (btn) { btn.disabled = false; btn.classList.remove('opacity-50', 'cursor-not-allowed'); }
document.getElementById('simTacticalSection')?.classList.remove('hidden');
window.drawSimTacticalBoard();
window.renderSimTacticalStrips();
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
window.renderSimTeamBoards();
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


const WC_HOUSE_MARGIN = 0.15;
const WC_MAX_STAKE = 200;
function wcOddsFromProb(prob) {
const adjusted = Math.min(0.95, Number(prob) * (1 + WC_HOUSE_MARGIN));
return Math.max(1.05, Math.round((1 / adjusted) * 100) / 100);
}
window.officialMatch = window.officialMatch || { status: 'idle' };
function officialMatchRef() {
return doc(db, 'artifacts', appId, 'public', 'data', 'config', 'officialMatch');
}
function floorBong(v) {
const n = Number(v);
if (!Number.isFinite(n)) return 0;
return Math.max(0, Math.floor(n));
}
function computeOfficialOdds() {
const a = getSimMatchRoster('A');
const b = getSimMatchRoster('B');
const oa = a.length ? a.reduce((s, p) => s + getOVR(p), 0) / a.length : STAT_BASE;
const ob = b.length ? b.reduce((s, p) => s + getOVR(p), 0) / b.length : STAT_BASE;
const pA = 1 / (1 + Math.pow(10, (ob - oa) / 40));
const clamp = Math.max(0.18, Math.min(0.82, pA));
return { oddsA: wcOddsFromProb(clamp), oddsB: wcOddsFromProb(1 - clamp) };
}
function getPendingOfficialBets(matchId) {
const mid = matchId || (window.officialMatch && window.officialMatch.matchId);
if (!mid) return [];
return (window.allPlayersData || []).map((p) => {
const b = p.officialBet;
if (b && String(b.matchId) === String(mid) && b.status === 'pending') {
return { ...b, playerId: p.id, playerName: p.name };
}
return null;
}).filter(Boolean);
}
function officialStatusLabel(m) {
if (!m || m.status === 'idle') return { t: '연습만', cls: 'text-slate-400' };
if (m.status === 'open') return { t: '베팅 접수 중', cls: 'text-amber-300' };
if (m.status === 'live') return { t: '공식 경기 진행', cls: 'text-red-300' };
if (m.status === 'settled') return { t: '정산 완료', cls: 'text-emerald-300' };
if (m.status === 'closed') return { t: '베팅 마감', cls: 'text-slate-300' };
return { t: m.status, cls: 'text-slate-400' };
}
window.renderOfficialBetPanel = () => {
const m = window.officialMatch || { status: 'idle' };
const stEl = document.getElementById('officialBetStatus');
const lab = officialStatusLabel(m);
if (stEl) { stEl.textContent = lab.t; stEl.className = `text-[10px] font-black ${lab.cls} shrink-0`; }
const gmBar = document.getElementById('officialBetGmBar');
if (gmBar) {
if (window.playerState && window.playerState.isGM) gmBar.classList.remove('hidden');
else gmBar.classList.add('hidden');
}
const box = document.getElementById('officialBetMarket');
if (!box) return;
const pending = getPendingOfficialBets(m.matchId);
const me = (window.allPlayersData || []).find((x) => x.id === window.playerState.id);
const myBet = me && me.officialBet && String(me.officialBet.matchId) === String(m.matchId) ? me.officialBet : null;
const wallet = me ? floorBong(me.bong) : 0;
const oddsA = Number(m.oddsA) || 1.85;
const oddsB = Number(m.oddsB) || 1.85;
const canBet = !!(window.playerState && !window.playerState.isGuest && !window.playerState.isGM && m.status === 'open' && !myBet);
let market = '';
if (m.status === 'open' || m.status === 'live' || m.status === 'closed' || m.status === 'settled') {
const resTxt = m.result === 'A' ? '레드팀 승' : m.result === 'B' ? '블루팀 승' : m.result === 'draw' ? '무승부(환급)' : '';
market += `<div class="grid grid-cols-2 gap-2 mb-2">
<button type="button" ${canBet ? `onclick="window.placeOfficialBet('A')"` : 'disabled'} class="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-left ${canBet ? 'hover:border-red-300' : 'opacity-80'}">
<div class="text-xs font-black text-red-100">레드팀 승</div>
<div class="text-[10px] text-fut-gold font-black">${oddsA.toFixed(2)}x</div>
</button>
<button type="button" ${canBet ? `onclick="window.placeOfficialBet('B')"` : 'disabled'} class="rounded-xl border border-blue-500/40 bg-blue-950/40 px-3 py-2 text-left ${canBet ? 'hover:border-blue-300' : 'opacity-80'}">
<div class="text-xs font-black text-blue-100">블루팀 승</div>
<div class="text-[10px] text-fut-gold font-black">${oddsB.toFixed(2)}x</div>
</button>
</div>`;
if (resTxt) market += `<p class="text-[11px] text-emerald-300 mb-1">결과: ${escapeHtml(resTxt)}${m.lastScore ? ` · ${m.lastScore.sa}-${m.lastScore.sb}` : ''}</p>`;
if (myBet) {
const mine = myBet.status === 'pending' ? '대기' : myBet.status === 'won' ? `적중 +${floorBong(myBet.payout)}B` : myBet.status === 'refund' ? '환급' : '미적중';
market += `<p class="text-[11px] text-amber-200 mb-1">내 베팅: ${myBet.pick === 'A' ? '레드' : '블루'} ${floorBong(myBet.stake)}B · ${mine}</p>`;
} else if (window.playerState && !window.playerState.isGuest && !window.playerState.isGM && m.status === 'open') {
market += `<p class="text-[10px] text-slate-400 mb-1">보유 ${wallet} B · 한 경기에 한 번만 걸 수 있습니다.</p>`;
}
if (window.playerState && window.playerState.isGM) {
const list = pending.length
? pending.slice(0, 40).map((b) => `<div class="flex justify-between gap-2 text-[11px] py-0.5 border-b border-slate-800/80"><span class="text-white truncate">${escapeHtml(b.playerName)} · ${b.pick === 'A' ? '레드' : '블루'} · ${floorBong(b.stake)}B</span><span class="text-amber-300 shrink-0">대기</span></div>`).join('')
: '<p class="text-[11px] text-slate-500 text-center py-2">대기 중인 베팅이 없습니다.</p>';
market += `<div class="text-[10px] font-black text-slate-400 mb-1">대기 ${pending.length}건</div><div class="max-h-40 overflow-y-auto">${list}</div>`;
}
} else {
market = '<p class="text-[11px] text-slate-500">선생님이 공식 경기 베팅을 열면 여기에 배당이 뜹니다.</p>';
}
box.innerHTML = market;
};
window.openOfficialBetting = async () => {
try {
checkAuthReady();
if (!window.playerState || !window.playerState.isGM) return;
if (countSimTeam('A') < 1 || countSimTeam('B') < 1) return window.customAlert('레드/블루에 선수를 먼저 배정한 뒤 베팅을 열어 주세요.');
const cur = window.officialMatch || {};
if (cur.status === 'open') return window.customAlert('이미 베팅이 열려 있습니다.');
if (cur.status === 'live') return window.customAlert('공식 경기가 진행 중입니다. 종료 후 다시 열어 주세요.');
const { oddsA, oddsB } = computeOfficialOdds();
const next = {
matchId: 'om_' + Date.now(),
status: 'open',
teamAName: SIM_TEAM_A_NAME,
teamBName: SIM_TEAM_B_NAME,
oddsA, oddsB,
openedAt: Date.now(),
openedBy: window.playerState.id,
result: null,
lastScore: null
};
await setDoc(officialMatchRef(), next, { merge: true });
window.officialMatch = next;
window.renderOfficialBetPanel();
window.customAlert(`공식 경기 베팅을 열었습니다.\n레드 ${oddsA.toFixed(2)}x · 블루 ${oddsB.toFixed(2)}x`);
} catch (e) { console.error(e); window.customAlert(`베팅 열기 실패:\n${e.message}`); }
};
window.closeOfficialBetting = async () => {
try {
checkAuthReady();
if (!window.playerState || !window.playerState.isGM) return;
const cur = window.officialMatch || {};
if (cur.status !== 'open') return window.customAlert('열려 있는 베팅이 없습니다.');
const next = { ...cur, status: 'closed', closedAt: Date.now() };
await setDoc(officialMatchRef(), next, { merge: true });
window.officialMatch = next;
window.renderOfficialBetPanel();
} catch (e) { window.customAlert(e.message); }
};
async function closeOfficialBettingForKickoff() {
if (!window.playerState || !window.playerState.isGM) return;
checkAuthReady();
const snap = await getDoc(officialMatchRef());
const cur = snap.exists() ? snap.data() : (window.officialMatch || {});
if (cur.status === 'settled') return;
const next = { ...cur, status: 'live', kickoffAt: Date.now() };
await setDoc(officialMatchRef(), next, { merge: true });
window.officialMatch = next;
window.renderOfficialBetPanel();
}
window.placeOfficialBet = async (pick) => {
try {
checkAuthReady();
if (!window.playerState || window.playerState.isGuest || window.playerState.isGM) return window.customAlert('학생 계정으로만 베팅할 수 있습니다.');
const m = window.officialMatch || {};
if (m.status !== 'open') return window.customAlert('지금은 베팅을 받지 않습니다. 선생님이 공식 경기를 열어 주세요.');
const p = (window.allPlayersData || []).find((x) => x.id === window.playerState.id);
if (!p) return;
if (p.officialBet && String(p.officialBet.matchId) === String(m.matchId) && p.officialBet.status === 'pending') {
return window.customAlert('이미 이 경기에 베팅했습니다.');
}
const odds = pick === 'A' ? Number(m.oddsA) : Number(m.oddsB);
const wallet = floorBong(p.bong);
const cap = Math.min(WC_MAX_STAKE, wallet);
if (cap < 1) return window.customAlert('봉이 부족합니다.');
const stake = await window.pickBongStake({
title: '공식 경기 베팅',
label: pick === 'A' ? '레드팀 승' : '블루팀 승',
odds, wallet, max: cap
});
if (!stake) return;
if (stake > cap) return window.customAlert('걸 수 있는 금액을 넘었습니다.');
const bet = { matchId: m.matchId, pick, stake, odds, status: 'pending', placedAt: Date.now() };
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id));
await setDoc(docRef, { bong: wallet - stake, officialBet: bet }, { merge: true });
window.customAlert(`${pick === 'A' ? '레드' : '블루'}에 ${stake} B를 걸었습니다.`);
window.renderOfficialBetPanel();
} catch (e) { console.error(e); window.customAlert(`베팅 실패:\n${e.message}`); }
};
async function maybeSettleOfficialBetsAfterSim(sa, sb, teamAName, teamBName, isOfficial) {
if (!isOfficial) return;
if (!window.playerState || !window.playerState.isGM) return;
const m = window.officialMatch || {};
if (m.status === 'settled') {
await window.customAlert('이 공식 경기는 이미 정산되었습니다.');
return;
}
let result = 'draw';
let label = '무승부 · 걸었던 봉을 환급합니다';
if (sa > sb) { result = 'A'; label = '레드팀 승'; }
else if (sa < sb) { result = 'B'; label = '블루팀 승'; }
const ok = await window.customConfirm(`공식 경기 최종 ${teamAName} ${sa} : ${sb} ${teamBName}\n→ ${label}\n\n삼봉FC 봉으로 베팅을 정산할까요?`);
if (!ok) return;
try {
const res = await settleOfficialMatch({ sa, sb, teamAName, teamBName, result });
if (!res) return;
await window.customAlert(`공식 경기 정산 완료!\n${label}\n적중 ${res.winnerCount}건 · 지급 ${res.totalPayout} B · 환급 ${res.refundCount}건`);
} catch (e) {
console.error(e);
await window.customAlert(`정산 실패:\n${e && e.message ? e.message : e}`);
}
}
async function settleOfficialMatch({ sa, sb, teamAName, teamBName, result }) {
checkAuthReady();
if (!window.playerState || !window.playerState.isGM) throw new Error('감독 계정으로만 정산할 수 있습니다.');
const snap = await getDoc(officialMatchRef());
const cur = snap.exists() ? snap.data() : (window.officialMatch || {});
if (cur.status === 'settled') throw new Error('이미 정산된 공식 경기입니다.');
const matchId = cur.matchId;
const settledAt = Date.now();
const batch = writeBatch(db);
let winnerCount = 0;
let refundCount = 0;
let totalPayout = 0;
(window.allPlayersData || []).forEach((p) => {
const b = p.officialBet;
if (!b || String(b.matchId) !== String(matchId) || b.status !== 'pending') return;
const stake = floorBong(b.stake);
let status = 'lost';
let payout = 0;
if (result === 'draw') {
status = 'refund';
payout = stake;
refundCount += 1;
} else if (String(b.pick) === String(result)) {
status = 'won';
payout = floorBong(stake * Number(b.odds || 0));
winnerCount += 1;
}
totalPayout += payout;
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id));
const payload = { officialBet: { ...b, status, payout, settledAt } };
if (payout > 0) payload.bong = increment(payout);
batch.set(docRef, payload, { merge: true });
});
const next = {
...cur,
status: 'settled',
result,
settledAt,
lastScore: { sa, sb },
teamAName, teamBName
};
batch.set(officialMatchRef(), next, { merge: true });
await batch.commit();
window.officialMatch = next;
window.renderOfficialBetPanel();
return { winnerCount, refundCount, totalPayout, result };
}


function defaultWcBoard() {
return {
updatedAt: new Date().toISOString(),
matches: [
{
id: 'kr_r32_2026',
title: '대한민국 32강 진출 예측',
subtitle: '삼봉FC 공식 경기와 별도 예측 보드',
kickoffLabel: '2026 월드컵',
status: 'open',
result: null,
options: [
{ id: 'advance', label: '32강 진출', prob: 0.38, odds: wcOddsFromProb(0.38) },
{ id: 'eliminate', label: '조별리그 탈락', prob: 0.62, odds: wcOddsFromProb(0.62) }
]
},
{
id: 'wc2026_final_winner',
title: '월드컵 우승국',
subtitle: '재미 예측 · 감독이 결과 확정',
kickoffLabel: '결승 이후 정산',
status: 'open',
result: null,
options: [
{ id: 'sa', label: '남미 우승', prob: 0.34, odds: wcOddsFromProb(0.34) },
{ id: 'eu', label: '유럽 우승', prob: 0.48, odds: wcOddsFromProb(0.48) },
{ id: 'other', label: '그 외 대륙', prob: 0.18, odds: wcOddsFromProb(0.18) }
]
}
]
};
}
function wcBoardRef() {
return doc(db, 'artifacts', appId, 'public', 'data', 'config', 'wcBoard');
}
function getWcBoard() {
return window.wcBoard && Array.isArray(window.wcBoard.matches) ? window.wcBoard : defaultWcBoard();
}
window.ensureWcBoardPublished = async () => {
try {
if (!window.playerState || !window.playerState.isGM) return;
checkAuthReady();
const snap = await getDoc(wcBoardRef());
const data = snap.exists() ? snap.data() : null;
if (data && Array.isArray(data.matches) && data.matches.length) return;
await setDoc(wcBoardRef(), defaultWcBoard(), { merge: true });
} catch (e) { console.error('wcBoard seed', e); }
};
window.renderWorldCupBetBoard = () => {
window.renderOfficialBetPanel();
};

window.placeFcWorldCupBet = async (pick) => {
window.placeOfficialBet(pick === 'advance' ? 'A' : 'B');
};

window.setWcMatchStatus = async (matchId, status) => {
try {
checkAuthReady();
if (!window.playerState.isGM) return;
const board = getWcBoard();
board.matches = (board.matches || []).map((m) => m.id === matchId ? { ...m, status } : m);
board.updatedAt = new Date().toISOString();
await setDoc(wcBoardRef(), board, { merge: true });
} catch (e) { window.customAlert(e.message); }
};

window.settleWcMatch = async (matchId) => {
try {
checkAuthReady();
if (!window.playerState.isGM) return;
const pick = document.getElementById('wcSettle_' + matchId)?.value;
if (!pick) return window.customAlert('결과를 선택하세요.');
if (!await window.customConfirm('결과를 확정하고 적중자에게 봉을 지급할까요?')) return;
const board = getWcBoard();
const match = (board.matches || []).find((m) => m.id === matchId);
if (!match) return;
const batch = writeBatch(db);
(window.allPlayersData || []).forEach((p) => {
const bets = Array.isArray(p.wcBets) ? p.wcBets : [];
let bong = Number(p.bong) || 0;
let changed = false;
const next = bets.map((b) => {
if (!b || b.matchId !== matchId || b.status !== 'pending') return b;
changed = true;
if (b.optionId === pick) {
const payout = Math.floor(Number(b.stake) * Number(b.odds));
bong += payout;
return { ...b, status: 'won', payout };
}
return { ...b, status: 'lost', payout: 0 };
});
if (changed) {
batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id)), { bong, wcBets: next }, { merge: true });
}
});
board.matches = board.matches.map((m) => m.id === matchId ? { ...m, status: 'settled', result: pick } : m);
board.updatedAt = new Date().toISOString();
batch.set(wcBoardRef(), board, { merge: true });
await batch.commit();
triggerConfetti();
window.customAlert('정산 완료. 적중자에게 봉이 지급되었습니다.');
} catch (e) { console.error(e); window.customAlert(`정산 실패:\n${e.message}`); }
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

const baseData = {
name: name, pos: '미정', age: age, gender: gender,
pac: STAT_BASE, sho: STAT_BASE, pas: STAT_BASE, dri: STAT_BASE, def: STAT_BASE, phy: STAT_BASE, ref: STAT_BASE, int: STAT_BASE, pst: STAT_BASE, dis: STAT_BASE, cmp: STAT_BASE, wrk: STAT_BASE,
level: 1, exp: 0, goals: 0, assists: 0, matches: 0, training: 0, saves: 0, keypass: 0, bong: 0, lastWageWeek: '',
inventory: [], itemLevels: {}, equipHead: null, equipHandL: null, equipHandR: null, equipFootL: null, equipFootR: null, equipFace: null,
activityDay: '', activityCounts: emptyActivityCounts(), season: 2,
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

if(isGM) window.switchAppTab('more', 'tabMaster');
else {
window.switchAppTab('home');
if(window.selectedPlayerId && window.allPlayersData.length > 0) window.selectPlayer(window.selectedPlayerId);
}

// 🔔 공지 팝업: 같은 공지는 기기당 1회만 (내용이 바뀌면 다시 1회)
if(!isGuest) {
const annRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'announcement');
getDoc(annRef).then(snap => {
const raw = snap.exists() ? snap.data().text : '';
const annText = typeof raw === 'string' ? raw.trim() : '';
const stamp = snap.exists() ? String(snap.data().updatedAt || '') : '';
if (!annText) return;
const token = `${stamp}|${annText}`;
try {
if (localStorage.getItem('sfc_ann_seen_v1') === token) return;
localStorage.setItem('sfc_ann_seen_v1', token);
} catch (e) { /* ignore */ }
setTimeout(() => {
window.customAlert(`📢 [감독님 공지사항]\n\n${escapeHtml(annText)}`);
}, 800);
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
id: safeId, name: name, pos: '미정', pac: STAT_BASE, sho: STAT_BASE, pas: STAT_BASE, dri: STAT_BASE, def: STAT_BASE, phy: STAT_BASE, ref: STAT_BASE, int: STAT_BASE, pst: STAT_BASE, dis: STAT_BASE, cmp: STAT_BASE, wrk: STAT_BASE,
level: 1, exp: 0, goals: 0, assists: 0, matches: 0, training: 0, saves: 0, keypass: 0, bong: 0, age: 13, inventory: [], itemLevels: {}, season: 2
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
else window.renderOfficialBetPanel();
if(isVisible('tabMasterStats')) window.renderMasterStats();
updateNavBongChip();
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

onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'season'), (docSnap) => {
const data = docSnap.data() || {};
window.seasonInfo = {
season: Number(data.season) || 1,
started: !!data.started,
startedAt: data.startedAt || null
};
applySeasonChrome();
}, (error) => console.error("Season Listen Error:", error));

onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'wcBoard'), (docSnap) => {
const data = docSnap.data();
if (data && Array.isArray(data.matches) && data.matches.length) {
window.wcBoard = data;
} else {
window.wcBoard = defaultWcBoard();
}
}, (error) => console.error("wcBoard Listen Error:", error));

onSnapshot(officialMatchRef(), (docSnap) => {
window.officialMatch = docSnap.exists() ? docSnap.data() : { status: 'idle' };
window.renderOfficialBetPanel();
}, (error) => console.error('officialMatch Listen Error:', error));

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

// 모의경기 팀 분류창: 삭제 버튼·레드/블루 라디오·더블클릭 이동·드래그 앤 드롭 (한 번만 등록)
if (typeof window !== 'undefined' && !window.__simTeamBoardUiBound) {
window.__simTeamBoardUiBound = true;
let dragSimPid = null;
document.addEventListener('change', (ev) => {
const t = ev.target;
if (t && t.matches && t.matches('.sim-profile-cb')) {
const team = t.getAttribute('data-sim-profile-team');
const pid = t.getAttribute('data-player-id');
if (pid && (team === 'A' || team === 'B')) {
if (t.checked) {
window.setPlayerSimTeam(pid, team);
} else {
const pl = window.allPlayersData.find((x) => x.id === pid);
if (pl && pl.simTeam === team) window.setPlayerSimTeam(pid, null);
}
}
return;
}
if (!t || !t.matches || !t.matches('input[type="radio"][data-sim-board]')) return;
if (t.value !== 'A' && t.value !== 'B') return;
const k = t.getAttribute('data-sim-board');
if (k && window.simBoardPreferredTarget) window.simBoardPreferredTarget[k] = t.value;
});
document.addEventListener('click', (ev) => {
const clr = ev.target.closest('.sim-team-clear-btn');
if (clr) {
ev.preventDefault();
const tm = clr.getAttribute('data-sim-clear-team');
if (tm === 'A' || tm === 'B') window.clearSimTeamColumn(tm);
return;
}
const rnd = ev.target.closest('.sim-team-random-fill-btn');
if (rnd) {
ev.preventDefault();
const tm = rnd.getAttribute('data-sim-random-team');
if (tm === 'A' || tm === 'B') window.fillSimTeamRandomPos(tm);
return;
}
const btn = ev.target.closest('.sim-team-remove-btn');
if (!btn) return;
ev.preventDefault();
const pid = btn.getAttribute('data-player-id');
if (pid) window.setPlayerSimTeam(pid, null);
});
document.addEventListener('dblclick', (ev) => {
const row = ev.target.closest('.sim-team-row');
if (!row) return;
const boardKey = row.getAttribute('data-sim-board');
if (!boardKey) return;
const pid = row.getAttribute('data-player-id');
if (!pid) return;
const r = document.querySelector(`input[name="${getSimTeamBoardRadioName(boardKey)}"]:checked`);
const team = r && (r.value === 'A' || r.value === 'B') ? r.value : 'A';
window.setPlayerSimTeam(pid, team);
});
document.addEventListener('dragstart', (ev) => {
const chip = ev.target.closest('.sim-tactical-chip');
if (chip) {
ev.dataTransfer.setData('text/sim-player', chip.getAttribute('data-sim-chip-id') || '');
ev.dataTransfer.setData('text/sim-team', chip.getAttribute('data-sim-chip-team') || '');
ev.dataTransfer.effectAllowed = 'copy';
return;
}
const row = ev.target.closest('.sim-team-row');
if (!row || row.getAttribute('draggable') !== 'true') return;
dragSimPid = row.getAttribute('data-player-id');
if (dragSimPid) {
ev.dataTransfer.setData('text/plain', dragSimPid);
ev.dataTransfer.effectAllowed = 'move';
}
});
document.addEventListener('dragend', () => { dragSimPid = null; });
document.addEventListener('dragover', (ev) => {
if (ev.target.closest('.sim-team-drop-zone')) {
ev.preventDefault();
ev.dataTransfer.dropEffect = 'move';
}
});
document.addEventListener('drop', async (ev) => {
const zone = ev.target.closest('.sim-team-drop-zone');
if (!zone) return;
ev.preventDefault();
const pid = (ev.dataTransfer.getData('text/plain') || dragSimPid || '').trim();
if (!pid) return;
const toTeam = zone.getAttribute('data-sim-drop');
if (toTeam !== 'A' && toTeam !== 'B') return;
const hitRow = ev.target.closest('.sim-team-row');
if (hitRow && hitRow.getAttribute('data-player-id') !== pid) {
const otherId = hitRow.getAttribute('data-player-id');
const pDrag = window.allPlayersData.find((x) => x.id === pid);
const pOther = window.allPlayersData.find((x) => x.id === otherId);
if (pDrag && pOther && pDrag.simTeam && pOther.simTeam && pDrag.simTeam !== pOther.simTeam) {
await window.swapSimTeamPlayers(pid, otherId);
}
return;
}
const pOnly = window.allPlayersData.find((x) => x.id === pid);
if (pOnly && pOnly.simTeam === toTeam) return;
await window.setPlayerSimTeam(pid, toTeam);
});
}

// 전술 보드: 필드 드래그·칩 드롭·기본 포메이션
if (typeof window !== 'undefined' && !window.__simTacticalUiBound) {
window.__simTacticalUiBound = true;
window.resetSimFormationDefaults = () => {
const rawA = getSimMatchRoster('A');
const rawB = getSimMatchRoster('B');
const padRA = padSimRosterWithBots(rawA, 'A');
const padRB = padSimRosterWithBots(rawB, 'B');
window.simFieldPositions.A = {};
window.simFieldPositions.B = {};
ensureSimFieldPositions(padRA.roster, padRB.roster);
window.drawSimTacticalBoard();
};
document.getElementById('btnSimFormationReset')?.addEventListener('click', () => window.resetSimFormationDefaults());
let __simTacticalDrag = null;
function __simTacticalLogicalXY(canvas, clientX, clientY) {
const rect = canvas.getBoundingClientRect();
const dpr = Math.min(2, window.devicePixelRatio || 1);
const lw = canvas.width / dpr;
const lh = canvas.height / dpr;
const x = ((clientX - rect.left) / rect.width) * lw;
const y = ((clientY - rect.top) / rect.height) * lh;
return { x, y, lw, lh };
}
function __simTacticalHit(x, y, lw, lh) {
const px0 = 12;
const py0 = 10;
const pw = lw - 24;
const ph = lh - 36;
const padRA = padSimRosterWithBots(getSimMatchRoster('A'), 'A');
const padRB = padSimRosterWithBots(getSimMatchRoster('B'), 'B');
for (const team of ['A', 'B']) {
const roster = team === 'A' ? padRA.roster : padRB.roster;
for (let i = 0; i < roster.length; i++) {
const p = roster[i];
const b = window.simFieldPositions[team][p.id];
if (!b) continue;
const px = px0 + b.nx * pw;
const py = py0 + b.ny * ph;
if (Math.hypot(x - px, y - py) < 18) return { team, pid: p.id };
}
}
return null;
}
const __tacCan = document.getElementById('simTacticalCanvas');
if (__tacCan) {
__tacCan.addEventListener('pointerdown', (e) => {
if (e.button !== undefined && e.button !== 0) return;
const o = __simTacticalLogicalXY(__tacCan, e.clientX, e.clientY);
const h = __simTacticalHit(o.x, o.y, o.lw, o.lh);
if (h) {
__simTacticalDrag = h;
try { __tacCan.setPointerCapture(e.pointerId); } catch (err) {}
}
});
__tacCan.addEventListener('pointermove', (e) => {
if (!__simTacticalDrag) return;
const o = __simTacticalLogicalXY(__tacCan, e.clientX, e.clientY);
const px0 = 12;
const py0 = 10;
const pw = o.lw - 24;
const ph = o.lh - 36;
let nx = (o.x - px0) / pw;
let ny = (o.y - py0) / ph;
nx = Math.max(0.03, Math.min(0.97, nx));
ny = Math.max(0.06, Math.min(0.94, ny));
window.simFieldPositions[__simTacticalDrag.team][__simTacticalDrag.pid] = { nx, ny };
window.drawSimTacticalBoard();
});
const __tacUp = () => {
if (__simTacticalDrag) {
saveSimFieldPositionsToStorage();
__simTacticalDrag = null;
}
};
__tacCan.addEventListener('pointerup', __tacUp);
__tacCan.addEventListener('pointercancel', __tacUp);
__tacCan.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
__tacCan.addEventListener('drop', (e) => {
e.preventDefault();
const pid = e.dataTransfer.getData('text/sim-player');
const team = e.dataTransfer.getData('text/sim-team');
if (!pid || (team !== 'A' && team !== 'B')) return;
const o = __simTacticalLogicalXY(__tacCan, e.clientX, e.clientY);
const px0 = 12;
const py0 = 10;
const pw = o.lw - 24;
const ph = o.lh - 36;
let nx = (o.x - px0) / pw;
let ny = (o.y - py0) / ph;
nx = Math.max(0.03, Math.min(0.97, nx));
ny = Math.max(0.06, Math.min(0.94, ny));
window.simFieldPositions[team][pid] = { nx, ny };
saveSimFieldPositionsToStorage();
window.drawSimTacticalBoard();
});
}
}

// 이벤트 리스너 세팅 등 모든 준비가 끝난 후 마지막에 시동
initApp();
