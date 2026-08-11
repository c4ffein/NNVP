/**
 * The course registry helpers: chapter ordering, next-chapter chaining, and
 * the aggregate course completion ratio the menu's overall bar shows.
 */
import { logicTest } from '../harness/define';
import {
  browserPoetCourse, courseChapters, chaptersOf, nextChapterId, courseCompletionRatio,
} from '../../src/lib/Tutorial/course';
import type { TutorialProgress } from '../../src/lib/Tutorial/progress';

const CHAPTER_IDS = [
  'welcome',
  'hello-layer',
  'first-training',
  'inspect-cnn',
  'machines-that-read',
  'attention',
  'browser-poet',
];

logicTest('course: the seven chapters are registered in order', ({ expect }) => {
  expect(courseChapters.map(chapter => chapter.id)).toEqual(CHAPTER_IDS);
  expect(courseChapters.map(chapter => chapter.course!.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

logicTest('course: chaptersOf filters by course id', ({ expect }) => {
  expect(chaptersOf(browserPoetCourse.id).length).toBe(7);
  expect(chaptersOf('some-other-course')).toEqual([]);
});

logicTest('course: nextChapterId walks the sequence and ends with null', ({ expect }) => {
  expect(nextChapterId('welcome')).toBe('hello-layer');
  expect(nextChapterId('hello-layer')).toBe('first-training');
  expect(nextChapterId('attention')).toBe('browser-poet');
  expect(nextChapterId('browser-poet')).toBe(null);
  expect(nextChapterId('not-a-chapter')).toBe(null);
});

logicTest('course: courseCompletionRatio averages the chapter ratios', ({ expect }) => {
  const none: TutorialProgress = {};
  expect(courseCompletionRatio(browserPoetCourse.id, none)).toBe(0);

  // Three of seven chapters fully completed.
  const three: TutorialProgress = {
    'hello-layer': { furthestStep: 6, completed: true },
    'first-training': { furthestStep: 7, completed: true },
    'inspect-cnn': { furthestStep: 6, completed: true },
  };
  expect(courseCompletionRatio(browserPoetCourse.id, three)).toBeCloseTo(3 / 7);

  // A partially played chapter contributes its fraction.
  const partial: TutorialProgress = {
    'hello-layer': { furthestStep: 3, completed: false }, // 3/6 of one chapter
  };
  expect(courseCompletionRatio(browserPoetCourse.id, partial)).toBeCloseTo(0.5 / 7);

  const all: TutorialProgress = Object.fromEntries(
    CHAPTER_IDS.map(id => [id, { furthestStep: 99, completed: true }]),
  );
  expect(courseCompletionRatio(browserPoetCourse.id, all)).toBe(1);

  expect(courseCompletionRatio('some-other-course', all)).toBe(0);
});
