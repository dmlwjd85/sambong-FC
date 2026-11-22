/** 선수 카드·레이더 차트·경험치 처리 */
import { setDoc } from 'firebase/firestore';
import { resolveFaceSrc } from './mangaFace.js';
import { featureOn } from '../config/features.js';
import { diffStatChanges, pushUndo } from './activityUndo.js';
import { POS_KR, STAT_NAMES, POS_WEIGHTS, STAT_KEYS, ACTIVITY_DAILY_CAP, STAT_DESC, ENHANCE_LEVELS, SHOP_ITEMS, isSimTeamKey, simTeamInfo } from './constants.js';
import { getStat, getBonusStats, statGrowthChancePct, applyLevelStatGrowth, getOVR, getTierInfo, getWeeklyWage, getExpNeeded } from './stats.js';
import { getAvatarHtml, triggerConfetti } from './ui.js';
import { playerDisplayName, canEditThisPlayer, getTodayActivityCounts, escapeAttr } from './utils.js';

window.showStatDesc = (statKey) => {
const pId = window.selectedPlayerId;
const p = window.allPlayersData.find(x => x.id === pId);
let growthText = '';
if(p) {
const bonus = getBonusStats(p);
const pct = Math.round(statGrowthChancePct(p, statKey, bonus, null));
const itemGrowth = featureOn('shop') ? (bonus.growth[statKey] || 0) : 0;
growthText = featureOn('shop')
? `\n\n-----------------------------\n🌱 [이번 레벨업 때 이 능력치가 오를 확률: 약 ${pct}%]\n기본은 낮고, 장비는 ${itemGrowth}%만큼 보탬이 돼요. 이미 높은 능력치는 더 천천히 올라요.`
: `\n\n-----------------------------\n🌱 [이번 레벨업 때 이 능력치가 오를 확률: 약 ${pct}%]\n기본은 낮아요. 이미 높은 능력치는 더 천천히 올라요.`;
}
window.customAlert(`[${STAT_NAMES[statKey]}]\n\n${STAT_DESC[statKey]}${growthText}`);
};

