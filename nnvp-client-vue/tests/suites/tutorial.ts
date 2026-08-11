/**
 * Tutorial mode is coachmark/overlay chrome layered over the app — menus,
 * cards, highlight rings, persistence read back through the menu UI — so
 * every test is an e2eOnly mechanical wrap. The registry now holds the
 * seven-chapter course ("From your first layer to a browser poet").
 */
import { e2eOnly } from '../harness/define';

e2eOnly(
  'tutorial: the Tutorial menu lists the course chapters with completion bars',
  'Asserts the tutorial menu modal UI: rendered course header, chapter and progress-bar element counts plus status text, via auto-retrying DOM matchers on the live page.',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await expect(page.locator('.tutorial-menu-container')).toBeVisible();
    await expect(page.locator('.course-header')).toBeVisible();
    // Seven chapters, plus the quiet Concepts-book card up top — dimmed
    // until the course has been started (the interstitial guards it).
    await expect(page.locator('.concepts-book-link')).toHaveCount(1);
    await expect(page.locator('.tutorial-menu-item:not(.concepts-book-link)')).toHaveCount(7);
    await expect(page.locator('.tutorial-menu-item .tutorial-menu-progress')).toHaveCount(7);
    await expect(page.locator('.tutorial-menu-item:not(.concepts-book-link)').first()).toContainText('Chapter 1 — Start here');
    await expect(page.locator('.concepts-book-link.dimmed')).toHaveCount(1);
    // Fresh profile: nothing started yet (the course header's status leads),
    // and the first chapter shines as the one call to action.
    await expect(page.locator('.tutorial-menu-item-status').first()).toHaveText('Not started');
    await expect(page.locator('.tutorial-menu-item.next-up')).toHaveCount(1);
    await expect(page.locator('.tutorial-menu-item.next-up')).toContainText('Start here');
    await expect(page.locator('.tutorial-menu-item.next-up .status-next-up')).toHaveText('Start →');
  },
);

e2eOnly(
  'tutorial: starts a chapter from the menu and advances after the first step action',
  'Runs the tutorial overlay as UI: card visibility, the coachmark highlight ring positioned over the catalog, a deliverable page.screenshot, and auto-advance after a real catalog click.',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await page.click('.tutorial-menu-item:has-text("Hello, layer")');
    await page.waitForTimeout(100);

    // The menu closes and the overlay card appears on the first step.
    await expect(page.locator('.tutorial-menu-container')).toHaveCount(0);
    const card = page.locator('.tutorial-card');
    await expect(card).toBeVisible();
    await expect(page.locator('.tutorial-progress')).toHaveText('Chapter 2 / 7 · Step 1 / 6');
    await expect(card).toContainText('Add an Input layer');

    // The coachmark ring highlights the Input layer template.
    await expect(page.locator('.tutorial-highlight')).toBeVisible();

    // Capture the overlay for the deliverable screenshot.
    await page.screenshot({ path: '/tmp/f2-tutorial.png' });

    // Perform the first step's action: add an Input layer from the catalog.
    await page.click('#layer-template-Input');
    await page.waitForTimeout(200);

    // The tutorial should auto-advance to step 2 (set the input shape).
    await expect(page.locator('.tutorial-progress')).toHaveText('Chapter 2 / 7 · Step 2 / 6');
    await expect(card).toContainText('Set the input shape');
  },
);

e2eOnly(
  'tutorial: Back stays on a completed step instead of snapping forward',
  'Exercises the overlay auto-advance gate against the real 500ms completion poll: after a real catalog click advances the card, Back must hold position across poll ticks while the step predicate stays satisfied.',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await page.click('.tutorial-menu-item:has-text("Hello, layer")');
    await page.waitForTimeout(100);
    await page.click('#layer-template-Input');
    await page.waitForTimeout(200);
    await expect(page.locator('.tutorial-progress')).toHaveText('Chapter 2 / 7 · Step 2 / 6');

    await page.click('.tutorial-btn:has-text("Back")');
    // Wait longer than two completion polls: without the furthest-step gate
    // the still-satisfied predicate would snap the card forward again.
    await page.waitForTimeout(1200);
    await expect(page.locator('.tutorial-progress')).toHaveText('Chapter 2 / 7 · Step 1 / 6');
    await expect(page.locator('.tutorial-done')).toBeVisible();
  },
);

