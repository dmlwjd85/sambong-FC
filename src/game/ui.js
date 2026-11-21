/** 알림창·기능 스위치 표시·아바타·축하 효과 */
import confetti from 'canvas-confetti';
import { getMangaFaceHtml, resolveFaceSrc, getDefaultSkinRel } from './mangaFace.js';
import { featureOn } from '../config/features.js';
import { formatSeasonStartLabel } from './seasonDate.js';
import { GENDER_MAP, STAT_BASE, SHOP_ITEMS } from './constants.js';
import { seasonResetSentence } from './utils.js';

export function applyFeatureChrome() {
document.querySelectorAll('[data-feature]').forEach((el) => {
const name = el.getAttribute('data-feature');
el.classList.toggle('feature-hidden', !featureOn(name));
});
if (window.renderBottomNav) window.renderBottomNav(true);
const sentence = seasonResetSentence();
document.querySelectorAll('.season-reset-hint').forEach((el) => { el.textContent = sentence; });
}
window.applyFeatureChrome = applyFeatureChrome;
window.applySeasonChrome = applySeasonChrome;

export function applySeasonChrome() {
const info = window.seasonInfo || {};
const when = formatSeasonStartLabel(info.startedAt);
const sub = document.getElementById('loginSeasonSub');
if (sub) {
sub.textContent = when
? `시즌 2가 ${when}에 시작됐어요. 모두 능력치 ${STAT_BASE}에서 같이 달려 봐요!`
: `시즌 2가 시작됐어요. 모두 능력치 ${STAT_BASE}에서 같이 달려 봐요!`;
}
const badge = document.getElementById('navSeasonBadge');
if (badge) badge.textContent = 'S2';
const master = document.getElementById('seasonMasterStatus');
if (master) {
master.textContent = when
? `시즌 2는 ${when}에 시작됐어요. ${seasonResetSentence()}`
: seasonResetSentence();
}
applyFeatureChrome();
}

const dialogQueue = [];
let dialogBusy = false;

function enqueueDialog(render) {
return new Promise((resolve) => {
dialogQueue.push({ render, resolve });
pumpDialogQueue();
});
}

function pumpDialogQueue() {
if (dialogBusy || !dialogQueue.length) return;
dialogBusy = true;
const job = dialogQueue.shift();
let settled = false;
const done = (value) => {
if (settled) return;
settled = true;
job.resolve(value);
dialogBusy = false;
pumpDialogQueue();
};
let opened = false;
try {
job.render(done);
opened = true;
} catch (e) {
console.error('dialog render', e);
} finally {
if (!opened && !settled) {
settled = true;
dialogBusy = false;
job.resolve(undefined);
pumpDialogQueue();
}
}
}

window.customAlert = (m) => enqueueDialog((done) => {
const d = document.createElement('div');
d.className = 'app-dialog fixed inset-0 z-[6000] flex items-center justify-center bg-black/80 px-4';
d.innerHTML = `<div class="bg-pitch-panel p-6 sm:p-8 rounded-3xl border-2 border-fut-gold max-w-sm w-full text-center space-y-4 shadow-2xl"><h3 class="text-xl font-display text-white">알림</h3><p class="text-base text-slate-100 whitespace-pre-wrap leading-relaxed break-keep">${m}</p><button type="button" class="app-dialog-ok bg-fut-gold text-slate-900 font-bold min-h-[44px] px-8 rounded-xl w-full">확인</button></div>`;
document.body.appendChild(d);
d.querySelector('.app-dialog-ok').addEventListener('click', () => { d.remove(); done(true); });
});

window.customConfirm = (m) => enqueueDialog((done) => {
const d = document.createElement('div');
d.className = 'app-dialog fixed inset-0 z-[6000] flex items-center justify-center bg-black/80 px-4';
d.innerHTML = `<div class="bg-pitch-panel p-6 sm:p-8 rounded-3xl border-2 border-fut-gold max-w-sm w-full text-center space-y-4 shadow-2xl"><h3 class="text-xl font-display text-white">확인</h3><p class="text-base text-slate-100 whitespace-pre-wrap leading-relaxed break-keep">${m}</p><div class="flex gap-3"><button type="button" class="app-dialog-no bg-slate-700 text-white font-bold min-h-[44px] rounded-xl w-full">취소</button><button type="button" class="app-dialog-yes bg-emerald-600 text-white font-bold min-h-[44px] rounded-xl w-full">진행</button></div></div>`;
document.body.appendChild(d);
d.querySelector('.app-dialog-yes').addEventListener('click', () => { d.remove(); done(true); });
d.querySelector('.app-dialog-no').addEventListener('click', () => { d.remove(); done(false); });
});

/** 프로필 얼굴 URL: 업로드 사진 > 장착 얼굴 아이템 > 장착 스킨 > 기본 3종 */
export function getPortraitUrl(p) {
if (p && p.facePhotoUrl && String(p.facePhotoUrl).trim()) return String(p.facePhotoUrl).trim();
const fid = p.equipFace;
if (fid) {
const it = SHOP_ITEMS.find(x => x.id === fid && x.type === 'face' && x.faceImageUrl);
if (it && String(it.faceImageUrl).trim()) return resolveFaceSrc(it.faceImageUrl);
}
const sid = p.equipSkin;
if (sid) {
const it = SHOP_ITEMS.find(x => x.id === sid && x.type === 'skin' && x.faceImageUrl);
if (it && String(it.faceImageUrl).trim()) return resolveFaceSrc(it.faceImageUrl);
}
return resolveFaceSrc(getDefaultSkinRel({ ...p, gender: (p.gender || GENDER_MAP[p.name]) === 'F' ? 'F' : 'M' }));
}

/**
 * 선수 얼굴: 업로드 사진·얼굴 아이템·스킨 > 축구만화 기본 스킨
 * variant: locker | detail | sm | md | xl
 */
export function getAvatarHtml(p, variant) {
const url = getPortraitUrl(p);
const gender = (p.gender || GENDER_MAP[p.name]) === 'F' ? 'F' : 'M';
return getMangaFaceHtml({ ...p, gender }, variant, url);
}


export const triggerConfetti = () => {
const el = document.getElementById('confettiOrigin');
if(el) {
const rect = el.getBoundingClientRect();
const x = (rect.left + rect.width / 2) / window.innerWidth;
const y = (rect.top + rect.height / 2) / window.innerHeight;
confetti({ particleCount: 60, spread: 70, origin: { x, y }, colors: ['#e8c271', '#38ff8e', '#ffffff'], zIndex: 9999, disableForReducedMotion: true });
}
};

export const animateFloatText = (text, colorClass, originId) => {
const el = document.getElementById(originId); if(!el) return;
const floatEl = document.createElement('div'); floatEl.className = `floating-text ${colorClass}`; floatEl.innerText = text;
el.appendChild(floatEl); setTimeout(() => floatEl.remove(), 1200);
};
