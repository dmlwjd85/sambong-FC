/** 이름 기반 시드 */
function hashStr(s) {
let h = 2166136261;
const str = String(s || 'sfc');
for (let i = 0; i < str.length; i++) {
h ^= str.charCodeAt(i);
h = Math.imul(h, 16777619);
}
return h >>> 0;
}

/** 기본 스킨 남녀 3종 (증명사진 비율) */
export const DEFAULT_SKINS = {
M: [
{ id: 'skin_m1', file: 'faces/skin-m1.jpg', name: '기본: 그린 스파이크' },
{ id: 'skin_m2', file: 'faces/skin-m2.jpg', name: '기본: 네이비 사이드' },
{ id: 'skin_m3', file: 'faces/skin-m3.jpg', name: '기본: 크림슨 실버' }
],
F: [
{ id: 'skin_f1', file: 'faces/skin-f1.jpg', name: '기본: 퍼플 포니' },
{ id: 'skin_f2', file: 'faces/skin-f2.jpg', name: '기본: 민트 보브' },
{ id: 'skin_f3', file: 'faces/skin-f3.jpg', name: '기본: 코랄 헤드밴드' }
]
};

export function resolveFaceSrc(relOrUrl) {
if (!relOrUrl) return '';
if (/^https?:\/\//i.test(relOrUrl)) return relOrUrl;
const base = import.meta.env.BASE_URL || '/';
return `${base}${String(relOrUrl).replace(/^\//, '')}`;
}

export function getDefaultSkinRel(p) {
const g = (p?.gender || '') === 'F' ? 'F' : 'M';
const list = DEFAULT_SKINS[g];
return list[hashStr(p?.name || p?.id || 'sfc') % list.length].file;
}

/**
 * 축구만화 증명사진 비율 얼굴.
 * variant: locker | detail | sm | md | xl
 */
export function getMangaFaceHtml(p, variant = 'md', src) {
const isGirl = (p.gender || '') === 'F';
const url = src || resolveFaceSrc(getDefaultSkinRel(p));
const cls = {
detail: 'manga-face manga-face-card',
card: 'manga-face manga-face-card',
locker: 'manga-face manga-face-mini',
xl: 'manga-face manga-face-xl',
md: 'manga-face manga-face-md',
sm: 'manga-face manga-face-sm'
}[variant] || 'manga-face manga-face-md';
const pos = isGirl ? 'manga-face-pos-f' : 'manga-face-pos-m';
return `<span class="${cls}" aria-hidden="true"><img src="${url}" alt="" class="manga-face-img ${pos}" loading="lazy" decoding="async" draggable="false"/></span>`;
}
