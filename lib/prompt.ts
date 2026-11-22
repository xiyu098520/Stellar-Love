'use client';

import type { ChatMessage } from './llm';
import { emptyState, stageOf } from './affinity';
import { chapterLabel, chapterNo, CHAPTER_SIZE } from './chapter';
import { clockText } from './clock';
import type { Character, Clock, GameState, Save, Turn, World, WorldBlock } from './types';
import { characterRegions } from './types';

const FORMAT = `只输出一个 JSON 对象，不要任何解释、不要代码块围栏：
{
  "segments": [
    { "type": "action", "text": "先把她这一回合的输入演一遍：她做了什么、说了什么" },
    { "type": "narration", "text": "旁白段落" },
    { "type": "dialogue", "who": "人物表里的名字", "text": "他说的话，不加引号", "tone": "softly" }
  ],
  "choices": ["顺着往前的一条", "反过来或岔开的一条"],
  "threads": ["9月2日 · 答应他：……（还没做）"],
  "plan": { "scene": "下一回合最可能到的场面", "cast": ["可能碰上的人"] },
  "place": "下城 · 旧宅",
  "settle": { "who": "砂金", "delta": 3, "reason": "你说中了他喜欢的老唱片", "minutes": 15,
              "money": 0, "moneyReason": "",
              "bought": [],
              "attrs": [{ "who": "", "name": "金钱", "delta": -38, "reason": "买了一杯手冲" }] }
}
tone 可选，只能是 sighs、whispers、softly、laughs、sad、happy、angry、excited、nervous、calm、tired、sarcastic 之一。
segments 至少 4 段、正文合计 800 到 1600 字。每一段都要短：叙述一句到两句，台词一条一句，不要出现整段大块文字。
第一段必须是 action：把玩家这一回合的输入重新演一遍，保留她做的事和话，不加她没做的事，也不整句复读。之后才是别人的反应和场面变化。
只要有人开口，就必须单独占一条 dialogue，一句台词一条；同一个人连说三句，就写成三条 dialogue，不要把三句塞进一条。
没有名字的人（店员、员工、助理、路人）开口时，who 写身份称呼，例如「便利店店员」。
choices 固定 2 条：一条顺（靠近、应下、接住话、给对方台阶），一条反（顶回去、岔开、起身要走、当面挑明、只回一半、干脆不做）。每条都要接住本回合抛出的所有钩子——他递来的东西、发来的消息、问了没答的话；写成完整的一套动作加一句说出口的话，不写心理活动，不缩成「我笑了笑」这种半句。
threads 只写这回合新埋的、变了的、刚好兑现的钩子，每条以日期开头；兑现的那条原样抄下来，句首加「✓」。没有就写 []。
plan 只是打算，不是承诺：scene 一句话，cast 最多三个现在不在场的人物表名字；走岔了就作废。`;

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
moneyReason：一句话说清这笔钱怎么回事，比如「店里的工钱」「他转来的 200」「买了一杯手冲」。
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
  -8 ＝ 他看见你跟别的男人走得近（别的男主角也算，可以吃醋、可以装作没看见）。
  这里报的是好感：涨的是他肯不肯让你靠近，愿不愿意私下见你；到了相应档位，亲近会自然发生。
  什么都没发生就写 0。
reason：一句话说明为什么，写具体的事，不写"气氛很好"。
minutes：这一回合过去了多少分钟，只填数字，不写时刻。
  几句闲话 5 到 15；一顿饭 45 到 90；赶一趟路 20 到 90；睡一觉 360 到 540；最多 720。
  没干别的事就填 15。不要写「傍晚」「第二天」这类字眼，钟由程序走。
money：这一段真的发生的金钱变化，正数是收入，负数是支出，只填数字。
  工资、转账、买东西、付房租、收红包都算；没发生就写 0。金额要符合这个人的收入和一贯的消费方式，不许凭空给大额。
moneyReason：一句话说清这笔钱怎么回事，比如「店里的工钱」「他转来的 200」「买了一杯手冲」。
  只在他不在面前出现、或这件事本来就适合发消息时用；没发生就写 []。不要替她回消息。
bought：这一段她在剧情里真的买下、带在身上的东西，写成名字数组，比如 ["手冲咖啡"]；没有就写 []。
  只写她留下的东西；吃掉的、用完的、送给别人的不写。钱那边照常报支出。
attrs：这一回合真正变动的自定义数值，写成数组；没有变动就写 []。
  who 留空 = 你的数值；填人物名 = 那个人的数值。
  name 必须用【数值】里给出的原名字，不许自己起新名字。
  钱花出去、赚进来，都要报；不许直接改写余额，只报增减。
