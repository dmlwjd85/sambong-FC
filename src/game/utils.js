/** 날짜·글자 이스케이프 같은 작은 도우미 */
import { featureOn } from '../config/features.js';
import { getSafeDocId } from './constants.js';

export function getKstDateStr() {
return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function fontStack(kind) {
const cs = getComputedStyle(document.documentElement);
const key = kind === 'num' ? '--font-num' : kind === 'title' ? '--font-title' : '--font-body';
const raw = (cs.getPropertyValue(key) || '').trim();
if (raw) return raw;
if (kind === 'num') return '"Bebas Neue","Oswald","JJAEM Body",sans-serif';
return '"JJAEM Body","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
}

export function playerDisplayName(p) {
const raw = p && typeof p.name === 'string' ? p.name.trim() : '';
if (raw) return raw;
const id = p && p.id ? String(p.id) : '';
return id.replace(/^player_/, '') || '선수';
}

export function canEditThisPlayer(pId) {
const ps = window.playerState || {};
if (!ps.id || ps.isGuest) return false;
if (ps.isGM) return true;
const mine = String(ps.id);
return String(pId) === mine || getSafeDocId(pId) === mine;
}

export function stripPrivate(data) {
const copy = { ...(data || {}) };
delete copy.pin;
delete copy.officialBet;
delete copy.wcBets;
return copy;
}

export function emptyActivityCounts() {
return { training: 0, matches: 0, goals: 0, assists: 0, keypass: 0, saves: 0 };
}

export function getTodayActivityCounts(p) {
const today = getKstDateStr();
const raw = (p && typeof p.activityCounts === 'object' && !Array.isArray(p.activityCounts)) ? p.activityCounts : {};
if (!p || p.activityDay !== today) return emptyActivityCounts();
const out = emptyActivityCounts();
Object.keys(out).forEach((k) => { out[k] = Number(raw[k]) || 0; });
return out;
}

export function seasonResetSentence() {
const bits = [];
if (featureOn('bong')) bits.push('자산');
if (featureOn('shop')) bits.push('장비');
if (bits.length) return `능력치와 기록, ${bits.join('·')}이 출발점으로 돌아가요. 이름과 얼굴은 그대로예요.`;
return '능력치와 기록이 출발점으로 돌아가요. 이름과 얼굴은 그대로예요.';
}

export const isVisible = (id) => {
const el = document.getElementById(id);
return el && !el.classList.contains('hidden');
};

/** 배열을 제자리에서 섞음 (성장 롤용) */
export function shuffleInPlace(arr) {
for (let i = arr.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
}
return arr;
}

export function getWeekNumber(d) {
d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
let yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
return d.getUTCFullYear() + "-W" + Math.ceil((((d - yearStart) / 86400000) + 1)/7);
}
/** 속성값 이스케이프 (img src 등) */
export function escapeAttr(u) {
return String(u).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
/** 텍스트 노드용 HTML 이스케이프 */
export function escapeHtml(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
