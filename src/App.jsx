import { useEffect, useRef } from 'react';
import appShellHtml from './app-shell.html?raw';

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
    el.innerHTML = appShellHtml;
    import('./game/initApp.js');
  }, []);

  return <div ref={hostRef} className="antialiased min-h-screen overflow-x-hidden text-slate-50" />;
}
