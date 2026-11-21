'use client';

import type { ChatMessage } from './llm';
import { emptyState, stageOf, trustStageOf } from './affinity';
import { chapterLabel } from './chapter';
import { clockText } from './clock';
import type { Character, Clock, GameState, Save, Turn, World, WorldBlock } from './types';

const FORMAT = `只输出一个 JSON 对象，不要任何解释、不要代码块围栏：
{
  "segments": [
    { "type": "narration", "text": "旁白段落" },
    { "type": "dialogue", "who": "人物表里的名字", "text": "他说的话，不加引号", "tone": "softly" }
  ],
  "choices": ["下一步可以做的事", "……"],
  "place": "旧街 · 金记",
  "settle": { "who": "砂金", "delta": 3, "reason": "你说中了他喜欢的老唱片", "minutes": 15,
              "money": 0, "moneyReason": "",
              "phone": [],
              "bought": [],
              "attrs": [{ "who": "", "name": "金钱", "delta": -38, "reason": "买了一杯手冲" }] }
}
tone 可选，只能是 sighs、whispers、softly、laughs、sad、happy、angry、excited、nervous、calm、tired、sarcastic 之一。
segments 至少 6 段、正文合计 800 到 1600 字。她一次读不完，所以每一段都要短：叙述一句到两句，台词一条一句，不要出现整段大块文字。
只要有人开口，就必须单独占一条 dialogue，一句台词一条；同一个人连说三句，就写成三条 dialogue，不要把三句塞进一条。
没有名字的人（店员、员工、助理、路人）开口时，who 写身份称呼，例如「便利店店员」。choices 给 2 到 4 条，每条不超过 18 字，写成她能做的事，不写心理活动。`;

const JA_RULE = `
每条 dialogue 额外给一个 "ja"：这句台词的自然日文口语（动漫对话那种，不要敬语腔，不要逐字直译），称呼、人称和情绪跟原句一致，ja 里不要写方括号标记。narration 不要 ja，text 照旧用中文。`;

/** 结算规则：只允许报这几个档，理由必须具体 */
const ROUTE_SETTLE_RULE = `【结算】
每回合结尾在 settle 里申报一次，不许省略。
who：本回合真正跟她有互动的那个男主角，用人物表里的名字；只是远远看见、没说话，就不算，写 ""。
delta：只能取 0、1、3、5、8、-1、-2、-4、-6、-8 之一。
  1 ＝ 多说了一句私人话。
  3 ＝ 聊到他喜欢的东西，他多讲了两句。
  5 ＝ 他主动了，或你说中了他真正在意的东西。
  8 ＝ 碰了手、深夜留你、他说了不该说的。
  -1 ＝ 他约你，你改约了；或你婉拒，但话说得让人不好受。
  -2 ＝ 他约你，你婉拒；他有点失落，但没往心里去。
  -4 ＝ 他提过在意的事，你没放在心上；或连着几次都被你推掉。
  -6 ＝ 你答应了他，最后没去。
  -8 ＝ 他看见你跟别的男人说笑（只能是没名字的人，绝不能是另一个男主角）。
  婉拒不是错事，最多掉 1 到 2；只有答应了又没去才是 -6。
  什么都没发生就写 0。
reason：一句话说明为什么，写具体的事，不写"气氛很好"。
minutes：这一回合过去了多少分钟，只填数字，不写时刻。
  几句闲话 5 到 15；一顿饭 45 到 90；赶一趟路 20 到 90；睡一觉 360 到 540；最多 720。
  没干别的事就填 15。不要写「傍晚」「第二天」这类字眼，钟由程序走。
money：这一段真的发生的金钱变化，正数是收入，负数是支出，只填数字。
  工资、转账、买东西、付房租、收红包都算；没发生就写 0。金额要符合这个人的收入和一贯的消费方式，不许凭空给大额。
moneyReason：一句话说清这笔钱怎么回事，比如「便利店夜班工资」「他转来的 200」「买了一杯手冲」。
phone：这一回合有没有人在手机里找她。最多一条，比如 [{"who":"砂金","text":"在忙吗"}]。
  只在他不在面前出现、或这件事本来就适合发消息时用；没发生就写 []。不要替她回消息。
bought：这一段她在剧情里真的买下、带在身上的东西，写成名字数组，比如 ["手冲咖啡"]；没有就写 []。
  只写她留下的东西；吃掉的、用完的、送给别人的不写。钱那边照常报支出。
attrs：这一回合真正变动的自定义数值，写成数组；没有变动就写 []。
  who 留空 = 你的数值；填人物名 = 那个人的数值。
  name 必须用【数值】里给出的原名字，不许自己起新名字。
  钱花出去、赚进来，都要报；不许直接改写余额，只报增减。
同一件事只算一次，不要反复加。`;

