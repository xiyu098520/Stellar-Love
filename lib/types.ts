export type Segment =
  | { type: 'narration'; text: string }
  | { type: 'dialogue'; who: string; text: string; tone?: string; ja?: string };

export type Turn = {
  role: 'user' | 'assistant';
  /** 用户输入或模型正文 */
  text: string;
  segments?: Segment[];
  choices?: string[];
  time?: string;
  place?: string;
  /** 这一回合真正在场的男主角 id；用来把主线记忆按人分片 */
  with?: string;
};

/** 玩家自己 */
export type SelfProfile = {
  name?: string;
  age?: string;
  /** 生日，如 9月20日；提前两天交给模型 */
  birthday?: string;
  /** 身份：哪家公司的什么人 */
  role?: string;
  /** 地区与势力，可以挂多个：自己的店、所属机构都算 */
  regions?: string[];
  /** 别人怎么称呼你 */
  called?: string;
  /** 说话习惯 */
  speech?: string;
  /** 其余资料 */
  note?: string;
};

export type Character = {
  id: string;
  name: string;
  /** 主角色＝能开个人线；NPC＝按关键词/地区临时出现 */
  role?: 'lead' | 'npc';
  age?: string;
  /** 生日，如 9月14日；提前两天交给模型 */
  birthday?: string;
  avatar?: string;
  voiceId?: string;
  identity?: string;
  speech?: string;
  /** 个人资料 / 备注 */
  note?: string;
  /** NPC：说到这些词就出现 */
  keywords?: string[];
  /** NPC：怎么出现 */
  mode?: 'always' | 'keyword' | 'dynamic';
  /** NPC：动态出现后持续几轮 */
  rounds?: number;
  /** 所属地区与势力，可以挂多个 */
  regions?: string[];
  /** 旧数据：单个地区，读取时会并进 regions */
  region?: string;
  /** NPC：能不能在手机通讯录里找到 */
  contact?: boolean;
  fields?: { k: string; v: string }[];
  /** 这个角色自己的数值，比如黑化度 */
  attrs?: AttrDef[];
};

export type WorldBlock = {
  title: string;
  content: string;
  /** 怎么交给模型：常驻 / 关键词 / 动态 / 地点 / 关闭；不填按常驻 */
  mode?: 'always' | 'keyword' | 'dynamic' | 'place' | 'off';
  /** 动态：命中之后还持续几轮 */
  rounds?: number;
  /** 说到这些词就注入 */
  keywords?: string[];
  /** 人到了这里就注入 */
  place?: string;
  /** 正文里出现这些词，本次就不再注入 */
  endKeywords?: string[];
};

/** 一条事件：信息、节日、普通事件 */
export type EventEntry = WorldBlock & {
  kind?: 'festival' | 'always' | 'event';
  /** 节日日期，如 12月24日 */
  date?: string;
  /** 节日提前几天开始注入，默认 2 天 */
  ahead?: number;
  /** 一句话简介 */
  desc?: string;
};

/** 一条自定义数值：初始值、上限（不填＝无上限） */
export type AttrDef = {
  id: string;
  name: string;
  init: number;
  max?: number;
};

