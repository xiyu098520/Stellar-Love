export type Segment =
  | { type: 'narration'; text: string }
  | { type: 'dialogue'; who: string; text: string; tone?: string };

export type Turn = {
  role: 'user' | 'assistant';
  /** 用户输入或模型正文 */
  text: string;
  segments?: Segment[];
  choices?: string[];
  time?: string;
  place?: string;
};

export type Character = {
  id: string;
  name: string;
  /** 主角色＝能开个人线；NPC＝按关键词/地区临时出现 */
  role?: 'lead' | 'npc';
  age?: string;
  avatar?: string;
  voiceId?: string;
  identity?: string;
  speech?: string;
  /** 个人资料 / 备注 */
  note?: string;
  /** NPC：说到这些词就出现 */
  keywords?: string[];
  /** NPC：怎么出现 */
  mode?: 'always' | 'keyword';
  /** NPC：所属地区，对应场所里的名称 */
  region?: string;
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

/** 一条事件：节日、常驻、动态、普通事件 */
export type EventEntry = WorldBlock & {
  kind?: 'festival' | 'always' | 'dynamic' | 'event';
  /** 节日日期，如 12月24日 */
  date?: string;
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
  /** 旧档案原样保留，新档案不用 */
  blocks?: WorldBlock[];
  characters: Character[];
  /** 你的全局数值，比如金钱、经验、体力 */
  attrs?: AttrDef[];
  protagonist?: string;
  notes?: string;
  opening?: string;
  summary?: string;
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

/** 一局游戏的可变状态：一个钟、一个地点、一份好感、一组数值 */
export type GameState = {
  time?: string;
  place?: string;
  affinity: Record<string, number>;
  log: AffinityEntry[];
  /** 你的全局数值：AttrDef.id -> 当前值 */
  attrs?: Record<string, number>;
  /** 角色的额外数值：角色 id -> AttrDef.id -> 当前值 */
  charAttrs?: Record<string, Record<string, number>>;
  /** 动态条目：条目键 -> 最近一次命中的轮次 */
  hits?: Record<string, number>;
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