/** 主线结算：只算信任，不算心动 */
const MAIN_SETTLE_RULE = `【结算】
每回合结尾在 settle 里申报一次，不许省略。
who：本回合真正跟她有互动的那个男主角，用人物表里的名字；只是远远看见、没说话，就不算，写 ""。
delta：只能取 0、1、3、5、8、-1、-2、-4、-6、-8 之一。
  1 ＝ 多说了一句实情，或提醒了她一句。
  3 ＝ 把要紧的消息交给她，或替她挡了一次麻烦。
  5 ＝ 在别人面前站到她这边，或说出自己真正的立场。
  8 ＝ 把不能外传的东西告诉她，或为她担了风险。
  -1 ＝ 敷衍了一句，她听得出来。
  -2 ＝ 她问的事，他绕开了。
  -4 ＝ 她托付的事，他先顾了自己。
  -6 ＝ 答应她的事没做到，也没解释。
  -8 ＝ 他看见你跟别的男人走得近（只能是没有名字的人，绝不能是另一个男主角）。
  这里报的是信任，不是心动：数值再高也不写情话、不写告白。
  什么都没发生就写 0。
reason：一句话说明为什么，写具体的事，不写"气氛很好"。
minutes：这一回合过去了多少分钟，只填数字，不写时刻。
  几句闲话 5 到 15；一顿饭 45 到 90；赶一趟路 20 到 90；睡一觉 360 到 540；最多 720。
  没干别的事就填 15。不要写「傍晚」「第二天」这类字眼，钟由程序走。
money：这一段真的发生的金钱变化，正数是收入，负数是支出，只填数字。
  工资、转账、买东西、付房租、收红包都算；没发生就写 0。金额要符合这个人的收入和一贯的消费方式，不许凭空给大额。
moneyReason：一句话说清这笔钱怎么回事，比如「便利店夜班工资」「他转来的 200」「买了一杯手冲」。
phone：这一回合有没有人在手机里找她。最多一条，比如 [{"who":"砂金","text":"在忙吗"}]。
  只在他不在面前出现、或这件事本来就适合发消息时用；没发生就写 []。不要替她回消息。
bought：这一段她在剧情里真的买下、带在身上的东西，写成名字数组，比如 ["手冲咖啡"]；没有就写 []。
  只写她留下的东西；吃掉的、用完的、送给别人的不写。钱那边照常报支出。
attrs：这一回合真正变动的自定义数值，写成数组；没有变动就写 []。
  who 留空 = 你的数值；填人物名 = 那个人的数值。
  name 必须用【数值】里给出的原名字，不许自己起新名字。
  钱花出去、赚进来，都要报；不许直接改写余额，只报增减。
同一件事只算一次，不要反复加。`;

/** 主线是多人同台：每个人只知道自己那一份，互不串消息 */
const MAIN_ISOLATION = `【主线 · 多人同台】
这一场是公开场合，几位男主角各有各的目标。
- 每个人只知道他自己和你之间发生过的事；他们彼此不熟识，也不清楚你跟别人私下怎么相处。
- 不打听、不提起你和别的男人的私事，不暗示他们互相认识，也不替别人转述。
- 你和他之间可以亲近、可以动心，但只发生在你们两个人之间；同一场里有别人时，不外露。
- 不要凭空让两个男主角聊起你，也不要写他们交换关于你的消息、互相吃醋或结盟。`;

