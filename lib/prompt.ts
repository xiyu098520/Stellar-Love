'use client';

import type { ChatMessage } from './llm';
import { emptyState, stageOf } from './affinity';
import type { Character, GameState, Save, Turn, World, WorldBlock } from './types';

const FORMAT = `只输出一个 JSON 对象，不要任何解释、不要代码块围栏：
{
  "segments": [
    { "type": "narration", "text": "旁白段落" },
    { "type": "dialogue", "who": "人物表里的名字", "text": "他说的话，不加引号", "tone": "softly" }
  ],
  "choices": ["下一步可以做的事", "……"],
  "time": "10月8日 周三 · 傍晚 19:20",
  "place": "旧街 · 金记",
  "settle": { "who": "砂金", "delta": 3, "reason": "你说中了他喜欢的老唱片", "minutes": 15,
              "attrs": [{ "who": "", "name": "金钱", "delta": -38, "reason": "买了一杯手冲" }] }
}
tone 可选，只能是 sighs、whispers、softly、laughs、sad、happy、angry、excited、nervous、calm、tired、sarcastic 之一。
segments 至少 6 段、正文合计 800 到 1600 字。她一次读不完，所以每一段都要短：叙述一句到两句，台词一条一句，不要出现整段大块文字。
只要有人开口，就必须单独占一条 dialogue，一句台词一条；同一个人连说三句，就写成三条 dialogue，不要把三句塞进一条。
没有名字的人（店员、员工、助理、路人）开口时，who 写身份称呼，例如「便利店店员」。choices 给 2 到 4 条，每条不超过 18 字，写成她能做的事，不写心理活动。`;

/** 结算规则：只允许报这几个档，理由必须具体 */
const SETTLE_RULE = `【结算】
每回合结尾在 settle 里申报一次，不许省略。
who：本回合真正跟她有互动的那个男主角，用人物表里的名字；只是远远看见、没说话，就不算，写 ""。
delta：只能取 0、1、3、5、8、-4、-6、-8 之一。
  1 ＝ 多说了一句私人话。
  3 ＝ 聊到他喜欢的东西，他多讲了两句。
  5 ＝ 他主动了，或你说中了他真正在意的东西。
  8 ＝ 碰了手、深夜留你、他说了不该说的。
  -4 ＝ 他提过在意的事，你没放在心上。
  -6 ＝ 他约了你，你没去。
  -8 ＝ 他看见你跟别的男人说笑（只能是没名字的人，绝不能是另一个男主角）。
  什么都没发生就写 0。
reason：一句话说明为什么，写具体的事，不写"气氛很好"。
minutes：这一回合过去了多少分钟，0 到 60。
attrs：这一回合真正变动的自定义数值，写成数组；没有变动就写 []。
  who 留空 = 你的数值；填人物名 = 那个人的数值。
  name 必须用【数值】里给出的原名字，不许自己起新名字。
  钱花出去、赚进来，都要报；不许直接改写余额，只报增减。
同一件事只算一次，不要反复加。`;

/** 主线：没有章节、没有终点，靠一条核心线索一直往下接 */
function chapterText(world: World): string {
  const core = (world.outline || '').trim();
  return [
    '【主线】',
    '这是一条没有终点的主线，不是有限的几章。你不写结局，也不主动收尾：每一回合往后接一点，一直接下去。',
    core
      ? `主线的核心线索：${core}\n所有事件都要挂在这条线索上；推进可以慢，但每一回合都得是它的一部分。`
      : '还没有给出核心线索：从世界观和开局里自己找出一个能长期追下去的事，把它当成主线核心，不要凭空结束它。',
    '不要写「第几章」「本章完」这类字样，也不要在正文里宣告阶段结束。',
    '需要换地方、换日子的时候，让事情自己把场景带过去：一件办完了，下一件自然浮上来。',
  ].join('\n');
}

