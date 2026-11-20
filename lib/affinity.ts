import type { GameState } from './types';

/** 阶段门槛：数值到哪一档，他对你的相处方式就变一次 */
export const STAGES = [
  { min: 0, name: '陌路' },
  { min: 30, name: '认识' },
  { min: 50, name: '熟' },
  { min: 80, name: '私交' },
  { min: 100, name: '全心' },
];

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
const DOWN = [0, -4, -6, -8];

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

export const DELTA_TABLE = [
  { d: 0, when: '办事、客套、聊完就散' },
  { d: 1, when: '多说了一句私人话' },
  { d: 3, when: '聊到他喜欢的东西，他多讲了两句' },
  { d: 5, when: '他主动了，或说中了他真正在意的东西' },
  { d: 8, when: '碰了手、深夜留你、他说了不该说的' },
  { d: -4, when: '他把在意的事提过，你没放在心上' },
  { d: -6, when: '他约了你，你没去' },
  { d: -8, when: '他看见你跟别的男人说笑（只能是没名字的人）' },
];