e2eOnly(
  'tutorial: the last chapter step chains into the next lesson',
  'Walks the overlay card to the final step with real Next clicks and asserts the chaining control swaps the running tutorial def in place (card re-renders as chapter 2 step 1).',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await page.click('.tutorial-menu-item:has-text("Hello, layer")');
    await page.waitForTimeout(100);
    // Skip ahead with Next to the last step (6 steps → 5 clicks).
    for (let i = 0; i < 5; i += 1) {
      await page.click('.tutorial-btn-primary:has-text("Next")');
      await page.waitForTimeout(50);
    }
    await expect(page.locator('.tutorial-progress')).toHaveText('Chapter 2 / 7 · Step 6 / 6');
    const nextLesson = page.locator('.tutorial-btn-primary:has-text("Next lesson")');
    await expect(nextLesson).toBeVisible();
    await nextLesson.click();
    await page.waitForTimeout(100);
    await expect(page.locator('.tutorial-progress')).toHaveText('Chapter 3 / 7 · Step 1 / 7');
    await expect(page.locator('.tutorial-card')).toContainText('Get an MNIST network');
  },
);

e2eOnly(
  'tutorial: "Do it for me" loads the chapter template and the step completes',
  'Clicks the overlay card\'s action button and asserts the real board mutation feeds back through the live predicate poll: the template loads and the card auto-advances.',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await page.click('.tutorial-menu-item:has-text("Train your first model")');
    await page.waitForTimeout(100);
    await expect(page.locator('.tutorial-card')).toContainText('Get an MNIST network');
    await page.click('.tutorial-btn:has-text("Do it for me")');
    // The template lands on the board and the predicate advances the card.
    await page.waitForTimeout(700);
    await expect(page.locator('.tutorial-progress')).toHaveText('Chapter 3 / 7 · Step 2 / 7');
    await expect(page.locator('.tutorial-card')).toContainText('Training panel');
  },
);

e2eOnly(
  'tutorial: progress is persisted and shown back in the menu',
  'Exercises tutorial persistence through the real UI loop: perform a step, exit the overlay, reopen the menu and read the rendered completion percentage from the DOM.',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await page.click('.tutorial-menu-item:has-text("Hello, layer")');
    await page.waitForTimeout(100);
    // Do the first step (1 of 6), then exit.
    await page.click('#layer-template-Input');
    await page.waitForTimeout(200);
    await expect(page.locator('.tutorial-progress')).toHaveText('Chapter 2 / 7 · Step 2 / 6');
    await page.click('.tutorial-exit');
    await page.waitForTimeout(100);
    // Reopen the menu: the bar reflects the reached step (1/6 ≈ 17%),
    // and having started the course undims the book card.
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    const status = page.locator('.tutorial-menu-item:has-text("Hello, layer") .tutorial-menu-item-status');
    await expect(status).toHaveText('17%');
    await expect(page.locator('.concepts-book-link.dimmed')).toHaveCount(0);
  },
);

e2eOnly(
  'tutorial: can be exited',
  'Asserts the overlay card unmounts from the DOM after clicking the exit control — overlay chrome lifecycle in the real UI.',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await page.click('.tutorial-menu-item:has-text("Hello, layer")');
    await page.waitForTimeout(100);
    await expect(page.locator('.tutorial-card')).toBeVisible();
    await page.click('.tutorial-exit');
    await page.waitForTimeout(50);
    await expect(page.locator('.tutorial-card')).toHaveCount(0);
  },
);

e2eOnly(
  'tutorial: the running tutorial links back to the tutorial menu',
  'Navigates from the running overlay card back to the menu modal via UI clicks and asserts the DOM handover (card unmounts, menu container appears).',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await page.click('.tutorial-menu-item:has-text("Hello, layer")');
    await page.waitForTimeout(100);
    await expect(page.locator('.tutorial-card')).toBeVisible();
    await page.click('.tutorial-menu-link');
    await page.waitForTimeout(100);
    // The tutorial closes and the menu takes over.
    await expect(page.locator('.tutorial-card')).toHaveCount(0);
    await expect(page.locator('.tutorial-menu-container')).toBeVisible();
  },
);

e2eOnly(
  'concepts: the book opens from the Tutorial menu, renders figures, and pages',
  'Drives the Concepts book modal as UI: table-of-contents rendering, an article with its inline SVG figure visible in the live DOM, and prev/next paging between articles.',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await page.click('.concepts-book-link');
    await page.waitForTimeout(200);
    // Fresh profile: the interstitial argues for the course first; the small
    // link is the honest way through to the book.
    await expect(page.locator('.book-interstitial')).toBeVisible();
    await page.click('.book-interstitial-anyway');
    await page.waitForTimeout(200);
    // Menu hands over to the book's table of contents.
    await expect(page.locator('.tutorial-menu-container')).toHaveCount(0);
    await expect(page.locator('.concept-book-container')).toBeVisible();
    await expect(page.locator('.concept-toc-item')).toHaveCount(15);
    // Open the first article: title, at least one SVG figure, a caption.
    await page.click('.concept-toc-item:has-text("What is a neural network?")');
    await page.waitForTimeout(150);
    await expect(page.locator('.concept-article-title')).toHaveText('What is a neural network?');
    await expect(page.locator('.concept-body svg').first()).toBeVisible();
    await expect(page.locator('.concept-body figcaption').first()).toBeVisible();
    // Page forward with the footer link, then back to the contents.
    await page.click('.concept-nav-next');
    await page.waitForTimeout(150);
    await expect(page.locator('.concept-article-title')).toHaveText('Tensors and shapes');
    await page.click('.concept-nav-link:has-text("Contents")');
    await page.waitForTimeout(150);
    // The visited articles now carry read marks in the contents.
    await expect(page.locator('.concept-toc-read')).toHaveCount(2);
  },
);

