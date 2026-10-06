/**
 * The inspection snapshot's lifecycle on the facade (the stale-colors bug):
 * per-layer activation data is keyed by layer id, and layer ids restart at 0
 * in every document — so a snapshot surviving a document swap paints the old
 * model's activations onto unrelated layers. The facade now drops it on
 * every document replacement, invalidates it on computation (workHash)
 * edits, and keeps it across annotation-only edits (still honestly
 * attributed). Dual: the bun world runs the REAL BoardInterface over its
 * editor; the browser world talks to the app's real facade.
 */
import { appTest, e2eOnly } from '../harness/define';

const SNAPSHOT = { 0: { summary: { kind: 'mean', size: 4, mean: 0.5 } } };

appTest('inspection: a template load replaces the document and drops the snapshot', async ({
  board, inspection, expect,
}) => {
  await board.addLayer('Input');
  await inspection.seed(SNAPSHOT);
  await inspection.setVizParams('0', { channelOffset: 2 });
  expect(await inspection.get()).not.toBe(null);
  await board.loadTemplate('2D Dense for MNIST');
  expect(await inspection.get()).toBe(null);
  // The 3D per-layer overrides are keyed by the same ids — dropped too.
  expect(await inspection.vizParamsCount()).toBe(0);
  // A silent drop: document replacement is not an "edit" to offer undoing.
  expect(await inspection.invalidatedCount()).toBe(0);
});

appTest('inspection: a file load replaces the document and drops the snapshot', async ({
  board, inspection, expect,
}) => {
  await board.addLayer('Input');
  const saved = await board.graphJSON();
  await inspection.seed(SNAPSHOT);
  // Even reloading the SAME bytes is a document replacement — ids are
  // reborn, the probe's world is gone.
  await board.loadJSON(saved);
  expect(await inspection.get()).toBe(null);
});

appTest('inspection: a computation edit invalidates the snapshot (and says so)', async ({
  board, inspection, expect,
}) => {
  await board.addLayer('Input');
  await board.addLayer('Dense');
  await board.connect(0, 1);
  await inspection.seed(SNAPSHOT);
  await board.addLayer('Dense'); // the computation changed
  expect(await inspection.get()).toBe(null);
  expect(await inspection.invalidatedCount()).toBe(1);
});

appTest('inspection: an edit landing right after the probe still invalidates', async ({
  board, inspection, expect,
}) => {
  await board.addLayer('Input');
  await board.addLayer('Dense');
  await board.connect(0, 1);
  // The snapshot is published and the computation changes before any
  // asynchronous identity work could settle — exactly what a fast edit
  // after an Inspect probe does. The guard must not skip that window.
  await inspection.seed(SNAPSHOT, { settle: false });
  await board.addLayer('Dense');
  expect(await inspection.get()).toBe(null);
  expect(await inspection.invalidatedCount()).toBe(1);
});

appTest('inspection: a parameter edit through the options panel invalidates too', async ({
  board, panel, inspection, expect,
}) => {
  await board.addLayer('Input');
  await board.addLayer('Dense');
  await board.connect(0, 1);
  await inspection.seed(SNAPSHOT);
  // units feeds the computation: editing it through the real panel must
  // reach the facade (the change-bubble notify) and invalidate.
  await board.select(1);
  await panel.setInput('number', 0, '99');
  expect(await inspection.get()).toBe(null);
  expect(await inspection.invalidatedCount()).toBe(1);
});

appTest('inspection: annotation-only edits keep the snapshot honestly', async ({
  board, inspection, expect,
}) => {
  await board.addLayer('Input');
  await board.addLayer('Dense');
  await board.connect(0, 1);
  await inspection.seed(SNAPSHOT);
  // Comments and positions never touch the workHash — the colors still
  // describe exactly the computation they were probed on.
  await board.setComment(1, 'my favorite layer');
  expect(await inspection.get()).not.toBe(null);
  await board.moveLayer(0, 500, 400);
  expect(await inspection.get()).not.toBe(null);
  expect(await inspection.invalidatedCount()).toBe(0);
});

