/** 기록실: 전체 능력치표, 리더보드, 비교, 업적 */
import { doc, setDoc } from 'firebase/firestore';
import { featureOn } from '../config/features.js';
import { checkAuthReady, db } from './boot.js';
import { appId, getSafeDocId, POS_KR, ACHIEVEMENTS } from './constants.js';
import { getStat, getBonusStats, getOVR, getTierInfo, getPosColor } from './stats.js';
import { applyFeatureChrome, getAvatarHtml, triggerConfetti } from './ui.js';
import { escapeHtml } from './utils.js';

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
const bVal = getStat(b, window.currentSortKey) + (bBonus[window.currentSortKey]||0);
const aVal = getStat(a, window.currentSortKey) + (aBonus[window.currentSortKey]||0);
if (bVal !== aVal) return bVal - aVal;
return getOVR(b) - getOVR(a);
});

players.forEach(p => {
const ovr = getOVR(p); const posText = POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정'; const b = getBonusStats(p).flat;
const ageVal = Number(p.age) || 13;
const getCell = (key) => {
const base = getStat(p, key); const bonus = b[key]||0;
const isHighlight = window.currentSortKey === key;
return `<td class="py-2 px-0.5 text-center ${isHighlight ? 'bg-slate-800/50' : ''}" onclick="event.stopPropagation()">
<input type="number" min="1" max="99" inputmode="numeric" value="${base}" class="w-11 bg-slate-950/80 border border-slate-600 rounded text-center font-oswald text-sm text-white py-1 focus:border-emerald-400 focus:outline-none" onchange="window.setStat('${p.id}', '${key}', this.value)">
${bonus>0 ? `<div class="text-[9px] text-emerald-400 leading-none mt-0.5">+${bonus}</div>`:''}
</td>`;
};
statsHtml += `<tr class="hover:bg-slate-800/80 transition cursor-pointer" onclick="window.switchTab('tabWorkspace'); window.selectPlayer('${p.id}')"><td class="py-3 pl-4 text-left font-bold text-white flex items-center gap-2 whitespace-nowrap"><span class="inline-flex items-center justify-center align-middle">${getAvatarHtml(p, 'sm')}</span><span>${p.name}</span></td><td class="py-3 text-center whitespace-nowrap"><span class="text-[12px] font-bold text-emerald-400 px-1.5 py-0.5 leading-none">${ageVal}</span></td><td class="py-3 text-center whitespace-nowrap"><span class="text-[10px] font-bold ${getPosColor(p.pos)} border border-slate-600 px-1.5 py-0.5 rounded leading-none">${posText}</span></td><td class="py-3 text-center font-oswald text-base sm:text-lg ${window.currentSortKey==='ovr' ? 'text-white bg-slate-800/50' : 'text-fut-gold'} font-bold">${ovr}</td>${getCell('pac')}${getCell('sho')}${getCell('pas')}${getCell('dri')}${getCell('def')}${getCell('phy')}${getCell('ref')}${getCell('int')}${getCell('pst')}${getCell('dis')}${getCell('cmp')}${getCell('wrk')}</tr>`;
});
statsTbody.innerHTML = statsHtml;
};

export function renderLeaderboard() {
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
if (sorted.length === 0) { listHtml = `<p class="text-sm text-slate-400 text-center py-4 leading-relaxed break-keep">아직 이 부문 기록이 없어요. 경기가 쌓이면 여기에 이름이 올라와요.</p>`; } 
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

export function renderMasterDashboard() {
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
html += `<tr class="hover:bg-slate-800/80 transition cursor-pointer" onclick="window.switchTab('tabWorkspace'); window.selectPlayer('${p.id}')"><td class="py-3 pl-4 text-left font-bold text-white flex items-center gap-2 whitespace-nowrap"><span class="inline-flex items-center justify-center">${getAvatarHtml(p, 'sm')}</span><span>${p.name}</span></td><td class="py-3 text-center whitespace-nowrap"><span class="text-[12px] font-bold text-emerald-400 px-1.5 py-0.5 leading-none">${ageVal}</span></td><td class="py-3 text-center whitespace-nowrap"><span class="text-[10px] font-bold ${getPosColor(p.pos)} border border-slate-600 px-1.5 py-0.5 rounded leading-none">${posText}</span></td><td class="py-3 text-center whitespace-nowrap"><span class="text-[10px] font-bold ${tier.class} border px-1.5 py-0.5 rounded shadow-sm">${tier.name.split(' ')[0]}</span></td><td class="py-3 text-center font-oswald text-base text-fut-gold font-bold">${ovr}</td><td class="py-3 text-center text-slate-300">${Number(p.matches)||0}</td><td class="py-3 text-center text-slate-300">${Number(p.goals)||0}</td><td class="py-3 text-center text-slate-300">${Number(p.assists)||0}</td><td class="py-3 text-center text-slate-300">${Number(p.saves)||0}</td><td class="py-3 text-center text-slate-300">${Number(p.training)||0}</td><td class="py-3 text-center font-oswald text-orange-400 text-sm">${Number(p.exp)||0}</td>${featureOn('bong') ? `<td class="py-3 pr-4 text-right font-oswald text-emerald-400 font-bold text-sm">${Number(p.bong)||0} B</td>` : ''}<td class="py-3 px-2 text-center"><button onclick="event.stopPropagation(); window.deletePlayer('${p.id}', '${p.name}')" class="text-red-400 hover:text-white transition bg-red-900/40 hover:bg-red-600 px-2 py-1 rounded text-[10px] border border-red-800/50"><i class="fa-solid fa-trash"></i> 삭제</button></td></tr>`;
});
tbody.innerHTML = html;
applyFeatureChrome();
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
if (featureOn('bong')) {
if (isAchieved && !isClaimed) {
claimBtnHtml = `<button onclick="window.claimAchievement('${ach.id}')" class="mt-3 w-full min-h-[44px] bg-gradient-to-r from-fut-gold-dark to-fut-gold text-slate-900 font-bold py-2 rounded-lg text-sm">보상 받기</button>`;
} else if (isClaimed) {
claimBtnHtml = `<div class="mt-3 w-full min-h-[44px] bg-slate-800 text-slate-400 font-bold py-2 rounded-lg text-sm flex items-center justify-center">받았어요</div>`;
}
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
if (!featureOn('bong')) return;
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
