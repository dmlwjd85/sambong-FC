/** 감독(GM) 도구: 능력치 수정, 시즌, 출석, 공지, 선수 추가·삭제 */
import { doc, setDoc, getDoc, collection, writeBatch, getDocs, deleteDoc, deleteField } from 'firebase/firestore';
import { featureOn } from '../config/features.js';
import { checkAuthReady, db } from './boot.js';
import { appId, ALLOWED_PLAYERS, getSafeDocId, GENDER_MAP, POS_KR, STAT_BASE, STAT_KEYS } from './constants.js';
import { getStat, getBonusStats, getOVR, getOVRForPos, getWeeklyWage, getExpNeeded, applyLevelStatGrowth } from './stats.js';
import { triggerConfetti, animateFloatText } from './ui.js';
import { canEditThisPlayer, emptyActivityCounts, seasonResetSentence, getWeekNumber, getKstDateStr } from './utils.js';
import { buildAttendanceDates, weekdayKr } from './attendanceDates.js';

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
if (statKey === 'bong' && !featureOn('bong')) return;
const newVal = Math.max(0, parseInt(value) || 0);
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(pId));
await setDoc(docRef, { [statKey]: newVal }, { merge: true });
} catch (e) { console.error("setRecord Error:", e); window.customAlert(`기록 수정 에러:\n${e.message}`); }
};

window.claimWage = async () => {
try {
checkAuthReady();
if (!featureOn('bong')) return;
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
if (type === 'bong' && !featureOn('bong')) return;
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
// 개별 기록으로 레벨이 오를 때(processExp)와 같은 규칙으로 능력치 성장
const levelsGained = currentLv - (Number(p.level) || 1);
for (let i = 0; i < levelsGained; i++) applyLevelStatGrowth(p, updatesObj);
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
if(!await window.customConfirm('모든 학생의 레벨을 1, 경험치를 0으로 되돌릴까요?\n능력치와 기록은 그대로예요.')) return;

const batch = writeBatch(db);
window.allPlayersData.forEach(p => {
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(p.id));
batch.set(docRef, { exp: 0, level: 1 }, { merge: true });
});
await batch.commit(); triggerConfetti(); window.customAlert('모든 학생의 레벨을 1, 경험치를 0으로 되돌렸어요.');
} catch (e) { console.error("resetAll Error:", e); window.customAlert(`초기화 에러:\n${e.message}`); }
};

window.startSeason2 = async () => {
try {
checkAuthReady();
if(!window.playerState.isGM) return;
if(!await window.customConfirm(`시즌 2를 다시 시작할까요?\n\n${seasonResetSentence()}\n이 작업은 되돌릴 수 없어요.`)) return;
if(!await window.customConfirm('정말로 전원 능력치와 기록을 출발점으로 돌릴까요?')) return;

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
activityUndo: [],
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
if (!featureOn('bong')) return;
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

const dateStr = getKstDateStr();
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

const dates = buildAttendanceDates(logs, getKstDateStr());

let modalHtml = `<div class="bg-pitch-panel p-4 sm:p-6 rounded-3xl border-2 border-emerald-500 w-full sm:w-[95vw] max-w-7xl shadow-2xl max-h-[90vh] flex flex-col font-sans text-white relative">
                 <h2 class="text-2xl sm:text-3xl font-display text-center text-emerald-400 mb-2 tracking-widest drop-shadow-lg !break-normal flex items-center justify-center gap-3"><i class="fa-solid fa-calendar-check"></i> 삼봉 풋살클럽 출석부 (2026)</h2>
                 <p class="text-xs text-emerald-200 mb-4 mt-2 text-center">토요스포츠데이 (3~6학년) / 9:20~12:30 / 좌우로 스크롤하여 전체 ${dates.length}주차 일정을 확인하세요!</p>
                 <div class="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 border border-emerald-800/50 rounded-xl bg-slate-900/80">
                     <table class="w-full text-center whitespace-nowrap text-xs border-collapse">
                         <thead>
                             <tr class="bg-slate-800 border-b border-emerald-800 sticky top-0 z-20 shadow-md">
                                 <th rowspan="2" class="p-2 border-r border-slate-700 w-10 sticky left-0 bg-slate-800 z-30">연번</th>
                                 <th rowspan="2" class="p-2 border-r border-slate-700 w-24 sticky left-10 bg-slate-800 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">성명</th>
                                 <th class="p-2 border-r border-slate-700 bg-emerald-900/80 text-emerald-300 w-12 sticky left-[136px] z-30 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">누계</th>
                                 ${(() => { let wk = 0; return dates.map((d) => `<th class="p-1 border-r border-slate-700 font-normal text-[10px] text-slate-400 w-12">${weekdayKr(d) === '토' ? `${++wk}주차` : '추가'}</th>`).join(''); })()}
                             </tr>
                             <tr class="bg-slate-800 border-b border-emerald-800 sticky top-8 z-10 shadow-md">
                                 <th class="p-1 border-r border-slate-700 text-[10px] bg-emerald-900/80 sticky left-[136px] z-30 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">출석</th>
                                 ${dates.map(d => `<th class="p-1 border-r border-slate-700 text-[10px]"><div class="text-emerald-400 font-bold">${d.substring(5).replace('-','/')}</div><div class="text-emerald-500/70 mt-0.5 font-bold">(${weekdayKr(d)})</div></th>`).join('')}
                             </tr>
                         </thead><tbody>`;

ALLOWED_PLAYERS.forEach((name, idx) => {
const safeDocId = getSafeDocId(name); const p = window.allPlayersData.find(x => x.id === safeDocId); const pId = p ? p.id : null; let attCount = 0;
let rowCells = dates.map(targetDate => {
const log = logs.find(l => l.date === targetDate);
if(log && pId && Array.isArray(log.players) && log.players.includes(pId)) { attCount++; return `<td class="p-1 border-r border-b border-slate-700/50"><div class="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500 flex items-center justify-center mx-auto text-[10px] font-bold shadow-[0_0_5px_rgba(56,255,142,0.5)]">O</div></td>`; }
return `<td class="p-1 border-r border-b border-slate-700/50 text-slate-700">-</td>`;
}).join('');

modalHtml += `<tr class="hover:bg-slate-800/60 transition group"><td class="p-2 border-r border-b border-slate-700/50 text-slate-500 sticky left-0 bg-slate-900 group-hover:bg-slate-800">${idx+1}</td><td class="p-2 border-r border-b border-slate-700/50 font-bold text-white tracking-widest sticky left-10 bg-slate-900 group-hover:bg-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">${name}</td><td class="p-2 border-r border-b border-slate-700/50 bg-emerald-900/20 font-bold text-emerald-300 sticky left-[136px] group-hover:bg-emerald-900/40 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">${attCount}</td>${rowCells}</tr>`;
});

modalHtml += `</tbody></table></div><button onclick="this.parentElement.parentElement.remove()" class="mt-6 bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-3 px-6 rounded-xl w-full sm:w-64 mx-auto transition shadow-lg text-lg">닫기</button></div>`;
const modal = document.createElement('div'); modal.className = "app-dialog fixed inset-0 z-[6000] flex items-center justify-center bg-black/90 px-2 sm:px-4 backdrop-blur-sm"; modal.innerHTML = modalHtml; document.body.appendChild(modal);
} catch (e) { console.error("조회 에러:", e); window.customAlert("데이터를 불러오는데 실패했습니다."); }
};

