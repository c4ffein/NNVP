/**
 * The training compile options live in a reactive module singleton
 * (src/lib/Training/trainingConfig.ts, same pattern as chatSession) so they
 * survive closing/reopening the Training window — App renders TrainingZone
 * under v-if, so close/reopen is a full unmount/remount — and so Phase 3 can
 * journal them into run records via snapshotTrainingConfig().
 */
import { logicTest, appTest } from '../harness/define';
import {
  trainingConfig, resetTrainingConfig, snapshotTrainingConfig,
} from '../../src/lib/Training/trainingConfig';

logicTest('trainingConfig: starts on the documented defaults and reset restores them', ({ expect }) => {
  // The module's initial values ARE the app's defaults (nothing before this
  // suite touches the singleton; app-driver teardowns reset it).
  expect(trainingConfig.selectedDataset).toBe('MNIST');
  expect(trainingConfig.selectedOptimizer).toBe('rmsprop');
  expect(trainingConfig.optimizerParams).toEqual({});
  expect(trainingConfig.epochs).toBe(10);
  expect(trainingConfig.selectedLoss).toBe('categoricalCrossentropy');
  // Mutate everything, then reset: back to the exact defaults.
  trainingConfig.selectedDataset = 'CIFAR10';
  trainingConfig.selectedOptimizer = 'adam';
  trainingConfig.optimizerParams = { learningRate: 0.002, beta1: 0.95 };
  trainingConfig.epochs = 3;
  trainingConfig.selectedLoss = 'meanSquaredError';
  resetTrainingConfig();
  expect(trainingConfig.selectedDataset).toBe('MNIST');
  expect(trainingConfig.selectedOptimizer).toBe('rmsprop');
  expect(trainingConfig.optimizerParams).toEqual({});
  expect(trainingConfig.epochs).toBe(10);
  expect(trainingConfig.selectedLoss).toBe('categoricalCrossentropy');
});

logicTest('trainingConfig: snapshots are plain JSON-safe copies, decoupled from the live config', ({ expect }) => {
  trainingConfig.selectedOptimizer = 'sgd';
  trainingConfig.optimizerParams = { learningRate: 0.01, nesterov: true };
  trainingConfig.epochs = 7;
  const snapshot = snapshotTrainingConfig();
  // Snapshot keys follow the RunRecord contract (dataset/optimizer/loss),
  // not the store's selected* keys.
  expect(snapshot).toEqual({
    dataset: 'MNIST',
    optimizer: 'sgd',
    optimizerParams: { learningRate: 0.01, nesterov: true },
    epochs: 7,
    loss: 'categoricalCrossentropy',
  });
  // JSON-safe: a stringify/parse round-trip loses nothing.
  expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  // Decoupled both ways: later config edits never reach the snapshot...
  trainingConfig.selectedOptimizer = 'adamax';
  trainingConfig.optimizerParams = {};
  expect(snapshot.optimizer).toBe('sgd');
  expect(snapshot.optimizerParams).toEqual({ learningRate: 0.01, nesterov: true });
  // ...and editing the snapshot's params never reaches the config.
  resetTrainingConfig();
  snapshot.optimizerParams.momentum = 0.9;
  expect(trainingConfig.optimizerParams).toEqual({});
  resetTrainingConfig(); // leave the singleton clean for later tests
});

appTest('training config: optimizer and epochs survive closing and reopening the training window', async ({ training, expect }) => {
  await training.open();
  // Sanity: the form starts from the defaults.
  expect(await training.optimizer()).toBe('rmsprop');
  expect(await training.epochs()).toBe(10);
  await training.setOptimizer('adam');
  await training.setEpochs(3);
  // Closing the Training window unmounts TrainingZone entirely (App's v-if);
  // reopening mounts a fresh instance over the same module singleton.
  await training.close();
  await training.open();
  expect(await training.optimizer()).toBe('adam');
  expect(await training.epochs()).toBe(3);
});
