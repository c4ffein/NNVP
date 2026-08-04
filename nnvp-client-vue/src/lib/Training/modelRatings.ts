/**
 * modelRatings.ts — model ratings as raw claims (Phase H3, slider variant).
 *
 * The recorded fact is the user's own number: `model.rated {workHash,
 * score}` (0..1000, workHash target — content-addressed: survives renames,
 * converges across devices). The fold keeps the LATEST claim per model in
 * causal order (per-instance seq chains + wallTime/uuid tie-breaks — the
 * same deterministic ordering runs use), then derives RANKS across the
 * rated field. The claim is sacred: rating one model never rewrites
 * another's number — only the derived positions move.
 *
 * The prompt's meaning is "how good compared to the other ones"; "better
 * for WHAT" stays deliberately unanswered (personal tool, one implicit
 * context). Claims are timestamped events — per-era or decayed folds need
 * no schema change later.
 *
 * (A pairwise `model.compared` experiment briefly existed on 2026-08-04;
 * its registry entry remains so any recorded judgments stay known events,
 * but nothing folds them anymore.)
 */

import { appendEvent, makeEvent } from '../Events/store';
import { orderEvents } from './runEvents';
import { getRecordStore } from '../LocalStore/db';
import type { RecordStore } from '../LocalStore/recordStore';
import type { DomainEvent } from '../Events/domainEvent';

export interface RatedPayload {
  workHash: string;
  /** The raw claim, 0..1000 ("800 = how good vs the others, says the user"). */
  score: number;
}

export interface ModelRating {
  workHash: string;
  /** The user's latest claim, clamped to 0..1000 — never derived. */
  score: number;
  /** 1 = best among rated models. Ties broken by hash for determinism. */
  rank: number;
  /** When the winning claim was made (display only). */
  ratedAt: string | null;
}

export interface RatingTable {
  byHash: Map<string, ModelRating>;
  /** Every rated model, best first. */
  rated: ModelRating[];
}

const clamp = (score: number) => Math.max(0, Math.min(1000, Math.round(score)));

/** PURE: rating events (any order, dupes tolerated) → latest claim + ranks. */
export function foldRatings(events: DomainEvent[]): RatingTable {
  const claims = events.filter((event) => {
    if (event.type !== 'model.rated') return false;
    const payload = event.payload as Partial<RatedPayload> | null;
    return typeof payload?.workHash === 'string' && typeof payload?.score === 'number';
  });
  // Causal order (dedupes by uuid internally); the LAST claim per model wins.
  const latest = new Map<string, DomainEvent>();
  for (const event of orderEvents(claims)) {
    latest.set((event.payload as RatedPayload).workHash, event);
  }
  const rated: ModelRating[] = [...latest.entries()].map(([workHash, event]) => ({
    workHash,
    score: clamp((event.payload as RatedPayload).score),
    rank: 0,
    ratedAt: typeof event.wallTime === 'string' && event.wallTime ? event.wallTime : null,
  }));
  rated.sort((a, b) => (b.score - a.score) || (a.workHash < b.workHash ? -1 : 1));
  rated.forEach((rating, index) => { rating.rank = index + 1; });
  return { byHash: new Map(rated.map(rating => [rating.workHash, rating])), rated };
}

/** Record one claim. */
export async function appendRating(
  workHash: string,
  score: number,
  store: RecordStore = getRecordStore(),
): Promise<void> {
  await appendEvent(
    makeEvent<RatedPayload>('model.rated', { payload: { workHash, score: clamp(score) } }),
    { store },
  );
}
