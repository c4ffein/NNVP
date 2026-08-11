// The course registry — "From your first layer to a browser poet".
//
// Chapters are ordinary TutorialDefs carrying `course: { id, order }`;
// ordering is advisory only (no locking): every chapter opens with a template
// step, so each one is independently startable. The helpers here are what the
// menu (grouping, overall progress) and the overlay (Next-lesson chaining)
// consume.

import type { TutorialDef } from '../tutorials';
import { completionRatio, readProgress } from '../progress';
import type { TutorialProgress } from '../progress';
import chapter1 from './chapter1Welcome';
import chapter2 from './chapter2HelloLayer';
import chapter3 from './chapter3FirstTraining';
import chapter4 from './chapter4InspectCnn';
import chapter5 from './chapter5MachinesThatRead';
import chapter6 from './chapter6Attention';
import chapter7 from './chapter7BrowserPoet';

export interface CourseDef {
  id: string;
  title: string;
  description: string;
}

export const browserPoetCourse: CourseDef = {
  id: 'browser-poet',
  title: 'From your first layer to a browser poet',
  description:
    'Seven chapters: find your bearings, place a layer, train on MNIST, look '
    + 'inside a CNN, then teach your browser to write poetry.',
};

/** All course chapters, sorted by their declared order. */
export const courseChapters: TutorialDef[] = [
  chapter1, chapter2, chapter3, chapter4, chapter5, chapter6, chapter7,
].slice().sort((a, b) => (a.course?.order ?? 0) - (b.course?.order ?? 0));

/** The chapters of one course, in order. */
export function chaptersOf(courseId: string): TutorialDef[] {
  return courseChapters.filter(tutorial => tutorial.course?.id === courseId);
}

/** The id of the chapter after `tutorialId` in its course, or null. */
export function nextChapterId(tutorialId: string): string | null {
  const current = courseChapters.find(tutorial => tutorial.id === tutorialId);
  if (!current || !current.course) return null;
  const siblings = chaptersOf(current.course.id);
  const index = siblings.findIndex(tutorial => tutorial.id === tutorialId);
  const next = index >= 0 ? siblings[index + 1] : undefined;
  return next ? next.id : null;
}

/** Mean of per-chapter completion ratios — the menu's overall course bar. */
export function courseCompletionRatio(
  courseId: string,
  progress: TutorialProgress = readProgress(),
): number {
  const chapters = chaptersOf(courseId);
  if (!chapters.length) return 0;
  const total = chapters.reduce((sum, chapter) => sum + completionRatio(chapter, progress), 0);
  return total / chapters.length;
}
