'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { chat, parseJSON } from '@/lib/llm';
import { activeBlocks, buildMessages, buildSummaryMessages, touchHits } from '@/lib/prompt';
import { applyDelta, clampAttr, emptyState, seedState, snapDelta, stageOf } from '@/lib/affinity';
import { advance, clockShort, clockText, clockValue, initClock } from '@/lib/clock';
import { chapterLabel, chapterTurns, numberedTurns } from '@/lib/chapter';
import { makeRouteSave } from '@/lib/routes';
import { appendIncoming, loadThreads } from '@/lib/phone';
import { takePendingPush } from '@/lib/phone';
import {
  activeProfile,
  addVoiceClip,
  delVoiceClip,
  getSave,
  latestSaveOf,
  listSaves,
  listVoiceClips,
  loadSettings,
  loadWallpaper,
  loadWorld,
  newId,
  putSave,
} from '@/lib/store';
import type {
  AffinityEntry,
  Character,
  GameState,
  Save,
  Segment,
  Settings,
  Turn,
  UndoSnapshot,
  VoiceClip,
  World,
} from '@/lib/types';
import type { NumberedTurn } from '@/lib/chapter';
import { applyMoney, earnCoins, loadWallet, saveWallet, addItem } from '@/lib/wallet';

type AttrSettle = { who?: string; name?: string; delta?: number; reason?: string };
type Settle = {
  who?: string;
  delta?: number;
  reason?: string;
  minutes?: number;
  money?: number;
  moneyReason?: string;
  phone?: { who?: string; text?: string }[];
  /** 这一段实际买到、带在身上的东西 */
  bought?: string[];
  attrs?: AttrSettle[];
};

type ModelOut = {
  segments?: Segment[];
  choices?: string[];
  place?: string;
  settle?: Settle | null;
};

const clipKey = (characterId: string, text: string) => `${characterId}\u0000${text}`;

const IconPlay = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M8.5 5.5l9.5 6.5-9.5 6.5z" strokeLinejoin="round" />
  </svg>
);

const IconStop = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="7" y="7" width="10" height="10" rx="1" />
  </svg>
);

const IconBookmark = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4">
    <path d="M7 4h10v16l-5-4-5 4z" strokeLinejoin="round" />
  </svg>
);

const IconClock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
    <circle cx="12" cy="12" r="7.5" />
    <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconUndo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M8 5L4 9l4 4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 9h9a6 6 0 0 1 0 12h-2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** 把模型申报的结算落成一条日志 */
