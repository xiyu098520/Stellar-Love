'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { emptyState } from '@/lib/affinity';
import { assistantCount, CHAPTER_SIZE } from '@/lib/chapter';
import { clockText, initClock } from '@/lib/clock';
import { listSaves, loadWorld, newId, putSave } from '@/lib/store';
import type { Save, World } from '@/lib/types';

export default function StoryPage() {
  const router = useRouter();
  const [world, setWorld] = useState<World | null>(null);
  const [save, setSave] = useState<Save | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const w = loadWorld();
    setWorld(w);
    (async () => {
      if (!w) {
        setLoaded(true);
        return;
      }
      const rows = await listSaves();
      setSave(rows.find(s => s.kind === 'main' && s.worldId === w.id) || null);
      setLoaded(true);
    })();
  }, []);

  const start = async () => {
    if (!world) return;
    const now = Date.now();
    const clock = initClock(world);
    const next: Save = {
      id: newId('main'),
      worldId: world.id,
      worldTitle: world.title,
      kind: 'main',
      title: '主线',
      turns: [],
      relations: [],
      state: { ...emptyState(), clock, time: clockText(clock) },
      createdAt: now,
      updatedAt: now,
    };
    await putSave(next);
    router.push(`/play?save=${next.id}`);
  };

  const total = save ? assistantCount(save.turns) : 0;
  const chapters = Math.max(1, Math.ceil(total / CHAPTER_SIZE));

  return (
    <main className="page">
      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={() => router.push('/')}>返回</button>
          <div className="title">主线</div>
          <div className="right">{world ? world.title : ''}</div>
        </div>

        <div className="body">
          {!loaded && <div className="muted">读取中……</div>}

          {loaded && !world && (
            <>
              <div className="muted">还没有剧本。先去剧本里新建或导入。</div>
              <div style={{ marginTop: 16 }}>
                <Link href="/world" className="btn ghost">去剧本</Link>
              </div>
            </>
          )}

          {loaded && world && !save && (
            <>
              <div className="muted">还没有开始主线。</div>
              <div style={{ marginTop: 18 }}>
                <button className="btn" onClick={start}>开始</button>
              </div>
            </>
          )}

          {loaded && world && save && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                <Link href={`/play?save=${save.id}`} className="btn" style={{ textDecoration: 'none' }}>
                  继续
                </Link>
                <span className="muted" style={{ fontSize: 11 }}>
                  {total ? `第 ${chapters} 章 · ${((total - 1) % CHAPTER_SIZE) + 1} / ${CHAPTER_SIZE} 回合` : '还没开场'}
                </span>
                <Link
                  href="/saves"
                  className="mini"
                  style={{ marginLeft: 'auto', textDecoration: 'none' }}
                >
                  存档管理
                </Link>
              </div>

              <div className="section-title">章节</div>
              {Array.from({ length: chapters }, (_, i) => i + 1).map(ch => {
                const done = Math.min(CHAPTER_SIZE, Math.max(0, total - (ch - 1) * CHAPTER_SIZE));
                const running = ch === chapters && done < CHAPTER_SIZE;
                return (
                  <Link
                    key={ch}
                    href={`/play?save=${save.id}&chapter=${ch}&read=1`}
                    className="menu-row"
                  >
                    <span className="k">第 {ch} 章</span>
                    <span className="v">
                      {done} / {CHAPTER_SIZE} 回合{running ? ' · 进行中' : ''}
                    </span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                );
              })}
              {!total && <div className="muted" style={{ fontSize: 12 }}>第一回合还没开始。</div>}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
