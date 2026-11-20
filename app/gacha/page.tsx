'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadWorld } from '@/lib/store';
import type { ExtraStory, Item, Wallet, World } from '@/lib/types';
import { addItem, loadWallet, saveWallet, spendCoins } from '@/lib/wallet';

type Pulled = { kind: 'item' | 'extra'; name: string; desc?: string };

export default function GachaPage() {
  const router = useRouter();
  const [world, setWorld] = useState<World | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [results, setResults] = useState<Pulled[]>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const w = loadWorld();
    setWorld(w);
    if (w) setWallet(loadWallet(w.id, w));
  }, []);

  const gifts = (world?.items || []).filter(i => i.kind === 'gift');
  const specials = world?.specials || [];
  const owned = new Set(wallet?.unlocked || []);
  const left = specials.filter(s => (s.unlock || 'gacha') === 'gacha' && !owned.has(s.id));

  function pickItem(): Item | null {
    if (!gifts.length) return null;
    return gifts[Math.floor(Math.random() * gifts.length)];
  }

  function pull(count: number) {
    if (!world || !wallet) return;
    const cost = count === 10 ? world.tenPullCost ?? 900 : world.pullCost ?? 100;
    const paid = spendCoins(wallet, cost);
    if (!paid) {
      setMsg(`抽卡币不够，还差 ${cost - wallet.coins}。跑剧情每回合会攒 100。`);
      return;
    }
    let next = paid;
    const out: Pulled[] = [];
    const extraPool = specials.filter(s => (s.unlock || 'gacha') === 'gacha' && !(next.unlocked || []).includes(s.id));

    const giveItem = () => {
      const it = pickItem();
      if (!it) return;
      next = addItem(next, it.id, 1);
      out.push({ kind: 'item', name: it.name, desc: '已放进背包' });
    };

    if (count === 10) {
      for (let i = 0; i < 9; i += 1) giveItem();
      const extra = extraPool[0] as ExtraStory | undefined;
      if (extra) {
        next = { ...next, unlocked: [...(next.unlocked || []), extra.id] };
        out.push({ kind: 'extra', name: extra.title || '未命名番外', desc: extra.desc || '已解锁，去人物页看' });
      } else {
        // 番外都抽完了，保底换成一件礼物
        const it = pickItem();
        if (it) {
          next = addItem(next, it.id, 1);
          out.push({ kind: 'item', name: it.name, desc: '番外已收齐，换成礼物' });
        }
      }
    } else {
      giveItem();
    }

    saveWallet(world.id, next);
    setWallet(next);
    setResults(out);
    setMsg(out.length ? `花了 ${cost} 抽卡币。` : '没有可抽的东西，先去剧本里加礼物和番外。');
  }

  return (
    <main className="page">
      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={() => router.push('/')}>返回</button>
          <div className="title">抽卡</div>
          <div className="right">{wallet ? `${wallet.coins} 币` : ''}</div>
        </div>

        <div className="body">
          {!world && <div className="muted">先载入一个剧本。</div>}

          {world && (
            <>
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.9 }}>
                每跑一回合攒 {world.coinPerTurn ?? 100} 抽卡币。单抽 {world.pullCost ?? 100}，十连 {world.tenPullCost ?? 900}，十连保底一个没拥有的番外。
                还剩 {left.length} 个番外没抽到。
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn" onClick={() => pull(1)} disabled={!wallet || wallet.coins < (world.pullCost ?? 100)}>
                  单抽 · {world.pullCost ?? 100}
                </button>
                <button className="btn" onClick={() => pull(10)} disabled={!wallet || wallet.coins < (world.tenPullCost ?? 900)}>
                  十连 · {world.tenPullCost ?? 900}
                </button>
              </div>

              {msg && <div className="tip" style={{ marginTop: 12 }}>{msg}</div>}

              {results.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div className="section-title">这一次</div>
                  {results.map((r, i) => (
                    <div className="ledger-bar" key={i}>
                      <span>{r.kind === 'extra' ? '番外' : '礼物'}</span>
                      <span>{r.name}</span>
                      <span className="muted" style={{ marginLeft: 'auto' }}>{r.desc}</span>
                    </div>
                  ))}
                </div>
              )}

              {!gifts.length && <div className="tip" style={{ marginTop: 14 }}>还没有礼物类物品，先去「剧本 → 玩法」加几件，或按「填入日常商品」。</div>}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
