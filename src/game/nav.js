/** 탭 이동과 하단 내비, 오늘의 팁 */
import { featureOn } from '../config/features.js';
import { DAILY_TIPS } from './constants.js';
import { renderLeaderboard, renderMasterDashboard } from './records.js';
import { openTacticsBoard } from './sim/tacticsBoard.js';

window.switchTab = (tabId) => {
['tabWorkspace', 'tabTips', 'tabShop', 'tabAchievements', 'tabRank', 'tabCompare', 'tabSim', 'tabTactics', 'tabGuide', 'tabMaster', 'tabMasterStats'].forEach(id => {
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
if(tabId === 'tabTactics') openTacticsBoard();
if(tabId === 'tabMaster') renderMasterDashboard();
if(tabId === 'tabMasterStats') window.renderMasterStats();
updateNavBongChip();
};

window.appNav = { hub: 'home', sub: null };

function getAppHubChips(hub) {
if (hub === 'match') {
return [
{ id: 'tabSim', label: '매치 센터' },
{ id: 'tabTactics', label: '전술판' }
];
}
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
let hubKey = hub || 'home';
if (hubKey === 'shop' && !featureOn('shop')) hubKey = 'home';
if (window.appNav.hub !== hubKey) window.appNav.sub = null;
window.appNav.hub = hubKey;
const chips = getAppHubChips(hubKey);
let page = subTabId || null;
if (!page && window.appNav.sub && chips.some((c) => c.id === window.appNav.sub)) page = window.appNav.sub;
if (!page) page = defaults[hubKey];
window.appNav.sub = chips.length ? page : null;

renderBottomNav();
if (!navFromMenu) {
const fav = currentFavorites().find((m) => m.page === page && !m.scroll && !m.action);
window.appNav.menuKey = fav ? fav.key : null;
}
paintBottomNavActive();
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

export function updateNavBongChip() {
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

function visibleTips() {
return DAILY_TIPS.filter((tip) => {
const t = `${tip.title} ${tip.desc} ${tip.category}`;
if (/베팅|전액/.test(t)) return false;
if (!featureOn('shop') && /상점|스킨|장비|강화/.test(t)) return false;
if (!featureOn('enhance') && /강화/.test(t)) return false;
if (!featureOn('bong') && /주급/.test(t)) return false;
return true;
});
}
function renderDailyTip() {
const tips = visibleTips();
const tip = tips.length ? tips[Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24 / 3) % tips.length] : { title: '킥인은 발로', img: '⚽', category: '기본규칙', desc: '공이 밖으로 나가면 손으로 던지지 않고 발로 차서 넣어요.' };

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

/* ───────────── 하단 탭: 자주 쓰는 메뉴 최대 6개 (기기·사람별로 저장) ───────────── */

/** 고를 수 있는 메뉴 전체 */
const MENU_ITEMS = [
{ key: 'locker', label: '라커룸', icon: 'fa-door-open', hub: 'home', page: 'tabWorkspace' },
{ key: 'teams', label: '팀 짜기', icon: 'fa-scale-balanced', hub: 'home', page: 'tabWorkspace', scroll: 'teamBuilderPanel' },
{ key: 'board', label: '분류표', icon: 'fa-people-group', hub: 'home', page: 'tabWorkspace', scroll: 'lockerSimTeamsPreview' },
{ key: 'match', label: '매치', icon: 'fa-futbol', hub: 'match', page: 'tabSim' },
{ key: 'tactics', label: '전술판', icon: 'fa-chalkboard', hub: 'match', page: 'tabTactics' },
{ key: 'trophy', label: '트로피', icon: 'fa-trophy', hub: 'career', page: 'tabAchievements' },
{ key: 'compare', label: '비교', icon: 'fa-code-compare', hub: 'career', page: 'tabCompare' },
{ key: 'news', label: '소식', icon: 'fa-bullhorn', hub: 'more', page: 'tabTips' },
{ key: 'rank', label: '전당', icon: 'fa-ranking-star', hub: 'more', page: 'tabRank' },
{ key: 'guide', label: '안내', icon: 'fa-circle-info', hub: 'more', page: 'tabGuide' },
{ key: 'master', label: '현황판', icon: 'fa-gauge-high', hub: 'more', page: 'tabMaster', gm: true },
{ key: 'stats', label: '스탯표', icon: 'fa-list-ol', hub: 'more', page: 'tabMasterStats', gm: true },
{ key: 'attendance', label: '출석부', icon: 'fa-calendar-check', action: 'attendance', gm: true },
{ key: 'shop', label: '상점', icon: 'fa-store', hub: 'shop', page: 'tabShop', feature: 'shop' },
];
export const MAX_FAVORITES = 6;
const DEFAULT_FAVS = {
gm: ['locker', 'teams', 'board', 'match', 'stats', 'master'],
student: ['locker', 'match', 'trophy', 'rank', 'news'],
};

let navFromMenu = false;
let navOwner = '';

const isGMNow = () => !!(window.playerState && window.playerState.isGM);
const roleKey = () => (isGMNow() ? 'gm' : 'student');
const storageKey = () => `sfc_nav_v1_${roleKey()}_${(window.playerState && window.playerState.id) || 'guest'}`;

/** 지금 사람이 쓸 수 있는 메뉴 */
export function availableMenus() {
return MENU_ITEMS.filter((m) => (!m.gm || isGMNow()) && (!m.feature || featureOn(m.feature)));
}

function loadFavoriteKeys() {
const avail = new Set(availableMenus().map((m) => m.key));
let keys = null;
try { keys = JSON.parse(localStorage.getItem(storageKey()) || 'null'); } catch (e) { keys = null; }
if (!Array.isArray(keys)) keys = DEFAULT_FAVS[roleKey()];
return keys.filter((k, i) => avail.has(k) && keys.indexOf(k) === i).slice(0, MAX_FAVORITES);
}

function saveFavoriteKeys(keys) {
try { localStorage.setItem(storageKey(), JSON.stringify(keys.slice(0, MAX_FAVORITES))); } catch (e) { /* 저장이 막혀도 이번엔 그대로 씀 */ }
}

export function currentFavorites() {
const byKey = new Map(availableMenus().map((m) => [m.key, m]));
return loadFavoriteKeys().map((k) => byKey.get(k)).filter(Boolean);
}

/** 하단 탭 그리기 (사람이 바뀌었거나 force일 때만 다시 그림) */
export function renderBottomNav(force) {
const grid = document.getElementById('appBottomNavGrid');
if (!grid) return;
const owner = storageKey();
if (!force && owner === navOwner && grid.children.length) return;
navOwner = owner;
const favs = currentFavorites();
grid.style.gridTemplateColumns = `repeat(${favs.length + 1}, minmax(0, 1fr))`;
grid.innerHTML = favs.map((m) => `<button type="button" class="app-tab" data-menu-key="${m.key}" onclick="window.openMenu('${m.key}')"><i class="fa-solid ${m.icon} text-lg"></i><span>${m.label}</span></button>`).join('')
+ '<button type="button" class="app-tab" data-menu-key="__all" onclick="window.openMenuSheet()" aria-label="전체 메뉴와 하단 탭 편집"><i class="fa-solid fa-table-cells-large text-lg"></i><span>전체</span></button>';
paintBottomNavActive();
}
window.renderBottomNav = renderBottomNav;

function paintBottomNavActive() {
const key = window.appNav && window.appNav.menuKey;
document.querySelectorAll('#appBottomNavGrid .app-tab').forEach((b) => b.classList.toggle('active', !!key && b.getAttribute('data-menu-key') === key));
}

/** 메뉴 열기 */
window.openMenu = (key) => {
const m = MENU_ITEMS.find((x) => x.key === key);
if (!m) return;
closeMenuSheet();
if (m.action === 'attendance') { window.viewAttendance(); return; }
navFromMenu = true;
try { window.switchAppTab(m.hub, m.page); } finally { navFromMenu = false; }
window.appNav.menuKey = key;
paintBottomNavActive();
const target = m.scroll ? document.getElementById(m.scroll) : null;
requestAnimationFrame(() => {
if (target) {
const top = target.getBoundingClientRect().top + window.scrollY - 72;
window.scrollTo({ top, behavior: 'smooth' });
} else window.scrollTo({ top: 0, behavior: 'smooth' });
});
};

/* 전체 메뉴 시트 (메뉴 이동 + 하단 탭 편집) */
let sheetEl = null;
let sheetEdit = false;

function closeMenuSheet() {
if (sheetEl) { sheetEl.remove(); sheetEl = null; }
}
window.closeMenuSheet = closeMenuSheet;

function sheetHtml() {
const favKeys = loadFavoriteKeys();
const avail = availableMenus();
const byKey = new Map(avail.map((m) => [m.key, m]));
if (!sheetEdit) {
return `<div class="flex items-center justify-between gap-2 mb-3">
<h3 class="text-lg font-display text-white">전체 메뉴</h3>
<button type="button" onclick="window.setMenuSheetEdit(true)" class="min-h-[44px] px-3 rounded-xl bg-emerald-800/70 border border-emerald-600 text-emerald-50 text-sm font-bold"><i class="fa-solid fa-pen mr-1"></i>하단 탭 편집</button>
</div>
<div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
${avail.map((m) => `<button type="button" class="menu-sheet-item ${favKeys.includes(m.key) ? 'is-fav' : ''}" onclick="window.openMenu('${m.key}')"><i class="fa-solid ${m.icon}"></i>${m.label}</button>`).join('')}
</div>
<p class="text-xs text-slate-500 mt-3">초록 테두리는 하단 탭에 들어 있는 메뉴예요.</p>`;
}
const full = favKeys.length >= MAX_FAVORITES;
const chosen = favKeys.map((k, i) => {
const m = byKey.get(k);
return `<div class="flex items-center gap-2 min-h-[48px] px-2 rounded-xl bg-slate-800/80 border border-emerald-700/50">
<span class="w-5 text-center text-xs text-slate-400 font-bold">${i + 1}</span>
<i class="fa-solid ${m.icon} text-emerald-300 w-5 text-center"></i>
<span class="flex-1 text-sm font-bold text-white">${m.label}</span>
<button type="button" onclick="window.moveFavorite('${k}', -1)" ${i === 0 ? 'disabled' : ''} class="w-10 h-10 rounded-lg bg-slate-700 text-white disabled:opacity-30" aria-label="${m.label} 앞으로"><i class="fa-solid fa-arrow-up"></i></button>
<button type="button" onclick="window.moveFavorite('${k}', 1)" ${i === favKeys.length - 1 ? 'disabled' : ''} class="w-10 h-10 rounded-lg bg-slate-700 text-white disabled:opacity-30" aria-label="${m.label} 뒤로"><i class="fa-solid fa-arrow-down"></i></button>
<button type="button" onclick="window.toggleFavorite('${k}')" class="w-10 h-10 rounded-lg bg-red-900/60 border border-red-700/60 text-red-100" aria-label="${m.label} 빼기"><i class="fa-solid fa-minus"></i></button>
</div>`;
}).join('') || '<p class="text-sm text-slate-400 py-2">아래에서 넣을 메뉴를 골라 주세요.</p>';
const rest = avail.filter((m) => !favKeys.includes(m.key)).map((m) => `<button type="button" onclick="window.toggleFavorite('${m.key}')" ${full ? 'disabled' : ''} class="flex items-center gap-2 min-h-[48px] px-3 rounded-xl bg-slate-900/80 border border-slate-600 text-sm font-bold text-slate-200 disabled:opacity-40"><i class="fa-solid fa-plus text-emerald-400"></i><i class="fa-solid ${m.icon} text-slate-400"></i>${m.label}</button>`).join('');
return `<div class="flex items-center justify-between gap-2 mb-1">
<h3 class="text-lg font-display text-white">하단 탭 편집</h3>
<button type="button" onclick="window.setMenuSheetEdit(false)" class="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-white text-sm font-bold">완료</button>
</div>
<p class="text-xs text-slate-400 mb-3">자주 쓰는 메뉴를 최대 ${MAX_FAVORITES}개까지 넣어요 (지금 ${favKeys.length}개). 나머지는 맨 끝 '전체'에서 열 수 있어요.</p>
<div class="space-y-1.5 mb-4">${chosen}</div>
<p class="text-xs font-bold text-slate-300 mb-2">넣을 수 있는 메뉴${full ? ' <span class="text-amber-300 font-normal">(가득 찼어요. 하나를 빼면 넣을 수 있어요)</span>' : ''}</p>
<div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">${rest || '<p class="text-xs text-slate-500">모두 넣었어요.</p>'}</div>
<button type="button" onclick="window.resetFavorites()" class="mt-4 min-h-[44px] w-full rounded-xl bg-slate-800 border border-slate-600 text-slate-300 text-sm font-bold">기본으로 되돌리기</button>`;
}

function paintSheet() {
if (!sheetEl) return;
const body = sheetEl.querySelector('.menu-sheet-body');
if (body) body.innerHTML = sheetHtml();
}

window.openMenuSheet = () => {
closeMenuSheet();
sheetEdit = false;
sheetEl = document.createElement('div');
sheetEl.className = 'app-dialog fixed inset-0 z-[6000] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm';
sheetEl.innerHTML = `<div class="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-pitch-bg border-t-2 sm:border-2 border-emerald-500 rounded-t-3xl sm:rounded-3xl p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl" role="dialog" aria-label="전체 메뉴">
<div class="w-10 h-1.5 rounded-full bg-slate-600 mx-auto mb-3 sm:hidden"></div>
<div class="menu-sheet-body"></div>
<button type="button" onclick="window.closeMenuSheet()" class="mt-3 min-h-[44px] w-full rounded-xl bg-slate-700 text-white font-bold">닫기</button>
</div>`;
sheetEl.addEventListener('click', (e) => { if (e.target === sheetEl) closeMenuSheet(); });
document.body.appendChild(sheetEl);
paintSheet();
};

window.setMenuSheetEdit = (on) => { sheetEdit = !!on; paintSheet(); };

window.toggleFavorite = (key) => {
const keys = loadFavoriteKeys();
const i = keys.indexOf(key);
if (i >= 0) keys.splice(i, 1);
else if (keys.length < MAX_FAVORITES) keys.push(key);
else return;
saveFavoriteKeys(keys);
renderBottomNav(true);
paintSheet();
};

window.moveFavorite = (key, dir) => {
const keys = loadFavoriteKeys();
const i = keys.indexOf(key);
const j = i + dir;
if (i < 0 || j < 0 || j >= keys.length) return;
[keys[i], keys[j]] = [keys[j], keys[i]];
saveFavoriteKeys(keys);
renderBottomNav(true);
paintSheet();
};

window.resetFavorites = () => {
try { localStorage.removeItem(storageKey()); } catch (e) { /* 무시 */ }
renderBottomNav(true);
paintSheet();
};