const STAGE_HINT: Record<string, string> = {
  陌路: '客气，分寸很足，不多问，不越界。',
  认识: '记得你说过的话，会多问一句，但还不会主动找你。',
  熟: '会自己找由头见你，有一点不承认的占有欲。',
  私交: '已经说破，会在意你跟谁在一起，也会明着护你。',
  全心: '不再掂量，把你放在他自己前面。',
};

function recentText(save: Save): { recent: string; place: string } {
  const place = save.state?.place || '';
  // 5 条 ≈ 两整轮（每轮一问一答），命中后能撑两轮
  const recent = [...save.turns.slice(-5).map(flatten), place].join('\n');
  return { recent, place };
}

/** NPC 的所属地区：提到这个人，就把那块地方一起带进来 */
function activeNpcRegions(world: World, recent: string): string[] {
  return world.characters
    .filter(c => c.role === 'npc' && !!c.region)
    .filter(c => c.mode === 'always' || (c.keywords || []).some(k => k.trim() && recent.includes(k.trim())))
    .map(c => c.region as string);
}

/** 固定栏目（不随触发变化的部分） */
export function worldBlocks(world: World): WorldBlock[] {
  const out: WorldBlock[] = [];
  const add = (title: string, content?: string) => {
    if (content && content.trim()) out.push({ title, content: content.trim(), mode: 'always' });
  };
  add('时代与科技', world.era);
  add('核心规则', world.rules);
  add('货币系统', world.currency);
  add('主线大纲', world.outline);
  add('禁忌', world.banned);
  add('文风', world.style);
  return out;
}

function entryActive(
  b: WorldBlock,
  ctx: { input: string; recent: string; place: string; index: number; hits: Record<string, number>; key: string },
): boolean {
  const mode = b.mode || 'always';
  if (mode === 'off') return false;
  if (mode === 'always') return true;
  if ((b.endKeywords || []).some(k => k.trim() && ctx.recent.includes(k.trim()))) return false;
  if (mode === 'place') return !!b.place && ctx.place.includes(b.place);
  if (mode === 'dynamic') {
    const hit = ctx.hits[ctx.key];
    if (hit === undefined) return false;
    return ctx.index - hit <= (b.rounds ?? 2);
  }
  // 关键词：只看这一轮你说了什么
  const hitInput = (b.keywords || []).some(k => k.trim() && ctx.input.includes(k.trim()));
  const hitPlace = !!b.place && ctx.place.includes(b.place);
  return hitInput || hitPlace;
}

/** 最近一条用户输入：关键词判定只看它 */
export function lastUserText(save: Save): string {
  for (let i = save.turns.length - 1; i >= 0; i--) {
    const t = save.turns[i];
    if (t.role === 'user') return flatten(t);
  }
  return '';
}

/** 已经走了几轮（一问一答算一轮） */
export function turnIndex(save: Save): number {
  return save.turns.filter(t => t.role === 'user').length;
}

export function entryKey(e: WorldBlock, i: number): string {
  return (e.title || '').trim() || `#${i}`;
}

/** 动态条目：这一轮说到了，就记下轮次，之后按 rounds 继续注入 */
export function touchHits(world: World, save: Save): Save {
  const input = lastUserText(save);
  if (!input) return save;
  const idx = turnIndex(save);
  const hits: Record<string, number> = { ...(save.state?.hits || {}) };
  let changed = false;
  const scan = (list: WorldBlock[] | undefined) =>
    (list || []).forEach((e, i) => {
      if ((e.mode || 'always') !== 'dynamic') return;
      if (!(e.keywords || []).some(k => k.trim() && input.includes(k.trim()))) return;
      hits[entryKey(e, i)] = idx;
      changed = true;
    });
  scan(world.events);
  scan(world.extras);
  if (!changed) return save;
  const state: GameState = { ...(save.state || emptyState()), hits };
  return { ...save, state };
}

