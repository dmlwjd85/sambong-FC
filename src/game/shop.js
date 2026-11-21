/** 상점·강화·장착 (features.js 스위치로 꺼져 있음) */
import { doc, setDoc } from 'firebase/firestore';
import { resolveFaceSrc } from './mangaFace.js';
import { featureOn } from '../config/features.js';
import { checkAuthReady, db } from './boot.js';
import { appId, getSafeDocId, STAT_NAMES, ENHANCE_LEVELS, SHOP_ITEMS, SHOP_GEAR_TYPES, SHOP_SKIN_TYPES } from './constants.js';
import { triggerConfetti } from './ui.js';
import { escapeAttr } from './utils.js';

window.shopCat = 'all';
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
if (!featureOn('shop')) {
const shopGrid = document.getElementById('shopGrid');
if (shopGrid) shopGrid.innerHTML = '';
return;
}
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

window.purchaseItem = async (itemId) => {
try {
checkAuthReady();
if (!featureOn('shop')) return;
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
if (!featureOn('enhance') || !featureOn('shop')) return;
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
if (!featureOn('shop')) return;
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
if (!featureOn('shop')) return;
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
