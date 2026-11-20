import { emptyState } from './affinity';
import { clockText, initClock } from './clock';
import { newId } from './store';
import type { Character, Save, World } from './types';

/** 从主线当前这一刻切出一条个人线；只带这一个人和当前时间地点 */
export function makeRouteSave(world: World, main: Save, c: Character): Save {
  const now = Date.now();
  const seed = main.state || emptyState();
  const clock = seed.clock || initClock(world);
  const value = seed.affinity?.[c.id] ?? 0;
  return {
    id: newId('route'),
    worldId: world.id,
    worldTitle: world.title,
    kind: 'route',
    routeOf: c.id,
    parentId: main.id,
    title: `${c.name}线`,
    turns: [],
    relations: [],
    state: {
      ...seed,
      clock,
      time: clockText(clock),
      affinity: { [c.id]: value },
      log: [],
      hits: {},
      charAttrs: seed.charAttrs?.[c.id] ? { [c.id]: seed.charAttrs[c.id] } : {},
      appointments: [],
    },
    createdAt: now,
    updatedAt: now,
  };
}
