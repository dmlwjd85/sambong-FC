/** 감독이 숫자 칸에 입력하거나 고르기 칸(포지션 등)을 여는 중이면, 다른 학생 기록이 들어와도 화면을 다시 그리지 않고
 *  입력을 마친 뒤(칸에서 벗어날 때) 한 번 그림. 입력 중인 값이 지워지거나 줄이 움직이는 것을 막음. */
let pendingRender = null;
function isEditingField() {
const a = document.activeElement;
if (!a || !a.closest || !a.closest('#mainUI')) return false;
if (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') return true;
return a.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(a.type);
}
export function renderWhenIdle(render) {
if (!isEditingField()) { pendingRender = null; render(); return; }
const first = !pendingRender;
pendingRender = render;
if (!first) return;
document.activeElement.addEventListener('blur', () => {
// change 이벤트(저장)가 먼저 처리되도록 한 박자 늦게
setTimeout(() => { const r = pendingRender; if (r) renderWhenIdle(r); }, 0);
}, { once: true });
}