/** 主线：没有章节、没有终点，靠一条核心线索一直往下接；个人线只写两个人 */
function chapterText(world: World, save: Save): string {
  if (save.kind === 'route') {
    return [
      '【个人线】',
      '这条线里只有你和他，没有主线任务，也没有别人来打断；别的男主角不存在，也不要提起。',
      '这条线里发生的事不会回到主线，也不会让别的男主角知道；反过来，你只记得主线里和他公开层面的相处。',
      '时间一直往前，不用急着收尾；每一次见面都可以比上一次更近一点。',
      '这里报的数值是羁绊，按现在的数值走，不要硬压回 30，也不要凭空跳到下一档。',
    ].join('\n');
  }
  const core = (world.outline || '').trim();
  return [
    '【主线】',
    '这是一条没有终点的主线，不是有限的几章。你不写结局，也不主动收尾：每一回合往后接一点，一直接下去。',
    core
      ? `主线的核心线索：${core}\n所有事件都要挂在这条线索上；推进可以慢，但每一回合都得是它的一部分。`
      : '还没有给出核心线索：从世界观和开局里自己找出一个能长期追下去的事，把它当成主线核心，不要凭空结束它。',
    '不要写「第几章」「本章完」这类字样，也不要在正文里宣告阶段结束。',
    '需要换地方、换日子的时候，让事情自己把场景带过去：一件办完了，下一件自然浮上来。',
    '主线是公开面：有别人在场时，他和你只到熟识，不外露；只有你们两个人时，可以更近，亲密尺度按下面的数值走。',
    '主线里的数值是信任：涨的是他肯不肯跟你说真话、愿不愿意约你单独见面；到了相应档位，亲近会自然发生。',
  ].join('\n');
}

/** 亲密尺度：按好感档位管身体接触到哪一步 */
function intimacyText(): string {
  return [
    '【亲密尺度】',
    '0 到 30：只到目光、擦肩、递东西时指尖碰到。',
    '30 到 50：点到为止的触碰。不许写成「我要抱抱」「我能牵你吗」这种当面索要，要顺势发生：散场人多，他把你往怀里带了一下；并肩走路时指尖蹭到，他不动声色地勾住；电车上你睡着了靠上他的肩，他不叫醒，只把你挪到更稳的位置。做完就过去，不解释，不表白。',
    '50 到 80：已经更进一步。牵手不再是躲着的，亲吻是情不自禁的，可以写，但不展开。',
    '80 到 100：不必有明确的告白。两个人独处，一个眼神就吻上了，也不需要谁先说破。到了这一档才允许更进一步；真的发生了，就默认已经在一起，不用再补一句「我们在一起吧」。',
    '不到相应档位，一处都不许越界；到了也要留在这一档内，不要抢下一步。',
  ].join('\n');
}

const STAGE_HINT: Record<string, string> = {
  陌路: '客气，分寸很足，不多问，不越界。',
  认识: '记得你说过的话，会多问一句，但还不会主动找你。',
  熟: '会自己找由头见你，有一点不承认的占有欲。',
  私交: '已经说破，会在意你跟谁在一起，也会明着护你。',
  全心: '不再掂量，把你放在他自己前面。',
};

