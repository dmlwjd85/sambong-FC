import { useEffect, useRef } from 'react';
import appShellHtml from './app-shell.html?raw';
import logoSvg from './assets/logo/sambong-fc-logo.svg?raw';

/**
 * 기존 단일 HTML의 <body> 내부 마크업을 주입한 뒤, 동일한 게임 로직(initApp) 모듈을 로드합니다.
 * (점진적으로 컴포넌트 분리 가능)
 */
export default function App() {
  const hostRef = useRef(null);
  const bootOnce = useRef(false);

  useEffect(() => {
    if (bootOnce.current) return;
    const el = hostRef.current;
    if (!el) return;
    bootOnce.current = true;
    // 로고는 글꼴 대신 SVG 그림을 바로 넣어요(아이폰에서도 같은 컬러 로고, 글꼴 깜빡임 없음)
    el.innerHTML = appShellHtml.replace('<!--sambong-fc-logo-->', logoSvg);
    import('./game/initApp.js');
  }, []);

  return <div ref={hostRef} className="antialiased min-h-screen overflow-x-hidden text-slate-50" />;
}
