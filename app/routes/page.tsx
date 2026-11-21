'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { emptyState, trustStageOf } from '@/lib/affinity';
import { clockText, initClock } from '@/lib/clock';
import { makeRouteSave } from '@/lib/routes';
import { listSaves, loadWorld, newId, putSave } from '@/lib/store';
import type { Character, Save, World } from '@/lib/types';

const GATE = 30;

export default function RoutesPage() {
  const router = useRouter();
  const [world, setWorld] = useState<World | null>(null);
  const [saves, setSaves] = useState<Save[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      setWorld(loadWorld());
      setSaves(await listSaves());
      setLoaded(true);
    })();
  }, []);

  const main = world
    ? saves.find(s => s.worldId === world.id && s.kind === 'main')
    : undefined;
  const leads = world ? world.characters.filter(c => c.role === 'lead') : [];

  function affinityOf(id: string) {
    return main?.state?.affinity?.[id] ?? 0;
  }

  function routeOf(id: string) {
    return saves.find(s => s.kind === 'route' && s.routeOf === id && s.worldId === world?.id);
  }

  async function enter(c: Character) {
    if (!world || !main) return;
    const existing = routeOf(c.id);
    if (existing) {
      router.push(`/play?save=${existing.id}`);
      return;
    }
    const value = affinityOf(c.id);
    if (value < GATE) return;

    const next = makeRouteSave(world, main, c);
    await putSave(next);
    router.push(`/play?save=${next.id}`);
  }

  return (
    <main className="page">
      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={() => router.push('/')}>返回</button>
          <div className="title">个人线</div>
          <div className="right">{leads.length} 人</div>
        </div>

        <div className="body">
          {!loaded && <div className="muted">读取中……</div>}

          {loaded && !world && <div className="muted">还没有剧本。</div>}

          {loaded && world && !main && (
            <div className="muted">还没有主线。先在「恋歌」里开一份主线，信任到了 30 才能进个人线。</div>
          )}

          {loaded && world && main && (
            <>
              <div className="muted" style={{ fontSize: 11, marginBottom: 12 }}>
                主线信任到 {GATE} 才能进。每一条线各自独立，互不知道；回主线后，这里发生的事不会被提起。
              </div>

              {leads.map(c => {
                const value = affinityOf(c.id);
                const route = routeOf(c.id);
                const open = !!route || value >= GATE;
                return (
                  <div key={c.id} className="save-row">
                    <div className="save-head">
                      <span className="save-title">{c.name}</span>
                      <span className="muted">{trustStageOf(value)}</span>
                      <span className="muted">{value} / 100</span>
                      {route && <span className="muted" style={{ marginLeft: 'auto' }}>已有个人线</span>}
                    </div>
                    <div className="save-actions">
                      <button className="mini" disabled={!open} onClick={() => enter(c)}>
                        {route ? '继续' : open ? '进入' : `主线信任 ${GATE} 解锁`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
