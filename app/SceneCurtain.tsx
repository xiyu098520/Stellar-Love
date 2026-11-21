'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 切页时的幕布：路由变化瞬间盖住画面，再淡出，避免大厅/章节之间闪白或闪图。
 * 直接改 DOM 的 class，不触发 React 更新，避免和路由内部渲染打架。
 */
export default function SceneCurtain() {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const booted = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    booted.current = false;
    const boot = window.setTimeout(() => {
      booted.current = true;
    }, 400);

    let fallback = 0;
    const show = () => {
      if (!booted.current) return;
      el.classList.add('on');
      if (fallback) window.clearTimeout(fallback);
      fallback = window.setTimeout(() => el.classList.remove('on'), 2200);
    };

    const push = history.pushState;
    const replace = history.replaceState;

    history.pushState = function (...args: Parameters<History['pushState']>) {
      const before = location.href;
      push.apply(history, args);
      if (location.href !== before) show();
    };
    history.replaceState = function (...args: Parameters<History['replaceState']>) {
      const before = location.href;
      replace.apply(history, args);
      if (location.href !== before) show();
    };

    window.addEventListener('popstate', show);

    return () => {
      window.clearTimeout(boot);
      if (fallback) window.clearTimeout(fallback);
      history.pushState = push;
      history.replaceState = replace;
      window.removeEventListener('popstate', show);
      el.classList.remove('on');
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t = window.setTimeout(() => el.classList.remove('on'), 80);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return (
    <div ref={ref} className="scene-curtain" aria-hidden="true">
      <i />
    </div>
  );
}
