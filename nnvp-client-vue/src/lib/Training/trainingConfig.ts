import { reactive } from 'vue';

/**
 * A plain, JSON-safe copy of the training compile options — what run records
 * journal (see PLAN.md Phase 3). Snapshots are decoupled from the live config:
 * mutating one never affects the other. The field names deliberately match
 * the RunRecord contract (runJournal.ts, backend summaries), NOT the store's
 * selected* keys — restoring a run maps them back (TrainingZone.restoreRun).
 */
export interface TrainingConfigSnapshot {
  dataset: string;
  optimizer: string;
  optimizerParams: Record<string, unknown>;
  epochs: number;
  loss: string;
}

// The training compile options outlive the Training window: closing it
// unmounts TrainingZone (App renders it under v-if), and the next mount binds
// back to this same reactive config, so nothing is lost. Same pattern as
// lib/Assistant/chatSession — a reactive module singleton, no store framework.
// In-memory on purpose: a page reload starts from the defaults.
export const trainingConfig = reactive({
  selectedDataset: 'MNIST',
  selectedOptimizer: 'rmsprop',
  // The per-optimizer parameter values (learningRate, momentum, ...); reset
  // to {} whenever the optimizer changes (TrainingZone.changeSelectedOptimizer).
  optimizerParams: {} as Record<string, unknown>,
  epochs: 10,
  selectedLoss: 'categoricalCrossentropy',
});

export function resetTrainingConfig(): void {
  trainingConfig.selectedDataset = 'MNIST';
  trainingConfig.selectedOptimizer = 'rmsprop';
  trainingConfig.optimizerParams = {};
  trainingConfig.epochs = 10;
  trainingConfig.selectedLoss = 'categoricalCrossentropy';
}

/** A plain (non-reactive) copy of the current config, safe to journal as JSON. */
export function snapshotTrainingConfig(): TrainingConfigSnapshot {
  return {
    dataset: trainingConfig.selectedDataset,
    optimizer: trainingConfig.selectedOptimizer,
    optimizerParams: { ...trainingConfig.optimizerParams },
    epochs: trainingConfig.epochs,
    loss: trainingConfig.selectedLoss,
  };
}
