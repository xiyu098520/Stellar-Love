'use client';

import type { ChatMessage } from './llm';
import type { Character, Save, Turn, World } from './types';

const FORMAT = `只输出一个 JSON 对象，不要任何解释、不要代码块围栏：
{
  "segments": [
    { "type": "narration", "text": "旁白段落" },
    { "type": "dialogue", "who": "人物表里的名字", "text": "他说的话，不加引号", "tone": "softly" }
  ],
  "choices": ["下一步可以做的事", "……"],
  "time": "10月8日 周三 · 傍晚 19:20",
  "place": "旧街 · 金记"
}
tone 可选，只能是 sighs、whispers、softly、laughs、sad、happy、angry、excited、nervous、calm、tired、sarcastic 之一。
segments 至少 3 段、正文合计 260 到 520 字。choices 给 2 到 4 条，每条不超过 18 字，写成她能做的事，不写心理活动。`;

function blocksText(world: World): string {
  return world.blocks
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

【场上可以有的人物】
${cast.map(charText).join('\n\n')}
${others.length ? `\n【其他人物（只能以无名背景或传话身份出现，不许写成恋爱对象）】\n${others.map(c => `- ${c.name}：${c.identity || ''}`).join('\n')}` : ''}

【写法】
句子短，不堆形容词，不用「仿佛」「似乎」「一丝」「不由得」。心理只从外面看：写动作、停顿、视线、呼吸，不写「他心疼」「他很在意」。
对白不加引号，不用「」。
不替玩家做决定：她的话、她的动作只写玩家自己给出的；模型只写别人的反应和世界的动静。
每回合至少有一个小的推进：他说了一句新的话、做了一件小事、带来一个消息、场面变了一点。
结尾不要收束，要留一个可以接着往下过下去的地方。

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
