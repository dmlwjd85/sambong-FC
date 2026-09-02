/** 이름 기반 시드 (선수마다 색감이 조금씩 달라지게) */
function hashStr(s) {
let h = 2166136261;
const str = String(s || 'sfc');
for (let i = 0; i < str.length; i++) {
h ^= str.charCodeAt(i);
h = Math.imul(h, 16777619);
}
return h >>> 0;
}

/**
 * 축구만화풍 기본 얼굴.
 * 업로드 사진이 없을 때 쓰는 바스트샷 PNG. 얼굴이 프레임 중앙에 오도록 object-position을 맞춥니다.
 * variant: detail | card | locker | xl | md | sm
 */
export function getMangaFaceHtml(p, variant = 'md') {
const isGirl = (p.gender || '') === 'F';
const h = hashStr(p?.name || p?.id || 'sfc');
const base = import.meta.env.BASE_URL || '/';
const src = `${base}faces/${isGirl ? 'sfc-manga-girl.jpg' : 'sfc-manga-boy.jpg'}`;
const hue = (h % 28) - 10;
const sat = 1.02 + (h % 8) * 0.02;
const bright = 0.98 + (h % 6) * 0.015;
const cls = {
detail: 'manga-face manga-face-card',
card: 'manga-face manga-face-card',
locker: 'manga-face manga-face-mini',
xl: 'manga-face manga-face-xl',
md: 'manga-face manga-face-md',
sm: 'manga-face manga-face-sm'
}[variant] || 'manga-face manga-face-md';
const pos = isGirl ? 'manga-face-pos-f' : 'manga-face-pos-m';
return `<span class="${cls}" aria-hidden="true"><img src="${src}" alt="" class="manga-face-img ${pos}" style="filter:hue-rotate(${hue}deg) saturate(${sat}) brightness(${bright})" draggable="false"/></span>`;
}
