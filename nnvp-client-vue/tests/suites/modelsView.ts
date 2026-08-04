/**
 * Pure Models-window view settings (Phase G follow-up): timestamp formatting
 * (absolute grid column vs human "2 minutes ago"), the first/last iteration
 * choice, and the day-granular date-range predicate shared by the timeline
 * and the evolution graph.
 */
import { logicTest } from '../harness/define';
import { formatWhen, inRange, pickSeen } from '../../src/lib/Training/modelsView';

const NOW = Date.parse('2026-08-03T12:00:00.000Z');

logicTest('modelsView: absolute mode prints YYYY-MM-DD HH:MM', ({ expect }) => {
  expect(formatWhen('2026-08-01T09:05:00.000Z', 'absolute', NOW))
    .toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  expect(formatWhen(null, 'absolute', NOW)).toBe('—');
  expect(formatWhen('garbage', 'absolute', NOW)).toBe('garbage');
});

logicTest('modelsView: relative mode speaks human', ({ expect }) => {
  const at = (iso: string) => formatWhen(iso, 'relative', NOW);
  expect(at('2026-08-03T11:59:30.000Z')).toBe('30 seconds ago');
  expect(at('2026-08-03T11:58:00.000Z')).toBe('2 minutes ago');
  expect(at('2026-08-03T09:00:00.000Z')).toBe('3 hours ago');
  expect(at('2026-07-29T12:00:00.000Z')).toBe('5 days ago');
  expect(at('2026-06-01T12:00:00.000Z')).toBe('2 months ago');
  expect(at('2026-08-03T11:59:59.500Z')).toBe('just now');
  // A clock-skewed future stamp must not print "-3 seconds ago".
  expect(at('2026-08-03T12:00:05.000Z')).toBe('just now');
});

logicTest('modelsView: pickSeen honors the first/last iteration setting', ({ expect }) => {
  expect(pickSeen('2026-07-01T00:00:00Z', '2026-07-20T00:00:00Z', 'first')).toBe('2026-07-01T00:00:00Z');
  expect(pickSeen('2026-07-01T00:00:00Z', '2026-07-20T00:00:00Z', 'last')).toBe('2026-07-20T00:00:00Z');
  expect(pickSeen('2026-07-01T00:00:00Z', null, 'last')).toBe('2026-07-01T00:00:00Z'); // degrade
  expect(pickSeen(null, null, 'first')).toBeNull();
});

logicTest('modelsView: inRange is day-granular and inclusive on both ends', ({ expect }) => {
  const seen = '2026-07-15T18:30:00.000Z';
  expect(inRange(seen, { from: null, to: null })).toBe(true);
  expect(inRange(seen, { from: '2026-07-15', to: null })).toBe(true); // same day counts
  expect(inRange(seen, { from: '2026-07-16', to: null })).toBe(false);
  expect(inRange(seen, { from: null, to: '2026-07-15' })).toBe(true); // same day counts
  expect(inRange(seen, { from: null, to: '2026-07-14' })).toBe(false);
  expect(inRange(seen, { from: '2026-07-01', to: '2026-07-31' })).toBe(true);
  // Undated states only pass an unfiltered range — never sneak through a filter.
  expect(inRange(null, { from: null, to: null })).toBe(true);
  expect(inRange(null, { from: '2026-07-01', to: null })).toBe(false);
});
