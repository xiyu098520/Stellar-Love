'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { chat, parseJSON } from '@/lib/llm';
import { activeBlocks, buildChapterSummaryMessages, buildMessages, touchHits } from '@/lib/prompt';
import { applyDelta, clampAttr, emptyState, seedState, snapDelta, stageOf, trustStageOf } from '@/lib/affinity';
import { advance, clockShort, clockText, clockValue, initClock } from '@/lib/clock';
import { CHAPTER_SIZE, chapterLabel, chapterNo, chapterTurns, numberedTurns } from '@/lib/chapter';
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
  saveWallpaper,
  loadWorld,
  newId,
  putSave,
  saveSettings,
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

const IconPhone = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
    <rect x="7" y="3" width="10" height="18" rx="2" />
    <path d="M11 18h2" strokeLinecap="round" />
  </svg>
);

const IconReceipt = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" strokeLinejoin="round" />
    <path d="M9 8h6M9 12h6" strokeLinecap="round" />
  </svg>
);

const IconSend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M12 19V5" strokeLinecap="round" />
    <path d="M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconHeart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M12 20s-7-4.2-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.8-7 9-7 9z" strokeLinejoin="round" />
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
    const after = applyDelta(before, delta);
    next.affinity[id] = after;
    push({
      characterId: id,
      characterName: c?.name || who,
      delta: after - before,
      reason: (settle?.reason || '').trim() || '（没有写理由）',
      before,
      after,
      stage: isMain ? trustStageOf(after) : stageOf(after),
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
  const [wallOpen, setWallOpen] = useState(false);
  const [wallBlur, setWallBlur] = useState(2);
  const [wallDim, setWallDim] = useState(45);
  const wallFileRef = useRef<HTMLInputElement>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenNote, setRegenNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState('');
  const draftRef = useRef<HTMLTextAreaElement>(null);

  // 输入框跟着内容长高，最多到 132px，再多就内部滚动
  useEffect(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [draft]);
  const [review, setReview] = useState(false);
  const [clips, setClips] = useState<Record<string, VoiceClip>>({});
  /** 钱包跨存档共用，进页面时读一次，花完再写回 */
  const [money, setMoney] = useState(0);
  /** 主线信任到了 30，这一回合出现邀请 */
  const [invite, setInvite] = useState<Character | null>(null);
  /** 手机里还没推进剧情的条数 */
  const [phoneLeft, setPhoneLeft] = useState(0);
  /** 手机推送只自动跑一次 */
  const pushHandled = useRef(false);
  /** 最后一段正文里已经点开了多少节拍；读到末尾才放选项和输入框 */
  const [seen, setSeen] = useState(9999);
  /** 底部：回复区展开 / 收起 */
  const [dockMode, setDockMode] = useState<'reply' | 'none'>('reply');
  const [todoOpen, setTodoOpen] = useState(false);
  /** 最近点过的选项，＋ 号拿它做叠加 */
  const [picked, setPicked] = useState(-1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notifClosed, setNotifClosed] = useState(false);
  const [phoneNote, setPhoneNote] = useState<{ name: string; count: number } | null>(null);
  /** 主线阅读式布局：随行动要带上的背包物品 */
  const [attach, setAttach] = useState('');
  const [itemOpen, setItemOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const storyEndRef = useRef<HTMLDivElement | null>(null);

  /** 主线阅读式：新内容落下来后贴到底部 */
  useEffect(() => {
    if (!save || save.kind !== 'main') return;
    storyEndRef.current?.scrollIntoView({ block: 'end' });
  }, [save?.turns.length, save?.id, save?.kind, busy]);

  useEffect(() => {
    (async () => {
      setSettings(loadSettings());
      setWorld(loadWorld());
      setWall(loadWallpaper().url);
      const bRaw = localStorage.getItem('stellar_wall_blur');
      const dRaw = localStorage.getItem('stellar_wall_dim');
      if (bRaw !== null) setWallBlur(Number(bRaw) || 0);
      if (dRaw !== null) setWallDim(Number(dRaw) || 0);
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

  /** 触发个人线邀请就弹出来问一次 */
  useEffect(() => {
    if (invite) setInviteOpen(true);
  }, [invite]);

  /** 有新消息时把弹窗重新亮起来 */
  useEffect(() => {
    setNotifClosed(false);
  }, [phoneLeft]);

  useEffect(() => {
    if (readMode) window.scrollTo({ top: 0 });
  }, [readMode]);

  const lastAssistant = [...(save?.turns || [])].reverse().find(t => t.role === 'assistant');
  const choices = lastAssistant?.choices || [];
  /** 最近的一条约定：一直显示，到点前两小时才能点 */
  const apptInfo = (() => {
    if (!save?.state?.clock || save.kind !== 'main') return null;
    const now = clockValue(save.state.clock);
    const list = (save.state.appointments || []).filter(a => !a.done);
    if (!list.length) return null;
    const appt = [...list].sort((a, b) => clockValue(a.clock) - clockValue(b.clock))[0];
    const diff = clockValue(appt.clock) - now;
    return { appt, diff, soon: diff <= 120 };
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

  /** 一章结束（第 10、20…回合）在后台摘一次；摘要在滑出窗口后才用 */
  const summarizeChapter = useCallback(
    async (done: Save, turnNo: number) => {
      if (turnNo % CHAPTER_SIZE !== 0) return;
      if (!settings || !world) return;
      const profile = activeProfile(settings, 'assistant');
      if (!profile.baseUrl.trim() || !profile.model.trim()) return;
      try {
        const ch = chapterNo(turnNo);
        const all = numberedTurns(done.turns);
        const blocks: string[] = [];
        for (let i = 0; i < all.length; i++) {
          const cur = all[i];
          if (cur.turn.role !== 'assistant') continue;
          if (cur.no < (ch - 1) * CHAPTER_SIZE + 1 || cur.no > ch * CHAPTER_SIZE) continue;
          const prev = all[i - 1];
          const her = prev && prev.turn.role === 'user' ? prev.turn.text.trim() : '';
          blocks.push([her ? `她说：${her}` : '', cur.turn.text].filter(Boolean).join('\n'));
        }
        if (!blocks.length) return;
        const raw = await chat(profile, buildChapterSummaryMessages(world, done, ch, blocks), {
          maxTokens: 700,
        });
        const text = raw
          .replace(/["“”]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!text) return;
        const latest = await getSave(done.id);
        if (!latest) return;
        const before = done.turns.filter(t => t.role === 'assistant')[turnNo - 1];
        const target = latest.turns.filter(t => t.role === 'assistant')[turnNo - 1];
        // 中途撤回或重写过，就对不上，不写
        if (!before || !target || target.text !== before.text) return;
        const summaries = [
          ...(latest.summaries || []).filter(s => s.turn !== turnNo),
          { turn: turnNo, text: text.slice(0, 400), at: Date.now() },
        ].sort((a, b) => a.turn - b.turn);
        await putSave({ ...latest, summaries });
        setSave(cur => (cur && cur.id === latest.id ? { ...cur, summaries } : cur));
      } catch {
        // 摘要失败就算了，下一章再说
      }
    },
    [settings, world],
  );

  const run = useCallback(
    async (nextSave: Save, extra?: string) => {
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
        const messages = buildMessages(
          world,
          seeded,
          voiceProfile?.lang === 'ja' ? 'ja' : 'zh',
          seeded.kind === 'route' && seeded.parentId
            ? (await getSave(seeded.parentId)) || undefined
            : undefined,
        );
        if (extra?.trim()) {
          messages[0] = {
            ...messages[0],
            content: `${messages[0].content}\n\n【本次重写要求】${extra.trim()}`,
          };
        }
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
          // 「她刚回来」只交代一回合
          resumed: undefined,
        };
        if (out?.place) state.place = out.place;

        const settleWho = (out?.settle?.who || '').trim();
        const settleChar = settleWho
          ? world.characters.find(x => x.name === settleWho || x.id === settleWho)
          : undefined;
        const turn: Turn = {
          role: 'assistant',
          text: segments.map(s => s.text).join('\n'),
          segments,
          choices: (out?.choices || []).slice(0, 4),
          time: state.time,
          place: out?.place,
          // 记下这一回合在场的是谁，主线记忆好按人分片
          with: nextSave.kind === 'route' ? nextSave.routeOf : settleChar?.id,
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
          checkpoints: [
            ...(nextSave.checkpoints || []),
            {
              at: nextSave.turns.length - 1,
              state: base,
              wallet: undo.wallet || { money: 0, coins: 0, inventory: {}, ledger: [], gifts: [] },
              summaries: nextSave.summaries || [],
            },
          ].slice(-15),
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
        // 主线和个人线共用一条日子：个人线里过的天数也记到主线的钟上
        if (done.kind === 'route' && done.parentId && done.state?.clock) {
          const mainSaved = await getSave(done.parentId);
          if (mainSaved) {
            await putSave({
              ...mainSaved,
              state: {
                ...(mainSaved.state || emptyState()),
                clock: done.state.clock,
                time: done.state.time,
              },
            });
          }
        }
        // 主动手机消息：每 3 回合最多一条；同一个人没回之前最多两条
        const idx = done.turns.filter(t => t.role === 'assistant').length;
        const phoneAt = done.state?.phoneAt ?? -99;
        const cands = (out?.settle?.phone || []).filter(p => p.who && p.text);
        if (cands.length && idx - phoneAt >= 3) {
          for (const p of cands) {
            const c = world?.characters.find(x => x.name === p.who && x.name.trim());
            if (!c || !p.text) continue;
            const waiting = (loadThreads(done.id)[c.id] || []).filter(
              m => m.role === 'them' && !m.pushed,
            ).length;
            if (waiting >= 2) continue;
            appendIncoming(done.id, c.id, p.text);
            done.state = { ...(done.state || emptyState()), phoneAt: idx };
            await putSave(done);
            break;
          }
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
        void summarizeChapter(done, done.turns.filter(t => t.role === 'assistant').length);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '生成失败');
        const failed: Save = { ...nextSave, undo, updatedAt: Date.now() };
        await putSave(failed);
        setSave(failed);
      } finally {
        setBusy(false);
      }
    },
    [world, settings, summarizeChapter],
  );

  async function begin() {
    if (!save) return;
    await run(save);
  }

  function countPhoneLeft(saveId: string) {
    const threads = loadThreads(saveId);
    let n = 0;
    let latest: { at: number; id: string; count: number } | null = null;
    for (const [id, list] of Object.entries(threads)) {
      const waiting = (list || []).filter(m => m.role === 'them' && !m.pushed);
      n += waiting.length;
      if (waiting.length) {
        const at = waiting[waiting.length - 1].at;
        if (!latest || at > latest.at) latest = { at, id, count: waiting.length };
      }
    }
    setPhoneLeft(n);
    const w = world || loadWorld();
    const who = latest ? w?.characters.find(c => c.id === latest!.id) : undefined;
    setPhoneNote(who && latest ? { name: who.name, count: latest.count } : null);
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
    // 个人线撤回，主线的钟也跟着退回去
    if (next.kind === 'route' && next.parentId && u.state?.clock) {
      const mainSaved = await getSave(next.parentId);
      if (mainSaved) {
        await putSave({
          ...mainSaved,
          state: {
            ...(mainSaved.state || emptyState()),
            clock: u.state.clock,
            time: u.state.time,
          },
        });
      }
    }
    if (u.wallet) {
      saveWallet(save.worldId, u.wallet);
      setMoney(u.wallet.money);
    }
    setSeen(9999);
    setSave(next);
  }

  /** 重写这一回合：保留这句输入，只退掉上一条回复和结算，再重新生成 */
  async function regenerate(extra?: string) {
    if (!save || busy) return;
    const u = save.undo;
    const last = save.turns[save.turns.length - 1];
    if (!u || !last || last.role !== 'assistant') {
      setErr('这一回合还不能重写。');
      return;
    }
    audioRef.current?.pause();
    setSpeaking('');
    setErr('');
    const kept = save.turns.slice(0, -1);
    const next: Save = {
      ...save,
      turns: kept,
      state: u.state,
      summaries: (save.summaries || []).filter(
        s => s.turn <= kept.filter(t => t.role === 'assistant').length,
      ),
      undo: undefined,
      updatedAt: Date.now(),
    };
    await putSave(next);
    if (next.kind === 'route' && next.parentId && u.state?.clock) {
      const mainSaved = await getSave(next.parentId);
      if (mainSaved) {
        await putSave({
          ...mainSaved,
          state: {
            ...(mainSaved.state || emptyState()),
            clock: u.state.clock,
            time: u.state.time,
          },
        });
      }
    }
    if (u.wallet) {
      saveWallet(save.worldId, u.wallet);
      setMoney(u.wallet.money);
    }
    setSeen(9999);
    setSave(next);
    await run(next, extra);
  }

  /** 按回合退回：恢复那一回合开始前的状态 */
  async function rollbackTo(at: number) {
    if (!save || busy) return;
    const cp = (save.checkpoints || []).find(c => c.at === at);
    if (!cp) {
      setErr('这一回合太早，退不回去了。');
      return;
    }
    audioRef.current?.pause();
    setSpeaking('');
    const next: Save = {
      ...save,
      turns: save.turns.slice(0, at),
      state: cp.state,
      summaries: cp.summaries,
      checkpoints: (save.checkpoints || []).filter(c => c.at < at),
      undo: undefined,
      updatedAt: Date.now(),
    };
    if (world && cp.wallet) {
      saveWallet(world.id, cp.wallet);
      setMoney(cp.wallet.money);
    }
    await putSave(next);
    setSave(next);
    setSeen(9999);
    setReview(false);
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

  /** 把「私下见过」记到主线：他自己记得，别的男主不知道 */
  async function stampMain(main: Save, route: Save): Promise<Save> {
    const rid = route.routeOf;
    const visits = route.turns.filter(t => t.role === 'assistant').length;
    const lastTime = [...route.turns]
      .reverse()
      .find(t => t.role === 'assistant' && t.time)?.time;
    const met = { ...(main.state?.met || {}) };
    if (rid) {
      met[rid] = {
        visits: (met[rid]?.visits || 0) + visits,
        time: lastTime || met[rid]?.time,
      };
    }
    const next: Save = {
      ...main,
      state: {
        ...(main.state || emptyState()),
        attrs: route.state?.attrs ?? main.state?.attrs,
        // 个人线涨的是羁绊，留在个人线；主线的信任不跟着变
        charAttrs: {
          ...(main.state?.charAttrs || {}),
          ...(rid && route.state?.charAttrs?.[rid]
            ? { [rid]: route.state.charAttrs[rid] }
            : {}),
        },
        met,
        resumed: true,
      },
      updatedAt: Date.now(),
    };
    await putSave(next);
    return next;
  }

  /** 个人线回到主线：日子接着往前走，见面的记录挂在主线上 */
  async function exitRoute() {
    if (!save || save.kind !== 'route') return;
    if (!confirm('回主线？这条个人线会留在这里，随时可以回来。')) return;
    if (save.parentId) {
      const main = await getSave(save.parentId);
      if (main) {
        const next = await stampMain(main, save);
        router.push(`/play?save=${next.id}`);
        return;
      }
    }
    router.push('/story');
  }

  /** 从个人线回列表：同样记一笔，再进别人的线时日子接着走 */
  async function leaveRouteToList() {
    if (!save || save.kind !== 'route') return;
    if (save.parentId) {
      const main = await getSave(save.parentId);
      if (main) await stampMain(main, save);
    }
    router.push('/routes');
  }

  const started = entries.length > 0;
  const routeName =
    save.kind === 'route'
      ? world?.characters.find(c => c.id === save.routeOf)?.name || ''
      : '';

  /* ---------- 只读回放 ---------- */

  if (readMode) {
    return (
      <main className="page a-read">
        <div className="a-rhead">
          <button onClick={() => router.push('/story')}>返回</button>
          <b>{chapter ? `第 ${chapter} 章` : '只读回放'}</b>
          <span>{entries.filter(e => e.turn.role === 'assistant').length} 回合</span>
        </div>
        <div className="a-rbody">
          {!entries.length && <div className="a-rempty">这一章还没有内容。</div>}
          {entries.map(({ turn: t, no }, i) =>
            t.role === 'user' ? (
              <div className="a-ryou" key={i}>你：{t.text}</div>
            ) : (
              <div key={i}>
                {(t.time || no) && (
                  <div className="a-rmeta">
                    {no ? `${chapterLabel(no)} · ` : ''}
                    {t.time || ''}
                    {t.place ? ` · ${t.place}` : ''}
                  </div>
                )}
                {(t.segments || []).map((seg, k) =>
                  seg.type === 'dialogue' ? (
                    <p className="a-rline" key={k}><em>{seg.who}</em>{seg.text}</p>
                  ) : (
                    <p className="a-rline narr" key={k}>{seg.text}</p>
                  ),
                )}
              </div>
            ),
          )}
        </div>
      </main>
    );
  }

  /* ---------- 放映 ---------- */

  const lastEntryNo = lastIdx >= 0 ? entries[lastIdx].no : 0;
  const shown = lastBeats.slice(0, Math.max(0, Math.min(seen, lastBeats.length)));
  const current = shown.length ? shown[shown.length - 1] : null;
  const currentKey = current ? `t${lastIdx}b${shown.length - 1}` : '';
  const currentChar =
    current && current.type === 'dialogue' && current.who ? charOf(current.who) : undefined;
  const currentClip =
    current && currentChar ? clips[clipKey(currentChar.id, current.text)] : undefined;
  const lastUser = [...entries].reverse().find(e => e.turn.role === 'user');
  const userPending =
    lastUser && entries.indexOf(lastUser) > lastIdx ? lastUser.turn.text : '';
  const todos = (save.state?.appointments || []).filter(a => !a.done);
  const todoLabel = apptInfo
    ? `${clockShort(apptInfo.appt.clock)} · ${apptInfo.appt.characterName}`
    : '没有约定';
  const progress =
    lastEntryNo && save.kind === 'main'
      ? ((((lastEntryNo - 1) % CHAPTER_SIZE) + 1) / CHAPTER_SIZE) * 100
      : 0;
  const hasNotif = !!(invite || (phoneNote && phoneLeft > 0));

  /* ---------- 回顾 ---------- */
  const revAssists = save.turns.filter(t => t.role === 'assistant').length;
  const revCh = Math.max(1, Math.floor((Math.max(revAssists, 1) - 1) / CHAPTER_SIZE) + 1);
  const revStart = (revCh - 1) * CHAPTER_SIZE;
  const revTimes = new Map<number, string>();
  {
    let n = 0;
    for (const t of save.turns) {
      if (t.role === 'assistant') {
        n += 1;
        if (t.time) revTimes.set(n, t.time);
      }
    }
  }
  const revSums = (save.summaries || []).slice(-8);
  const revIntro =
    (save.summaries || []).find(s => s.turn === revCh * CHAPTER_SIZE)?.text ||
    (world?.outline || '').split('\n').find(l => l.trim())?.slice(0, 90) ||
    '';
  const revInputs: { i: number; text: string; no: number }[] = [];
  {
    let n = 0;
    save.turns.forEach((t, i) => {
      if (t.role === 'assistant') {
        n += 1;
        return;
      }
      const no = n + 1;
      if (no > revStart && no <= revStart + CHAPTER_SIZE) {
        revInputs.push({ i, text: t.text, no });
      }
    });
  }

  /* ---------- 主线：阅读式 ---------- */

  if (save.kind === 'main') {
    const storyProfiles = (settings?.profiles || []).filter(p => p.kind === 'story');
    const activeStory = storyProfiles.find(p => p.id === settings?.active.story) || storyProfiles[0];
    const bag = itemOpen && world ? loadWallet(save.worldId, world).inventory || {} : {};
    const bagItems = Object.keys(bag)
      .map(id => {
        const it = (world?.items || []).find(x => x.id === id);
        return it ? { ...it, count: bag[id] } : null;
      })
      .filter(Boolean) as { id: string; name: string; count: number }[];
    const onStage = Array.from(
      new Set(
        (entries[entries.length - 1]?.turn.segments || [])
          .map(s => (s.type === 'dialogue' ? s.who || '' : ''))
          .filter(Boolean),
      ),
    );
    const compose = (text: string) => {
      const t = text.trim();
      if (!t) return '';
      return attach ? `${t.replace(/[，,。\s]+$/, '')}（带上${attach}）` : t;
    };

    const playOverlays = (
      <>
        {regenOpen && (
          <div className="a-mask" onClick={() => setRegenOpen(false)}>
            <div className="a-modal" onClick={e => e.stopPropagation()}>
              <div className="k">REGENERATE</div>
              <div className="t">重写这一回合</div>
              <div className="d">保留你刚才那句，只重写上一条。可以补一句要求。</div>
              <div className="a-quote">{lastUser?.turn.text || '（没有找到上一句）'}</div>
              <textarea
                className="a-note"
                value={regenNote}
                onChange={e => setRegenNote(e.target.value)}
                placeholder="比如：不要写成她主动；让白厄在这里出现；气氛再冷一点"
              />
              <div className="a-acts">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    const n = regenNote;
                    setRegenOpen(false);
                    void regenerate(n);
                  }}
                >
                  开始重写
                </button>
                <button className="quiet" onClick={() => setRegenOpen(false)}>
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {wallOpen && (
          <section className="m-wall">
            <div className="m-wall-top">
              <button onClick={() => setWallOpen(false)}>返回</button>
              <div className="t">封面设置</div>
            </div>
            <div className="m-wall-body">
              <div className="lb">壁纸</div>
              <div className="row">
                <button onClick={() => wallFileRef.current?.click()}>选择图片</button>
                <button
                  className="ghost"
                  onClick={() => {
                    saveWallpaper('', '');
                    setWall('');
                  }}
                >
                  清除
                </button>
              </div>
              <div className="sl">
                <span>模糊</span>
                <input
                  type="range"
                  min={0}
                  max={12}
                  value={wallBlur}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setWallBlur(v);
                    localStorage.setItem('stellar_wall_blur', String(v));
                  }}
                />
              </div>
              <div className="sl">
                <span>暗度</span>
                <input
                  type="range"
                  min={0}
                  max={90}
                  value={wallDim}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setWallDim(v);
                    localStorage.setItem('stellar_wall_dim', String(v));
                  }}
                />
              </div>
              <div className="hint">
                建议用手机里的竖图。壁纸只在阅读时露出，不会影响卡片和按钮的可读性。
              </div>
              <input
                ref={wallFileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => {
                    const url = String(r.result || '');
                    saveWallpaper(url, f.name);
                    setWall(url);
                  };
                  r.readAsDataURL(f);
                  e.target.value = '';
                }}
              />
            </div>
          </section>
        )}
      </>
    );

    return (
      <main className="m-main">
        {wall && (
          <div
            className="m-wallimg"
            style={{ backgroundImage: `url("${wall}")`, filter: `blur(${wallBlur}px)` }}
          />
        )}
        <div className="m-veil" style={wall ? { opacity: wallDim / 100 } : undefined} />

        <header className="m-top">
          <button className="m-back" onClick={() => router.push('/')}>返回</button>
          <div className="m-ch">
            {lastEntryNo ? `第 ${Math.floor((lastEntryNo - 1) / CHAPTER_SIZE) + 1} 章` : '主线'}
            <i>{lastEntryNo ? chapterLabel(lastEntryNo) : '尚未开始'}</i>
          </div>
          <div className="m-bar"><i style={{ width: `${progress}%` }} /></div>
          <button className="m-model" onClick={() => setModelOpen(v => !v)}>
            {activeStory?.name || '模型'}
            <span>▾</span>
          </button>
          <button className="m-gear" aria-label="封面设置" onClick={() => setWallOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {modelOpen && (
          <div className="m-menu">
            {storyProfiles.length ? (
              storyProfiles.map(p => (
                <button
                  key={p.id}
                  className={p.id === activeStory?.id ? 'on' : ''}
                  onClick={() => {
                    if (!settings) return;
                    const next: Settings = {
                      ...settings,
                      active: { ...settings.active, story: p.id },
                    };
                    saveSettings(next);
                    setSettings(next);
                    setModelOpen(false);
                  }}
                >
                  <b>{p.name || p.model || '未命名'}</b>
                  <i>{p.model || '未填模型'}</i>
                </button>
              ))
            ) : (
              <div className="m-menu-empty">还没配正文接口，去设置里加。</div>
            )}
          </div>
        )}

        {hasNotif && !notifClosed && !inviteOpen && (
          <div
            className="m-notif"
            onClick={() =>
              invite ? setInviteOpen(true) : router.push(`/phone?save=${save.id}`)
            }
          >
            <span className="tx">
              <b>{invite ? invite.name : phoneNote?.name || '手机'}</b>
              <span>{invite ? '想见你 · 个人线在等你' : `${phoneNote?.count || 0} 条新消息`}</span>
            </span>
            <span className="go">{invite ? '去看 ›' : '手机 ›'}</span>
          </div>
        )}

        <div className="m-now">
          <button
            className="m-again"
            onClick={() => {
              setRegenNote('');
              setRegenOpen(true);
            }}
            disabled={busy || !save.undo}
          >
            重写
          </button>
          <div className="when">
            {save.state?.clock
              ? `${save.state.clock.y}年${save.state.clock.m}月${save.state.clock.d}日`
              : '时间未定'}
            <small>
              {save.state?.clock
                ? `${String(Math.floor(save.state.clock.min / 60)).padStart(2, '0')}:${String(save.state.clock.min % 60).padStart(2, '0')}`
                : ''}
            </small>
          </div>
          {save.state?.place && <div className="where">{save.state.place}</div>}
          {onStage.length > 0 && (
            <div className="cast">
              在场 · {onStage.join('、')}
            </div>
          )}
        </div>

        <div className="m-story">
          {!started && (
            <div className="m-start">
              <div className="k">MAIN STORY</div>
              <div className="t">{world?.title || '剧本'}</div>
              <div className="s">{world?.tagline || '第一幕，从这里开始'}</div>
              <button onClick={begin} disabled={busy}>
                {busy ? '正在开场……' : '开始'}
              </button>
            </div>
          )}

          {entries.map(({ turn: t }, i) =>
            t.role === 'user' ? (
              <div className="m-say me" key={i}>
                <div className="m-tx">{t.text}</div>
              </div>
            ) : (
              (t.segments || []).map((seg, k) => {
                if (seg.type !== 'dialogue') {
                  return <p className="m-narr" key={`${i}-${k}`}>{seg.text}</p>;
                }
                const c = seg.who ? charOf(seg.who) : undefined;
                const key = `t${i}b${k}`;
                const isLast = i === entries.length - 1;
                return (
                  <div className="m-say" key={`${i}-${k}`}>
                    <span
                      className="m-av"
                      style={c?.avatar ? { backgroundImage: `url("${c.avatar}")` } : undefined}
                    >
                      {!c?.avatar && (seg.who || '？').slice(0, 1)}
                    </span>
                    <div className="m-body">
                      <div className="m-who">{seg.who}</div>
                      <div className="m-tx">{seg.text}</div>
                      {isLast && (
                        <div className="m-tools">
                          {voiceProfile?.baseUrl && (
                            <button
                              className={speaking === key ? 'on' : ''}
                              onClick={() => play(key, seg.text, seg.who || '', seg.tone, seg.ja)}
                            >
                              {speaking === key ? <IconStop /> : <IconPlay />}语音
                            </button>
                          )}
                          {c && (
                            <button
                              className={clips[clipKey(c.id, seg.text)] ? 'on' : ''}
                              onClick={() => toggleFavorite(key, c, seg.text)}
                            >
                              <IconBookmark on={!!clips[clipKey(c.id, seg.text)]} />
                              {clips[clipKey(c.id, seg.text)] ? '已收藏' : '收藏'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ),
          )}
          {busy && <div className="m-busy">……</div>}
          <div ref={storyEndRef} />
        </div>

        <div className="m-dock">
          {todoOpen && (
            <div className="m-todo">
              {todos.length ? (
                todos.map(a => {
                  const now = save.state?.clock ? clockValue(save.state.clock) : 0;
                  const diff = clockValue(a.clock) - now;
                  const soon = diff <= 120;
                  return (
                    <button key={a.id} disabled={!soon} onClick={() => goAppointment(a.id)}>
                      <span>
                        <b>{clockShort(a.clock)}</b> · {a.characterName}
                        {a.place ? ` · ${a.place}` : ''}
                      </span>
                      <i>
                        {soon ? '去赴约' : diff < 1440 ? '还有几小时' : `还有 ${Math.ceil(diff / 1440)} 天`}
                      </i>
                    </button>
                  );
                })
              ) : (
                <div className="m-empty">还没有约定。</div>
              )}
            </div>
          )}

          {dockMode === 'reply' && choices.length > 0 && (
            <div className="m-opts">
              {choices.map((c, i) => (
                <div className={`m-opt${picked === i ? ' on' : ''}`} key={i}>
                  <button
                    className="t"
                    disabled={busy}
                    onClick={() => {
                      setDraft(c);
                      setPicked(i);
                    }}
                  >
                    {c}
                  </button>
                  <button
                    className="add"
                    disabled={busy}
                    onClick={() => {
                      setDraft(d =>
                        d.trim() ? `${d.replace(/[，,。\s]+$/, '')}，${c}` : c,
                      );
                      setPicked(i);
                    }}
                  >
                    ＋
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="m-pills">
            <button className={todoOpen ? 'on' : ''} onClick={() => setTodoOpen(v => !v)}>
              待办 <i>{todoLabel}</i>
            </button>
            <button onClick={() => setReview(true)}>
              回顾
            </button>
            <button
              className={dockMode === 'reply' ? 'on' : ''}
              onClick={() => setDockMode(m => (m === 'reply' ? 'none' : 'reply'))}
            >
              回复<i>{dockMode === 'reply' ? '⌃' : '⌄'}</i>
            </button>
          </div>

          {attach && (
            <div className="m-attach">
              附 · {attach}
              <button onClick={() => setAttach('')}>×</button>
            </div>
          )}

          <div className="m-input">
            <button
              className={`m-plus${itemOpen ? ' on' : ''}`}
              onClick={() => setItemOpen(v => !v)}
              aria-label="背包"
            >
              ＋
            </button>
            <textarea
              ref={draftRef}
              rows={1}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="写下你要做的事…"
              disabled={busy}
            />
            <button
              className="m-send"
              disabled={busy}
              onClick={() => {
                const out = compose(draft);
                if (!out) return;
                send(out);
                setAttach('');
              }}
            >
              <IconSend />
            </button>
          </div>

          {err && <div className="m-err">{err}</div>}
        </div>

        {itemOpen && (
          <div className="m-sheet" onClick={() => setItemOpen(false)}>
            <div className="m-sheet-body" onClick={e => e.stopPropagation()}>
              <div className="k">背包</div>
              {bagItems.length ? (
                bagItems.map(it => (
                  <button
                    key={it.id}
                    onClick={() => {
                      setAttach(it.name);
                      setItemOpen(false);
                    }}
                  >
                    <b>{it.name}</b>
                    <i>×{it.count}</i>
                  </button>
                ))
              ) : (
                <div className="m-empty">背包里还没有东西。</div>
              )}
            </div>
          </div>
        )}

        {invite && inviteOpen && (
          <div className="m-mask" onClick={() => setInviteOpen(false)}>
            <div className="m-modal" onClick={e => e.stopPropagation()}>
              <div className="k">PERSONAL ROUTE · {invite.name}</div>
              <div className="t">他想见你</div>
              <div className="d">好感到这儿就是极限了。再往下走，只能去他的个人线。</div>
              <div className="acts">
                <button className="primary" disabled={busy} onClick={acceptInvite}>去见他</button>
                <button disabled={busy} onClick={postponeInvite}>改约 · 过两天</button>
                <button disabled={busy} onClick={declineInvite}>婉拒</button>
                <button className="quiet" onClick={() => setInviteOpen(false)}>再想想</button>
              </div>
            </div>
          </div>
        )}
        {playOverlays}
      </main>
    );
  }

  return (
    <main className="play-a">
      <div
        className="a-scene"
        style={wall ? { backgroundImage: `url("${wall}")` } : undefined}
      />
      <div className="a-vig" />
      <div className="a-sprocket top" />
      <div className="a-sprocket bot" />

      <header className="a-dtop">
        <button
          className="a-back"
          onClick={() =>
            save.kind === 'route' ? leaveRouteToList() : router.push('/')
          }
        >
          返回
        </button>
        <span className="a-no">
          {save.kind === 'route' ? '个人线' : '番外'}
        </span>
        <div className="a-prog"><i style={{ width: `${progress}%` }} /></div>
        {save.kind === 'route' && (
          <button className="a-back" onClick={exitRoute}>回主线</button>
        )}
        <button
          className="a-ibtn"
          title="手机"
          onClick={() => router.push(`/phone?save=${save.id}`)}
        >
          <IconPhone />
        </button>
        <button className="a-ibtn" title="结算" onClick={() => router.push('/ledger')}>
          <IconReceipt />
        </button>
        <button className="a-ibtn" title="剧情回顾" onClick={() => setReview(true)}>
          <IconClock />
        </button>
        <button
          className="a-ibtn"
          title="撤回上一回合"
          disabled={!save.undo || busy}
          onClick={undoLast}
        >
          <IconUndo />
        </button>
      </header>

      {hasNotif && !notifClosed && !inviteOpen && !reading && (
        <div
          className="a-notif"
          onClick={() =>
            invite ? setInviteOpen(true) : router.push(`/phone?save=${save.id}`)
          }
        >
          <span className="ic">{invite ? <IconHeart /> : <IconPhone />}</span>
          <span className="tx">
            <b>{invite ? invite.name : phoneNote?.name || '手机'}</b>
            <span>
              {invite
                ? '想见你 · 个人线在等你'
                : `${phoneNote?.count || 0} 条新消息`}
            </span>
          </span>
          <span className="dot" />
          <span className="go">{invite ? '去看 ›' : '手机 ›'}</span>
        </div>
      )}

      {current?.type === 'dialogue' && current.who && (
        <div className="a-name">{current.who}</div>
      )}

      <div
        className="a-flex"
        onClick={() => {
          if (reading) setSeen(s => s + 1);
        }}
      >
        {!started && (
          <div className="a-center">
            <div className="k">{save.kind === 'route' ? 'PERSONAL ROUTE' : 'EXTRA'}</div>
            <div className="t">{world?.title || '剧本'}</div>
            <div className="s">
              {save.kind === 'route'
                ? `${routeName} · 个人线`
                : world?.tagline || '第一幕，从这里开始'}
            </div>
            <button className="a-cta" onClick={begin} disabled={busy}>
              {busy ? '正在开场……' : '开始放映'}
            </button>
            {err && <div className="s" style={{ color: '#cf9c9c' }}>{err}</div>}
          </div>
        )}
        {reading && <div className="a-tap">轻点继续</div>}
      </div>

      <div
        className="a-talk"
        onClick={() => {
          if (reading) setSeen(s => s + 1);
        }}
      >
        {userPending && <div className="a-you">你 · {userPending}</div>}
        {current &&
          (current.type === 'dialogue' ? (
            <>
              <div className="a-ticket">{current.who}</div>
              <div className="a-box">
                <p>{current.text}</p>
                {(voiceProfile?.baseUrl || currentChar) && (
                  <div className="a-tools">
                    {voiceProfile?.baseUrl && (
                      <button
                        className={speaking === currentKey ? 'on' : ''}
                        onClick={e => {
                          e.stopPropagation();
                          play(currentKey, current.text, current.who, current.tone, current.ja);
                        }}
                      >
                        {speaking === currentKey ? <IconStop /> : <IconPlay />}语音
                      </button>
                    )}
                    {currentChar && (
                      <button
                        className={currentClip ? 'on' : ''}
                        disabled={saving === currentKey}
                        onClick={e => {
                          e.stopPropagation();
                          toggleFavorite(currentKey, currentChar, current.text);
                        }}
                      >
                        <IconBookmark on={!!currentClip} />
                        {currentClip ? '已收藏' : '收藏'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="a-box narr">
              <p>{current.text}</p>
            </div>
          ))}
        {busy && <div className="a-busy">……</div>}
      </div>

      {started && !reading && (
        <div className="a-dock">
          {todoOpen && (
            <div className="a-todo-panel">
              {todos.length ? (
                todos.map(a => {
                  const now = save.state?.clock ? clockValue(save.state.clock) : 0;
                  const diff = clockValue(a.clock) - now;
                  const soon = diff <= 120;
                  return (
                    <button
                      key={a.id}
                      className="a-todo-item"
                      disabled={!soon}
                      onClick={() => goAppointment(a.id)}
                    >
                      <span>
                        <b>{clockShort(a.clock)}</b> · {a.characterName}
                        {a.place ? ` · ${a.place}` : ''}
                      </span>
                      <i>
                        {soon
                          ? '去赴约'
                          : diff < 1440
                            ? '还有几小时'
                            : `还有 ${Math.ceil(diff / 1440)} 天`}
                      </i>
                    </button>
                  );
                })
              ) : (
                <div className="a-todo-empty">还没有约定。</div>
              )}
            </div>
          )}

          {dockMode === 'reply' && choices.length > 0 && (
            <div className="a-opts">
              {choices.map((c, i) => (
                <button
                  key={i}
                  className={`a-opt${picked === i ? ' on' : ''}`}
                  disabled={busy}
                  onClick={() => {
                    setDraft(c);
                    setPicked(i);
                  }}
                >
                  <i>—</i>
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="a-pills">
            <button
              className={`a-pill todo${todoOpen ? ' on' : ''}`}
              onClick={() => setTodoOpen(v => !v)}
            >
              <b>待办</b>
              <span>{todoLabel}</span>
              <i>›</i>
            </button>
            <button
              className="a-pill"
              onClick={() => router.push(`/phone?save=${save.id}`)}
            >
              去手机{phoneLeft > 0 && <em>{phoneLeft}</em>}
            </button>
            <button
              className={`a-pill${dockMode === 'reply' ? ' on' : ''}`}
              onClick={() => setDockMode(m => (m === 'reply' ? 'none' : 'reply'))}
            >
              回复<i>{dockMode === 'reply' ? '⌃' : '⌄'}</i>
            </button>
          </div>

          {dockMode === 'reply' && (
            <>
              <div className="a-reply">
                <button
                  className="a-add"
                  disabled={busy || picked < 0}
                  onClick={() => {
                    const c = choices[picked];
                    if (!c) return;
                    setDraft(d => (d.trim() ? `${d.replace(/[，,。\s]+$/, '')}，${c}` : c));
                  }}
                >
                  ＋
                </button>
                <textarea
                  ref={draftRef}
                  rows={1}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  placeholder="写一句你想做的…"
                  disabled={busy}
                />
                <button className="a-send" disabled={busy} onClick={() => send(draft)}>
                  <IconSend />
                </button>
              </div>
              <div className="a-hint">
                点选项替换，点＋叠加，不直接发
                <b onClick={() => setDockMode('none')}>收起</b>
              </div>
            </>
          )}

          {err && <div className="a-hint" style={{ color: '#cf9c9c' }}>{err}</div>}
        </div>
      )}

      {invite && inviteOpen && (
        <div className="a-mask" onClick={() => setInviteOpen(false)}>
          <div className="a-modal" onClick={e => e.stopPropagation()}>
            <div className="k">PERSONAL ROUTE · {invite.name}</div>
            <div className="t">他想见你</div>
            <div className="d">主线的信任到这儿就是极限了。再往下走，只能去他的个人线。</div>
            <div className="a-acts">
              <button className="primary" disabled={busy} onClick={acceptInvite}>
                去见他
              </button>
              <button disabled={busy} onClick={postponeInvite}>
                改约 · 过两天
              </button>
              <button disabled={busy} onClick={declineInvite}>
                婉拒
              </button>
              <button className="quiet" onClick={() => setInviteOpen(false)}>
                再想想
              </button>
            </div>
          </div>
        </div>
      )}

      {review && (
        <div className="review-mask">
          <div className="review-panel">
            <div className="rv-head">
              <button className="rv-close" onClick={() => setReview(false)}>‹ 返回</button>
              <div className="rv-ch">第 {revCh} 章 · {revAssists} 回合</div>
            </div>
            <div className="rv-title">回顾</div>
            <div className="rv-body">
              {revIntro && <div className="rv-intro">{revIntro}</div>}
              <div className="rv-list">
                {!revSums.length && <div className="rv-empty">还没有可以回顾的内容。</div>}
                {revSums.map(s => (
                  <div className="rv-line" key={s.turn}>
                    <span className="rv-date">{revTimes.get(s.turn) || '——'}</span>
                    <span>{s.text}</span>
                  </div>
                ))}
              </div>
              <div className="rv-archive">重写本章档案</div>
              {revInputs.map(r => (
                <div className="rv-row" key={r.i}>
                  <span className="rv-no">{String(r.no).padStart(2, '0')}</span>
                  <span className="rv-tx">{r.text}</span>
                  <button
                    className="rv-undo"
                    disabled={busy || !(save.checkpoints || []).some(c => c.at === r.i)}
                    onClick={() => rollbackTo(r.i)}
                  >
                    退回
                  </button>
                </div>
              ))}
              {!revInputs.length && <div className="rv-empty">本章还没有你的记录。</div>}
            </div>
            <div className="rv-foot">
              <button className="rv-step" disabled={!save.undo || busy} onClick={undoLast}>
                <i />退一步 <em>退掉的不留</em>
              </button>
              <button className="rv-go" onClick={() => setReview(false)}>去开演 →</button>
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
