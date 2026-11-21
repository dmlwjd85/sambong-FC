/** 능력치·OVR·레벨·성장 계산 */
import { featureOn } from '../config/features.js';
import { STAT_NAMES, POS_WEIGHTS, STAT_BASE, STAT_KEYS, ENHANCE_LEVELS, SHOP_ITEMS } from './constants.js';
import { shuffleInPlace } from './utils.js';

export const getStat = (p, key) => {
const n = Number(p?.[key]);
return Number.isFinite(n) && n > 0 ? Math.min(99, n) : STAT_BASE;
};

export const getBonusStats = (p) => {
let flat = { pac: 0, sho: 0, pas: 0, dri: 0, def: 0, phy: 0, ref: 0, int: 0, pst: 0, dis: 0, cmp: 0, wrk: 0 };
let growth = { pac: 0, sho: 0, pas: 0, dri: 0, def: 0, phy: 0, ref: 0, int: 0, pst: 0, dis: 0, cmp: 0, wrk: 0 };
if (!featureOn('shop') || !p) return { flat, growth };

const equippedIds = [p.equipHead, p.equipHandL, p.equipHandR, p.equipFootL, p.equipFootR].filter(Boolean);
equippedIds.forEach(itemId => {
const item = SHOP_ITEMS.find(x => x.id === itemId);
const level = (p.itemLevels && typeof p.itemLevels === 'object' && !Array.isArray(p.itemLevels) && p.itemLevels[itemId]) ? Number(p.itemLevels[itemId]) : 0;
const enhData = ENHANCE_LEVELS[level] || ENHANCE_LEVELS[0];

if (item) {
for (const [key, baseVal] of Object.entries(item.baseStats || {})) { flat[key] += baseVal + enhData.statPlus; }
for (const [key, baseGrow] of Object.entries(item.baseGrowth || {})) {
// 성장%는 반으로 줄이고 스탯당 10%를 넘지 않게 해 인플레이션을 막음
growth[key] += Math.min(10, Math.floor(Number(baseGrow) * enhData.growthMult * 0.5));
}
}
});
return { flat, growth };
};
function currentStatValue(p, key, updatesObj) {
if (updatesObj && Number.isFinite(Number(updatesObj[key]))) return Math.min(99, Number(updatesObj[key]));
return getStat(p, key);
}
/** 레벨업 시 한 스탯이 +1 될 확률(%). 기본 6% + 장비, 높은 스탯은 더 잘 안 오름 */
export function statGrowthChancePct(p, key, bonuses, updatesObj) {
const cur = currentStatValue(p, key, updatesObj);
if (cur >= 99) return 0;
const itemGrow = Math.min(10, Number(bonuses && bonuses.growth ? bonuses.growth[key] : 0) || 0);
const raw = Math.min(16, 6 + itemGrow);
const dim = Math.max(0.18, (90 - cur) / 35);
return raw * dim;
}
/** 레벨 1회분: 포지션 핵심→보조→기타 순으로 굴려 최대 2개만 +1 */
export function applyLevelStatGrowth(p, updatesObj) {
const bonuses = getBonusStats(p);
const w = POS_WEIGHTS[p.pos] || POS_WEIGHTS['미정'];
const core = shuffleInPlace((w.core || []).slice());
const sub = shuffleInPlace((w.sub || []).slice());
const etc = shuffleInPlace(STAT_KEYS.filter((k) => !core.includes(k) && !sub.includes(k)));
const increased = [];
for (const s of [...core, ...sub, ...etc]) {
if (increased.length >= 2) break;
const cur = currentStatValue(p, s, updatesObj);
if (cur >= 99) continue;
if (Math.random() * 100 < statGrowthChancePct(p, s, bonuses, updatesObj)) {
updatesObj[s] = cur + 1;
increased.push(STAT_NAMES[s].split(' ')[0]);
}
}
return increased;
}
/** 개인 훈련: 낮은 확률로 포지션 핵심 스탯 1개 +1 (높은 스탯은 거의 안 오름) */
export function tryTrainingStatBump(p, updatesObj) {
const w = POS_WEIGHTS[p.pos] || POS_WEIGHTS['미정'];
const pool = (w.core && w.core.length) ? w.core.slice() : STAT_KEYS.slice();
shuffleInPlace(pool);
const key = pool[0];
const cur = currentStatValue(p, key, updatesObj);
if (cur >= 82) return null;
const chance = cur >= 72 ? 12 : 26;
if (Math.random() * 100 >= chance) return null;
updatesObj[key] = cur + 1;
return STAT_NAMES[key].split(' ')[0];
}

export const getOVRForPos = (stats, pos) => {
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

export const getOVR = (p) => {
const b = getBonusStats(p).flat;
const stats = {
pac: getStat(p, 'pac')+b.pac, sho: getStat(p, 'sho')+b.sho, pas: getStat(p, 'pas')+b.pas,
dri: getStat(p, 'dri')+b.dri, def: getStat(p, 'def')+b.def, phy: getStat(p, 'phy')+b.phy,
ref: getStat(p, 'ref')+b.ref, int: getStat(p, 'int')+b.int, pst: getStat(p, 'pst')+b.pst,
dis: getStat(p, 'dis')+b.dis, cmp: getStat(p, 'cmp')+b.cmp, wrk: getStat(p, 'wrk')+b.wrk
};
return getOVRForPos(stats, p.pos);
};

export const getTierInfo = (ovr) => {
if(ovr < 65) return { name: '루키 (ROOKIE)', class: 'tier-badge-rookie', cardClass: 'card-rookie' };
if(ovr < 75) return { name: '세미프로 (SEMI-PRO)', class: 'tier-badge-semipro', cardClass: 'card-semipro' };
if(ovr < 85) return { name: '프로 (PRO)', class: 'tier-badge-pro', cardClass: 'card-pro' };
if(ovr < 92) return { name: '월드클래스 (WORLD CLASS)', class: 'tier-badge-worldclass', cardClass: 'card-worldclass' };
return { name: '챌린저 (CHALLENGER)', class: 'tier-badge-challenger', cardClass: 'card-challenger' };
};

export const getWeeklyWage = (ovr) => { return Math.max(40, Math.min(160, Math.floor(40 + ((ovr - 50) / 49) * 120))); };
/** 시즌 2: 레벨당 필요 EXP를 높여 연타 성장 억제 */
export const getExpNeeded = (level) => Math.floor(70 + ((Number(level) || 1) * 8));

/** 기록 취소 등: 차감분만큼 EXP에서 빼고, 부족하면 레벨을 내리며 이전 구간 필요치를 보충함 (processExp와 역연산) */
export function applyExpLoss(p, totalDeduct, updatesObj) {
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

export const getPosColor = (pos) => {
if(pos === 'Pivo') return 'text-red-500'; if(pos === 'Ala') return 'text-emerald-500';
if(pos === 'Fixo') return 'text-blue-500'; if(pos === 'Goleiro') return 'text-orange-500'; 
return 'text-yellow-400 animate-pulse';
};
export const getPosBg = (pos) => {
if(pos === 'Pivo') return 'bg-red-500'; if(pos === 'Ala') return 'bg-emerald-500';
if(pos === 'Fixo') return 'bg-blue-500'; if(pos === 'Goleiro') return 'bg-orange-500'; 
return 'bg-yellow-500';
};