同一件事只算一次，不要反复加。`;

/** 主线是多人同台：男主可以互相认识、竞争，也可以和平共处 */
const MAIN_ISOLATION = `【主线 · 多人同台】
这一场可以只有一个人，也可以几个人同时在。
- 男主角之间可以认识，也可以不认识；认识的话，可能是同事、旧识、对手，也可能只是听说过。
- 他们可以竞争、试探、互相拆台，也可以客气地和平共处。吃醋、结盟、交换消息都可以写，但要符合各自的性格和立场。
- 每场有一个主视角：谁在跟她说重要的话，谁就是这一场的主；其他人不抢戏，也不长篇大论。
- 不要为了热闹把所有人都塞进来；不在场的人就不出现。`;

/** 主线：没有章节、没有终点，靠一条核心线索一直往下接；个人线只写两个人 */
function chapterText(world: World, save: Save): string {
  if (save.kind === 'route') {
    return [
      '【个人线】',
      '这是主线之外的空档，只有你和他，没有工作，也没有别人来打断。',
      '他不是失忆：主线里见过、说过的事，他都记得；别人不知道细节，也不会强行追问。',
      '时间一直往前，不用急着收尾；每一次见面都可以比上一次更近一点。',
      '这里报的数值是好感，按现在的数值走，不要硬压，也不要凭空跳档。',
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
    '有人在场的场合，他们会装作跟你只是认识；只有你们两个人在时，才把话说开、把距离缩短。这层遮掩本身就是偷情的一部分，不是禁令。',
    '这里的数值是好感：涨的是他愿不愿意让你靠近；到了相应档位，亲近会自然发生，不必先告白。',
  ].join('\n');
}

/** 亲密尺度：按好感档位管身体接触到哪一步 */
function intimacyText(): string {
  return [
    '【亲密尺度】',
    '0 到 30：只到目光、擦肩、递东西时指尖碰到。',
    '30 到 50：点到为止的触碰。不许写成「我要抱抱」「我能牵你吗」这种当面索要，要顺势发生：散场人多，他把你往怀里带了一下；并肩走路时指尖蹭到，他不动声色地勾住；马车上你睡着了靠上他的肩，他不叫醒，只把你挪到更稳的位置。做完就过去，不解释，不表白。',
    '50 到 80：已经更进一步。牵手不再是躲着的，亲吻是情不自禁的，可以写，但不展开。',
    '80 到 100：不必有明确的告白。两个人独处，一个眼神就吻上了，也不需要谁先说破。到了这一档才允许更进一步；真的发生了，就默认已经在一起，不用再补一句「我们在一起吧」。',
    '不到相应档位，一处都不许越界；到了也要留在这一档内，不要抢下一步。',
    '亲密不是每回合都有：多数回合只写相处、对话和日常；连续两章都写亲密，要有一个由头。',
    '到了那一步，主体永远是两个人的呼吸、体温、手的落点、衣服和距离；可以带一笔门外或旁人的反应，一两句就回来，不让人抢戏。不写逐句协商、不写确认式的问答。',
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

/** 固定栏目：一局里不会变，放在 system 最前面，缓存才能一直命中 */
export function worldBlocks(world: World): WorldBlock[] {
  const out: WorldBlock[] = [];
  const add = (title: string, content?: string) => {
    if (content && content.trim()) out.push({ title, content: content.trim(), mode: 'always' });
  };
  add('时代与科技', world.era);
  add('核心规则', world.rules);
  add('关系规则', world.relations);
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

/** 跟着这一场走的条目：地点、节日、临时资料。每回合都可能变，只放进最后的用户消息 */
export function dynamicBlocks(world: World, save: Save): WorldBlock[] {
  const { recent, place } = recentText(save);
  const input = lastUserText(save);
  const index = turnIndex(save);
  const hits = save.state?.hits || {};

  const pick = (b: WorldBlock, i: number) => {
    if (!b.content.trim()) return false;
    if ((b.mode || 'always') === 'off') return false;
    const key = entryKey(b, i);
    const t = b.title || '';
    // 人就在这、或这一场里提到了，才展开完整内容
    if (t && place && place.includes(t)) return true;
    if (t && recent.includes(t)) return true;
    return entryActive(b, { input, recent, place, index, hits, key });
  };

  const out: WorldBlock[] = [];
  (world.placeList || []).forEach((p, i) => {
    if (pick(p, i)) out.push({ ...p, content: p.content.trim() });
  });
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
  return out;
}

/** 这一回合真正要注入的块（固定 + 动态），给摘要和速查用 */
export function activeBlocks(world: World, save: Save): WorldBlock[] {
  const out = [...worldBlocks(world), ...dynamicBlocks(world, save)];
  return out.length ? out : world.blocks || [];
}

function fixedBlocksText(world: World): string {
  return worldBlocks(world)
    .map(b => `## ${b.title}\n${b.content}`)
    .join('\n\n');
}

