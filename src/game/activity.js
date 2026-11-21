/** 훈련·경기 기록 추가와 되돌리기 */
import { doc, setDoc } from 'firebase/firestore';
import { featureOn } from '../config/features.js';
import { popUndo, revertStatMap } from './activityUndo.js';
import { checkAuthReady, db } from './boot.js';
import { appId, ACTIVITY_DAILY_CAP, ACTIVITY_LABEL } from './constants.js';
import { processExp } from './playerCard.js';
import { tryTrainingStatBump, applyExpLoss } from './stats.js';
import { animateFloatText } from './ui.js';
import { getKstDateStr, playerDisplayName, getTodayActivityCounts } from './utils.js';

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
if(type === 'training') {
expGained = 25;
updates.training = (Number(p.training)||0) + 1;
const bumped = tryTrainingStatBump(p, updates);
if (bumped) {
animateFloatText(`${bumped} +1`, 'text-fut-gold', 'confettiOrigin');
setTimeout(() => window.customAlert(`💪 훈련 효과!\n[${playerDisplayName(p)}]의 ${bumped}이(가) +1 올랐습니다.`), 400);
}
}
if(type === 'goals') { expGained = 20; updates.goals = (Number(p.goals)||0) + 1; if (featureOn('bong')) updates.bong = (Number(p.bong)||0) + 3; }
if(type === 'assists') { expGained = 10; updates.assists = (Number(p.assists)||0) + 1; if (featureOn('bong')) updates.bong = (Number(p.bong)||0) + 1; }
if(type === 'keypass') { expGained = 15; updates.keypass = (Number(p.keypass)||0) + 1; if (featureOn('bong')) updates.bong = (Number(p.bong)||0) + 1; }
if(type === 'saves') { expGained = 15; updates.saves = (Number(p.saves)||0) + 1; if (featureOn('bong')) updates.bong = (Number(p.bong)||0) + 2; }

animateFloatText(`+${expGained} EXP`, 'text-emerald-400', 'confettiOrigin');
await processExp(p, expGained, docRef, updates, type);
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
else if(type === 'goals' && (Number(p.goals) || 0) > 0) { expDeduct += 20; updates.goals = Number(p.goals) - 1; if (featureOn('bong')) updates.bong = Math.max(0, (Number(p.bong)||0) - 3); }
else if(type === 'assists' && (Number(p.assists) || 0) > 0) { expDeduct += 10; updates.assists = Number(p.assists) - 1; if (featureOn('bong')) updates.bong = Math.max(0, (Number(p.bong)||0) - 1); }
else if(type === 'keypass' && (Number(p.keypass) || 0) > 0) { expDeduct += 15; updates.keypass = Number(p.keypass) - 1; if (featureOn('bong')) updates.bong = Math.max(0, (Number(p.bong)||0) - 1); }
else if(type === 'saves' && (Number(p.saves) || 0) > 0) { expDeduct += 15; updates.saves = Number(p.saves) - 1; if (featureOn('bong')) updates.bong = Math.max(0, (Number(p.bong)||0) - 2); }
else return window.customAlert("❌ 차감할 해당 기록이 없습니다.");

if(!await window.customConfirm('방금 기록을 취소할까요? 그때 오른 능력치와 경험치를 되돌리고, 경험치 1이 더 빠져요.')) return;

const today = getKstDateStr();
if (p.activityDay === today) {
const counts = getTodayActivityCounts(p);
if ((counts[type] || 0) > 0) {
counts[type] -= 1;
updates.activityDay = today;
updates.activityCounts = counts;
}
}

const popped = popUndo(p.activityUndo, type);
if (popped.entry) {
Object.assign(updates, revertStatMap(p, popped.entry.stats));
updates.activityUndo = popped.stack;
}
if (!featureOn('bong')) delete updates.bong;
animateFloatText(`-${expDeduct} EXP`, 'text-red-400', 'confettiOrigin');
applyExpLoss(p, expDeduct, updates);
await setDoc(docRef, updates, { merge: true });
} catch (e) { console.error("undoActivity Error:", e); window.customAlert(`서버 에러:\n${e.message}`); }
};
