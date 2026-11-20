'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { lastSaveId, loadSettings, loadWorld, newId, putSave } from '@/lib/store';
import type { Save, Settings, World } from '@/lib/types';

const ICONS: Record<string, React.ReactNode> = {
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.2v2.1M12 18.7v2.1M4.8 12H2.7M21.3 12h-2.1M6.9 6.9 5.4 5.4M18.6 18.6l-1.5-1.5M17.1 6.9l1.5-1.5M5.4 18.6l1.5-1.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.4" r="3.4" />
      <path d="M4.8 20c.5-3.6 3.5-5.6 7.2-5.6s6.7 2 7.2 5.6" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.4c-1.7-1.3-4-1.9-6.4-1.9v12.6c2.4 0 4.7.6 6.4 1.9 1.7-1.3 4-1.9 6.4-1.9V4.5c-2.4 0-4.7.6-6.4 1.9Z" />
      <path d="M12 6.4V19" />
    </>
  ),
  play: (
    <>
      <path d="M12 3.6 20.4 12 12 20.4 3.6 12Z" />
      <path d="M12 8.2 15.8 12 12 15.8 8.2 12Z" />
    </>
  ),
  chevron: (
    <>
      <path d="M5 8l5 4-5 4" />
      <path d="M12 8l5 4-5 4" />
    </>
  ),
  branch: (
    <>
      <path d="M6 4v10a3 3 0 0 0 3 3h9" />
      <path d="M6 20V14" />
      <path d="M15 14l3 3-3 3" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3.5c.6 3.6 1.9 5 5.5 5.5-3.6.6-5 1.9-5.5 5.5-.6-3.6-1.9-5-5.5-5.5 3.6-.6 5-1.9 5.5-5.5Z" />
      <path d="M17.6 15.2c.3 1.7.9 2.3 2.6 2.6-1.7.3-2.3.9-2.6 2.6-.3-1.7-.9-2.3-2.6-2.6 1.7-.3 2.3-.9 2.6-2.6Z" />
    </>
  ),
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

export default function Lobby() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
    setWorld(loadWorld());
    setLastId(lastSaveId());
  }, []);

  const wall = settings?.wallpaper;

  // 壁纸同时铺到 html 层，页面之外露出的区域也是壁纸，不是纯黑
  useEffect(() => {
    if (!wall) return;
    document.documentElement.style.setProperty('--wall', `url("${wall}")`);
    return () => {
      document.documentElement.style.removeProperty('--wall');
    };
  }, [wall]);

  async function startMain() {
    if (!world) {
      router.push('/settings');
      return;
    }
    const now = Date.now();
    const save: Save = {
      id: newId('main'),
      worldId: world.id,
      worldTitle: world.title,
      kind: 'main',
      title: '主线',
      turns: [],
      relations: [],
      createdAt: now,
      updatedAt: now,
    };
    await putSave(save);
    router.push(`/play?save=${save.id}`);
  }

  return (
    <>
      <div className={`stage-bg${wall ? '' : ' blank'}`} />
      {wall && <img className="stage-photo" src={wall} alt="" />}

      <main className="stage">
        <div className="hud-title">
        <span className="en">STARSONG</span>
        <span className="cn">恋歌</span>
      </div>

      <button className="hud-corner top-right" onClick={() => router.push('/settings')}>
        <Icon name="gear" />
        <em>设定</em>
      </button>

      <div className="hud-side">
        <button className="off">
          <span className="en">ROUTE</span>
          <span className="cn">个人线</span>
        </button>
        <button className="off">
          <span className="en">SIDE</span>
          <span className="cn">番外</span>
        </button>
        <button onClick={() => router.push('/characters')}>
          <span className="en">ARCHIVE</span>
          <span className="cn">人物</span>
        </button>
      </div>

      <button className="entry-main" onClick={startMain}>
        <span className="en">MAIN · STORY</span>
        <span className="title">恋歌</span>
        <span className="sub">{world ? '第一章 · 相遇之前' : '先导入剧本'}</span>
      </button>

      {lastId && (
        <button className="entry-resume" onClick={() => router.push(`/play?save=${lastId}`)}>
          <Icon name="chevron" />
          <span>继续</span>
        </button>
      )}

      <div className="hud-foot">{world ? world.title : '未载入剧本'} · v0.1.6</div>
      </main>
    </>
  );
}
