/**
 * The catalog's master collapse arrow always answers "what does one click do
 * next?": it only shows "expand all" while EVERY category is closed — opening
 * any single category flips it back to "collapse all".
 */
import { appTest } from '../harness/define';

appTest('collapse-all arrow flips back as soon as one category is opened', async ({ catalog, expect }) => {
  await catalog.open();
  expect(await catalog.masterArrowCollapsed()).toBe(false);
  await catalog.toggleAll();
  expect(await catalog.masterArrowCollapsed()).toBe(true);
  // Open a single category: one click must now re-close everything.
  await catalog.toggleCategory('Core');
  expect(await catalog.masterArrowCollapsed()).toBe(false);
  // Close it again by hand: we are back to fully collapsed.
  await catalog.toggleCategory('Core');
  expect(await catalog.masterArrowCollapsed()).toBe(true);
});
