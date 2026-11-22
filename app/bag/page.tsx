'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { activeWorldId, loadWorld } from '@/lib/store';
import type { Item, Wallet, World } from '@/lib/types';
import { buyItem, loadWallet, saveWallet } from '@/lib/wallet';

export default function BagPage() {
  const router = useRouter();
  const [world, setWorld] = useState<World | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [tab, setTab] = useState<'bag' | 'shop'>('bag');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const w = loadWorld();
    setWorld(w);
    if (w) setWallet(loadWallet(w.id, w));
    else setWallet(null);
  }, []);

  const items = useMemo(() => world?.items || [], [world]);

  const nameOf = (id: string) => items.find(i => i.id === id)?.name || id.replace(/^x:/, '');

  const owned = Object.entries(wallet?.inventory || {})
    .map(([id, qty]) => ({ id, qty, item: items.find(i => i.id === id) }))
    .sort((a, b) => b.qty - a.qty);

  const shops = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const shop = it.shop?.trim() || '杂货店';
      const list = map.get(shop) || [];
      list.push(it);
      map.set(shop, list);
    }
    return [...map.entries()];
  }, [items]);

  function buy(item: Item) {
    if (!world || !wallet) return;
    const next = buyItem(wallet, item, { turnIndex: 0 });
    if (!next) {
      setMsg(`钱不够，${item.name} 要 ${item.price} 金。`);
      return;
    }
    saveWallet(world.id, next);
    setWallet(next);
    setMsg(`买了 ${item.name}，放进背包了。`);
  }

  return (
    <main className="page">
      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={() => router.push('/')}>返回</button>
          <div className="title">背包与商店</div>
          <div className="right">{wallet ? `${wallet.money} 金 · ${wallet.coins} 币` : ''}</div>
        </div>

        <div className="body">
          <div className="tabs">
            <button className={`tab ${tab === 'bag' ? 'on' : ''}`} onClick={() => setTab('bag')}>背包</button>
            <button className={`tab ${tab === 'shop' ? 'on' : ''}`} onClick={() => setTab('shop')}>商店</button>
          </div>

          {!world && <div className="muted">先载入一个剧本。</div>}

          {world && tab === 'bag' && (
            <>
              {owned.length === 0 && <div className="muted">背包是空的。去商店买，或者在剧情里买。</div>}
              {owned.map(({ id, qty, item }) => (
                <div className="ledger-bar" key={id}>
                  <span>{item?.name || nameOf(id)}</span>
                  <span className="muted">{item?.kind === 'gift' ? '礼物' : item?.kind === 'collect' ? '收藏' : '日常'}</span>
                  <span className="val" style={{ marginLeft: 'auto' }}>× {qty}</span>
                </div>
              ))}
            </>
          )}

          {world && tab === 'shop' && shops.length === 0 && (
            <div className="muted">还没有商品。去「剧本 → 玩法 → 物品与商店」里加，或按「填入日常商品」。</div>
          )}
          {world && tab === 'shop' && shops.map(([shop, list]) => (
            <div key={shop} style={{ marginTop: 18 }}>
              <div className="section-title">{shop}</div>
              {list.map(it => (
                <div className="ledger-bar" key={it.id}>
                  <span>{it.name}</span>
                  <span className="muted">{it.kind === 'gift' ? '礼物' : it.kind === 'collect' ? '收藏' : '日常'}</span>
                  <span className="muted" style={{ marginLeft: 'auto' }}>{it.price} 元</span>
                  <button className="mini" onClick={() => buy(it)} disabled={!wallet || wallet.money < it.price}>
                    买
                  </button>
                </div>
              ))}
            </div>
          ))}

          {msg && <div className="tip" style={{ marginTop: 14 }}>{msg}</div>}
        </div>
      </div>
    </main>
  );
}
