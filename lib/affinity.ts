import type { GameState, World } from './types';

/** 阶段门槛：数值到哪一档，他对你的相处方式就变一次 */
export const STAGES = [
  { min: 0, name: '陌路' },
  { min: 30, name: '认识' },
  { min: 50, name: '熟' },
  { min: 80, name: '私交' },
  { min: 100, name: '全心' },
];

/** 主线里的数值是信任，不是恋爱进度 */
export const TRUST_STAGES = [
  { min: 0, name: '戒备' },
  { min: 20, name: '公事' },
  { min: 45, name: '信任' },
  { min: 70, name: '交心' },
  { min: 90, name: '托付' },
];

export function trustStageOf(v: number): string {
  let name = TRUST_STAGES[0].name;
  for (const s of TRUST_STAGES) if (v >= s.min) name = s.name;
  return name;
}

export function stageOf(v: number): string {
  let name = STAGES[0].name;
  for (const s of STAGES) if (v >= s.min) name = s.name;
  return name;
}

/** 掉分下限：跨过的门槛不会跌破，最多掉到下一档的门槛 */
export function floorOf(v: number): number {
  if (v >= 100) return 80;
  if (v >= 80) return 50;
  if (v >= 50) return 30;
  return 0;
}

const UP = [0, 1, 3, 5, 8];
const DOWN = [0, -1, -2, -4, -6, -8];

/** 只认这几档，模型报别的就取最近的 */
export function snapDelta(d: number): number {
  const n = Number(d);
  if (!Number.isFinite(n) || n === 0) return 0;
  const list = n > 0 ? UP : DOWN;
  return list.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best), 0);
}

export function applyDelta(before: number, delta: number): number {
  const after = Math.max(0, Math.min(100, before + delta));
  if (delta < 0) return Math.max(after, floorOf(before));
  return after;
}

export function emptyState(): GameState {
  return { affinity: {}, log: [] };
}

/** 剧本里新加的数值，补齐到已有存档上 */
export function seedState(world: World, st: GameState): GameState {
  const attrs = { ...(st.attrs || {}) };
  for (const a of world.attrs || []) if (attrs[a.id] === undefined) attrs[a.id] = a.init;

  const charAttrs = { ...(st.charAttrs || {}) };
  for (const c of world.characters) {
    const cur = { ...(charAttrs[c.id] || {}) };
    for (const a of c.attrs || []) if (cur[a.id] === undefined) cur[a.id] = a.init;
    charAttrs[c.id] = cur;
  }
  return { ...st, attrs, charAttrs };
}

export function clampAttr(v: number, max?: number): number {
  const n = Math.max(0, Math.round(v));
  return max && max > 0 ? Math.min(max, n) : n;
}

export const DELTA_TABLE = [
  { d: 0, when: '办事、客套、聊完就散' },
  { d: 1, when: '多说了一句私人话' },
  { d: 3, when: '聊到他喜欢的东西，他多讲了两句' },
  { d: 5, when: '他主动了，或说中了他真正在意的东西' },
  { d: 8, when: '碰了手、深夜留你、他说了不该说的' },
  { d: -1, when: '他约你，你改约了' },
  { d: -2, when: '他约你，你婉拒，他有点失落' },
  { d: -4, when: '他把在意的事提过，你没放在心上' },
  { d: -6, when: '他约了你，你没去' },
  { d: -8, when: '他看见你跟别的男人说笑（只能是没名字的人）' },
];