export type World = {
  id: string;
  title: string;
  updatedAt: number;
  /** 原著 / 出处 */
  source?: string;
  /** 一句话简介 */
  tagline?: string;
  /** 世界观 · 时代与科技 */
  era?: string;
  /** 世界观 · 核心规则 */
  rules?: string;
  /** 世界观 · 重要场所与势力（旧版大文本，仅用于迁移） */
  places?: string;
  /** 世界观 · 场所列表 */
  placeList?: WorldBlock[];
  /** 世界观 · 货币系统 */
  currency?: string;
  /** 世界观 · 关系规则：四线互不相见、换线认知重排这类 */
  relations?: string;
  /** 开局日期，如 2065-09-12 */
  startDate?: string;
  /** 开局时刻，如 08:00 */
  startTime?: string;
  /** 主线方向：核心线索，不是章节 */
  outline?: string;
  /** 规则与禁忌 */
  banned?: string;
  /** 文风样本 */
  style?: string;
  /** 补充栏目（旧版，迁移进 events） */
  extras?: WorldBlock[];
  /** 事件：节日 / 常驻 / 动态 / 事件 */
  events?: EventEntry[];
  /** 剧本里的物品与商店 */
  items?: Item[];
  /** 番外 */
  specials?: ExtraStory[];
  /** 开局资金 */
  initialMoney?: number;
  /** 每回合赚的抽卡币，默认 100 */
  coinPerTurn?: number;
  /** 单抽花费，默认 100 */
  pullCost?: number;
  /** 十连花费，默认 900 */
  tenPullCost?: number;
  /** 旧档案原样保留，新档案不用 */
  blocks?: WorldBlock[];
  characters: Character[];
  /** 你的全局数值，比如金钱、经验、体力 */
  attrs?: AttrDef[];
  /** 玩家自己 */
  self?: SelfProfile;
  protagonist?: string;
  notes?: string;
  opening?: string;
  summary?: string;
};

/** 番外：抽到或满足条件才能看的一小段故事 */
export type ExtraStory = {
  id: string;
  title: string;
  /** 绑定哪个男主，不填是公共番外 */
  characterId?: string;
  desc?: string;
  content: string;
  /** gacha 抽到才解锁；free 一直能看 */
  unlock?: 'gacha' | 'free';
};

/** 一件剧本里的实物，可买可送 */
export type Item = {
  id: string;
  name: string;
  desc?: string;
  price: number;
  /** 商店分组，比如奶茶店、日用品店 */
  shop?: string;
  /** gift 有纪念意义；daily 日常消耗，不进赠礼记录 */
  kind?: 'gift' | 'daily' | 'collect';
};

/** 一笔钱的进出 */
export type MoneyEntry = {
  id: string;
  at: number;
  turnIndex: number;
  time?: string;
  place?: string;
  /** 正为收入，负为支出 */
  amount: number;
  reason: string;
  who?: string;
};

/** 真正送到他手里的一件东西 */
export type GiftEntry = {
  id: string;
  characterId: string;
  characterName: string;
  itemId: string;
  itemName: string;
  at: number;
  time?: string;
  line: 'main' | 'route';
  saveId: string;
  memorable?: boolean;
};

/** 一条带日期的约定，到了那天会出现在待办里 */
export type Appointment = {
  id: string;
  characterId: string;
  characterName: string;
  turnIndex: number;
  clock: Clock;
  place?: string;
  note?: string;
  done?: boolean;
};

/** 跨存档共用的一份钱包：钱、抽卡币、背包、账目、送出的东西 */
export type Wallet = {
  money: number;
  coins: number;
  inventory: Record<string, number>;
  ledger: MoneyEntry[];
  gifts: GiftEntry[];
  /** 已经抽到的番外 id */
  unlocked?: string[];
};

export type Relation = {
  a: string;
  b: string;
  level?: number;
  state?: string;
};

export type SaveKind = 'main' | 'route' | 'extra';

/** 一次好感结算，一条日志 */
export type AffinityEntry = {
  id: string;
  characterId: string;
  characterName: string;
  /** 本次变化，正为涨、负为降 */
  delta: number;
  reason: string;
  before: number;
  after: number;
  /** 结算后的阶段名 */
  stage: string;
  at: number;
  turnIndex: number;
  time?: string;
  place?: string;
  /** 模型原样返回的结算申报，便于核对 */
  raw?: string;
  /** 这一回合实际注入了哪些设定栏目 */
  injected?: string[];
  /** 好感，还是自定义数值 */
  kind?: 'affinity' | 'attr';
  /** 自定义数值的名字 */
  attrName?: string;
};

/** 游戏里的一个钟：日期加当天第几分钟 */
export type Clock = {
  y: number;
  m: number;
  d: number;
  /** 0 到 1439 */
  min: number;
};

