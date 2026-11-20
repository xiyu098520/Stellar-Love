import type { Clock, World } from './types';

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function leap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysIn(y: number, m: number): number {
  return m === 2 && leap(y) ? 29 : DAYS[m - 1];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 剧本没填就从 2025 年 9 月 1 日早上八点起 */
export function initClock(world: World): Clock {
  const [y, m, d] = (world.startDate || '').split('-').map(Number);
  const [hh, mm] = (world.startTime || '').split(':').map(Number);
  const year = Number.isFinite(y) && y > 0 ? y : 2025;
  const month = Number.isFinite(m) && m >= 1 && m <= 12 ? m : 9;
  const day = Number.isFinite(d) && d >= 1 && d <= daysIn(year, month) ? d : 1;
  const min =
    Number.isFinite(hh) && hh >= 0 && hh < 24
      ? hh * 60 + (Number.isFinite(mm) && mm >= 0 && mm < 60 ? mm : 0)
      : 8 * 60;
  return { y: year, m: month, d: day, min };
}

/** 往前走几分钟，跨午夜就进下一天 */
export function advance(c: Clock, minutes: number): Clock {
  const add = Number.isFinite(minutes) ? Math.max(0, Math.min(720, Math.round(minutes))) : 0;
  let total = c.min + add;
  let { y, m, d } = c;
  while (total >= 1440) {
    total -= 1440;
    d += 1;
    if (d > daysIn(y, m)) {
      d = 1;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  return { y, m, d, min: total };
}

/** 2065年9月12日 22:40 */
export function clockText(c: Clock): string {
  return `${c.y}年${c.m}月${c.d}日 ${pad(Math.floor(c.min / 60))}:${pad(c.min % 60)}`;
}

/** 不带年份的短格式，顶栏用 */
export function clockShort(c: Clock): string {
  return `${c.m}月${c.d}日 ${pad(Math.floor(c.min / 60))}:${pad(c.min % 60)}`;
}
