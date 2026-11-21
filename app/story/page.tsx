'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { emptyState } from '@/lib/affinity';
import { assistantCount, CHAPTER_SIZE } from '@/lib/chapter';
import { clockText, initClock } from '@/lib/clock';
import { listSaves, loadWorld, newId, putSave } from '@/lib/store';
import type { Save, World } from '@/lib/types';

const Arrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Back = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Chevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const pad = (n: number) => String(n).padStart(2, '0');

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
  const running = total % CHAPTER_SIZE !== 0;

  const assists = save ? save.turns.filter(t => t.role === 'assistant') : [];

  const chapterInfo = (ch: number) => {
    const slice = assists.slice((ch - 1) * CHAPTER_SIZE, ch * CHAPTER_SIZE);
    const times = slice.map(t => t.time).filter(Boolean) as string[];
    const place = slice.find(t => t.place)?.place;
    const range = times.length
      ? times[0] === times[times.length - 1]
        ? times[0]
        : `${times[0]} — ${times[times.length - 1]}`
      : '还没开场';
    return {
      done: Math.min(CHAPTER_SIZE, slice.length),
      range,
      place: place || '',
    };
  };

  const current = chapterInfo(chapters);
  const startLine = world
    ? world.startDate
      ? `${world.startDate} ${world.startTime || ''}`.trim()
      : ''
    : '';

  const resume = () => {
    if (!world) return;
    if (!save) {
      start();
      return;
    }
    router.push(`/play?save=${save.id}`);
  };

  const openChapter = (ch: number) => {
    if (!save) return;
    if (ch === chapters) {
      router.push(`/play?save=${save.id}`);
      return;
    }
    router.push(`/play?save=${save.id}&chapter=${ch}&read=1`);
  };

  return (
    <main className="story-a">
      <div className="s-bg" />
      <div className="s-beam" />
      <div className="s-veil" />
      <div className="s-grain" />
      <div className="s-watermark">STORY</div>

      <nav className="s-nav">
        <button className="s-back" onClick={() => router.push('/')} aria-label="返回">
          <Back />
        </button>
        <div className="s-tt">
          MAIN STORY
          <b>主线</b>
        </div>
        <div className="s-world">{world?.title || ''}</div>
      </nav>

      <div className="s-scroll">
        {loaded && !world && (
          <div className="s-empty">
            <b>还没有剧本</b>
            <span>先去剧本里新建或导入一个，再回来开场。</span>
            <button onClick={() => router.push('/world')}>去剧本</button>
          </div>
        )}

        {loaded && world && (
          <>
            <div className="s-hero">
              <div className="s-eyebrow">CHAPTER SELECT</div>
              <div className="s-hero-row">
                <div className="s-num">{save ? pad(chapters) : '00'}</div>
                <div className="s-hero-meta">
                  <b>{save ? `第 ${chapters} 章` : '序章'}</b>
                  <span>
                    {save
                      ? total
                        ? (
                            <>
                              {current.done} / {CHAPTER_SIZE} 回合 ·{' '}
                              <i>{running ? '进行中' : '已完成'}</i>
                            </>
                          )
                        : '还没有开场'
                      : '还没有开始主线'}
                  </span>
                  <em>{save && total ? current.range : startLine}</em>
                </div>
              </div>
              <div className="s-bar">
                <i style={{ width: `${(current.done / CHAPTER_SIZE) * 100}%` }} />
              </div>
            </div>

            {save && (
              <>
                <div className="s-sec">
                  <span>章节</span>
                  <i>共 {chapters} 章</i>
                </div>

                {Array.from({ length: chapters }, (_, i) => i + 1).map((ch, i) => {
                  const info = chapterInfo(ch);
                  const active = ch === chapters;
                  return (
                    <button
                      key={ch}
                      className={`s-ch${active ? ' on' : ''}`}
                      style={{ ['--i' as string]: i } as React.CSSProperties}
                      onClick={() => openChapter(ch)}
                    >
                      <span className="s-ch-no">{pad(ch)}</span>
                      <span className="s-ch-main">
                        <span className="s-ch-t">第 {ch} 章</span>
                        <span className="s-ch-meta">
                          {[info.place, info.range].filter(Boolean).join(' · ')}
                        </span>
                        <span className="s-dots">
                          {Array.from({ length: CHAPTER_SIZE }, (_, d) => (
                            <i key={d} className={d < info.done ? 'on' : ''} />
                          ))}
                        </span>
                      </span>
                      <span className="s-ch-side">
                        {info.done === CHAPTER_SIZE && (
                          <em className={active ? '' : 'done'}>已完成</em>
                        )}
                        {active && info.done === 0 && <em>未开始</em>}
                        {active && info.done > 0 && info.done < CHAPTER_SIZE && <em>进行中</em>}
                        <Chevron />
                      </span>
                    </button>
                  );
                })}
              </>
            )}

            {save && total === 0 && (
              <div className="s-empty" style={{ paddingTop: 24 }}>
                <span>第一章还没有开始。按下面的按钮，让第一幕亮起来。</span>
              </div>
            )}
          </>
        )}
      </div>

      {loaded && world && (
        <div className="s-foot">
          <button className="s-cta" onClick={resume}>
            {save && total ? '继续演出' : '开始第一章'}
            <Arrow />
          </button>
          <div className="s-foot-note">
            {save && total
              ? `第 ${chapters} 章 · ${current.done} / ${CHAPTER_SIZE} 回合`
              : startLine || '第一幕，从这里开始'}
          </div>
        </div>
      )}
    </main>
  );
}
