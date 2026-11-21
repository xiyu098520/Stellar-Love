import type { Character, Save, VoiceClip, Wallet, World } from './types';

/** 拾光轴里的一条：剧情回合、赠礼、收藏语音 */
export type MemoryKind = 'story' | 'gift' | 'voice';

export type Memory = {
  id: string;
  kind: MemoryKind;
  /** 排序用，毫秒 */
  at: number;
  /** 故事内日期键，用来算相伴天数；没有就是空 */
  dateKey: string;
  /** 显示用日期，如 11月18日 21:10 */
  label: string;
  title: string;
  text?: string;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "2026年11月18日 21:10" / "11月18日" → 日期键和显示文本 */
export function parseWhen(s?: string): { key: string; label: string } | null {
  if (!s) return null;
  const full = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(\d{1,2}):(\d{2}))?/);
  if (full) {
    const [, y, m, d, h, mi] = full;
    return {
      key: `${y}-${pad2(Number(m))}-${pad2(Number(d))}`,
      label: `${Number(m)}月${Number(d)}日${h ? ` ${pad2(Number(h))}:${mi}` : ''}`,
    };
  }
  const short = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(\d{1,2}):(\d{2}))?/);
  if (short) {
    const [, m, d, h, mi] = short;
    return {
      key: `--${pad2(Number(m))}-${pad2(Number(d))}`,
      label: `${Number(m)}月${Number(d)}日${h ? ` ${pad2(Number(h))}:${mi}` : ''}`,
    };
  }
  return null;
}

/** 相识天数：剧本开始那天到主线当前日期 */
export function knowDays(world: World | null, main?: Save): number {
  if (!world?.startDate || !main?.state?.clock) return 0;
  const [y, m, d] = world.startDate.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const a = Date.UTC(y, m - 1, d);
  const c = main.state.clock;
  const b = Date.UTC(c.y, c.m - 1, c.d);
  return Math.max(1, Math.floor((b - a) / 86400000) + 1);
}

/**
 * 这个人的拾光轴：主线里提到他的回合摘要、个人线全部摘要、
 * 送过的有纪念意义的礼物、收藏的语音，按时间倒序。
 */
export function memoriesOf(opts: {
  character: Character;
  world: World;
  saves: Save[];
  voices: VoiceClip[];
  wallet: Wallet | null;
}): Memory[] {
  const { character, world, saves, voices, wallet } = opts;
  const list: Memory[] = [];
  const name = (character.name || '').trim();
  const main = saves.find(s => s.worldId === world.id && s.kind === 'main');
  const routes = saves.filter(
    s => s.worldId === world.id && s.kind === 'route' && s.routeOf === character.id,
  );

  for (const save of [main, ...routes]) {
    if (!save) continue;
    const own = save.kind === 'route';
    const assists = save.turns.filter(t => t.role === 'assistant');
    for (const sum of save.summaries || []) {
      const turn = assists[sum.turn - 1];
      if (!turn) continue;
      if (!own && name && !turn.text.includes(name)) continue;
      const when = parseWhen(turn.time);
      const text = (sum.text || '').trim();
      if (!text) continue;
      list.push({
        id: `st_${save.id}_${sum.turn}`,
        kind: 'story',
        at: sum.at,
        dateKey: when?.key || '',
        label: when?.label || '',
        title: text.length > 20 ? `${text.slice(0, 20)}…` : text,
        text: text.length > 20 ? text : undefined,
      });
    }
  }

  for (const g of wallet?.gifts || []) {
    if (g.characterId !== character.id || g.memorable === false) continue;
    const when = parseWhen(g.time);
    list.push({
      id: `gf_${g.id}`,
      kind: 'gift',
      at: g.at,
      dateKey: when?.key || '',
      label: when?.label || '',
      title: `收到他送的${g.itemName}`,
    });
  }

  for (const v of voices) {
    if (v.characterId !== character.id) continue;
    if (world.id && v.worldId !== world.id) continue;
    const d = new Date(v.createdAt);
    list.push({
      id: `vc_${v.id}`,
      kind: 'voice',
      at: v.createdAt,
      dateKey: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      label: `${d.getMonth() + 1}月${d.getDate()}日`,
      title: '收藏了一段声音',
      text: v.text,
    });
  }

  return list.sort((a, b) => b.at - a.at);
}

/** 相伴天数：有记录的那些故事内日期，去了重 */
export function companionDays(memories: Memory[]): number {
  const set = new Set<string>();
  for (const m of memories) if (m.kind !== 'voice' && m.dateKey) set.add(m.dateKey);
  return set.size;
}

const LEVELS = [
  { min: 0, name: '初识' },
  { min: 60, name: '熟悉' },
  { min: 150, name: '默契' },
  { min: 300, name: '心照' },
  { min: 600, name: '难分' },
];

export type Bond = {
  /** 羁绊值，跟剧情好感完全分开 */
  score: number;
  level: string;
  /** 到下一档的进度 0–1 */
  progress: number;
  known: number;
  companion: number;
  story: number;
  gift: number;
  voice: number;
};

/**
 * 羁绊怎么涨：相识和相伴按天、共同经历按回合、赠礼和语音额外加成。
 * 之后要调权重，只改这里。
 */
export function bondOf(memories: Memory[], known: number): Bond {
  const companion = companionDays(memories);
  const story = memories.filter(m => m.kind === 'story').length;
  const gift = memories.filter(m => m.kind === 'gift').length;
  const voice = memories.filter(m => m.kind === 'voice').length;
  const score = known + companion * 2 + story * 3 + gift * 6 + voice * 8;

  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (score >= LEVELS[i].min) idx = i;
  const next = LEVELS[idx + 1];
  const progress = next
    ? Math.min(1, (score - LEVELS[idx].min) / (next.min - LEVELS[idx].min))
    : 1;

  return {
    score,
    level: LEVELS[idx].name,
    progress,
    known,
    companion,
    story,
    gift,
    voice,
  };
}

/** 按月份分组，月份跟随记录顺序（已经是倒序） */
export function groupByMonth(memories: Memory[]): { key: string; name: string; items: Memory[] }[] {
  const out: { key: string; name: string; items: Memory[] }[] = [];
  for (const m of memories) {
    const key = m.dateKey.slice(0, 7) || '未知';
    const month = key.slice(5, 7);
    const name = month ? `${Number(month)}月` : '更早';
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(m);
    else out.push({ key, name, items: [m] });
  }
  return out;
}