e2eOnly(
  'concepts: the fresh-user interstitial recommends the course and its big button starts it',
  'Drives the recommendation dialog UI on a fresh profile: the dimmed book card opens the interstitial instead of the book, and the primary button hands over to the running chapter-1 overlay.',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await page.click('.concepts-book-link');
    await page.waitForTimeout(150);
    await expect(page.locator('.book-interstitial')).toBeVisible();
    await expect(page.locator('.concept-book-container')).toHaveCount(0);
    await page.click('.book-interstitial-start');
    await page.waitForTimeout(150);
    await expect(page.locator('.tutorial-menu-container')).toHaveCount(0);
    await expect(page.locator('.tutorial-card')).toBeVisible();
    await expect(page.locator('.tutorial-progress')).toHaveText('Chapter 1 / 7 · Step 1 / 4');
  },
);

e2eOnly(
  'concepts: the welcome chapter reads the book and the nudge leads back to the lesson',
  'Asserts modal stacking and the back-to-lesson nudge in the real UI: the welcome step\'s Learn link opens the book above the active tutorial, reading it satisfies the step through the persisted read mark, and the nudge button returns to the auto-advanced card.',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await page.click('.tutorial-menu-item:has-text("Start here")');
    await page.waitForTimeout(100);
    await expect(page.locator('.tutorial-progress')).toHaveText('Chapter 1 / 7 · Step 1 / 4');
    const learn = page.locator('.tutorial-concept-link').first();
    await expect(learn).toContainText('What is a neural network?');
    await learn.click();
    await page.waitForTimeout(200);
    await expect(page.locator('.concept-book-container')).toBeVisible();
    await expect(page.locator('.concept-article-title')).toHaveText('What is a neural network?');
    // Mid-lesson: the back-to-lesson nudge shows top and bottom, dismissible.
    await expect(page.locator('.concept-nudge')).toHaveCount(2);
    // Opening the article recorded the read mark → the step predicate is
    // satisfied and the card auto-advances behind the book. The nudge's
    // button hands the reader back to the lesson.
    await page.waitForTimeout(700);
    await page.click('.concept-nudge-back >> nth=0');
    await page.waitForTimeout(150);
    await expect(page.locator('.concept-book-container')).toHaveCount(0);
    await expect(page.locator('.tutorial-card')).toBeVisible();
    await expect(page.locator('.tutorial-progress')).toHaveText('Chapter 1 / 7 · Step 2 / 4');
  },
);

e2eOnly(
  'concepts: the nudge can be dismissed and stays away for the visit',
  'Exercises the dismiss control on the back-to-lesson nudge in the rendered modal: the × removes both banners while the book stays open, and paging articles does not resurrect them.',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await page.click('.tutorial-menu-item:has-text("Hello, layer")');
    await page.waitForTimeout(100);
    await page.click('.tutorial-concept-link >> nth=0');
    await page.waitForTimeout(200);
    await expect(page.locator('.concept-nudge')).toHaveCount(2);
    await page.click('.concept-nudge-dismiss >> nth=0');
    await page.waitForTimeout(100);
    await expect(page.locator('.concept-nudge')).toHaveCount(0);
    // Paging to another article keeps the dismissal for this visit.
    await page.click('.concept-nav-next');
    await page.waitForTimeout(150);
    await expect(page.locator('.concept-nudge')).toHaveCount(0);
    await page.click('.concept-book-overlay .modal-close');
    await page.waitForTimeout(150);
    await expect(page.locator('.tutorial-card')).toBeVisible();
  },
);

e2eOnly(
  'tutorial: the About modal links to the tutorial menu',
  'Drives the About modal UI into the tutorial menu and asserts one modal replaces the other in the rendered DOM (shared .modal-overlay chrome disambiguated by content).',
  async ({ page, expect }) => {
    // About is its own modal, opened by the ? button at the far right of the
    // top bar.
    await page.click('[aria-label="About NNVP"]');
    await page.waitForTimeout(300);
    await expect(page.locator('.modal-container')).toContainText('Tutorials');
    await page.click('.about-tutorials-button');
    await page.waitForTimeout(300);
    // About closes, the tutorial menu opens. (Both use the shared
    // .modal-overlay chrome now, so identify the About modal by its content.)
    await expect(page.locator('.modal-container')).toHaveCount(0);
    await expect(page.locator('.tutorial-menu-container')).toBeVisible();
  },
);