/** 一局游戏的可变状态：一个钟、一个地点、一份好感、一组数值 */
export type GameState = {
  /** 显示用的时间字符串，由 clock 算出来 */
  time?: string;
  /** 真正的钟，程序负责走 */
  clock?: Clock;
  place?: string;
  affinity: Record<string, number>;
  log: AffinityEntry[];
  /** 你的全局数值：AttrDef.id -> 当前值 */
  attrs?: Record<string, number>;
  /** 角色的额外数值：角色 id -> AttrDef.id -> 当前值 */
  charAttrs?: Record<string, Record<string, number>>;
  /** 动态条目：条目键 -> 最近一次命中的轮次 */
  hits?: Record<string, number>;
  /** 还没完成的约定 */
  appointments?: Appointment[];
  /** 每个角色今天有没有收过礼物：角色 id -> y-m-d */
  giftDay?: Record<string, string>;
  /** 上一次有人在手机里找她是第几回合 */
  phoneAt?: number;
  /** 邀请冷却：角色 id -> 可以再邀请的回合 */
  inviteAt?: Record<string, number>;
  /** 私下见过的记录：角色 id -> 次数和最近一次时间 */
  met?: Record<string, { visits: number; time?: string }>;
  /** 刚从个人线回到主线，下一回合要交代一句；用完即清 */
  resumed?: boolean;
};

/** 一条收藏下来的语音：合成一次，反复听 */
export type VoiceClip = {
  id: string;
  characterId: string;
  characterName: string;
  worldId: string;
  /** 台词原文 */
  text: string;
  /** 音频 dataURL（mp3 base64） */
  audio: string;
  createdAt: number;
};

/** 撤回上一回合用的快照：回合数 + 那一回合之前的状态 */
export type UndoSnapshot = {
  /** 回退后 turns 截到这里 */
  turns: number;
  state: GameState;
  /** 这一回合之前的钱包，撤回时一起退 */
  wallet?: Wallet;
};

/** 一回合的事件摘要：只记事实，八十个字以内 */
export type TurnSummary = {
  /** 第几个回合，从 1 开始 */
  turn: number;
  text: string;
  at: number;
};

export type Save = {
  id: string;
  worldId: string;
  worldTitle: string;
  kind: SaveKind;
  /** 个人线归属的角色 id */
  routeOf?: string;
  /** 个人线从哪份存档（主线）分出 */
  parentId?: string;
  title: string;
  turns: Turn[];
  relations: Relation[];
  state?: GameState;
  /** 每回合一条，原文还在，只是发给模型时前面几条换成摘要 */
  summaries?: TurnSummary[];
  /** 只留一级：撤回上一回合 */
  undo?: UndoSnapshot;
  createdAt: number;
  updatedAt: number;
};

/** 四类接口：正文 / 助手归总 / 语音朗读 / 图像 */
export type ApiKind = 'story' | 'assistant' | 'tts' | 'image';

/** 一套接口配置，可存多套当预设用 */
export type ApiProfile = {
  id: string;
  kind: ApiKind;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  /** 语音 */
  voiceId?: string;
  /** 每个角色各自的音色，键是角色 id；没配的用 voiceId 兜底 */
  voices?: Record<string, string>;
  speed?: number;
  lang?: 'zh' | 'ja';
  tone?: string;
  /** 图像 */
  size?: string;
};

export type Settings = {
  profiles: ApiProfile[];
  /** 每一类当前用哪一套 */
  active: Partial<Record<ApiKind, string>>;
  voiceEnabled?: boolean;
  wallpaper?: string;
  wallpaperName?: string;
};

/** 角色的地区与势力；旧数据里的单个 region 也算进来 */
export function characterRegions(c: Character): string[] {
  const list = (c.regions || []).filter(Boolean);
  if (c.region && !list.includes(c.region)) list.push(c.region);
  return list;
}
