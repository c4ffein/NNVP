// Tutorial registry.
//
// One generic overlay component (TutorialOverlay) plays ANY tutorial listed
// here; the tutorial menu lists them with completion bars, grouped by course.
// Definitions are declarative data (steps + predicates from ./predicates,
// chapters under ./course); progress persistence lives in ./progress and is
// re-exported here so consumers keep one import surface.
//
// Like the predicates this module is Vue-agnostic and unit-testable: DOM and
// localStorage access is guarded, predicates never throw.

import type { TutorialStep } from './predicates';
import { courseChapters } from './course';

export interface TutorialDef {
  id: string;
  title: string;
  description: string;
  steps: TutorialStep[];
  /** Course membership: chapters carry the course id and a 1-based order. */
  course?: { id: string; order: number };
}

export {
  readProgress,
  markStepReached,
  markCompleted,
  completionRatio,
  resetProgress,
} from './progress';
export type { TutorialProgress, TutorialProgressEntry } from './progress';

/** Every playable tutorial — today, the six chapters of the course. */
export const tutorials: TutorialDef[] = [...courseChapters];

/** Look up a tutorial definition by id. */
export function getTutorial(id: string): TutorialDef | undefined {
  return tutorials.find(tutorial => tutorial.id === id);
}

export default tutorials;
