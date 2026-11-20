import { stageOf } from './affinity';
import type { Character, Save, World } from './types';

export type PhoneMsg = {
  id: string;
  role: 'me' | 'them';
  text: string;
  at: number;
  /** 已经推送进剧情的消息 */
  pushed?: boolean;
};

export type PhoneThreads = Record<string, PhoneMsg[]>;

const threadKey = (saveId: string) => `stellar-phone-${saveId}`;
const pushKey = (saveId: string) => `stellar-push-${saveId}`;

export function loadThreads(saveId: string): PhoneThreads {
  try {
    return JSON.parse(localStorage.getItem(threadKey(saveId)) || '{}');
  } catch {
    return {};
  }
}

export function saveThreads(saveId: string, threads: PhoneThreads) {
  localStorage.setItem(threadKey(saveId), JSON.stringify(threads));
}

/** 主线里见过面的人才会出现在通讯录；个人线里只有他 */
export function phoneContacts(world: World, save: Save): Character[] {
  const leads = world.characters.filter(c => c.role !== 'npc' && c.name.trim());
  if (save.kind === 'route') return leads.filter(c => c.id === save.routeOf);
  const aff = save.state?.affinity || {};
  return leads.filter(c => (aff[c.id] ?? 0) > 0);
}

export function phonePrompt(world: World, save: Save, c: Character): string {
  const raw = save.state?.affinity?.[c.id] ?? 0;
  const v = save.kind === 'main' ? Math.min(30, raw) : raw;
  const facts = [c.age && `${c.age}岁`, c.identity, c.note].filter(Boolean).join('；');
  return `你在扮演${c.name}，正在用手机跟她发消息。
人物：${facts || '按人物表'}
说话习惯：${c.speech || '口语，短句，按人设'}
关系：好感 ${v}（${stageOf(v)}）。
现在：${save.state?.time || '未定'}，${save.state?.place || '不确定在哪'}。
规则：
- 只写他发过来的消息，1 到 3 条，每条 40 字以内。
- 口语、短句；不要旁白、动作、括号里的表情，不替她说话。
- 不提到任何其他男主角。
- 关系没到那一步就不要越界。
- 只输出 JSON：{"messages":["..."],"minutes":5}。minutes 是他回这几条花的时间，1 到 30 分钟。`;
}

/** 推送时交给主线的那段话 */
export function pushText(save: Save, c: Character, msgs: PhoneMsg[]): string {
  const lines = msgs
    .slice(-16)
    .map(m => `${m.role === 'me' ? '你' : c.name}：${m.text}`)
    .join('\n');
  const head =
    save.kind === 'route'
      ? `你在手机上跟${c.name}聊了一阵：`
      : '你在手机上跟人聊了一阵：';
  return `${head}\n${lines}\n（手机上的内容只有你知道，场上的人看不到屏幕，也听不到对方是谁。）`;
}

export function setPendingPush(saveId: string, text: string) {
  localStorage.setItem(pushKey(saveId), text);
}

export function takePendingPush(saveId: string): string {
  const text = localStorage.getItem(pushKey(saveId)) || '';
  localStorage.removeItem(pushKey(saveId));
  return text;
}
