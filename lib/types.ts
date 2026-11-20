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
  blocks: WorldBlock[];
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
