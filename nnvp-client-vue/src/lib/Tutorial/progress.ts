// Tutorial progress persistence — per-tutorial furthest step + completion,
// stored under one localStorage key so the menu, the overlay and the About
// modal all read one source of truth. Guarded like the predicates: storage
// access never throws (SSR / privacy mode / quota degrade to no-ops).
//
// Split out of tutorials.ts so the course registry (lib/Tutorial/course) can
// compute aggregate ratios without a runtime import cycle through the
// tutorial registry.

import type { TutorialDef } from './tutorials';

const STORAGE_KEY = 'nnvp-tutorial-progress';

export interface TutorialProgressEntry {
  furthestStep: number;
  completed: boolean;
}

/** All stored progress, keyed by tutorial id. */
export type TutorialProgress = Record<string, TutorialProgressEntry>;

function storage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* SSR / privacy mode */ }
  return null;
}

/** All stored progress: { [tutorialId]: { furthestStep, completed } }. */
export function readProgress(): TutorialProgress {
  const store = storage();
  if (!store) return {};
  try {
    return JSON.parse(store.getItem(STORAGE_KEY)!) || {};
  } catch {
    return {};
  }
}

function writeProgress(all: TutorialProgress): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* quota / privacy mode */ }
}

/** Record that `stepIndex` of a tutorial was reached (monotonic). */
export function markStepReached(tutorialId: string, stepIndex: number): void {
  const all = readProgress();
  const entry = all[tutorialId] || { furthestStep: 0, completed: false };
  entry.furthestStep = Math.max(entry.furthestStep, stepIndex);
  all[tutorialId] = entry;
  writeProgress(all);
}

/** Record that a tutorial was finished. */
export function markCompleted(tutorialId: string): void {
  const all = readProgress();
  const entry = all[tutorialId] || { furthestStep: 0, completed: false };
  entry.completed = true;
  all[tutorialId] = entry;
  writeProgress(all);
}

/** Drop ALL stored tutorial progress (the debug menu's fresh-user reset). */
export function resetProgress(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch { /* privacy mode */ }
}

/**
 * Completion ratio in [0, 1] for the menu's progress bars: 1 when finished,
 * otherwise the fraction of steps reached so far.
 */
export function completionRatio(tutorial: TutorialDef, progress: TutorialProgress = readProgress()): number {
  const entry = progress[tutorial.id];
  if (!entry) return 0;
  if (entry.completed) return 1;
  if (!tutorial.steps.length) return 0;
  return Math.min(entry.furthestStep / tutorial.steps.length, 1);
}
