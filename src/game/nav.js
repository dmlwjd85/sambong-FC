/** 탭 이동과 하단 내비, 오늘의 팁 */
import { featureOn } from '../config/features.js';
import { DAILY_TIPS } from './constants.js';
import { renderLeaderboard, renderMasterDashboard } from './records.js';

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
let hubKey = hub || 'home';
if (hubKey === 'shop' && !featureOn('shop')) hubKey = 'home';
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