/** 这一回合真正要注入的块（顺序即优先级） */
export function activeBlocks(world: World, save: Save): WorldBlock[] {
  const { recent, place } = recentText(save);
  const npcRegions = activeNpcRegions(world, recent);
  const input = lastUserText(save);
  const index = turnIndex(save);
  const hits = save.state?.hits || {};

  const pick = (b: WorldBlock, i: number) => {
    if (!b.content.trim()) return false;
    const key = entryKey(b, i);
    const t = b.title || '';
    if (t && place && place.includes(t)) return true;
    if (t && npcRegions.some(r => r && (r.includes(t) || t.includes(r)))) return true;
    return entryActive(b, { input, recent, place, index, hits, key });
  };

  const out: WorldBlock[] = [];
  const add = (title: string, content?: string) => {
    if (content && content.trim()) out.push({ title, content: content.trim(), mode: 'always' });
  };
  add('时代与科技', world.era);
  add('核心规则', world.rules);
  add('货币系统', world.currency);
  (world.placeList || []).forEach((p, i) => {
    if (pick(p, i)) out.push({ ...p, content: p.content.trim() });
  });
  add('主线大纲', world.outline);
  add('禁忌', world.banned);
  add('文风', world.style);
  (world.events || []).forEach((e, i) => {
    if (pick(e, i)) out.push({ ...e, content: e.content.trim() });
  });
  (world.extras || []).forEach((b, i) => {
    if (pick(b, i)) out.push({ ...b, content: b.content.trim() });
  });
  return out.length ? out : world.blocks || [];
}

function blocksText(world: World, save: Save): string {
  return activeBlocks(world, save)
    .map(b => `## ${b.title}\n${b.content}`)
    .join('\n\n');
}

function charText(c: Character): string {
  const fields = (c.fields || []).map(f => `- ${f.k}：${f.v}`).join('\n');
  return [
    `### ${c.name}`,
    c.age ? `年龄：${c.age}` : '',
    c.identity ? `身份：${c.identity}` : '',
    c.speech ? `说话方式：${c.speech}` : '',
    c.note ? `资料：${c.note}` : '',
    fields,
  ]
    .filter(Boolean)
    .join('\n');
}

function stateText(world: World, save: Save): string {
  const st = save.state;
  if (!st) return '';
  const rows = Object.entries(st.affinity || {}).map(([id, v]) => {
    const c = world.characters.find(x => x.id === id);
    const name = c?.name || id;
    const stage = stageOf(v);
    const extra = (c?.attrs || [])
      .map(a => `${a.name} ${st.charAttrs?.[id]?.[a.id] ?? a.init}`)
      .join('，');
    return `- ${name}：${v}（${stage}）${STAGE_HINT[stage] || ''}${extra ? `｜${extra}` : ''}`;
  });
  const mine = (world.attrs || [])
    .filter(a => a.name.trim())
    .map(a => {
      const v = st.attrs?.[a.id] ?? a.init;
      return `- ${a.name}：${v}${a.max ? ` / ${a.max}` : ''}`;
    });
  const lines = [
    st.time ? `时间：${st.time}` : '',
    st.place ? `地点：${st.place}` : '',
    ...rows,
    ...mine,
  ].filter(Boolean);
  return lines.length ? `【当前状态】\n${lines.join('\n')}` : '';
}

function attrDefsText(world: World): string {
  const lines: string[] = [];
  for (const a of world.attrs || []) {
    if (!a.name.trim()) continue;
    lines.push(`- ${a.name}（你的）：初值 ${a.init}，${a.max ? `上限 ${a.max}` : '无上限'}`);
  }
  for (const c of world.characters) {
    for (const a of c.attrs || []) {
      if (!a.name.trim()) continue;
      lines.push(`- ${c.name}·${a.name}：初值 ${a.init}，${a.max ? `上限 ${a.max}` : '无上限'}`);
    }
  }
  return lines.length
    ? `【可改的数值】\n名字必须照抄，只能报增减，不能直接写结果：\n${lines.join('\n')}`
    : '';
}