// --- The guard modal (App-hosted chrome, real undo round-trip) ---------------

e2eOnly(
  'inspection guard: warns on a computation edit and Undo restores the trained view',
  'Drives the App-hosted warning modal as real UI: a catalog click while an inspection is live must raise the dialog over the app, and its Undo button must run the real facade undo AND reinstate the dropped snapshot — a full round-trip only the live app wires together.',
  async ({ page, canvas, expect }) => {
    await page.evaluate(async () => {
      const dbg = (window as unknown as { nnvp: { debug: { graphEditor: { loadTemplate(n: string): void } } } }).nnvp.debug;
      dbg.graphEditor.loadTemplate('2D Dense for MNIST');
    });
    await page.waitForTimeout(300);
    await page.evaluate(async () => {
      const bi = (window as unknown as { nnvp: { debug: { boardInterface: {
        setInspection(d: unknown): void; whenInspectionSettled(): Promise<void>;
      } } } }).nnvp.debug.boardInterface;
      bi.setInspection({ byLayerId: { 2: { summary: { kind: 'mean', size: 4, mean: 0.5 } } } });
      await bi.whenInspectionSettled();
    });
    const layersBefore = await canvas.layerCount(page);
    // A computation edit: add a layer from the catalog.
    await page.click('.LayerTemplate:has(.layer-template-name:text-is("Dense"))');
    await expect(page.locator('.inspection-guard')).toBeVisible();
    // Undo: the edit reverts and the colors come back (workHash matches again).
    await page.click('.inspection-guard-undo');
    await page.waitForTimeout(300);
    await expect(page.locator('.inspection-guard')).toHaveCount(0);
    expect(await canvas.layerCount(page)).toBe(layersBefore);
    const restored = await page.evaluate(async () => {
      const bi = (window as unknown as { nnvp: { debug: { boardInterface: {
        getInspection(): unknown; whenInspectionSettled(): Promise<void>;
      } } } }).nnvp.debug.boardInterface;
      await bi.whenInspectionSettled();
      return bi.getInspection() !== null;
    });
    expect(restored).toBe(true);
  },
);

e2eOnly(
  'inspection guard: don\'t-show-again mutes the dialog but never the clearing',
  'Exercises the dialog\'s persisted dismissal in the real UI: after ticking the checkbox and keeping a change, a second computation edit must clear the (re-seeded) inspection WITHOUT raising the dialog — the localStorage flag only silences chrome, the facade still invalidates.',
  async ({ page, canvas, expect }) => {
    const seed = () => page.evaluate(async () => {
      const bi = (window as unknown as { nnvp: { debug: { boardInterface: {
        setInspection(d: unknown): void; whenInspectionSettled(): Promise<void>;
      } } } }).nnvp.debug.boardInterface;
      bi.setInspection({ byLayerId: { 0: { summary: { kind: 'mean', size: 4, mean: 0.5 } } } });
      await bi.whenInspectionSettled();
    });
    const inspectionIsNull = () => page.evaluate(async () => {
      const bi = (window as unknown as { nnvp: { debug: { boardInterface: {
        getInspection(): unknown; whenInspectionSettled(): Promise<void>;
      } } } }).nnvp.debug.boardInterface;
      await bi.whenInspectionSettled();
      return bi.getInspection() === null;
    });
    await page.click('.LayerTemplate:has(.layer-template-name:text-is("Input"))');
    await page.waitForTimeout(150);
    await seed();
    await page.click('.LayerTemplate:has(.layer-template-name:text-is("Dense"))');
    await expect(page.locator('.inspection-guard')).toBeVisible();
    await page.locator('.inspection-guard-dismiss input').check();
    await page.click('.inspection-guard-keep');
    await page.waitForTimeout(150);
    expect(await inspectionIsNull()).toBe(true);
    // Second round: still clears, no dialog.
    await seed();
    await page.click('.LayerTemplate:has(.layer-template-name:text-is("Dense"))');
    await page.waitForTimeout(700);
    await expect(page.locator('.inspection-guard')).toHaveCount(0);
    expect(await inspectionIsNull()).toBe(true);
  },
);
