'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { advance, clockShort, clockText, initClock } from '@/lib/clock';
import { applyDelta, emptyState } from '@/lib/affinity';
import { chat, parseJSON } from '@/lib/llm';
import {
  loadThreads,
  phoneContacts,
  phonePrompt,
  pushAllText,
  saveThreads,
  setPendingPush,
  type PhoneMsg,
  type PhoneThreads,
} from '@/lib/phone';
import type { Character, Item, Save, Settings, Wallet, World } from '@/lib/types';
import { giftItem, loadWallet, saveWallet } from '@/lib/wallet';
import { festivalDaysUntil } from '@/lib/prompt';
import { activeProfile, getSave, latestSaveOf, loadSettings, loadWorld, putSave } from '@/lib/store';

function PhoneInner() {
  const router = useRouter();
  const params = useSearchParams();
  const saveId = params.get('save') || '';

  const [save, setSave] = useState<Save | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [threads, setThreads] = useState<PhoneThreads>({});
  const [active, setActive] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [giftPick, setGiftPick] = useState(false);
  const [gift, setGift] = useState<Item | null>(null);

  useEffect(() => {
    (async () => {
      const w = loadWorld();
      const s = saveId ? await getSave(saveId) : await latestSaveOf(w?.id || '');
      setWorld(w);
      setSettings(loadSettings());
      setSave(s || null);
      if (s) {
        setThreads(loadThreads(s.id));
        setWallet(loadWallet(s.worldId, w));
      }
    })();
  }, [saveId]);

  const contacts: Character[] =
    world && save ? phoneContacts(world, save) : [];
  const person = contacts.find(c => c.id === active);
  const msgs = active ? threads[active] || [] : [];
  const left = contacts.reduce(
    (n, c) => n + (threads[c.id] || []).filter(m => !m.pushed).length,
    0,
  );
  const giftItems = (world?.items || []).filter(
    i => i.kind === 'gift' && (wallet?.inventory[i.id] || 0) > 0,
  );

  async function commit(next: Save, list: PhoneMsg[]) {
    await putSave(next);
    const all = { ...loadThreads(next.id), [active]: list };
    saveThreads(next.id, all);
    setSave(next);
    setThreads(all);
  }

  async function send() {
    if (!save || !world || !settings || !person || busy) return;
    const text = draft.trim();
    const sending = gift;
    if (!text && !sending) return;
    setBusy(true);
    setErr('');
    setDraft('');
    setGiftPick(false);

    const now = Date.now();
    const clock = advance(save.state?.clock || initClock(world), 3);
    const today = clockText(clock).split(' ')[0];
    const dupGift =
      !!sending &&
      !!wallet &&
      wallet.gifts.some(g => g.characterId === person.id && (g.time || '').split(' ')[0] === today);
    const shown = sending
      ? `（送出${sending.name}${dupGift ? '，今天已经送过他东西了' : ''}）${text}`
      : text;
    const mine: PhoneMsg = { id: `${now}`, role: 'me', text: shown, at: now };
    let list = [...msgs, mine];
    const withMine: Save = {
      ...save,
      state: { ...(save.state || emptyState()), clock, time: clockText(clock) },
      updatedAt: now,
    };
    await commit(withMine, list);

    try {
      const profile = activeProfile(settings, 'assistant');
      if (!profile.baseUrl.trim() || !profile.model.trim()) {
        throw new Error('先在「设定 → 接口与预设」里配好助手接口。');
      }
      const recent = list
        .slice(-20)
        .map(m => `${m.role === 'me' ? '她' : person.name}：${m.text}`)
        .join('\n');
      const raw = await chat(
        profile,
        [
          { role: 'system', content: phonePrompt(world, withMine, person, sending?.name) },
          { role: 'user', content: `最近的消息：\n${recent}\n\n她刚发来：${text || '（没有说话，只是把东西递了过来）'}${sending ? `，并送出「${sending.name}」` : ''}` },
        ],
        { json: true, maxTokens: 500 },
      );

      let out: { messages?: string[]; minutes?: number; accepted?: boolean };
      try {
        out = parseJSON<{ messages?: string[]; minutes?: number; accepted?: boolean }>(raw);
      } catch {
        out = { messages: [raw.trim()] };
      }
      const said = (out.messages || [])
        .map(s => String(s).trim())
        .filter(Boolean)
        .slice(0, 3);
      if (!said.length) throw new Error('模型没有回出消息。');

      const spent = Math.max(1, Math.min(30, Number(out.minutes) || 5));
      const replied = said.map((t, i) => ({
        id: `${now}-${i}`,
        role: 'them' as const,
        text: t,
        at: Date.now(),
      }));
      list = [...list, ...replied];
      const clock2 = advance(clock, spent);
      const after: Save = {
        ...withMine,
        state: { ...(withMine.state || emptyState()), clock: clock2, time: clockText(clock2) },
        updatedAt: Date.now(),
      };
      await commit(after, list);

      // 他收下了，东西才真的记到他名下；推辞的话还留在背包里
      if (sending && wallet && out.accepted !== false) {
        const todayKey = clockText(clock2).split(' ')[0];
        const prevToday = wallet.gifts.filter(
          g => g.characterId === person.id && (g.time || '').split(' ')[0] === todayKey,
        ).length;
        const nextWallet = giftItem(wallet, sending, person.id, person.name, {
          time: clockText(clock2),
          line: save.kind === 'route' ? 'route' : 'main',
          saveId: save.id,
        });
        if (nextWallet) {
          saveWallet(save.worldId, nextWallet);
          setWallet(nextWallet);
        }
        // 礼物的好感由程序算：当天第一件日常 +1、礼物 +2、节日或郑重感谢 +3，之后不再加
        if (person.role !== 'npc' && prevToday === 0) {
          const festival = (world.events || []).some(
            e => e.kind === 'festival' && festivalDaysUntil(e.date, clock2) === 0,
          );
          const sincere = /谢谢|感谢|恭喜|生日|辛苦了|抱歉/.test(text);
          const add = festival || sincere ? 3 : sending.kind === 'daily' ? 1 : 2;
          const baseState = after.state || emptyState();
          const before = baseState.affinity?.[person.id] ?? 0;
          const raw = applyDelta(before, add);
          const value = save.kind === 'main' ? Math.min(Math.max(30, before), raw) : raw;
          const upd: Save = {
            ...after,
            state: { ...baseState, affinity: { ...baseState.affinity, [person.id]: value } },
            updatedAt: Date.now(),
          };
          await putSave(upd);
          setSave(upd);
        }
      }
      setGift(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '发送失败');
    } finally {
      setBusy(false);
    }
  }

  function push() {
    if (!save || !left) return;
    const text = pushAllText(save, contacts, threads);
    setPendingPush(save.id, text);
    const all: PhoneThreads = { ...threads };
    for (const c of contacts) {
      all[c.id] = (all[c.id] || []).map(m => ({ ...m, pushed: true }));
    }
    saveThreads(save.id, all);
    setThreads(all);
    router.push(`/play?save=${save.id}&push=1`);
  }

  return (
    <main className="page">
      <div className="sheet">
        <div className="topbar">
          <button
            className="back"
            onClick={() => {
              if (save) router.push(`/play?save=${save.id}`);
              else router.push('/');
            }}
          >
            返回
          </button>
          <div className="title">{person ? person.name : '手机'}</div>
          <div className="right">
            {save?.state?.clock ? clockShort(save.state.clock) : ''}
          </div>
        </div>

        <div className="body">
          {!save && <div className="muted">没有可以挂手机的存档。</div>}

          {save && !person && (
            <>
              {contacts.length === 0 && (
                <div className="muted">主线里还没遇见谁。见过面之后，联系方式才会出现在这里。</div>
              )}
              {contacts.map(c => {
                const row = threads[c.id] || [];
                const last = row[row.length - 1];
                const left = row.filter(m => !m.pushed).length;
                return (
                  <button key={c.id} className="phone-row" onClick={() => setActive(c.id)}>
                    <span className="phone-avatar">{c.name.slice(0, 1)}</span>
                    <span className="phone-who">
                      <span className="phone-name">{c.name}</span>
                      <span className="phone-preview">{last ? last.text : '还没有聊过'}</span>
                    </span>
                    {left > 0 && <span className="phone-dot">{left}</span>}
                  </button>
                );
              })}
            </>
          )}

          {save && person && (
            <>
              <div className="phone-bar">
                <button className="back" onClick={() => { setActive(''); setErr(''); }}>
                  通讯录
                </button>
                <button className="mini push" disabled={!left} onClick={push}>
                  {left ? `推送剧情 · ${left} 条` : '没有要推送的'}
                </button>
              </div>

              <div className="phone-log">
                {msgs.length === 0 && <div className="muted">还没有聊过。</div>}
                {msgs.map(m => (
                  <div key={m.id} className={`bubble ${m.role}`}>
                    {m.text}
                  </div>
                ))}
                {busy && <div className="muted">对方正在输入……</div>}
              </div>

              {err && <div className="err">{err}</div>}

              {gift && (
                <div className="tip" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  将送出：{gift.name}
                  <button className="mini" onClick={() => setGift(null)}>取消</button>
                </div>
              )}
              {giftPick && (
                <div className="ledger-card" style={{ marginBottom: 8 }}>
                  {giftItems.length === 0 && (
                    <div className="muted">背包里没有可以送的礼物。去「背包」买一件有纪念意义的东西。</div>
                  )}
                  {giftItems.map(it => (
                    <button
                      key={it.id}
                      className="phone-row"
                      onClick={() => {
                        setGift(it);
                        setGiftPick(false);
                      }}
                    >
                      <span className="phone-who">
                        <span className="phone-name">{it.name}</span>
                        <span className="phone-preview">还剩 {wallet?.inventory[it.id] || 0} 件</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="phone-input">
                <button
                  className="dock-icon"
                  title="送东西"
                  onClick={() => setGiftPick(v => !v)}
                  disabled={busy}
                >
                  ＋
                </button>
                <input
                  value={draft}
                  placeholder={gift ? `连同${gift.name}一起说点什么` : `给${person.name}发消息`}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') send();
                  }}
                  disabled={busy}
                />
                <button onClick={send} disabled={busy || (!draft.trim() && !gift)}>发送</button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function PhonePage() {
  return (
    <Suspense fallback={null}>
      <PhoneInner />
    </Suspense>
  );
}
