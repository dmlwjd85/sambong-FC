/** Firebase 연결과 앱 시작(initApp), 실시간 구독 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, collection, onSnapshot, writeBatch } from 'firebase/firestore';
import { featureOn } from '../config/features.js';
import { appId, INITIAL_PLAYERS, ALLOWED_PLAYERS, getSafeDocId, GENDER_MAP, STAT_BASE } from './constants.js';
import { renderActivePool } from './locker.js';
import { markRosterReady, tryRememberedEntry } from './login.js';
import { updateNavBongChip } from './nav.js';
import { renderLeaderboard, renderMasterDashboard } from './records.js';
import { getOVR, recommendedPosition } from './stats.js';
import { applySeasonChrome } from './ui.js';
import { isVisible } from './utils.js';
import { renderWhenIdle } from './renderGate.js';

export const checkAuthReady = () => {
if (!auth || !auth.currentUser) {
throw new Error("서버와의 연결이 끊어졌거나 인증되지 않았습니다. 새로고침 해주세요.");
}
};

export let db, auth;
let subscribed = false;

/** 포지션이 '미정'인 선수는 능력치 가중치로 고른 추천 포지션으로 일단 정해 둠 (감독 기기에서 한 번에 저장) */
const autoPosDone = new Set();
export function autoAssignUndecidedPositions() {
if (!window.playerState || !window.playerState.isGM || !db) return;
const todo = (window.allPlayersData || []).filter((p) => (!p.pos || p.pos === '미정') && !autoPosDone.has(p.id));
if (!todo.length) return;
const batch = writeBatch(db);
const now = new Date().toISOString();
todo.forEach((p) => {
autoPosDone.add(p.id);
batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id)), { pos: recommendedPosition(p).pos, posAuto: true, updatedAt: now }, { merge: true });
});
batch.commit().catch((e) => { console.error('auto pos', e); todo.forEach((p) => autoPosDone.delete(p.id)); });
}
window.autoAssignUndecidedPositions = autoAssignUndecidedPositions;

export const initApp = async () => {
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
// 로그인 상태 알림이 다시 와도 실시간 구독은 한 번만 (중복 구독 → 화면이 여러 번 그려지는 것 방지)
if (subscribed) return;
subscribed = true;
onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'players'), (snapshot) => {
const dbPlayers = new Map();
snapshot.forEach(d => { 
try {
if(!d.id.includes('gm')) {
const data = d.data();
const cleanId = d.id.replace(/^player_/, '');
const copy = { ...data };
delete copy.officialBet;
delete copy.wcBets;
const shown = (typeof data.name === 'string' && data.name.trim()) ? data.name.trim() : cleanId;
dbPlayers.set(cleanId, { ...copy, id: cleanId, name: shown, fromDb: true });
if (shown && !ALLOWED_PLAYERS.includes(shown)) ALLOWED_PLAYERS.push(shown);
if (shown && data.gender) GENDER_MAP[shown] = data.gender;
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
markRosterReady();
autoAssignUndecidedPositions();

// 로그인 상태에 따른 자동 선택 로직
if(window.playerState.id && !window.playerState.isGuest) {
if(!window.selectedPlayerId || !window.allPlayersData.find(x => x.id === window.selectedPlayerId)) {
window.selectedPlayerId = window.playerState.isGM ? getSafeDocId(ALLOWED_PLAYERS[0]) : window.playerState.id;
}
}

renderWhenIdle(() => {
window.renderLockerRoom();
if(window.selectedPlayerId) window.renderSelectedCard(window.selectedPlayerId);
renderActivePool();

if(isVisible('tabAchievements')) window.renderAchievements();
if(isVisible('tabRank')) renderLeaderboard();
if(isVisible('tabMaster')) renderMasterDashboard();
if(isVisible('tabCompare')) window.renderCompareList();
if(isVisible('tabSim')) window.renderSimMatchTab();
if(isVisible('tabMasterStats')) window.renderMasterStats();
updateNavBongChip();
});
tryRememberedEntry();
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
const eventText = String((data && data.text) || '');
const hideEvent = /베팅|전액/.test(eventText) || (!featureOn('shop') && /상점|스킨|장비|강화/.test(eventText)) || (!featureOn('bong') && /주급/.test(eventText));
if(eventText && marqueeContainer && marqueeText && !hideEvent) {
const isRecent = (Date.now() - (data.timestamp || 0)) < 1000 * 60 * 60 * 24;
if(isRecent) {
marqueeText.innerText = eventText;
marqueeContainer.classList.remove('hidden');
} else { marqueeContainer.classList.add('hidden'); }
} else if (marqueeContainer) { marqueeContainer.classList.add('hidden'); }
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

document.getElementById('loadingOverlay')?.classList.add('hidden');
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
