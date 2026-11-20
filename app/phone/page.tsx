'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { advance, clockShort, clockText, initClock } from '@/lib/clock';
import { emptyState } from '@/lib/affinity';
import { chat, parseJSON } from '@/lib/llm';
import {
  loadThreads,
  phoneContacts,
  phonePrompt,
  pushText,
  saveThreads,
  setPendingPush,
  type PhoneMsg,
  type PhoneThreads,
} from '@/lib/phone';
import { activeProfile, getSave, latestSaveOf, loadSettings, loadWorld, putSave } from '@/lib/store';
import type { Character, Save, Settings, World } from '@/lib/types';

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

  useEffect(() => {
    (async () => {
      const w = loadWorld();
      const s = saveId ? await getSave(saveId) : await latestSaveOf(w?.id || '');
      setWorld(w);
      setSettings(loadSettings());
      setSave(s || null);
      if (s) setThreads(loadThreads(s.id));
    })();
  }, [saveId]);

  const contacts: Character[] =
    world && save ? phoneContacts(world, save) : [];
  const person = contacts.find(c => c.id === active);
  const msgs = active ? threads[active] || [] : [];
  const unsent = msgs.filter(m => !m.pushed).length;

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
    if (!text) return;
    setBusy(true);
    setErr('');
    setDraft('');

    const now = Date.now();
    const mine: PhoneMsg = { id: `${now}`, role: 'me', text, at: now };
    let list = [...msgs, mine];
    const clock = advance(save.state?.clock || initClock(world), 3);
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
          { role: 'system', content: phonePrompt(world, withMine, person) },
          { role: 'user', content: `最近的消息：\n${recent}\n\n她刚发来：${text}` },
        ],
        { json: true, maxTokens: 500 },
      );

      let out: { messages?: string[]; minutes?: number };
      try {
        out = parseJSON<{ messages?: string[]; minutes?: number }>(raw);
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : '发送失败');
    } finally {
      setBusy(false);
    }
  }

  function push() {
    if (!save || !person || !unsent) return;
    const text = pushText(save, person, msgs);
    setPendingPush(save.id, text);
    const marked = msgs.map(m => ({ ...m, pushed: true }));
    const all = { ...loadThreads(save.id), [active]: marked };
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
                <button className="mini push" disabled={!unsent} onClick={push}>
                  {unsent ? `推送剧情 · ${unsent} 条` : '没有要推送的'}
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

              <div className="phone-input">
                <input
                  value={draft}
                  placeholder={`给${person.name}发消息`}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') send();
                  }}
                  disabled={busy}
                />
                <button onClick={send} disabled={busy || !draft.trim()}>发送</button>
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
