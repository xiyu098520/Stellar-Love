import type { Turn } from './types';

/** 一章固定十个回合，只是显示方式，不影响剧情 */
export const CHAPTER_SIZE = 10;

export type NumberedTurn = { turn: Turn; no: number };

const nodeNo = (turnNo: number) => ((Math.max(1, turnNo) - 1) % CHAPTER_SIZE) + 1;
export const chapterNo = (turnNo: number) => Math.floor((Math.max(1, turnNo) - 1) / CHAPTER_SIZE) + 1;

/** 1-3 这种写法 */
export function chapterLabel(turnNo: number): string {
  return `${chapterNo(turnNo)}-${nodeNo(turnNo)}`;
}

export function assistantCount(turns: Turn[]): number {
  return turns.filter(t => t.role === 'assistant').length;
}

/** 给每个回合标上全局回合号；旁白和台词都算，玩家那一条不标 */
export function numberedTurns(turns: Turn[]): NumberedTurn[] {
  let n = 0;
  return turns.map(turn => {
    if (turn.role === 'assistant') n += 1;
    return { turn, no: turn.role === 'assistant' ? n : 0 };
  });
}

/** 取某一章的回合，含每个回合前面她说的那句话 */
export function chapterTurns(turns: Turn[], ch: number): NumberedTurn[] {
  const start = (Math.max(1, ch) - 1) * CHAPTER_SIZE + 1;
  const end = Math.max(1, ch) * CHAPTER_SIZE;
  const all = numberedTurns(turns);
  const out: NumberedTurn[] = [];
  for (let i = 0; i < all.length; i++) {
    const cur = all[i];
    if (cur.turn.role === 'assistant') {
      if (cur.no >= start && cur.no <= end) out.push(cur);
    } else {
      const next = all[i + 1];
      if (next && next.no >= start && next.no <= end) out.push(cur);
    }
  }
  return out;
}
