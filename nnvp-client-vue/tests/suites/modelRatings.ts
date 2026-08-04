/**
 * Model ratings (Phase H3, the SLIDER variant — the pairwise experiment was
 * retired the same day it shipped): the stored fact is the user's raw claim,
 * `model.rated {workHash, score}` (0..1000). The fold keeps the LATEST claim
 * per model (causal order — deterministic across devices) and derives ranks
 * across the field; claims are never rewritten by other models' ratings.
 */
import { logicTest } from '../harness/define';
import { foldRatings } from '../../src/lib/Training/modelRatings';
import type { DomainEvent } from '../../src/lib/Events/domainEvent';

let counter = 0;
function rated(workHash: string, score: number, overrides: Partial<DomainEvent> = {}): DomainEvent {
  counter += 1;
  return {
    uuid: `rate-${counter}`,
    type: 'model.rated',
    streamId: null,
    deviceId: 'device-a',
    instanceId: 'instance-1',
    seq: counter,
    dependsOn: [],
    wallTime: `2026-08-04T10:00:${String(counter % 60).padStart(2, '0')}.000Z`,
    payload: { workHash, score },
    ...overrides,
  };
}

logicTest('modelRatings: the claim is the score; ranks derive across the field', ({ expect }) => {
  const table = foldRatings([rated('A', 800), rated('B', 400), rated('C', 650)]);
  expect(table.byHash.get('A')!.score).toBe(800); // the raw claim, untouched
  expect(table.byHash.get('A')!.rank).toBe(1);
  expect(table.byHash.get('C')!.rank).toBe(2);
  expect(table.byHash.get('B')!.rank).toBe(3);
  expect(table.rated.map(r => r.workHash)).toEqual(['A', 'C', 'B']);
});

logicTest('modelRatings: re-rating replaces — the LATEST claim per model wins', ({ expect }) => {
  const table = foldRatings([rated('A', 300), rated('A', 900)]);
  expect(table.byHash.get('A')!.score).toBe(900);
  expect(table.rated.length).toBe(1);
  // Causal order decides, not array order (deterministic across devices).
  const later = rated('A', 700);
  const earlier = rated('A', 100);
  const swapped = { ...earlier, seq: later.seq + 1, wallTime: '2026-08-04T11:00:00.000Z' };
  expect(foldRatings([swapped, later]).byHash.get('A')!.score).toBe(100);
});

logicTest('modelRatings: dupes, garbage and out-of-range claims never poison the fold', ({ expect }) => {
  const good = rated('A', 640);
  const table = foldRatings([
    good, good, // duplicate delivery is normal
    { ...rated('B', 0), payload: { nonsense: true } },
    rated('C', 5000), // clamped, not rejected — the intent was "great"
    rated('D', -50), // clamped up
  ]);
  expect(table.byHash.get('A')!.score).toBe(640);
  expect(table.byHash.has('B')).toBe(false);
  expect(table.byHash.get('C')!.score).toBe(1000);
  expect(table.byHash.get('D')!.score).toBe(0);
});
