'use client';

import type { ChatMessage } from './llm';
import { stageOf } from './affinity';
import type { Character, Save, Turn, World, WorldBlock } from './types';

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
segments 至少 3 段、正文合计 260 到 520 字。choices 给 2 到 4 条，每条不超过 18 字，写成她能做的事，不写心理活动。`;

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

const STAGE_HINT: Record<string, string> = {
  陌路: '客气，分寸很足，不多问，不越界。',
  认识: '记得你说过的话，会多问一句，但还不会主动找你。',
  熟: '会自己找由头见你，有一点不承认的占有欲。',
  私交: '已经说破，会在意你跟谁在一起，也会明着护你。',
  全心: '不再掂量，把你放在他自己前面。',
};

/** 组装给模型的设定块：固定栏目在前，补充在后；新档案为空时退回旧档案原块 */
export function worldBlocks(world: World): WorldBlock[] {
  const out: WorldBlock[] = [];
  const add = (title: string, content?: string) => {
    if (content && content.trim()) out.push({ title, content: content.trim() });
  };
  add('时代与科技', world.era);
  add('核心规则', world.rules);
  add('场所与势力', world.places);
  add('主线大纲', world.outline);
  add('禁忌', world.banned);
  add('文风', world.style);
  for (const b of world.extras || []) add(b.title, b.content);
  return out.length ? out : (world.blocks || []);
}

function blocksText(world: World): string {
  return worldBlocks(world)
    .map(b => `## ${b.title}\n${b.content}`)
    .join('\n\n');
}

function charText(c: Character): string {
  const fields = (c.fields || []).map(f => `- ${f.k}：${f.v}`).join('\n');
  return [
    `### ${c.name}`,
    c.identity ? `身份：${c.identity}` : '',
    c.speech ? `说话方式：${c.speech}` : '',
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
  const leads = world.characters.filter(c => c.identity && c.id !== 'npc');
  const cast = routeId
    ? leads.filter(c => c.id === routeId)
    : leads;
  const others = world.characters.filter(c => !cast.includes(c) && c.identity);

  return `你是一款中文乙女向恋爱游戏的叙述者。你负责写这一回合的场面：旁白、对白、她的选择。玩家是女主角，用「你」称呼她。

【玩法】
${save.kind === 'route'
  ? '这是某个人的个人线：只写这一个男主角和她的相处，其他男主角不在场、也不会被提及姓名。'
  : '这是主线：四个男主角都可以出现，但每一场只写其中一个；其他人在场也只是没有名字的背景。'}

【世界观】
${blocksText(world)}

【主角】
${world.protagonist || '（未设定，按世界观推断）'}
${stateText(world, save) ? `\n${stateText(world, save)}\n` : ''}
【场上可以有的人物】
${cast.map(charText).join('\n\n')}
${others.length ? `\n【其他人物（只能以无名背景或传话身份出现，不许写成恋爱对象）】\n${others.map(c => `- ${c.name}：${c.identity || ''}`).join('\n')}` : ''}
${attrDefsText(world) ? `\n${attrDefsText(world)}` : ''}

【写法】
句子短，不堆形容词，不用「仿佛」「似乎」「一丝」「不由得」。心理只从外面看：写动作、停顿、视线、呼吸，不写「他心疼」「他很在意」。
对白不加引号，不用「」。
不替玩家做决定：她的话、她的动作只写玩家自己给出的；模型只写别人的反应和世界的动静。
每回合至少有一个小的推进：他说了一句新的话、做了一件小事、带来一个消息、场面变了一点。
结尾不要收束，要留一个可以接着往下过下去的地方。
时间和地点要接着上一回合，不许跳回白天、不许换城市。

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
