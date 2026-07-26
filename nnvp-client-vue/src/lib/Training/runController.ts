/**
 * One training RUN as a state machine: running → (paused ⇄ running)* → done,
 * where a run may span several engine fit() segments split by pauses.
 *
 * Scope by design: the controller owns the segment loop, pause/resume/cancel
 * transitions and the epoch bookkeeping that keeps charts and the run journal
 * on one absolute epoch axis. It is Vue-free and engine-agnostic (talks only
 * to the TrainingSession seam), and it deliberately does NOT own the journal
 * record or error surfaces — TrainingZone keeps those. One controller = one
 * run: a future multi-run manager (docs/tasks.md "one local, several remote")
 * holds a list of these, enforcing the single-local-slot rule itself.
 *
 * Pause semantics (capabilities.canPause engines): pause() asks the engine to
 * stop after the batch in flight; the interrupted epoch's remainder is NOT
 * replayed at fault — the resume segment simply trains the remaining epochs
 * on a freshly drawn slice (for the demo trainer that is a feature: every
 * resume sees new data). Optimizer state lives in the session's model, so a
 * resume is a true continuation, not a restart.
 */

import watchTraining, { createWatchState } from '../ModelTrainer/watchTraining';
import type { WatchState } from '../ModelTrainer/watchTraining';
import type { TrainingCallbacks, TrainingDataset, TrainingSession } from './engine';

export type RunControllerState = 'running' | 'paused' | 'done';
export type RunOutcome = 'completed' | 'cancelled';

export interface EpochMetrics {
  epoch: number;
  acc?: number;
  loss?: number;
  valAcc?: number;
  valLoss?: number;
}

/**
 * One curriculum phase: `epochs` epochs on `dataset`. A classic single-run is
 * one phase; pretrain → fine-tune is two. The epoch axis is ABSOLUTE across
 * phases (phase 2 of [20, 10] spans epochs 20..29) — charts and journal never
 * reset. Works because datasets share the fixed text vocab / class count, so
 * the same warm model keeps training across the switch.
 */
export interface RunPhase {
  dataset: TrainingDataset;
  epochs: number;
  /** Display name (the dataset's registry key) — phase markers, samples. */
  label: string;
}

/** The reactive chart-data objects (TrainingZone's, structurally). */
interface ChartData {
  labels: number[];
  series: { className: string; name: string; data: (number | undefined)[] }[];
}

export interface RunControllerInit {
  session: TrainingSession;
  phases: RunPhase[];
  chartData0: ChartData;
  chartData1: ChartData;
  /** TrainingZone's Stop-button flag; checked between batches (cancel-by-throw). */
  cancelRequested: () => boolean;
  /** The exact throw value the historical cancel path uses ('cancelRequested'). */
  stopError: unknown;
  /** Journal hook — receives ABSOLUTE epoch numbers across segments. */
  onEpoch?: (m: EpochMetrics) => void;
  onStateChange?: (state: RunControllerState) => void;
  /**
   * Fired (and awaited — sample generation wants the GPU quiet) after each
   * phase COMPLETES, the last one included; never fired on cancel/error.
   */
  onPhaseEnd?: (phaseIndex: number, phase: RunPhase, epochsDone: number) => void | Promise<void>;
}

export default class RunController {
  private init: RunControllerInit;

  private watchState: WatchState;

  private currentState: RunControllerState = 'running';

  private pauseRequested = false;

  private cancelledWhilePaused = false;

  private epochsDone = 0;

  private resumeSignal: (() => void) | null = null;

  private stateWaiters: (() => void)[] = [];

  constructor(init: RunControllerInit) {
    this.init = init;
    this.watchState = createWatchState();
  }

  get state(): RunControllerState {
    return this.currentState;
  }

  get epochsCompleted(): number {
    return this.epochsDone;
  }

  get epochsTotal(): number {
    return this.init.phases.reduce((total, phase) => total + phase.epochs, 0);
  }