export function routeCharacterId(save: Save): string | null {
  return save.kind === 'route' && save.routeOf ? save.routeOf : null;
}

export function buildSystem(world: World, save: Save): string {
  const routeId = routeCharacterId(save);
  const leads = world.characters.filter(c => c.role !== 'npc' && c.name.trim());
  const cast = routeId ? leads.filter(c => c.id === routeId) : leads;

  const { recent, place } = recentText(save);
  const npcs = world.characters.filter(c => c.role === 'npc' && c.name.trim());
  const activeNpcs = npcs.filter(
    n =>
      n.mode === 'always' ||
      (n.keywords || []).some(k => k.trim() && recent.includes(k.trim())) ||
      (!!n.region && (place.includes(n.region) || recent.includes(n.region))),
  );

  return `你是一款中文乙女向恋爱游戏的叙述者。你负责写这一回合的场面：旁白、对白、她的选择。玩家是女主角，用「你」称呼她。

【玩法】
${save.kind === 'route'
  ? '这是某个人的个人线：只写这一个男主角和她的相处，其他男主角不在场、也不会被提及姓名。'
  : '这是主线：四个男主角都可以出现，但每一场只写其中一个；其他人在场也只是没有名字的背景。'}

【世界观】
${blocksText(world, save)}

【主角】
${world.protagonist || '（未设定，按世界观推断）'}
${stateText(world, save) ? `\n${stateText(world, save)}\n` : ''}
【场上可以有的人物】
${cast.map(charText).join('\n\n')}
${activeNpcs.length ? `\n【本回合可以出现的配角】\n${activeNpcs.map(charText).join('\n\n')}\n（配角只在需要的时候出现，不抢主线，不写成恋爱对象。）` : ''}

【没有名字的人】
人物表之外的人照样可以出现：便利店的店员、百货公司的员工、你的助理、街上撞到的人、一只会说话的机器宠物。
- 他们的 who 只用身份称呼，不编名字。店员就是「便利店店员」，员工就是「百货公司员工」，你的助理就是「助理」，路上那个人就是「路人」。
- 同一个场景里同一种身份有两个时，写成「便利店店员甲」「便利店店员乙」。
- 他们也只是人，会说话、会办事、会不耐烦，但不会抢主角的戏，也不会突然变成恋爱对象。
${attrDefsText(world) ? `\n${attrDefsText(world)}` : ''}

【写法】
句子短，不堆形容词，不用「仿佛」「似乎」「一丝」「不由得」。心理只从外面看：写动作、停顿、视线、呼吸，不写「他心疼」「他很在意」。
对白不加引号，不用「」。
不替玩家做决定：她的话、她的动作只写玩家自己给出的；模型只写别人的反应和世界的动静。
每回合至少有一个小的推进：他说了一句新的话、做了一件小事、带来一个消息、场面变了一点。
结尾不要收束，要留一个可以接着往下过下去的地方。
时间和地点要接着上一回合，不许跳回白天、不许换城市。

${chapterText(world)}

${SETTLE_RULE}

【输出】
${FORMAT}`;
}

export function flatten(t: Turn): string {
  if (t.role === 'user') return t.text;
  if (t.segments?.length) {
    return t.segments
      .map(s => (s.type === 'dialogue' ? `${s.who}：${s.text}` : s.text))
      .join('\n');
  }
  return t.text;
}

export function buildMessages(world: World, save: Save): ChatMessage[] {
  const system = buildSystem(world, save);
  const history: ChatMessage[] = [];
  for (const t of save.turns) {
    history.push({ role: t.role, content: flatten(t) });
  }
  if (history.length === 0 && world.opening) {
    history.push({ role: 'user', content: `开场：\n${world.opening}\n\n请从这里接着写第一回合。` });
  }
  return [{ role: 'system', content: system }, ...history];
}
