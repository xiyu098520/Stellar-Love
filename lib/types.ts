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
  avatar?: string;
  voiceId?: string;
  identity?: string;
  speech?: string;
  fields?: { k: string; v: string }[];
};

export type WorldBlock = { title: string; content: string };

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
  /** 世界观 · 重要场所与势力 */
  places?: string;
  /** 主线大纲，一章一行 */
  outline?: string;
  /** 规则与禁忌 */
  banned?: string;
  /** 文风样本 */
  style?: string;
  /** 补充栏目 */
  extras?: WorldBlock[];
  /** 旧档案原样保留，新档案不用 */
  blocks?: WorldBlock[];
  characters: Character[];
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
};

/** 一局游戏的可变状态：一个钟、一个地点、一份好感 */
export type GameState = {
  time?: string;
  place?: string;
  affinity: Record<string, number>;
  log: AffinityEntry[];
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
