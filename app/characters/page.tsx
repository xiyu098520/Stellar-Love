'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadSettings, loadWorld } from '@/lib/store';
import type { Settings, World } from '@/lib/types';

export default function CharactersPage() {
  const router = useRouter();
  const [world, setWorld] = useState<World | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    setWorld(loadWorld());
    setSettings(loadSettings());
  }, []);

  const wall = settings?.wallpaper;
  const list = world?.characters || [];

  return (
    <main className="page">
      <div
        className={`wallpaper${wall ? '' : ' default'}`}
        style={wall ? { backgroundImage: `url(${wall})` } : undefined}
      />
      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={() => router.push('/')}>返回</button>
          <div className="title">人物</div>
          <div className="right">{list.length ? `${list.length} 人` : ''}</div>
        </div>

        <div className="body">
          {!world && <div className="muted">还没有导入剧本。先去设定里导入。</div>}

          {world && (
            <div className="cards">
              {list.map(c => (
                <div className="card" key={c.id}>
                  {c.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="pic" src={c.avatar} alt={c.name} />
                  ) : (
                    <div className="ph">{c.name.slice(0, 1)}</div>
                  )}
                  <div className="name">{c.name}</div>
                  <div className="idn">{c.identity || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
