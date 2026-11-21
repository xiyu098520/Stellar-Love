import type { Clock, World } from './types';

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function leap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysIn(y: number, m: number): number {
  return m === 2 && leap(y) ? 29 : DAYS[m - 1];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 读得懂 2065-09-12 / 2065/9/12 / 2065年9月12日 这几种写法 */
export function parseDateText(v: string | undefined): { y: number; m: number; d: number } | null {
  const s = (v || '').trim();
  if (!s) return null;
  const hit = s.match(/(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})/);
  if (!hit) return null;
  const y = Number(hit[1]);
  const m = Number(hit[2]);
  const d = Number(hit[3]);
  if (!y || m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return null;
  return { y, m, d };
}

/** 读得懂 8:00 / 08:00 / 8点 / 早上8点 / 晚上8点 / 8点半 / 20时30分 */
export function parseTimeText(v: string | undefined): { h: number; m: number } | null {
  const s = (v || '').trim();
  if (!s) return null;
  let hit = s.match(/(\d{1,2})\s*[::：时点]\s*(\d{1,2})?/);
  if (!hit) hit = s.match(/(\d{1,2})/);
  if (!hit) return null;
  let h = Number(hit[1]);
  const m = hit[2] ? Number(hit[2]) : /半/.test(s) ? 30 : 0;
  if (h > 23 || m > 59) return null;
  if (/凌晨|早上|上午/.test(s)) {
    if (h === 12) h = 0;
  } else if (/中午/.test(s)) {
    if (h < 12) h += 12;
  } else if (/下午|傍晚|晚上|夜/.test(s)) {
    if (h < 12) h += 12;
  }
  return { h, m };
}

export function formatDate(p: { y: number; m: number; d: number }): string {
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function formatTime(p: { h: number; m: number }): string {
  return `${pad(p.h)}:${pad(p.m)}`;
}

export function timeOfDay(h: number): string {
  if (h < 6) return '凌晨';
  if (h < 12) return '上午';
  if (h === 12) return '中午';
  if (h < 18) return '下午';
  return '晚上';
}

/** 剧本没填就从 2025 年 9 月 1 日早上八点起 */
export function initClock(world: World): Clock {
  const d = parseDateText(world.startDate);
  const t = parseTimeText(world.startTime);
  const year = d?.y ?? 2025;
  const month = d?.m ?? 9;
  const day = d?.d ?? 1;
  const min = t ? t.h * 60 + t.m : 8 * 60;
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

/** 只用来比先后，不显示 */
export function clockValue(c: Clock): number {
  return ((c.y * 12 + c.m) * 31 + c.d) * 1440 + c.min;
}