  /** The phase the NEXT trained epoch belongs to. */
  get currentPhaseIndex(): number {
    let end = 0;
    for (let i = 0; i < this.init.phases.length; i += 1) {
      end += this.init.phases[i]!.epochs;
      if (this.epochsDone < end) return i;
    }
    return this.init.phases.length - 1;
  }

  private setState(state: RunControllerState): void {
    this.currentState = state;
    this.init.onStateChange?.(state);
    const waiters = this.stateWaiters;
    this.stateWaiters = [];
    waiters.forEach(resolve => resolve());
  }

  /** Resolves on the NEXT state transition (pause() awaits leaving 'running'). */
  private nextStateChange(): Promise<void> {
    return new Promise((resolve) => {
      this.stateWaiters.push(resolve);
    });
  }

  /**
   * Drive the run to its end. Resolves 'completed' | 'cancelled'; rethrows
   * engine errors untouched (TrainingZone's historical error surface).
   * Cancellation arrives EITHER through init.cancelRequested (the Stop button
   * while running, thrown between batches) or through cancel() while paused.
   */
  async run(): Promise<RunOutcome> {
    const { phases } = this.init;
    const grandTotal = this.epochsTotal;
    // Cumulative phase ends on the absolute epoch axis: [20, 10] -> [20, 30].
    const phaseEnds: number[] = [];
    phases.reduce((end, phase) => {
      phaseEnds.push(end + phase.epochs);
      return end + phase.epochs;
    }, 0);

    while (this.epochsDone < grandTotal) {
      const phaseIndex = this.currentPhaseIndex;
      const phase = phases[phaseIndex]!;
      const phaseEnd = phaseEnds[phaseIndex]!;
      this.pauseRequested = false;
      try {
        await watchTraining(
          this.init.chartData0,
          this.init.chartData1,
          (callbacks: TrainingCallbacks) => this.init.session.fit(phase.dataset, callbacks, {
            epochs: phaseEnd - this.epochsDone,
            initialEpoch: this.epochsDone,
          }),
          this.init.cancelRequested,
          this.init.stopError,
          (m) => {
            this.epochsDone = m.epoch + 1;
            this.init.onEpoch?.(m);
          },
          this.watchState,
        );
      } catch (error) {
        this.setState('done');
        if (error === this.init.stopError) return 'cancelled';
        throw error;
      }
      // Segment resolved on its own: the phase finished, or the engine
      // stopped early because pause() asked it to (possibly both at once).
      if (this.epochsDone >= phaseEnd) {
        await this.init.onPhaseEnd?.(phaseIndex, phase, this.epochsDone);
      } else if (!this.pauseRequested) {
        // Engine ended a segment early without a pause request: never spin.
        break;
      }
      if (this.pauseRequested && this.epochsDone < grandTotal) {
        this.setState('paused');
        await new Promise<void>((resolve) => {
          this.resumeSignal = resolve;
        });
        this.resumeSignal = null;
        if (this.cancelledWhilePaused) {
          this.setState('done');
          return 'cancelled';
        }
        this.setState('running');
      }
    }
    this.setState('done');
    return 'completed';
  }

  /**
   * Ask the engine to stop after the batch in flight; resolves once the run
   * has actually LEFT 'running' — as 'paused', or as 'done' when the segment
   * finished before the stop landed (callers re-check state).
   */
  async pause(): Promise<RunControllerState> {
    if (this.currentState !== 'running') return this.currentState;
    this.pauseRequested = true;
    const changed = this.nextStateChange();
    this.init.session.stop();
    await changed;
    return this.currentState;
  }

  resume(): void {
    if (this.currentState !== 'paused') return;
    this.resumeSignal?.();
  }

  /** Cancel from 'paused' (the running-state cancel is the Stop button flag). */
  cancel(): void {
    if (this.currentState !== 'paused') return;
    this.cancelledWhilePaused = true;
    this.resumeSignal?.();
  }
}
