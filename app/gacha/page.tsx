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
    <main className="g-main">
      <div className="g-veil" />

      <header className="g-top">
        <button className="g-back" onClick={() => router.push('/')}>返回</button>
        <div className="g-title">
          相遇
          <i>STARLIGHT GACHA</i>
        </div>
        <div className="g-coin">{wallet ? `${wallet.coins} 币` : '—'}</div>
      </header>

      <div className="g-body">
        {!world && <div className="g-empty">先载入一个剧本。</div>}

        {world && (
          <>
            <div className="g-stage">
              <div className="g-card">
                <span className="g-corner">{left.length > 0 ? `${left.length} 未得` : '已收齐'}</span>
                <div className="g-card-body">
                  <div className="g-k">本期卡池</div>
                  <div className="g-name">{world.title || '相遇'}</div>
                  <div className="g-line" />
                  <div className="g-desc">
                    十连保底一个还没拥有的番外。<br />
                    每跑一回合攒 {world.coinPerTurn ?? 100} 抽卡币。
                  </div>
                </div>
              </div>
            </div>

            <div className="g-foot">
              {msg && <div className="g-msg">{msg}</div>}

              {results.length > 0 && (
                <div className="g-results">
                  <div className="g-rhead">这一次</div>
                  <div className="g-grid">
                    {results.map((r, i) => (
                      <div className={`g-mini${r.kind === 'extra' ? ' rare' : ''}`} key={i}>
                        <b>{r.kind === 'extra' ? '番外' : '礼物'}</b>
                        <span>{r.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="g-acts">
                <button
                  className="g-pull"
                  onClick={() => pull(1)}
                  disabled={!wallet || wallet.coins < (world.pullCost ?? 100)}
                >
                  相遇一次
                  <i>{world.pullCost ?? 100} 币</i>
                </button>
                <button
                  className="g-pull ten"
                  onClick={() => pull(10)}
                  disabled={!wallet || wallet.coins < (world.tenPullCost ?? 900)}
                >
                  相遇十次
                  <i>{world.tenPullCost ?? 900} 币</i>
                </button>
              </div>

              {!gifts.length && (
                <div className="g-empty">还没有礼物类物品，先去「剧本 → 玩法」加几件。</div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