/** 主线的信任到了哪一档，态度怎么变；只说分寸，不说恋爱 */
const TRUST_HINT: Record<string, string> = {
  戒备: '客气，话留三分，不交底。',
  公事: '只谈手上的事，肯听，但不主动多说。',
  信任: '肯把一部分实情告诉你，遇事会想到你。',
  交心: '自己的难处肯说，也肯替你担事。',
  托付: '把最要紧的东西交到你手上，但不越界。',
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

function selfText(world: World): string {
  const s = world.self || {};
  const note = (s.note || world.protagonist || '').trim();
  const lines = [
    s.name ? `名字：${s.name}` : '',
    s.age ? `年龄：${s.age}` : '',
    s.role ? `身份：${s.role}` : '',
    (s.regions || []).length ? `地区与势力：${(s.regions || []).join('、')}` : '',
    s.called ? `别人怎么称呼她：${s.called}` : '',
    s.speech ? `说话习惯：${s.speech}` : '',
    note ? `其他：${note}` : '',
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : '（未设定，按世界观推断）';
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
  scan(world.placeList);
  (world.characters || []).forEach(n => {
    if (n.role !== 'npc' || n.mode !== 'dynamic') return;
    if (!(n.keywords || []).some(k => k.trim() && input.includes(k.trim()))) return;
    hits[`npc:${n.id}`] = idx;
    changed = true;
  });
  if (!changed) return save;
  const state: GameState = { ...(save.state || emptyState()), hits };
  return { ...save, state };
}

/** 离这个节日还有几天（0 就是今天） */
export function festivalDaysUntil(date: string | undefined, clock: Clock): number | null {
  if (!date) return null;
  const m = date.match(/(\d{1,2})\s*[月\-/]\s*(\d{1,2})/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (!month || !day) return null;
  const now = Date.UTC(clock.y, clock.m - 1, clock.d);
  let target = Date.UTC(clock.y, month - 1, day);
  if (target < now) target = Date.UTC(clock.y + 1, month - 1, day);
  return Math.round((target - now) / 86400000);
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
  add('关系规则', world.relations);
  add('货币系统', world.currency);
  (world.placeList || []).forEach((p, i) => {
    if (pick(p, i)) out.push({ ...p, content: p.content.trim() });
  });
  add('主线大纲', world.outline);
  add('禁忌', world.banned);
  add('文风', world.style);
  const clock = save.state?.clock;
  if (clock) {
    const routeId = routeCharacterId(save);
    const cast = (world.characters || []).filter(
      c => c.role === 'npc' || !routeId || c.id === routeId,
    );
    cast.forEach(c => {
      const b = (c.birthday || '').trim();
      if (!b) return;
      const days = festivalDaysUntil(b, clock);
      if (days === null || days < 0 || days > 2) return;
      out.push({
        title: `生日 · ${c.name}（${days === 0 ? '就是今天' : `还有 ${days} 天`}）`,
        content: `${b} 是${c.name}的生日。${days === 0 ? '今天就是。' : `还有 ${days} 天。`}这件事可以自然地出现在相处里；要不要准备、当天怎么过，由她决定，不要替她安排。`,
        mode: 'always',
      });
    });
    const myBirthday = (world.self?.birthday || '').trim();
    if (myBirthday) {
      const days = festivalDaysUntil(myBirthday, clock);
      if (days !== null && days >= 0 && days <= 2) {
        out.push({
          title: `生日 · 她（${days === 0 ? '就是今天' : `还有 ${days} 天`}）`,
          content: `${myBirthday} 是她的生日。${days === 0 ? '今天就是。' : `还有 ${days} 天。`}认识她的人会用自己的方式对待这一天；不要替她决定怎么过。`,
          mode: 'always',
        });
      }
    }
  }
  (world.events || []).forEach((e, i) => {
    if (e.kind === 'festival' && save.state?.clock) {
      const days = festivalDaysUntil(e.date, save.state.clock);
      const ahead = e.ahead ?? 2;
      if (days !== null && days >= 0 && days <= ahead && e.content.trim()) {
        out.push({
          title: `节日 · ${e.title || '节日'}（${days === 0 ? '就是今天' : `还有 ${days} 天`}）`,
          content: e.content.trim(),
          mode: 'always',
        });
        return;
      }
    }
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
    const isMain = save.kind === 'main';
    const shown = isMain ? Math.min(100, v) : v;
    const stage = isMain ? trustStageOf(shown) : stageOf(shown);
    const hint = isMain ? TRUST_HINT[stage] : STAGE_HINT[stage];
    const tag = isMain ? '信任' : '羁绊';
    const extra = (c?.attrs || [])
      .map(a => `${a.name} ${st.charAttrs?.[id]?.[a.id] ?? a.init}`)
      .join('，');
    return `- ${name} · ${tag}：${shown}（${stage}）${hint || ''}${extra ? `｜${extra}` : ''}`;
  });
  const mine = (world.attrs || [])
    .filter(a => a.name.trim())
    .map(a => {
      const v = st.attrs?.[a.id] ?? a.init;
      return `- ${a.name}：${v}${a.max ? ` / ${a.max}` : ''}`;
    });
  const lines = [
    st.clock ? `时间：${clockText(st.clock)}` : st.time ? `时间：${st.time}` : '',
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

export function buildSystem(world: World, save: Save, lang: 'zh' | 'ja' = 'zh'): string {
  const routeId = routeCharacterId(save);
  const leads = world.characters.filter(c => c.role !== 'npc' && c.name.trim());
  const cast = routeId ? leads.filter(c => c.id === routeId) : leads;

  const { recent, place } = recentText(save);
  const npcs = world.characters.filter(c => c.role === 'npc' && c.name.trim());
  const hits = save.state?.hits || {};
  const idx = turnIndex(save);
  const activeNpcs = npcs.filter(n => {
    if (n.mode === 'always') return true;
    if (n.mode === 'dynamic') {
      const hit = hits[`npc:${n.id}`];
      if (hit === undefined) return false;
      return idx - hit <= (n.rounds ?? 2);
    }
    return (
      (n.keywords || []).some(k => k.trim() && recent.includes(k.trim())) ||
      (!!n.region && (place.includes(n.region) || recent.includes(n.region)))
    );
  });

  const isRoute = save.kind === 'route';
  const stageId = isRoute ? null : sceneLeadOf(world, save);
  const met = stageId ? save.state?.met?.[stageId] : undefined;
  const metNote = met
    ? `【你们私下见过】
你和她在${met.time ? ` ${met.time} ` : '之前'}私下见过 ${met.visits} 次。这些事是真的发生过，但不是这一场该谈的话题：除非她主动提起，不要主动提，也不要把话往那边带。
`
    : '';
  const resumedNote =
    !isRoute && save.state?.resumed
      ? `【她刚回来】
中间隔了些日子，她有自己的事要办；别人只是各忙各的，没有谁一直在等她。开场自然带过，不要追问她做了什么，也不要替她编造。
`
      : '';

  return `你是一款中文乙女向恋爱游戏的叙述者。你负责写这一回合的场面：旁白、对白、她的选择。玩家是女主角，用「你」称呼她。

【玩法】
${isRoute
  ? '这是某个人的个人线：只写这一个男主角和她的相处，其他男主角不在场、也不会被提及姓名。'
  : '这是主线：男主角都可以出现，但每一场只写其中一个；其他人在场也只是没有名字的背景。'}

【世界观】
${blocksText(world, save)}

【主角】
${selfText(world)}
${stateText(world, save) ? `\n${stateText(world, save)}\n` : ''}
${metNote}${resumedNote}
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
时间由系统给出，你只报这一回合过了几分钟；正文里可以写「天黑了」「快打烊了」，但不要写具体钟点。

${chapterText(world, save)}

${isRoute ? '' : `${MAIN_ISOLATION}\n\n`}${intimacyText()}

${isRoute ? ROUTE_SETTLE_RULE : MAIN_SETTLE_RULE}

【输出】
${FORMAT}${lang === 'ja' ? JA_RULE : ''}`;
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

/** 这一场在场的是谁：先看她这句话里点了谁，再看上一个回合记下的人 */
export function sceneLeadOf(world: World, save: Save): string | undefined {
  if (save.kind === 'route') return save.routeOf;
  const input = lastUserText(save);
  const named = world.characters.find(
    c => c.role !== 'npc' && c.name.trim() && input.includes(c.name.trim()),
  );
  if (named) return named.id;
  for (let i = save.turns.length - 1; i >= 0; i--) {
    const t = save.turns[i];
    if (t.role === 'assistant' && t.with) return t.with;
  }
  return undefined;
}

/** 没有标明在场者的回合按公开场面处理；标了别人的，不带进这一场 */
function belongsToScene(t: Turn, lead?: string): boolean {
  if (!lead || !t.with) return true;
  return t.with === lead;
}

/** 个人线开局时，把他和她在主线公开层面的经过带几条过来 */
function publicRecap(main: Save | undefined, cid: string | null): string {
  if (!main || !cid) return '';
  const assists = main.turns.filter(t => t.role === 'assistant');
  const sums = new Map((main.summaries || []).map(s => [s.turn, s.text]));
  const lines: string[] = [];
  assists.forEach((t, i) => {
    // 只带他自己在场的，以及不带任何人的公开场面
    if (t.with && t.with !== cid) return;
    const s = sums.get(i + 1);
    if (s) lines.push(`- ${s}`);
  });
  return lines.slice(-5).join('\n');
}

export function buildMessages(
  world: World,
  save: Save,
  lang: 'zh' | 'ja' = 'zh',
  parentMain?: Save,
): ChatMessage[] {
  const system = buildSystem(world, save, lang);
  const history: ChatMessage[] = [];
  const memory: string[] = [];
  const sums = new Map((save.summaries || []).map(s => [s.turn, s.text]));
  const total = save.turns.filter(t => t.role === 'assistant').length;
  const cut = Math.max(0, total - KEEP_ROUNDS);
  const lead = sceneLeadOf(world, save);
  let no = 0;

  for (const t of save.turns) {
    if (t.role === 'assistant') no += 1;
    if (cut > 0 && no <= cut) {
      // 已经滑出窗口：有摘要就只发摘要，没有就用一小截原文兜底
      if (t.role === 'assistant') {
        if (!belongsToScene(t, lead)) continue;
        const s = sums.get(no);
        const label = chapterLabel(no);
        memory.push(s ? `- ${label}：${s}` : `- ${label}：${flatten(t).slice(0, 160)}`);
      } else if (!sums.has(no + 1)) {
        memory.push(`- 她说：${t.text.slice(0, 80)}`);
      }
      continue;
    }
    // 别的男主角的私人场面，不带进这一场
    if (t.role === 'assistant' && !belongsToScene(t, lead)) continue;
    history.push({ role: t.role, content: flatten(t) });
  }

  if (history.length === 0) {
    const routeLead =
      save.kind === 'route' && save.routeOf
        ? world.characters.find(c => c.id === save.routeOf)
        : undefined;
    if (routeLead) {
      history.push({
        role: 'user',
        content: `现在是${routeLead.name}的个人线第一回合。时间地点接着主线这里：${
          save.state?.time || '未定'
        }${save.state?.place ? `，${save.state.place}` : ''}。请写你们碰面的这一刻，从眼下的场景直接开始，不要重述世界观，也不要写开场白。`,
      });
    } else if (world.opening) {
      history.push({ role: 'user', content: `开场：\n${world.opening}\n\n请从这里接着写第一回合。` });
    }
  }

  const parts: string[] = [];
  const recap = save.kind === 'route' ? publicRecap(parentMain, save.routeOf || null) : '';
  if (recap) {
    parts.push(
      `【你们在主线里一起经历过的事】\n这些只有公开层面的事，发生在主线里；你们私下怎么相处不在其中，也不要主动提起。\n${recap}`,
    );
  }
  if (memory.length) {
    parts.push(
      `【更早的经过】\n前面几回合已经滑出原文窗口，下面是当时留下的事件摘要。钱、礼物、约定、称呼都在里面，接着它们写，不要重新问已经发生过的事。\n${memory.join('\n')}`,
    );
  }
  const memo = parts.length ? `\n\n${parts.join('\n\n')}` : '';

  return [{ role: 'system', content: system + memo }, ...history];
}

/** 最近保留原文的回合数；再往前只发摘要 */
export const KEEP_ROUNDS = 5;

const SUMMARY_RULE = `你在给一段中文乙女游戏剧情做事件摘要。只写事实，不写文笔。
要求：
- 八十个字以内，能更短就短，不要硬凑。
- 只写这一回合真正发生的事，一到三件，按顺序。
- 钱写清：谁给谁多少、为什么。
- 礼物或物品写清：谁给谁、是什么。
- 约定写清：谁答应了什么、什么时候、做到没有。
- 称呼变化、身份线索、关系变化，一句话带过。
- 删掉天气、环境、形容词、心理描写和语气词。
- 不要编造没发生的事。
- 直接输出摘要正文，不要标题、引号、项目符号，也不要 JSON。`;

/** 一回合结束就摘一次，摘要不发给模型，等滑出窗口才用 */
export function buildSummaryMessages(
  world: World,
  save: Save,
  turn: Turn,
  herWords: string,
): ChatMessage[] {
  const onRoute = save.kind === 'route' && save.routeOf;
  const who = onRoute ? world.characters.find(c => c.id === save.routeOf)?.name : '';
  const body = [herWords ? `她说：${herWords}` : '', flatten(turn)].filter(Boolean).join('\n\n');
  return [
    { role: 'system', content: SUMMARY_RULE },
    {
      role: 'user',
      content: `${who ? `这条线是${who}。` : ''}地点：${
        turn.place || save.state?.place || '未写明'
      }；时间：${turn.time || save.state?.time || '未写明'}。\n\n${body}`,
    },
  ];
}
