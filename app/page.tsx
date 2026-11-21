'use client';

import { useLayoutEffect, useState } from 'react';
import Link from 'next/link';
import { listSaves, loadWallpaper, loadWorld } from '@/lib/store';
import { loadWallet } from '@/lib/wallet';
import { loadThreads } from '@/lib/phone';
import { clockShort, initClock, timeOfDay } from '@/lib/clock';
import type { Save, Wallet, World } from '@/lib/types';

const ICONS: Record<string, React.ReactNode> = {
  person: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-4 3-6.4 7-6.4S19 16 19 20" />
    </>
  ),
  heart: (
    <>
      <path d="M12 20s-7-4.2-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.8-7 9-7 9z" />
    </>
  ),
  book: (
    <>
      <path d="M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4z" />
      <path d="M20 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
    </>
  ),
  save: (
    <>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8 4v6h8V4M8 20v-5h8v5" />
    </>
  ),
  bag: (
    <>
      <path d="M5 9h14l-1 11H6z" />
      <path d="M9 9V7a3 3 0 0 1 6 0v2" />
    </>
  ),
  star: (
    <>
      <path d="M12 3l2.6 5.6L21 10l-4.5 4.2 1 6.3-5.5-3-5.5 3 1-6.3L3 10l6.4-1.4z" />
    </>
  ),
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export default function Lobby() {
  const [world, setWorld] = useState<World | null>(null);
  const [main, setMain] = useState<Save | null>(null);
  const [routes, setRoutes] = useState(0);
  const [unread, setUnread] = useState(0);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const w = loadWorld();
    setWorld(w);
    if (!w) {
      setReady(true);
      return;
    }
    setWallet(loadWallet(w.id, w));
    (async () => {
      const rows = (await listSaves()).filter(s => s.worldId === w.id);
      const m = rows.find(s => s.kind === 'main') || null;
      setMain(m);
      setRoutes(rows.filter(s => s.kind === 'route').length);
      if (m) {
        const threads = loadThreads(m.id);
        setUnread(
          Object.values(threads).reduce(
            (n, list) => n + (list || []).filter(x => x.role === 'them' && !x.pushed).length,
            0,
          ),
        );
      }
      setReady(true);
    })();
  }, []);

  // 壁纸铺在 html 层（fixed），切页回来不会重画、不会闪
  useLayoutEffect(() => {
    const el = document.documentElement;
    const { url } = loadWallpaper();
    if (url) el.style.setProperty('--wall', `url("${url}")`);
    else el.style.removeProperty('--wall');
  }, []);

  const clock = main?.state?.clock || (world ? initClock(world) : null);
  const dateLine = clock
    ? `${clockShort(clock)} · ${timeOfDay(Math.floor(clock.min / 60))}`
    : '';
  const leads = (world?.characters || []).filter(c => c.role !== 'npc').length;
  const specials = (world?.specials || []).length;
  const startHref = '/story';

  return (
    <main className="lobby-a">
      <div className="a-bg" />
      <div className="a-veil" />
      <div className="a-beam" />

      <div className="a-top">
        <div className="a-brand">
          STELLAR
          <i />
          <small>v0.2.60</small>
        </div>
        <div className="a-coin">
          {ready ? (wallet?.money ?? 0).toLocaleString('en-US') : '—'}
          <span>金</span>
        </div>
      </div>

      {world && (
        <div className="a-status">
          <b>{world.title}</b>
          {dateLine || '尚未开场'}
          {main?.state?.place ? <em>{main.state.place}</em> : null}
        </div>
      )}

      <Link href="/world" className="a-title" title="剧本设定">
        {world?.title || '未载入剧本'}
      </Link>

      <nav className="a-rail">
        <Link href="/settings" className="a-entry" prefetch>
          <Icon name="gear" />
          设定
        </Link>
        <Link href="/saves" className="a-entry" prefetch>
          <Icon name="save" />
          存档
        </Link>
        <Link href="/bag" className="a-entry" prefetch>
          <Icon name="bag" />
          背包
        </Link>
      </nav>

      <Link href="/gacha" className="a-gacha" prefetch>
        <Icon name="star" />
        <span>抽卡</span>
        <em>{ready ? (wallet?.coins ?? 0).toLocaleString('en-US') : ''}</em>
      </Link>

      <Link href={startHref} className={`a-start${world ? '' : ' off'}`} prefetch>
        开始放映
      </Link>

      <div className="a-strip">
        <Link href="/people" className="a-card" prefetch>
          <Icon name="person" />
          <span>人物</span>
          <i>{leads ? `${leads} 人` : '未建'}</i>
        </Link>
        <Link href="/routes" className="a-card" prefetch>
          <Icon name="heart" />
          <span>个人线</span>
          <i>{routes ? `${routes} 条` : '未开'}</i>
        </Link>
        <Link href="/people" className="a-card" prefetch>
          <Icon name="book" />
          <span>番外</span>
          <i>{specials ? `${specials} 篇` : '暂无'}</i>
        </Link>
        <Link
          href={main ? `/phone?save=${main.id}` : '/phone'}
          className={`a-card${unread ? ' has' : ''}`}
          prefetch
        >
          <Icon name="phone" />
          <span>手机</span>
          <i>{unread ? `${unread} 条新消息` : '无新消息'}</i>
        </Link>
      </div>
    </main>
  );
}