function applySettle(
  world: World,
  state: GameState,
  settle: Settle | null | undefined,
  raw: string,
  turnIndex: number,
  injected: string[],
  isMain: boolean,
): GameState {
  const next: GameState = {
    ...state,
    affinity: { ...state.affinity },
    log: [...state.log],
    attrs: { ...(state.attrs || {}) },
    charAttrs: { ...(state.charAttrs || {}) },
  };

  const push = (entry: Omit<AffinityEntry, 'id' | 'at' | 'turnIndex' | 'time' | 'place' | 'raw' | 'injected'>) => {
    next.log.push({
      ...entry,
      id: `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      at: Date.now(),
      turnIndex,
      time: next.time,
      place: next.place,
      raw,
      injected,
    });
  };

  const who = (settle?.who || '').trim();
  const delta = snapDelta(settle?.delta ?? 0);
  if (who && delta !== 0) {
    const c = world.characters.find(x => x.name === who || x.id === who);
    const id = c?.id || `unknown:${who}`;
    const before = next.affinity[id] ?? 0;
    const raw = applyDelta(before, delta);
    // 主线里好感最多推到 30，再往上的升温留给个人线；已经更高的不回落
    const after = isMain && delta > 0 ? Math.min(Math.max(30, before), raw) : raw;
    next.affinity[id] = after;
    push({
      characterId: id,
      characterName: c?.name || who,
      delta: after - before,
      reason: (settle?.reason || '').trim() || '（没有写理由）',
      before,
      after,
      stage: stageOf(after),
      kind: 'affinity',
    });
  }

  for (const a of settle?.attrs || []) {
    const name = (a.name || '').trim();
    const value = Number(a.delta);
    if (!name || !Number.isFinite(value) || value === 0) continue;
    const target = (a.who || '').trim();
    const reason = (a.reason || '').trim() || '（没有写理由）';

    if (target) {
      const c = world.characters.find(x => x.name === target || x.id === target);
      const def = c?.attrs?.find(d => d.name === name);
      if (!c || !def) continue;
      const before = next.charAttrs?.[c.id]?.[def.id] ?? def.init;
      const after = clampAttr(before + value, def.max);
      if (after === before) continue;
      next.charAttrs![c.id] = { ...(next.charAttrs?.[c.id] || {}), [def.id]: after };
      push({
        characterId: c.id,
        characterName: c.name,
        delta: after - before,
        reason,
        before,
        after,
        stage: stageOf(next.affinity[c.id] ?? 0),
        kind: 'attr',
        attrName: def.name,
      });
    } else {
      const def = (world.attrs || []).find(d => d.name === name);
      if (!def) continue;
      const before = next.attrs?.[def.id] ?? def.init;
      const after = clampAttr(before + value, def.max);
      if (after === before) continue;
      next.attrs![def.id] = after;
      push({
        characterId: '',
        characterName: '你',
        delta: after - before,
        reason,
        before,
        after,
        stage: '',
        kind: 'attr',
        attrName: def.name,
      });
    }
  }

  return next;
}

/** 一条叙述拆成适合逐句显示的短句 */
function splitNarration(text: string): string[] {
  const parts = text
    .split(/(?<=[。！？…])/)
    .map(s => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && p.length < 12) out[out.length - 1] += p;
    else out.push(p);
  }
  return out.length ? out : [text];
}

type Beat = { type: 'dialogue' | 'narration'; who?: string; text: string; tone?: string; ja?: string };

/** 把一回合的分段铺成逐句播放的节拍：台词一句一句，旁白一段一段 */
function beatsOf(segments: Segment[] | undefined): Beat[] {
  const out: Beat[] = [];
  for (const seg of segments || []) {
    if (seg.type === 'dialogue')
      splitNarration(seg.text).forEach(text =>
        out.push({ type: 'dialogue', who: seg.who, text, tone: seg.tone, ja: seg.ja }),
      );
    else if (seg.text.trim()) out.push({ type: 'narration', text: seg.text.trim() });
  }
  return out;
}

function PlayInner() {
  const router = useRouter();
  const params = useSearchParams();
  const saveId = params.get('save') || '';
  const chapterParam = params.get('chapter') || '';
  const readMode = params.get('read') === '1';
  const chapter = chapterParam ? Math.max(1, Number(chapterParam) || 1) : 0;

  const [save, setSave] = useState<Save | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [wall, setWall] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState('');
  const [review, setReview] = useState(false);
  const [clips, setClips] = useState<Record<string, VoiceClip>>({});
  /** 钱包跨存档共用，进页面时读一次，花完再写回 */
  const [money, setMoney] = useState(0);
  /** 主线好感到了 30，这一回合出现邀请 */
  const [invite, setInvite] = useState<Character | null>(null);
  /** 手机里还没推进剧情的条数 */
  const [phoneLeft, setPhoneLeft] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  /** 手机推送只自动跑一次 */
  const pushHandled = useRef(false);
  /** 最后一段正文里已经点开了多少节拍；读到末尾才放选项和输入框 */
  const [seen, setSeen] = useState(9999);

  useEffect(() => {
    (async () => {
      setSettings(loadSettings());
      setWorld(loadWorld());
      setWall(loadWallpaper().url);
      const s = saveId ? await getSave(saveId) : await latestSaveOf(loadWorld()?.id || '');
      setSave(s || null);
      if (s) setMoney(loadWallet(s.worldId, loadWorld()).money);
      if (s) countPhoneLeft(s.id);
      if (!s) setErr('找不到这份存档，回大厅重新开始。');
    })();
  }, [saveId]);

  useEffect(() => {
    listVoiceClips()
      .then(rows => {
        const map: Record<string, VoiceClip> = {};
        rows.forEach(v => {
          map[clipKey(v.characterId, v.text)] = v;
        });
        setClips(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (readMode) {
      window.scrollTo({ top: 0 });
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [save?.turns.length, busy, seen, readMode]);

  const lastAssistant = [...(save?.turns || [])].reverse().find(t => t.role === 'assistant');
  const choices = lastAssistant?.choices || [];
  /** 快到的约定：到点前两小时内提醒 */
  const dueAppt = (() => {
    if (!save?.state?.clock || save.kind !== 'main') return undefined;
    const now = clockValue(save.state.clock);
    return (save.state.appointments || []).find(
      a => !a.done && clockValue(a.clock) - now <= 120,
    );
  })();

  /** 只读回放只看这一章；平时看全部 */
  const entries: NumberedTurn[] = save
    ? chapter
      ? chapterTurns(save.turns, chapter)
      : numberedTurns(save.turns)
    : [];

  const lastIdx = (() => {
    for (let i = entries.length - 1; i >= 0; i--) if (entries[i].turn.role === 'assistant') return i;
    return -1;
  })();
  const lastBeats = lastIdx >= 0 ? beatsOf(entries[lastIdx].turn.segments) : [];
  const reading = lastIdx >= 0 && seen < lastBeats.length;

  const voiceProfile = settings ? activeProfile(settings, 'tts') : null;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<Record<string, string>>({});
  const [speaking, setSpeaking] = useState('');
  const [saving, setSaving] = useState('');

  const charOf = useCallback(
    (name?: string) => {
      const n = (name || '').trim();
      if (!n || !world) return undefined;
      return world.characters.find(c => c.name === n);
    },
    [world],
  );

  async function synth(text: string, who?: string, tone?: string, ja?: string): Promise<string> {
    const p = voiceProfile!;
    const c = charOf(who);
    const voice = c?.voiceId || (c && p.voices?.[c.id]) || p.voiceId || 'alloy';
    const v3 = /v[3-9]/i.test(p.model || '');
    const spoken = p.lang === 'ja' && ja?.trim() ? ja.trim() : text;
    const say = v3 && tone ? `[${tone}] ${spoken}` : spoken;

    let res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        voiceId: voice,
        text: say,
        model: p.model,
        speed: p.speed,
      }),
    });

    // 本地 next dev 没有 Pages Functions，退回直连（OpenAI 兼容的接口）
    if (res.status === 404 && !/elevenlabs/i.test(p.baseUrl)) {
      res = await fetch(`${p.baseUrl.replace(/\/+$/, '')}/audio/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${p.apiKey}`,
        },
        body: JSON.stringify({
          model: p.model || 'tts-1',
          input: say,
          voice,
          speed: p.speed || 1,
          response_format: 'mp3',
        }),
      });
    }

    if (!res.ok) {
      let detail = `语音接口 ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) detail = String(j.error);
      } catch {}
      throw new Error(detail);
    }
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('音频读不出来'));
      reader.readAsDataURL(blob);
    });
  }

  async function play(key: string, text: string, who?: string, tone?: string, ja?: string) {
    const c = charOf(who);
    const clip = c ? clips[clipKey(c.id, text)] : undefined;
    try {
      let url = clip?.audio || cacheRef.current[key];
      if (!url) {
        if (!voiceProfile?.baseUrl) {
          setErr('还没有配语音接口，先去设定里填。');
          return;
        }
        url = await synth(text, who, tone, ja);
        cacheRef.current[key] = url;
      }
      audioRef.current?.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      setSpeaking(key);
      audio.onended = () => setSpeaking('');
      await audio.play();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '语音播放失败');
      setSpeaking('');
    }
  }

  async function toggleFavorite(key: string, c: Character, text: string) {
    if (!save) return;
    const k = clipKey(c.id, text);
    const exist = clips[k];
    if (exist) {
      try {
        await delVoiceClip(exist.id);
      } catch {}
      setClips(prev => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
      return;
    }
    if (!voiceProfile?.baseUrl) {
      setErr('还没有配语音接口，先去设定里填。');
      return;
    }
    setErr('');
    setSaving(key);
    try {
      const audio = cacheRef.current[key] || (await synth(text));
      cacheRef.current[key] = audio;
      const clip: VoiceClip = {
        id: newId('voice'),
        characterId: c.id,
        characterName: c.name,
        worldId: save.worldId,
        text,
        audio,
        createdAt: Date.now(),
      };
      await addVoiceClip(clip);
      setClips(prev => ({ ...prev, [k]: clip }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : '收藏失败');
    } finally {
      setSaving('');
    }
  }

  const renderDlg = (who: string | undefined, text: string, key: string, tone?: string, ja?: string) => {
    const c = charOf(who);
    const clip = c ? clips[clipKey(c.id, text)] : undefined;
    return (
      <div className="dlgbox" key={key}>
        <div className="dlgbox-name">{who}</div>
        {(voiceProfile?.baseUrl || c) && (
          <div className="dlgbox-tools">
            {voiceProfile?.baseUrl && (
              <button
                className={speaking === key ? 'on' : ''}
                title="播放这句"
                onClick={e => {
                  e.stopPropagation();
                  play(key, text, who, tone, ja);
                }}
              >
                {speaking === key ? <IconStop /> : <IconPlay />}
              </button>
            )}
            {c && (
              <button
                className={clip ? 'on' : ''}
                title={clip ? '取消收藏' : '收藏这句'}
                disabled={saving === key}
                onClick={e => {
                  e.stopPropagation();
                  toggleFavorite(key, c, text);
                }}
              >
                <IconBookmark on={!!clip} />
              </button>
            )}
          </div>
        )}
        <div className="dlgbox-line">{text}</div>
      </div>
    );
  };

  const renderNarr = (text: string, key: string) => (
    <div className="dlgbox narr" key={key}>
      <div className="dlgbox-line">{text}</div>
    </div>
  );

  /** 一回合结束就在后台摘一次；摘要只给以后用，不影响这一段正文 */
  const summarizeTurn = useCallback(
    async (done: Save, turnNo: number, turn: Turn, herWords: string) => {
      if (!settings || !world) return;
      const profile = activeProfile(settings, 'assistant');
      if (!profile.baseUrl.trim() || !profile.model.trim()) return;
      try {
        const raw = await chat(profile, buildSummaryMessages(world, done, turn, herWords), {
          maxTokens: 300,
        });
        const text = raw
          .replace(/["“”]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!text) return;
        const latest = await getSave(done.id);
        if (!latest) return;
        const target = latest.turns.filter(t => t.role === 'assistant')[turnNo - 1];
        // 中途撤回或重写过，就对不上，不写
        if (!target || target.text !== turn.text) return;
        const summaries = [
          ...(latest.summaries || []).filter(s => s.turn !== turnNo),
          { turn: turnNo, text: text.slice(0, 120), at: Date.now() },
        ].sort((a, b) => a.turn - b.turn);
        await putSave({ ...latest, summaries });
        setSave(cur => (cur && cur.id === latest.id ? { ...cur, summaries } : cur));
      } catch {
        // 摘要失败就算了，下回合再说
      }
    },
    [settings, world],
  );

  const run = useCallback(
    async (nextSave: Save) => {
      if (!world || !settings) return;
      setBusy(true);
      setErr('');
      // 这一回合开始前的样子，撤回时原样退回去
      const baseTurns =
        nextSave.turns.length && nextSave.turns[nextSave.turns.length - 1].role === 'user'
          ? nextSave.turns.length - 1
          : nextSave.turns.length;
      const undo: UndoSnapshot = {
        turns: baseTurns,
        state: nextSave.state || emptyState(),
        wallet: world ? loadWallet(nextSave.worldId, world) : undefined,
      };
      try {
        const touched = touchHits(world, nextSave);
        const seeded: Save = {
          ...touched,
          state: seedState(world, touched.state || emptyState()),
        };
        const messages = buildMessages(world, seeded, voiceProfile?.lang === 'ja' ? 'ja' : 'zh');
        const storyApi = activeProfile(settings, 'story');
        const parseOut = (s: string): ModelOut | null => {
          try {
            const o = parseJSON<ModelOut>(s);
            if (!o?.segments?.some(x => x && typeof x.text === 'string' && x.text.trim())) return null;
            return o;
          } catch {
            return null;
          }
        };

        let raw = await chat(storyApi, messages, { json: true, maxTokens: 4000 });
        let out = parseOut(raw);
        // 输出坏了就带着原话再要一次，别让这一回合的结算直接丢掉
        if (!out) {
          const retry = await chat(
            storyApi,
            [
              ...messages,
              { role: 'assistant', content: raw.slice(0, 1500) },
              {
                role: 'user',
                content:
                  '上面这条不能用。请严格按前面要求的 JSON 对象重新输出这一回合：要有 segments，旁白用 narration，台词用 dialogue 并带 name；不要解释，不要代码块围栏。',
              },
            ],
            { json: true, maxTokens: 4000 },
          );
          const again = parseOut(retry);
          if (again) {
            out = again;
            raw = retry;
          }
        }

        let segments = (out?.segments || []).filter(
          s => s && typeof s.text === 'string' && s.text.trim(),
        );
        if (!segments.length) segments = [{ type: 'narration', text: raw }];

        const base = seeded.state || emptyState();
        // 钟由程序走：模型只报这一段过了多少分钟
        const spent = out?.settle?.minutes;
        const clock = advance(base.clock || initClock(world), Number(spent ?? 15));
        const state: GameState = {
          ...base,
          affinity: { ...base.affinity },
          log: [...base.log],
          clock,
          time: clockText(clock),
        };
        if (out?.place) state.place = out.place;

        const turn: Turn = {
          role: 'assistant',
          text: segments.map(s => s.text).join('\n'),
          segments,
          choices: (out?.choices || []).slice(0, 4),
          time: state.time,
          place: out?.place,
        };

        const settled = applySettle(
          world,
          state,
          out?.settle,
          JSON.stringify(out?.settle ?? null),
          nextSave.turns.length,
          activeBlocks(world, seeded).map(b => b.title),
          nextSave.kind === 'main',
        );

        const done: Save = {
          ...nextSave,
          turns: [...nextSave.turns, turn],
          state: settled,
          undo,
          updatedAt: Date.now(),
        };
        // 钱和抽卡币：这一回合真的变了才记，每一回合都发抽卡币
        if (world && undo.wallet) {
          let wallet = undo.wallet;
          const amount = Number(out?.settle?.money ?? 0);
          if (Number.isFinite(amount) && amount !== 0) {
            wallet = applyMoney(wallet, amount, {
              reason: (out?.settle?.moneyReason || '').trim() || (amount > 0 ? '收入' : '支出'),
              time: state.time,
              place: state.place,
              turnIndex: nextSave.turns.length,
            });
          }
          wallet = earnCoins(wallet, world.coinPerTurn ?? 100);
          // 剧情里买下的东西，按名字找剧本物品；找不到就按自定义物品记进背包
          for (const name of out?.settle?.bought || []) {
            const clean = String(name || '').trim();
            if (!clean) continue;
            const hit = (world.items || []).find(i => i.name === clean);
            wallet = addItem(wallet, hit ? hit.id : `x:${clean}`, 1);
          }
          saveWallet(world.id, wallet);
          setMoney(wallet.money);
        }
        await putSave(done);
        // 这一回合他有没有在手机里找她
        for (const p of out?.settle?.phone || []) {
          const c = world?.characters.find(x => x.name === p.who && x.name.trim());
          if (c && p.text) appendIncoming(done.id, c.id, p.text);
        }
        countPhoneLeft(done.id);
        // 主线里好感到了 30、他这一回合在场，就问一次要不要去见他
        if (done.kind === 'main' && world && out?.settle?.who) {
          const c = world.characters.find(x => x.role !== 'npc' && x.name === out?.settle?.who);
          const value = c ? done.state?.affinity?.[c.id] ?? 0 : 0;
          if (c && value >= 30) {
            const rows = await listSaves();
            const hasRoute = rows.some(s => s.kind === 'route' && s.routeOf === c.id && s.worldId === world.id);
            const idx = done.turns.filter(t => t.role === 'assistant').length;
            const readyAt = done.state?.inviteAt?.[c.id] ?? 0;
            if (!hasRoute && readyAt <= idx) setInvite(c);
            else setInvite(null);
          }
        }
        setSeen(1);
        setSave(done);
        const last = nextSave.turns[nextSave.turns.length - 1];
        const herWords = last && last.role === 'user' ? last.text : '';
        void summarizeTurn(done, done.turns.filter(t => t.role === 'assistant').length, turn, herWords);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '生成失败');
        const failed: Save = { ...nextSave, undo, updatedAt: Date.now() };
        await putSave(failed);
        setSave(failed);
      } finally {
        setBusy(false);
      }
    },
    [world, settings, summarizeTurn],
  );

  async function begin() {
    if (!save) return;
    await run(save);
  }

  function countPhoneLeft(saveId: string) {
    const threads = loadThreads(saveId);
    const n = Object.values(threads).reduce(
      (sum, list) => sum + (list || []).filter(m => !m.pushed).length,
      0,
    );
    setPhoneLeft(n);
  }

  /** 去见他：从这一刻切出个人线 */
  async function acceptInvite() {
    if (!save || !world || !invite) return;
    const route = makeRouteSave(world, save, invite);
    await putSave(route);
    router.push(`/play?save=${route.id}`);
  }

  /** 改约：扣 1，过两天同一时间再见，写进待办 */
  async function postponeInvite() {
    if (!save || !invite) return;
    const c = invite;
    const base = save.state || emptyState();
    const src = base.clock || initClock(loadWorld() as World);
    const dt = new Date(Date.UTC(src.y, src.m - 1, src.d + 2, 19, 0));
    const clock = { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), min: 19 * 60 };
    const appt = {
      id: newId('ap'),
      characterId: c.id,
      characterName: c.name,
      turnIndex: save.turns.filter(t => t.role === 'assistant').length,
      clock,
      place: base.place,
      note: '上次改约，说好这天再见',
    };
    const next: Save = {
      ...save,
      state: {
        ...base,
        affinity: { ...base.affinity, [c.id]: applyDelta(base.affinity?.[c.id] ?? 0, -1) },
        appointments: [...(base.appointments || []), appt],
      },
      updatedAt: Date.now(),
    };
    await putSave(next);
    setSave(next);
    setInvite(null);
  }

  /** 婉拒：扣 5，十回合后再来问 */
  async function declineInvite() {
    if (!save || !invite) return;
    const c = invite;
    const base = save.state || emptyState();
    const idx = save.turns.filter(t => t.role === 'assistant').length;
    const next: Save = {
      ...save,
      state: {
        ...base,
        affinity: { ...base.affinity, [c.id]: applyDelta(base.affinity?.[c.id] ?? 0, -5) },
        inviteAt: { ...(base.inviteAt || {}), [c.id]: idx + 10 },
      },
      updatedAt: Date.now(),
    };
    await putSave(next);
    setSave(next);
    setInvite(null);
  }

  /** 到点了的约定，直接进他的线 */
  async function goAppointment(apptId: string) {
    if (!save || !world) return;
    const appt = (save.state?.appointments || []).find(a => a.id === apptId && !a.done);
    const c = appt ? world.characters.find(x => x.id === appt.characterId) : undefined;
    if (!appt || !c) return;
    const route = makeRouteSave(world, save, c);
    route.state = {
      ...(route.state || emptyState()),
      clock: appt.clock,
      time: clockText(appt.clock),
      place: appt.place || route.state?.place,
    };
    const base = save.state || emptyState();
    const nextMain: Save = {
      ...save,
      state: {
        ...base,
        appointments: (base.appointments || []).map(a => (a.id === appt.id ? { ...a, done: true } : a)),
      },
      updatedAt: Date.now(),
    };
    await putSave(route);
    await putSave(nextMain);
    router.push(`/play?save=${route.id}`);
  }

  // 从手机按了「推送剧情」回来：把那段聊天当成这一回合她的输入，直接接着写
  useEffect(() => {
    if (!save || !world || !settings || busy || pushHandled.current) return;
    if (params.get('push') !== '1') return;
    pushHandled.current = true;
    const text = takePendingPush(save.id);
    if (!text) {
      router.replace(`/play?save=${save.id}`);
      return;
    }
    const userTurn: Turn = { role: 'user', text };
    const next: Save = { ...save, turns: [...save.turns, userTurn], updatedAt: Date.now() };
    setSave(next);
    router.replace(`/play?save=${save.id}`);
    void run(next);
  }, [save, world, settings, busy, params, run, router]);

  async function send(text: string) {
    if (!save || busy || !text.trim()) return;
    const userTurn: Turn = { role: 'user', text: text.trim() };
    const next: Save = { ...save, turns: [...save.turns, userTurn], updatedAt: Date.now() };
    setSave(next);
    setDraft('');
    await run(next);
  }

  /** 只退一回合：内容、时间、好感、数值、日志一起退回 */
  async function undoLast() {
    if (!save || busy) return;
    const u = save.undo;
    if (!u || save.turns.length <= u.turns) {
      setErr('这一回合还不能撤回。');
      return;
    }
    if (!confirm('撤回上一回合？好感、时间、数值和日志都会退回那之前。')) return;
    audioRef.current?.pause();
    setSpeaking('');
    setErr('');
    const next: Save = {
      ...save,
      turns: save.turns.slice(0, u.turns),
      state: u.state,
      summaries: (save.summaries || []).filter(
        s => s.turn <= save.turns.slice(0, u.turns).filter(t => t.role === 'assistant').length,
      ),
      undo: undefined,
      updatedAt: Date.now(),
    };
    await putSave(next);
    // 撤回一回合，钱、账目、抽卡币一起退回
    if (u.wallet) {
      saveWallet(save.worldId, u.wallet);
      setMoney(u.wallet.money);
    }
    setSeen(9999);
    setSave(next);
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

  /** 个人线回到主线：时间往前走，好感带回去；这段剧情本身留在个人线里 */
  async function exitRoute() {
    if (!save || save.kind !== 'route') return;
    if (!confirm('回主线？这条个人线会留在这里，随时可以回来。回主线后，这里发生的事不会被提起。')) return;
    if (save.parentId) {
      const main = await getSave(save.parentId);
      if (main) {
        const rc = save.state?.clock;
        const mc = main.state?.clock;
        const clock = rc && (!mc || clockValue(rc) > clockValue(mc)) ? rc : mc;
        const rid = save.routeOf;
        const next: Save = {
          ...main,
          state: {
            ...(main.state || emptyState()),
            clock: clock || main.state?.clock,
            time: clock ? clockText(clock) : main.state?.time,
            attrs: save.state?.attrs ?? main.state?.attrs,
            affinity: {
              ...(main.state?.affinity || {}),
              ...(rid && save.state?.affinity?.[rid] !== undefined
                ? { [rid]: save.state.affinity[rid] }
                : {}),
            },
            charAttrs: {
              ...(main.state?.charAttrs || {}),
              ...(rid && save.state?.charAttrs?.[rid]
                ? { [rid]: save.state.charAttrs[rid] }
                : {}),
            },
          },
          updatedAt: Date.now(),
        };
        await putSave(next);
        router.push(`/play?save=${next.id}`);
        return;
      }
    }
    router.push('/story');
  }

  const started = entries.length > 0;
  const routeName =
    save.kind === 'route'
      ? world?.characters.find(c => c.id === save.routeOf)?.name || ''
      : '';

  return (
    <main className="page">
      <div
        className={`wallpaper${wall ? '' : ' default'}`}
        style={wall ? { backgroundImage: `url(${wall})` } : undefined}
      />

      <div className="sheet">
        <div className="topbar">
          <button
            className="back"
            onClick={() => router.push(readMode ? '/story' : save.kind === 'route' ? '/routes' : '/')}
          >
            返回
          </button>
          <div className="title">
            {save.kind === 'main' ? (chapter ? `第${chapter}章` : '主线') : `个人线${routeName ? ` · ${routeName}` : ''}`}
          </div>
          {save.kind === 'route' && !readMode && (
            <button className="back" onClick={exitRoute} style={{ marginLeft: 'auto', marginRight: 14 }}>
              回主线
            </button>
          )}
          {!readMode && (
            <Link
              href={`/phone?save=${save.id}`}
              className="back"
              style={{ marginLeft: save.kind === 'route' ? 0 : 'auto', marginRight: 14 }}
            >
              手机
            </Link>
          )}
          <Link
            href="/ledger"
            className="back"
            style={{ marginLeft: !readMode ? 0 : 'auto', marginRight: 14 }}
          >
            结算
          </Link>
          <div className="right">
            {readMode
              ? '只读回放'
              : `${money} 金 · ${save.state?.clock ? `${clockShort(save.state.clock)} · ` : ''}${
                  entries.filter(e => e.turn.role === 'assistant').length
                } 回合`}
          </div>
        </div>

        <div
          className="reader"
          onClick={() => {
            if (reading) setSeen(s => s + 1);
          }}
        >
          {!started && !readMode && (
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

          {!started && readMode && (
            <div className="center" style={{ padding: '18vh 0' }}>
              <div className="muted">这一章还没有内容。</div>
            </div>
          )}

          {entries.map(({ turn: t, no }, i) =>
            t.role === 'user' ? (
              <div className="turn" key={i}>
                <div className="you">{t.text}</div>
              </div>
            ) : (
              <div className="turn" key={i}>
                {(t.time || (save.kind === 'main' && no)) && (
                  <div className="meta">
                    {save.kind === 'main' && no ? `${chapterLabel(no)} · ` : ''}
                    {t.time}
                    {t.place ? ` · ${t.place}` : ''}
                  </div>
                )}
                {i === lastIdx
                  ? beatsOf(t.segments).map((b, k) =>
                      k < seen ? (
                        <div className={`beat ${b.type}`} key={k}>
                          {b.type === 'dialogue'
                            ? renderDlg(b.who, b.text, `t${i}b${k}`, b.tone, b.ja)
                            : renderNarr(b.text, `t${i}b${k}`)}
                        </div>
                      ) : null,
                    )
                  : (t.segments || []).map((seg, k) =>
                      seg.type === 'dialogue'
                        ? renderDlg(seg.who, seg.text, `t${i}b${k}`, seg.tone, seg.ja)
                        : renderNarr(seg.text, `t${i}b${k}`),
                    )}
              </div>
            ),
          )}

          {busy && <div className="muted">……</div>}
          {reading && <div className="tap-hint">轻点继续</div>}
          {err && started && <div className="err">{err}</div>}
          <div ref={bottomRef} />
        </div>
      </div>

      {started && !reading && !readMode && (
        <div className="dock">
          {phoneLeft > 0 && save && (
            <div className="choices">
              <button className="choice" onClick={() => router.push(`/phone?save=${save.id}`)}>
                手机里有 {phoneLeft} 条 · 去看看
              </button>
            </div>
          )}
          {dueAppt && (
            <div className="choices">
              <button className="choice" onClick={() => goAppointment(dueAppt.id)}>
                今天和{dueAppt.characterName}有约 · 去赴约
              </button>
            </div>
          )}
          {invite && (
            <div className="choices">
              <button className="choice" disabled={busy} onClick={acceptInvite}>
                去见他
              </button>
              <button className="choice" disabled={busy} onClick={postponeInvite}>
                改约 · 过两天
              </button>
              <button className="choice" disabled={busy} onClick={declineInvite}>
                婉拒
              </button>
            </div>
          )}
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
            <button className="dock-icon" onClick={() => setReview(true)} title="剧情回顾">
              <IconClock />
              <span>回顾</span>
            </button>
            <button
              className="dock-icon"
              onClick={undoLast}
              disabled={!save.undo || busy}
              title="撤回上一回合"
            >
              <IconUndo />
              <span>撤回</span>
            </button>
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

      {review && (
        <div className="review-mask">
          <div className="review-panel">
            <div className="topbar">
              <button className="back" onClick={() => setReview(false)}>关闭</button>
              <div className="title">剧情回顾</div>
              <div className="right">{save.turns.filter(t => t.role === 'assistant').length} 回合</div>
            </div>
            <div className="review-body">
              {!save.turns.length && <div className="muted">还没有内容。</div>}
              {save.turns.map((t, i) =>
                t.role === 'user' ? (
                  <div className="review-you" key={i}>你：{t.text}</div>
                ) : (
                  <div className="review-turn" key={i}>
                    <div className="meta">
                      {t.time || ''}
                      {t.place ? ` · ${t.place}` : ''}
                    </div>
                    {(t.segments || []).map((seg, k) =>
                      seg.type === 'dialogue' ? (
                        <div className="review-dlg" key={k}>
                          <span>{seg.who}</span>
                          {seg.text}
                        </div>
                      ) : (
                        <p className="narr" key={k}>{seg.text}</p>
                      ),
                    )}
                  </div>
                ),
              )}
            </div>
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
