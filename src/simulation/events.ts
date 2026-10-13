import type { EventType, HistoryEvent, World } from '../types/simulation';
import { SIM } from './constants';

/**
 * Records a historical event. Every caller passes text that describes a state
 * change that has actually been applied to the world.
 */
export function logEvent(
  world: World,
  type: EventType,
  civs: number[],
  text: string,
  importance: number,
  tile = -1,
  war: number | null = null,
): HistoryEvent {
  const event: HistoryEvent = {
    id: world.eventSeq++,
    year: world.year,
    type,
    civs: civs.filter((c, i) => c >= 0 && civs.indexOf(c) === i),
    text,
    importance: Math.max(1, Math.min(5, Math.round(importance))),
    tile,
    war,
  };
  world.events.push(event);
  if (world.events.length > SIM.maxEvents) pruneEvents(world);
  return event;
}

/**
 * Keeps the log bounded. Minor events are discarded oldest-first; anything of
 * importance 3+ is retained unless the log is still far too large.
 */
export function pruneEvents(world: World): void {
  const target = Math.floor(SIM.maxEvents * 0.85);
  let excess = world.events.length - target;
  if (excess <= 0) return;
  for (const threshold of [1, 2, 3]) {
    if (excess <= 0) break;
    const keep: HistoryEvent[] = [];
    for (const e of world.events) {
      if (excess > 0 && e.importance <= threshold) {
        excess--;
        continue;
      }
      keep.push(e);
    }
    world.events = keep;
  }
  if (world.events.length > SIM.maxEvents) world.events = world.events.slice(world.events.length - target);
}

export function eventsForCiv(world: World, civId: number): HistoryEvent[] {
  return world.events.filter((e) => e.civs.includes(civId));
}
