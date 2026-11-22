'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { emptyState } from '@/lib/affinity';
import { bondOf, knowDays, memoriesOf } from '@/lib/bond';
import { clockText } from '@/lib/clock';
import { makeRouteSave } from '@/lib/routes';
import { listSaves, listVoiceClips, loadWorld, putSave } from '@/lib/store';
import { loadWallet } from '@/lib/wallet';
import type { Character, Save, VoiceClip, Wallet, World } from '@/lib/types';
import { characterRegions } from '@/lib/types';

const GATE = 30;

type Row = {
  c: Character;
  route?: Save;
  value: number;
  bond: ReturnType<typeof bondOf>;
  open: boolean;
};

export default function RoutesPage() {
  const router = useRouter();
  const [world, setWorld] = useState<World | null>(null);
  const [saves, setSaves] = useState<Save[]>([]);
  const [voices, setVoices] = useState<VoiceClip[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [ask, setAsk] = useState<Row | null>(null);

  useEffect(() => {
    (async () => {
      const w = loadWorld();
      setWorld(w);
      setSaves(await listSaves());
      setVoices(await listVoiceClips());
      setWallet(w ? loadWallet(w.id, w) : null);
      setLoaded(true);
    })();
  }, []);

  const main = world
    ? saves.find(s => s.worldId === world.id && s.kind === 'main')
    : undefined;
  const leads = world ? world.characters.filter(c => c.role !== 'npc') : [];
  const known = knowDays(world, main);

  const rows = useMemo<Row[]>(() => {
    if (!world) return [];
    return leads.map(c => {
      const route = saves.find(
        s => s.kind === 'route' && s.routeOf === c.id && s.worldId === world.id,
      );
      const value = main?.state?.affinity?.[c.id] ?? 0;
      const bond = bondOf(
        memoriesOf({ character: c, world, saves, voices, wallet }),
        known,
      );
      return { c, route, value, bond, open: !!route || value >= GATE };
    });
  }, [world, leads, saves, voices, wallet, known, main]);

  const opened = rows.filter(r => r.route);
  const unlocked = rows.filter(r => r.open);
  const lastRoute = useMemo(() => {
    const list = saves
      .filter(s => s.kind === 'route' && s.worldId === world?.id)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return list[0];
  }, [saves, world]);
  const cta =
    rows.find(r => r.route && r.route.id === lastRoute?.id) ||
    rows.find(r => r.open) ||
    null;

  async function enter(c: Character) {
    if (!world || !main) return;
    setAsk(null);
    const existing = saves.find(
      s => s.kind === 'route' && s.routeOf === c.id && s.worldId === world.id,
    );
    if (existing) {
      // 日子接着过：进线时把这条线的钟对齐到主线现在
      const mc = main.state?.clock;
      if (mc) {
        await putSave({
          ...existing,
          state: {
            ...(existing.state || emptyState()),
            clock: mc,
            time: clockText(mc),
          },
        });
      }
      router.push(`/play?save=${existing.id}`);
      return;
    }
    const value = main.state?.affinity?.[c.id] ?? 0;
    if (value < GATE) return;
    const next = makeRouteSave(world, main, c);
    await putSave(next);
    router.push(`/play?save=${next.id}`);
  }

  const pct = leads.length ? Math.round((opened.length / leads.length) * 100) : 0;

  return (
    <main className="story-a">
      <div className="s-bg" />
      <div className="s-beam" />
      <div className="s-veil" />
      <div className="s-grain" />
      <div className="s-watermark">ROUTE</div>

      <nav className="s-nav">
        <button className="s-back" aria-label="返回" onClick={() => router.push('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="s-tt">
          PERSONAL ROUTE<b>个人线</b>
        </div>
        <div className="s-world">{world?.title || ''}</div>
      </nav>

      <div className="s-scroll">
        {!loaded && <div className="muted">读取中……</div>}

        {loaded && !world && <div className="muted">还没有剧本。</div>}

        {loaded && world && !main && (
          <div className="muted">还没有主线。先在「恋歌」里开一份主线，信任到了 30 才能进个人线。</div>
        )}

        {loaded && world && main && (
          <>
            <div className="s-hero">
              <div className="s-eyebrow">ROUTE SELECT</div>
              <div className="s-hero-row">
                <div className="s-num">
                  {opened.length ? String(opened.length).padStart(2, '0') : '00'}
                </div>
                <div className="s-hero-meta">
                  <b>私人时间</b>
                  <span>
                    已开启 {opened.length} / {leads.length} 条
                    {unlocked.length > opened.length ? ' · 有人还在等' : ''}
                  </span>
                  <em>主线里的信任只到这一步，剩下的在这里</em>
                </div>
              </div>
              <div className="s-bar">
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>

            <div className="s-sec">
              <span>个人线</span>
              <i>共 {leads.length} 条</i>
            </div>

            {rows.map((r, i) => (
              <button
                key={r.c.id}
                className={`s-ch${r.route ? ' on' : r.open ? '' : ' lock'}`}
                style={{ '--i': i } as React.CSSProperties}
                disabled={!r.open}
                onClick={() => setAsk(r)}
              >
                <span className="s-ch-no">{String(i + 1).padStart(2, '0')}</span>
                <span className="s-ch-main">
                  <span className="s-ch-t">{r.c.name}</span>
                  <span className="s-ch-meta">
                    {[r.c.identity, characterRegions(r.c).join(' / ')].filter(Boolean).join(' · ')}
                    {r.route
                      ? ` · 上次 ${r.route.state?.time || '——'}${r.route.state?.place ? ` ${r.route.state.place}` : ''}`
                      : ` · 好感 ${r.value} / 100`}
                  </span>
                  <span className="s-dots">
                    {Array.from({ length: 10 }).map((_, k) => (
                      <i
                        key={k}
                        className={k < Math.round(Math.min(r.bond.score, 100) / 10) ? 'on' : ''}
                      />
                    ))}
                  </span>
                </span>
                <span className="s-ch-side">
                  <em className={r.route ? 'done' : r.open ? '' : 'dim'}>
                    {r.route
                      ? `羁绊 · ${r.bond.level}`
                      : r.open
                        ? '可以去了'
                        : `还差 ${GATE - r.value}`}
                  </em>
                  {r.open && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </button>
            ))}
          </>
        )}
      </div>

      <div className="s-foot">
        <button
          className="s-cta"
          disabled={!cta}
          onClick={() => cta && setAsk(cta)}
        >
          {cta
            ? `${cta.route ? '继续' : '去见他'} · ${cta.c.name}`
            : loaded && world && main
              ? '信任还不够'
              : '还没开始'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="s-foot-note">
          信任 {GATE} 解锁 · 日子是同一条，那几天别人不知道细节
        </div>
      </div>

      <div
        className={`mask${ask ? ' on' : ''}`}
        onClick={e => {
          if (e.target === e.currentTarget) setAsk(null);
        }}
      >
        <div className="sheetbox">
          <i>PERSONAL ROUTE</i>
          <h3>{ask?.c.name || ''}</h3>
          <p>
            {ask?.route
              ? '回到他的线上，接着上次的地方往下走。'
              : '现在去见他。这条线里只有你们两个人；别人只知道你忙了几天，不知道细节。'}
          </p>
          <div className="acts">
            <button
              className="primary"
              onClick={() => ask && enter(ask.c)}
            >
              进去
            </button>
            <button onClick={() => setAsk(null)}>再想想</button>
          </div>
        </div>
      </div>
    </main>
  );
}
