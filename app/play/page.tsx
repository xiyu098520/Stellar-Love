'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { chat, parseJSON } from '@/lib/llm';
import { buildMessages, worldBlocks } from '@/lib/prompt';
import { applyDelta, emptyState, snapDelta, stageOf } from '@/lib/affinity';
import { activeProfile, getSave, loadSettings, loadWallpaper, loadWorld, putSave } from '@/lib/store';
import type { AffinityEntry, GameState, Save, Segment, Settings, Turn, World } from '@/lib/types';

type Settle = { who?: string; delta?: number; reason?: string; minutes?: number };

type ModelOut = {
  segments?: Segment[];
  choices?: string[];
  time?: string;
  place?: string;
  settle?: Settle | null;
};

/** 把模型申报的结算落成一条日志 */
function applySettle(
  world: World,
  state: GameState,
  settle: Settle | null | undefined,
  raw: string,
  turnIndex: number,
  injected: string[],
): GameState {
  const next: GameState = {
    ...state,
    affinity: { ...state.affinity },
    log: [...state.log],
  };
  const who = (settle?.who || '').trim();
  const delta = snapDelta(settle?.delta ?? 0);
  if (!who || delta === 0) return next;

  const c = world.characters.find(x => x.name === who || x.id === who);
  const id = c?.id || `unknown:${who}`;
  const before = next.affinity[id] ?? 0;
  const after = applyDelta(before, delta);
  next.affinity[id] = after;

  const entry: AffinityEntry = {
    id: `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    characterId: id,
    characterName: c?.name || who,
    delta: after - before,
    reason: (settle?.reason || '').trim() || '（没有写理由）',
    before,
    after,
    stage: stageOf(after),
    at: Date.now(),
    turnIndex,
    time: next.time,
    place: next.place,
    raw,
    injected,
  };
  next.log.push(entry);
  return next;
}

function PlayInner() {
  const router = useRouter();
  const params = useSearchParams();
  const saveId = params.get('save') || '';

  const [save, setSave] = useState<Save | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [wall, setWall] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      setSettings(loadSettings());
      setWorld(loadWorld());
      setWall(loadWallpaper().url);
      const s = await getSave(saveId);
      setSave(s || null);
      if (!s) setErr('找不到这份存档，回大厅重新开始。');
    })();
  }, [saveId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [save?.turns.length, busy]);

  const lastAssistant = [...(save?.turns || [])].reverse().find(t => t.role === 'assistant');
  const choices = lastAssistant?.choices || [];

  const run = useCallback(
    async (nextSave: Save) => {
      if (!world || !settings) return;
      setBusy(true);
      setErr('');
      try {
        const messages = buildMessages(world, nextSave);
        const raw = await chat(activeProfile(settings, 'story'), messages, { json: true, maxTokens: 2400 });
        let out: ModelOut;
        try {
          out = parseJSON<ModelOut>(raw);
        } catch {
          out = { segments: [{ type: 'narration', text: raw }], choices: [] };
        }
        const segments = (out.segments || []).filter(
          s => s && typeof s.text === 'string' && s.text.trim(),
        );
        const turn: Turn = {
          role: 'assistant',
          text: segments.map(s => s.text).join('\n'),
          segments,
          choices: (out.choices || []).slice(0, 4),
          time: out.time,
          place: out.place,
        };

        const base = nextSave.state || emptyState();
        const state: GameState = {
          ...base,
          affinity: { ...base.affinity },
          log: [...base.log],
        };
        if (out.time) state.time = out.time;
        if (out.place) state.place = out.place;
        const settled = applySettle(
          world,
          state,
          out.settle,
          JSON.stringify(out.settle ?? null),
          nextSave.turns.length,
          worldBlocks(world).map(b => b.title),
        );

        const done: Save = {
          ...nextSave,
          turns: [...nextSave.turns, turn],
          state: settled,
          updatedAt: Date.now(),
        };
        await putSave(done);
        setSave(done);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '生成失败');
        await putSave(nextSave);
        setSave(nextSave);
      } finally {
        setBusy(false);
      }
    },
    [world, settings],
  );

  async function begin() {
    if (!save) return;
    await run(save);
  }

  async function send(text: string) {
    if (!save || busy || !text.trim()) return;
    const userTurn: Turn = { role: 'user', text: text.trim() };
    const next: Save = { ...save, turns: [...save.turns, userTurn], updatedAt: Date.now() };
    setSave(next);
    setDraft('');
    await run(next);
  }

  if (!save) {
    return (
      <main className="page">
        <div className="wallpaper default" />
        <div className="sheet">
          <div className="topbar">
            <button className="back" onClick={() => router.push('/')}>返回</button>
            <div className="title">{err ? '出错了' : '读取中'}</div>
          </div>
          <div className="body">
            <div className="muted">{err || '正在打开存档……'}</div>
          </div>
        </div>
      </main>
    );
  }

  const started = save.turns.length > 0;

  return (
    <main className="page">
      <div
        className={`wallpaper${wall ? '' : ' default'}`}
        style={wall ? { backgroundImage: `url(${wall})` } : undefined}
      />

      <div className="sheet">
        <div className="topbar">
          <button className="back" onClick={() => router.push('/')}>返回</button>
          <div className="title">{save.kind === 'main' ? '主线' : '个人线'}</div>
          <Link href="/ledger" className="back" style={{ marginLeft: 'auto', marginRight: 14 }}>结算</Link>
          <div className="right">{save.turns.filter(t => t.role === 'assistant').length} 回合</div>
        </div>

        <div className="reader">
          {!started && (
            <div className="center" style={{ padding: '18vh 0' }}>
              <div className="muted" style={{ marginBottom: 20, letterSpacing: '.2em' }}>
                {world?.title || '剧本'}
              </div>
              <button className="btn" onClick={begin} disabled={busy}>
                {busy ? '正在开场……' : '开始'}
              </button>
              {err && <div className="err">{err}</div>}
            </div>
          )}

          {save.turns.map((t, i) =>
            t.role === 'user' ? (
              <div className="turn" key={i}>
                <div className="you">{t.text}</div>
              </div>
            ) : (
              <div className="turn" key={i}>
                {t.time && (
                  <div className="meta">
                    {t.time}
                    {t.place ? ` · ${t.place}` : ''}
                  </div>
                )}
                {(t.segments || []).map((seg, k) =>
                  seg.type === 'dialogue' ? (
                    <div className="dlg" key={k}>
                      <div className="who">{seg.who}</div>
                      <div className="line">{seg.text}</div>
                    </div>
                  ) : (
                    <p className="narr" key={k}>{seg.text}</p>
                  ),
                )}
              </div>
            ),
          )}

          {busy && <div className="muted">……</div>}
          {err && started && <div className="err">{err}</div>}
          <div ref={bottomRef} />
        </div>
      </div>

      {started && (
        <div className="dock">
          {choices.length > 0 && (
            <div className="choices">
              {choices.map((c, i) => (
                <button key={i} className="choice" disabled={busy} onClick={() => send(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
          <div className="ask">
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') send(draft);
              }}
              placeholder="写一句你想做的……"
              disabled={busy}
            />
            <button onClick={() => send(draft)} disabled={busy}>↑</button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <div className="wallpaper default" />
          <div className="lobby">
            <div className="brand">
              <div className="sub">载入中</div>
            </div>
          </div>
        </main>
      }
    >
      <PlayInner />
    </Suspense>
  );
}