window.changePositionModal = (pId) => {
if (!canEditThisPlayer(pId)) return;
const p = window.allPlayersData.find(x => x.id === pId);
if (!p) return;
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

return `<button type="button" onclick="window.confirmChangePos('${pId}', '${pos.id}')" class="bg-slate-800 hover:bg-emerald-900 border border-slate-600 hover:border-emerald-500 p-3 rounded-xl text-left transition group flex flex-col gap-1 relative overflow-hidden min-h-[44px]">
      <div class="flex justify-between items-center w-full relative z-10 gap-2">
          <div class="font-bold text-lg text-emerald-400 group-hover:text-white">${pos.name}</div>
          <div class="flex flex-col items-end">
              <div class="text-xs text-slate-300 mb-0.5">선택 시 예상 OVR</div>
              <div class="font-oswald text-2xl ${ovrColor} leading-none flex items-center gap-2">${potentialOvr} <span class="text-sm">${diffStr}</span></div>
          </div>
      </div>
      <div class="text-sm text-slate-200 mt-1 relative z-10 leading-relaxed">${pos.desc}</div>
      <div class="text-xs text-red-200 mt-1 bg-red-900/30 w-fit px-1.5 py-0.5 rounded border border-red-800/50">핵심 스탯: ${pos.core} (70% 반영)</div>
  </button>`;
}).join('');

modal.className = 'app-dialog fixed inset-0 z-[6000] flex items-center justify-center bg-black/80 px-4';
modal.innerHTML = `<div class="bg-pitch-bg p-6 rounded-3xl border-2 border-emerald-500 max-w-sm w-full sm:max-w-md shadow-2xl">
  <h3 class="text-xl font-display text-white mb-2 text-center">선호 포지션 변경</h3>
  <p class="text-base text-emerald-200 mb-4 text-center leading-relaxed">포지션마다 핵심 능력치가 달라요. 내가 잘하는 쪽에 맞춰 골라 봐요.</p>
  <div class="bg-slate-900 p-3 rounded-xl mb-4 border border-slate-700 flex justify-between items-center shadow-inner">
      <span class="text-sm text-slate-300 font-bold">현재 내 OVR (${POS_KR[p.pos] ? POS_KR[p.pos].split('(')[0] : '미정'})</span>
      <span class="font-oswald text-2xl text-fut-gold">${currentOvr}</span>
  </div>
  <div class="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">${btns}</div>
  <button type="button" onclick="this.parentElement.parentElement.remove()" class="mt-4 bg-slate-700 hover:bg-slate-600 text-white font-bold min-h-[44px] py-3 px-6 rounded-xl w-full transition shadow-md">닫기</button>
</div>`;
document.body.appendChild(modal); window.posModalInstance = modal;
};

window.confirmChangePos = async (pId, newPos) => {
try {
if (!canEditThisPlayer(pId)) return;
checkAuthReady();
const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', 'player_' + getSafeDocId(pId));
await setDoc(docRef, { pos: newPos }, { merge: true });
if(window.posModalInstance) window.posModalInstance.remove();
window.customAlert(`포지션이 [${POS_KR[newPos]}] (으)로 변경되었습니다.`);
} catch (e) { console.error("posChange Error:", e); window.customAlert(`포지션 변경 에러:\n${e.message}`); }
};

window.sortMasterStats = (key) => { window.currentSortKey = key; window.renderMasterStats(); window.renderMasterDashboard(); };

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