window.renderSelectedCard = (pId) => {
const p = window.allPlayersData.find(x => x.id === pId);
if(!p) return;

const isMe = window.playerState.id === pId; const isGM = window.playerState.isGM;
const ovr = getOVR(p); const tier = getTierInfo(ovr); const lv = Number(p.level) || 1; const exp = Number(p.exp) || 0;
const expNeeded = getExpNeeded(lv); const expPercent = Math.min(100, Math.floor((exp / expNeeded) * 100));
const bonus = getBonusStats(p);
const kitItem = SHOP_ITEMS.find((x) => x.id === p.equipKit && x.type === 'kit');

const shownName = playerDisplayName(p);
document.getElementById('detailPanelTitle') && (document.getElementById('detailPanelTitle').innerText = isMe ? '내 선수' : `${shownName} 선수`);
document.getElementById('detailLevel') && (document.getElementById('detailLevel').innerText = lv);

const badge = document.getElementById('detailTierBadge');
if(badge) { badge.innerText = tier.name.split(' ')[0]; badge.title = tier.name; badge.className = `px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${tier.class}`; }

const card = document.getElementById('detailFutCard');
const kitClass = featureOn('shop') && kitItem && kitItem.kitClass ? kitItem.kitClass : '';
if(card) { card.className = `fut-card fut-compact ${tier.cardClass} ${kitClass}`.trim(); }
const aura = document.getElementById('cardAuraWrapper');
if (aura) {
const auraTier = (tier.cardClass || 'card-rookie').replace('card-', 'card-aura-');
aura.className = `card-aura ${auraTier} relative shrink-0 w-[44%] max-w-[180px]`;
}

const detailAv = document.getElementById('detailAvatar');
if (detailAv) detailAv.innerHTML = getAvatarHtml(p, 'detail');
document.getElementById('detailName') && (document.getElementById('detailName').innerText = shownName);
document.getElementById('detailAge') && (document.getElementById('detailAge').innerText = Number(p.age) || 13);
document.getElementById('detailOvr') && (document.getElementById('detailOvr').innerText = ovr);
document.getElementById('detailPos') && (document.getElementById('detailPos').innerText = ({ Goleiro: 'GK', Fixo: 'DF', Ala: 'MF', Pivo: 'FW' })[p.pos] || '미정');
const posFull = document.getElementById('detailPosFull');
if (posFull) posFull.textContent = POS_KR[p.pos] || '포지션 미정';
const rankEl = document.getElementById('detailRank');
if (rankEl) {
const all = (window.allPlayersData || []).map((x) => getOVR(x)).sort((a, b) => b - a);
const rank = all.indexOf(ovr) + 1;
rankEl.innerHTML = `<span class="text-fut-gold font-bebas text-base">${rank}</span><span class="text-slate-400 text-[11px]"> / ${all.length}명</span>`;
}
document.getElementById('detailExpText') && (document.getElementById('detailExpText').innerText = `${exp} / ${expNeeded}`);
document.getElementById('detailExpBar') && (document.getElementById('detailExpBar').style.width = `${expPercent}%`);

const simTeamPanel = document.getElementById('detailSimTeamPanel');
if (simTeamPanel) {
const st = p.simTeam;
const teamLabel = isSimTeamKey(st) ? simTeamInfo(st).name : '';
if (!teamLabel) {
simTeamPanel.innerHTML = '';
simTeamPanel.classList.add('hidden');
} else {
simTeamPanel.classList.remove('hidden');
simTeamPanel.innerHTML = `<div class="fm-info-row"><span>팀</span><b class="${simTeamInfo(st).text}">${teamLabel}</b></div>`;
}
}

const renderRecord = (id, key, val) => {
const el = document.getElementById(id); if(!el) return;
const safeVal = Number(val) || 0;
if (isGM) { el.innerHTML = `<input type="number" value="${safeVal}" class="w-full max-w-[3rem] bg-transparent text-center border-b border-slate-600 focus:border-emerald-500 focus:outline-none m-0 p-0 text-current font-bebas text-lg leading-none" onchange="window.setRecord('${p.id}', '${key}', this.value)">`; } 
else { el.innerText = safeVal; }
};

renderRecord('recMatches', 'matches', p.matches); renderRecord('recTraining', 'training', p.training);
renderRecord('recGoals', 'goals', p.goals); renderRecord('recAssists', 'assists', p.assists);
renderRecord('recKeypass', 'keypass', p.keypass); renderRecord('recSaves', 'saves', p.saves);
const seasonStartNote = document.getElementById('seasonStartNote');
if (seasonStartNote) {
const atStart = ['matches','training','goals','assists','keypass','saves'].every((k) => !(Number(p[k]) || 0));
seasonStartNote.textContent = atStart ? '시즌 2 출발선이에요. 경기와 훈련 기록은 아직 0에서 시작해요.' : '';
seasonStartNote.classList.toggle('hidden', !atStart);
}

const stats = [
{ id: 'pac', label: '속력' }, { id: 'sho', label: '슈팅' }, { id: 'pas', label: '패스' },
{ id: 'dri', label: '드리블' }, { id: 'def', label: '수비' }, { id: 'phy', label: '피지컬' },
{ id: 'ref', label: '반사' }, { id: 'int', label: '가로채기' }, { id: 'pst', label: '위치' },
{ id: 'dis', label: '볼배급' }, { id: 'cmp', label: '평정심' }, { id: 'wrk', label: '활동량' }
];

/** FM처럼 숫자 크기에 따라 색 (낮음 빨강 → 보통 노랑 → 좋음 초록 → 뛰어남 하늘 → 최상 금색) */
const fmTone = (v) => (v >= 85 ? 'fm-v-5' : v >= 75 ? 'fm-v-4' : v >= 65 ? 'fm-v-3' : v >= 55 ? 'fm-v-2' : 'fm-v-1');
const posConfig = POS_WEIGHTS[p.pos];
let gridHtml = '';
stats.forEach(s => {
const baseVal = getStat(p, s.id); const bVal = bonus.flat[s.id] || 0; const totalVal = Math.min(99, baseVal + bVal);
const bonusBadge = (featureOn('shop') && bVal > 0) ? `<sup class="text-[9px] text-emerald-300 font-bold">+${bVal}</sup>` : '';
const role = posConfig && posConfig.core.includes(s.id) ? 'fm-attr-core' : posConfig && posConfig.sub.includes(s.id) ? 'fm-attr-sub' : '';
if (isGM) {
gridHtml += `<div class="fm-attr ${role}">
<button type="button" class="fm-attr-label" onclick="window.showStatDesc('${s.id}')">${s.label}</button>
<button type="button" onclick="window.modStat('${p.id}', '${s.id}', -1)" class="fm-step" aria-label="${s.label} 내리기"><i class="fa-solid fa-minus"></i></button>
<span class="fm-val ${fmTone(baseVal)}">${baseVal}${bonusBadge}</span>
<button type="button" onclick="window.modStat('${p.id}', '${s.id}', 1)" class="fm-step" aria-label="${s.label} 올리기"><i class="fa-solid fa-plus"></i></button>
</div>`;
} else {
gridHtml += `<button type="button" class="fm-attr ${role}" onclick="window.showStatDesc('${s.id}')">
<span class="fm-attr-label">${s.label}</span>
<span class="fm-val ${fmTone(totalVal)}">${totalVal}${bonusBadge}</span>
</button>`;
}
});
const statsGridElGM = document.getElementById('detailStatsGrid');
if (statsGridElGM) statsGridElGM.classList.toggle('fm-attr-grid-gm', !!isGM);

/** 카드 아래 FUT식 대표 능력치 6개 */
const faceKeys = p.pos === 'Goleiro'
? [['ref', 'REF'], ['dis', 'DIS'], ['pst', 'POS'], ['cmp', 'CMP'], ['phy', 'PHY'], ['pac', 'SPD']]
: [['pac', 'PAC'], ['sho', 'SHO'], ['pas', 'PAS'], ['dri', 'DRI'], ['def', 'DEF'], ['phy', 'PHY']];
const faceEl = document.getElementById('detailFaceStats');
if (faceEl) faceEl.innerHTML = faceKeys.map(([k, ab]) => `<span><b>${Math.min(99, getStat(p, k) + (bonus.flat[k] || 0))}</b>${ab}</span>`).join('');

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

if(isMe && !window.playerState.isGuest) {
document.getElementById('playerTrainingPanel')?.classList.remove('hidden');
document.getElementById('recBong') && (document.getElementById('recBong').innerText = Number(p.bong) || 0);
if (featureOn('bong')) document.getElementById('expectedWageDisplay') && (document.getElementById('expectedWageDisplay').innerText = `이번 주 ${getWeeklyWage(ovr)}`);
const counts = getTodayActivityCounts(p);
const hint = document.getElementById('activityQuotaHint');
if (hint) {
hint.innerHTML = `오늘 남은 한도 — 훈련 ${counts.training}/${ACTIVITY_DAILY_CAP.training} · 출전 ${counts.matches}/${ACTIVITY_DAILY_CAP.matches} · 골 ${counts.goals}/${ACTIVITY_DAILY_CAP.goals} · 어시 ${counts.assists}/${ACTIVITY_DAILY_CAP.assists}<br><span class="text-slate-400">개인 훈련은 가끔 포지션 핵심 스탯이 +1 됩니다. 이미 높은 능력치는 잘 안 오릅니다.</span>`;
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
}
const btnChangePos = document.getElementById('btnChangePos');
if (canEditThisPlayer(p.id)) {
document.getElementById('iconEditPos')?.classList.remove('hidden');
btnChangePos?.classList.add('cursor-pointer');
if (btnChangePos) btnChangePos.onclick = () => window.changePositionModal(p.id);
} else {
document.getElementById('iconEditPos')?.classList.add('hidden');
btnChangePos?.classList.remove('cursor-pointer');
if (btnChangePos) btnChangePos.onclick = null;
}

if(isGM) {
document.getElementById('gmControls')?.classList.remove('hidden');
document.getElementById('gmWalletManager')?.classList.remove('hidden');
document.getElementById('gmAgeManager')?.classList.remove('hidden');
document.getElementById('gmStatHint')?.classList.remove('hidden');
document.getElementById('gmInputAge') && (document.getElementById('gmInputAge').value = Number(p.age) || 13);
const gmViewBong = document.getElementById('gmViewBong');
if(gmViewBong) gmViewBong.innerHTML = `<input type="number" value="${Number(p.bong) || 0}" class="w-16 bg-transparent text-center border-b border-slate-600 focus:border-emerald-500 focus:outline-none transition-colors m-0 p-0 text-fut-gold font-display text-xl leading-none" onchange="window.setRecord('${p.id}', 'bong', this.value)">`;
} else {
document.getElementById('gmControls')?.classList.add('hidden');
document.getElementById('gmWalletManager')?.classList.add('hidden');
document.getElementById('gmAgeManager')?.classList.add('hidden');
document.getElementById('gmStatHint')?.classList.add('hidden');
}
// 아래 '기록 입력·감독 도구' 칸: 보여 줄 게 없으면 통째로 숨김
const trainingShown = !document.getElementById('playerTrainingPanel')?.classList.contains('hidden');
document.getElementById('playerActionsPanel')?.classList.toggle('hidden', !trainingShown && !isGM);
};

export async function processExp(p, expGained, docRef, updatesObj, activityType) {
const beforeStats = {};
STAT_KEYS.forEach((k) => { beforeStats[k] = getStat(p, k); });
let currentLv = Number(p.level) || 1;
const startLv = currentLv;
let currentExp = (Number(p.exp) || 0) + Number(expGained);
let leveledUp = false; let increasedStats = [];

while(currentExp >= getExpNeeded(currentLv)) { currentExp -= getExpNeeded(currentLv); currentLv++; leveledUp = true; }
updatesObj.exp = currentExp;

if(leveledUp) {
updatesObj.level = currentLv;
const levelsGained = Math.max(1, currentLv - startLv);
for (let i = 0; i < levelsGained; i++) {
increasedStats.push(...applyLevelStatGrowth(p, updatesObj));
}

triggerConfetti(); 
const uniqueStats = [...new Set(increasedStats)];
const statsMsg = uniqueStats.length > 0
? `\n\n오른 능력치: ${uniqueStats.join(', ')}`
: (featureOn('shop') ? '\n\n이번엔 능력치가 그대로예요. 장비를 끼우면 다음엔 조금 더 잘 올라요.' : '\n\n이번엔 능력치가 그대로예요. 다음 레벨에서 다시 기회가 있어요.');
setTimeout(() => window.customAlert(`축하해요!\n${playerDisplayName(p)} 선수가 레벨 ${currentLv}이 됐어요.${statsMsg}`), 500);
}
if (activityType) {
updatesObj.activityUndo = pushUndo(p.activityUndo, { type: activityType, stats: diffStatChanges(STAT_KEYS, beforeStats, updatesObj) });
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
