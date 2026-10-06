/**
 * Starting a run that cannot start: every failure path out of startTraining
 * must hand the Train button back and say why. The realistic one is the
 * dataset download failing (offline, CDN down) — an error the engine does
 * not tag, which used to escape trainClicked with isTraining stuck on true:
 * a permanent "Stop Training" button and a run that never was.
 */
import { appTest } from '../harness/define';

appTest('training: a start that fails on the dataset download hands the button back and says why', async ({
  board, training, expect,
}) => {
  await board.loadTemplate('2D Dense for MNIST');
  await training.makeDatasetsUnreachable();
  await training.open();
  expect(await training.trainButtonLabel()).toContain('Start Training');
  await training.clickTrain();
  expect(await training.trainButtonLabel()).toContain('Start Training');
  const error = await training.startError();
  expect(error).not.toBe(null);
  // The REASON must be the download the driver blocked: bun's driver
  // refuses with its own marker, Chromium reports an aborted route as
  // "Failed to fetch". Not any earlier failure the catch also swallows (a
  // missing seam verb once passed this test), and not happy-dom's CORS
  // refusal either — that one means the block is gone and the test went
  // to the real CDN.
  expect(error).toMatch(/datasets unreachable|Failed to fetch/);
});