function charText(c: Character): string {
  const fields = (c.fields || []).map(f => `- ${f.k}：${f.v}`).join('\n');
  return [
    `### ${c.name}`,
    c.age ? `年龄：${c.age}` : '',
    c.identity ? `身份：${c.identity}` : '',
    characterRegions(c).length ? `地区与势力：${characterRegions(c).join('、')}` : '',
    c.speech ? `说话方式：${c.speech}` : '',
    c.sample ? `说话范例：\n${c.sample}` : '',
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
    const shown = Math.min(100, v);
    const stage = stageOf(shown);
    const hint = STAGE_HINT[stage];
    const tag = '好感';
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

/** 全局注入：场所、事件、配角都放进 system，不再每回合重算 */
function staticWorldText(world: World): string {
  const places = (world.placeList || []).filter(p => (p.content || '').trim());
  const events = (world.events || []).filter(e => (e.content || '').trim());
  const npcs = (world.characters || []).filter(c => c.role === 'npc' && c.name.trim());
  return [
    places.length
      ? `【场所与势力】\n${places.map(p => `## ${p.title}\n${p.content.trim()}`).join('\n\n')}`
      : '',
    events.length
      ? `【事件与节日】\n${events.map(e => `## ${e.title}\n${e.content.trim()}`).join('\n\n')}`
      : '',
    npcs.length ? `【配角】\n${npcs.map(charText).join('\n\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildSystem(world: World, save: Save, lang: 'zh' | 'ja' = 'zh'): string {
  const routeId = routeCharacterId(save);
  const leads = world.characters.filter(c => c.role !== 'npc' && c.name.trim());
  const cast = routeId ? leads.filter(c => c.id === routeId) : leads;

  const isRoute = save.kind === 'route';

  return `你是一款中文乙女向恋爱游戏的叙述者。你负责写这一回合的场面：旁白、对白、她的选择。玩家是女主角，用「你」称呼她。

【玩法】
${isRoute
  ? '这是某个人的个人线：只写这一个男主角和她的相处，其他男主角不在场、也不会被提及姓名。'
  : '这是主线：男主角都可以出现，可以只写一个，也可以在同一个场面里出现几位。有人在场时主次分明，谁在跟她说重要的话，谁就是这一场的主。'}

【世界观】
${fixedBlocksText(world)}

【主角】
${selfText(world)}

【场上可以有的人物】
${cast.map(charText).join('\n\n')}

${staticWorldText(world)}
${isRoute ? '' : `
【男主出场】
- 男主不会无缘无故出现，更不会自己找上门。要他登场，必须有理由：她主动联系、事先约好、事情牵到他、或者她去了他常在的地方。
- 路过、顺路、恰好经过、来讨杯茶，都不算理由。
- 第一次登场之前要先有铺垫：前一两回合提到他的名字、他的东西、他所在的地方，或者让别人提起他。没有铺垫，就不要让他出现。
- 开场前两回合，除非她主动联系或直接去找，男主不出场。
- 同一场可以出现多位男主，但只让一个人在说话；其他人在场就写他们的动静，不要抢话。
- 她没去找、也没碰上他的事时，这一回合就只写工作和日常，不要为了热闹把男主塞进来。

【认识程度】
- 默认她跟这些男主还不熟。没在已经写过的回合里正式见过面，就当第一次见面写：他不知道她是谁，她也不知道他。
- 第一次见面，不叫昵称，不叙旧，不替她回忆“上次”“之前”“又见面了”。
- 他知道的信息只能是当场看到、听到，或者凭工作关系了解到的；不能凭空知道她的私事、过往、工作细节，也不能说「跟你资料上的一样」。
- 有权有势的人能查到一些公开信息，但也只知道摆在明面上的那些，不知道她的私事。
`}

【没有名字的人】
人物表之外的人照样可以出现：路边的摊贩、店里的伙计、你的管家、街上撞到的人、一只赖在门口不走的猫。
- 他们的 who 只用身份称呼，不编名字。摊贩就是「摊贩」，伙计就是「伙计」，你的管家就是「管家」，路上那个人就是「路人」。
- 同一个场景里同一种身份有两个时，写成「伙计甲」「伙计乙」。
- 他们也只是人，会说话、会办事、会不耐烦，但不会抢主角的戏，也不会突然变成恋爱对象。
${attrDefsText(world) ? `\n${attrDefsText(world)}` : ''}

【写法】
句子短，不堆形容词，不用「仿佛」「似乎」「一丝」「不由得」。心理只从外面看：写动作、停顿、视线、呼吸；但心动要写足——耳根热、心跳、手不知道往哪放、话说到一半停住，该甜就甜。
对白不加引号，不用「」。
不替玩家做决定：她的话、她的动作只写玩家自己给出的；可以写她没结论的拉扯，两三句：想说什么又咽回去、两个念头打架、身体先动了脑子还没跟上。不下结论，不写「我明白了」「我确定了」。
每回合都要有人主动往前推，不能只接玩家的话：提问、提议、拦人、递东西、说刚听到的消息，或自己先动起来。上一回合玩家在推，这一回合换别人推。推的是人，不是事：一个眼神、一句追问、一次靠近也算。
不要把选择权丢回玩家：不许用「要不要我……」「你想我……」「这样可以吗」「接下来怎么办」收尾。犹豫写在动作里：手停在半空、看你一眼、多等半秒。一回合最多一个非问不可的问句，而且不能出现在最后一段。
谁登场都要有来由；一场戏只有一个主场：你正跟谁说话，谁就是主场，其他人不抢戏。
钩子必须接住：递到手上的东西、发来的消息、问了没答的话，这一回合要有人提、要有人等回话；下回合必须让它回来，不许当没发生过。
关系按具体的「第一次」推进：第一次单独相处、第一次他等你、第一次留下吃饭、第一次牵手、第一次接吻、第一次说喜欢。跨一次算一格，不能跳，也不能跨过之后假装没发生。
时间要放慢：一段对话、一次对视、一杯酒、一道菜 5 到 15 分钟，一段路 15 到 30 分钟。一个三小时的场面要拆成几个回合才演完；只有玩家明说要走、要睡、隔天再来，才许跨时段。时间和地点接着上一回合，不许跳回白天、不许换城市。
时间由系统给出，正文里要写清钟点，比如「下午三点」「晚上十一点」；跨过零点就换日。
没交换联系方式，就不能收到他的消息；广播、公告、陌生人私信除外。
不重演：档案、回顾、钩子里写过的场景和台词，不许再演一遍。
人物离场要交代去向；一章里最多带进一个新人，配角不抢主场。

${chapterText(world, save)}

${isRoute ? '' : `${MAIN_ISOLATION}\n\n`}${intimacyText()}

${isRoute ? ROUTE_SETTLE_RULE : MAIN_SETTLE_RULE}

【输出】
${FORMAT}${lang === 'ja' ? JA_RULE : ''}`;
}

/** 每回合会变的部分：全部拼到最后一条用户消息里，system 一个字都不动，缓存才能一直命中 */
export function buildTurnContext(world: World, save: Save, parentMain?: Save): string {
  const isRoute = save.kind === 'route';
  const stageId = isRoute ? null : sceneLeadOf(world, save);
  const met = stageId ? save.state?.met?.[stageId] : undefined;
  const metNote = met
    ? `【你们私下见过】
你和她在${met.time ? ` ${met.time} ` : '之前'}私下见过 ${met.visits} 次。这些事是真的发生过，但不是这一场该谈的话题：除非她主动提起，不要主动提，也不要把话往那边带。`
    : '';
  const resumedNote =
    !isRoute && save.state?.resumed
      ? `【她刚回来】
中间隔了些日子，她有自己的事要办；别人只是各忙各的，没有谁一直在等她。开场自然带过，不要追问她做了什么，也不要替她编造。`
      : '';
  const recap = isRoute ? publicRecap(parentMain, save.routeOf || null) : '';
  // 上一回合自己对下一场的设想：只是打算，走向变了就作废
  const lastPlan = [...save.turns]
    .reverse()
    .find(t => t.role === 'assistant' && t.plan && ((t.plan.scene || '').trim() || (t.plan.cast || []).length))?.plan;
  const planBits: string[] = [];
  if (lastPlan) {
    if ((lastPlan.scene || '').trim()) planBits.push(`接下来最可能到「${lastPlan.scene!.trim()}」`);
    if ((lastPlan.cast || []).length) {
      planBits.push(`那里可能碰上 ${(lastPlan.cast || []).join('、')}`);
    }
  }

  return [
    stateText(world, save),
    metNote,
    resumedNote,
    save.threads?.length
      ? `【还没兑现的事】\n${save.threads.map(t => `- ${t}`).join('\n')}\n（答应了、欠着、约好还没到的，这回合该提就提，该还就还，不能当没发生过。）`
      : '',
    planBits.length
      ? `【上一回合的设想】\n${planBits.join('；')}。只是打算，还没发生；真按这个走就先铺垫再让人露面，走岔了就作废。`
      : '',
    recap
      ? `【你们在主线里一起经历过的事】\n这些只有公开层面的事，发生在主线里；你们私下怎么相处不在其中，也不要主动提起。\n${recap}`
      : '',
  ]
    .filter(s => s && s.trim())
    .join('\n\n');
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
  // 一章一条的回顾，存在这一章最后一回合的位置
  const chapterSums = new Map<number, string>();
  for (const s of save.summaries || []) {
    if (s.turn % CHAPTER_SIZE === 0) chapterSums.set(s.turn / CHAPTER_SIZE, s.text);
  }
  const total = save.turns.filter(t => t.role === 'assistant').length;
  // 1–5 章全给原文；跨进第 6 章时整章换掉第 1 章，之后每过一章换一章
  const cut = total > KEEP_ROUNDS ? Math.ceil((total - KEEP_ROUNDS) / CHAPTER_SIZE) * CHAPTER_SIZE : 0;
  let no = 0;

  for (const t of save.turns) {
    if (t.role === 'assistant') no += 1;
    if (cut > 0 && no <= cut) {
      const ch = chapterNo(no);
      const chSum = chapterSums.get(ch);
      // 这一章已经有回顾：只用回顾，不再逐回合复述
      if (chSum && ch * CHAPTER_SIZE <= cut) {
        if (t.role === 'assistant' && no === ch * CHAPTER_SIZE) {
          memory.push(`- 第 ${ch} 章${t.time ? `（${t.time}）` : ''}：${chSum}`);
        }
        continue;
      }
      // 还没到章末：有摘要就只发摘要，没有就用一小截原文兜底
      if (t.role === 'assistant') {
        const s = sums.get(no);
        const label = chapterLabel(no);
        memory.push(s ? `- ${label}：${s}` : `- ${label}：${flatten(t).slice(0, 160)}`);
      } else if (!sums.has(no + 1)) {
        memory.push(`- 她说：${t.text.slice(0, 80)}`);
      }
      continue;
    }
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
  if (memory.length) {
    parts.push(
      `【更早的经过】\n前面几回合已经滑出原文窗口，下面是当时留下的事件摘要。钱、礼物、约定、称呼都在里面，接着它们写，不要重新问已经发生过的事。\n${memory.join('\n')}`,
    );
  }
  const ctx = buildTurnContext(world, save, parentMain);
  if (ctx.trim()) parts.push(ctx);

  // 会变的东西全部拼到最后一条用户消息里，system 和历史保持原样，缓存才能续上
  const block = parts.length ? `【本回合资料】\n${parts.join('\n\n')}\n\n` : '';
  const last = history[history.length - 1];
  if (last && last.role === 'user') {
    history[history.length - 1] = { role: 'user', content: block + last.content };
  } else if (block) {
    history.push({ role: 'user', content: `${block}继续这一回合。` });
  }

  return [{ role: 'system', content: system }, ...history];
}

/** 最近保留原文的回合数；再往前只发章节摘要（五章 = 五十回合） */
export const KEEP_ROUNDS = CHAPTER_SIZE * 5;

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

const CHAPTER_SUMMARY_RULE = `你在给一段中文乙女游戏剧情做章节回顾。只写事实，不写文笔。
要求：
- 三百字以内，能更短就短，不要硬凑。
- 按顺序写清这一章发生了什么：见了谁、做了什么、答应了什么、关系有什么变化。
- 钱写清：谁给谁多少、为什么。
- 重要的物品、线索、约定写清楚。
- 称呼变化、身份线索、关系变化，一句话带过。
- 删掉天气、环境、形容词、心理描写和语气词。
- 不要编造没发生的事。
- 直接输出回顾正文，不要标题、引号、项目符号，也不要 JSON。`;

/** 一章结束时摘一次，存到这一章最后一回合的位置 */
export function buildChapterSummaryMessages(
  world: World,
  save: Save,
  chapter: number,
  blocks: string[],
): ChatMessage[] {
  const onRoute = save.kind === 'route' && save.routeOf;
  const who = onRoute ? world.characters.find(c => c.id === save.routeOf)?.name : '';
  return [
    { role: 'system', content: CHAPTER_SUMMARY_RULE },
    {
      role: 'user',
      content: `${who ? `这条线是${who}。` : ''}这是第 ${chapter} 章。\n\n${blocks.join('\n\n---\n\n')}`,
    },
  ];
}
