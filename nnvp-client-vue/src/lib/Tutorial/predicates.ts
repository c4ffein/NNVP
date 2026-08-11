// Tutorial step schema + the predicate toolbox every course chapter draws from.
//
// This module is intentionally Vue-agnostic and side-effect free so it can be
// unit-tested in isolation. Steps are declarative data; each step's
// `isComplete` predicate inspects real editor state through the
// `$boardInterface` facade (typed STRUCTURALLY, not as BoardInterface: the
// predicates are polled with fakes in tests and must never throw, whatever
// they are given), plus two blessed non-board singletons: the trainingConfig
// reactive module and the session-signal cache (lib/Tutorial/sessionSignals).
//
// Editor-state contract used here (the facade's typed read getters):
//   $boardInterface.getLayers()        -> array of placed layer wrappers
//   wrapper.id                         -> nnvp layer id
//   wrapper.inputLayers                -> nnvp ids of the layers feeding it
//   wrapper.kerasLayer.name            -> Keras layer type, e.g. "Conv2D"
//   wrapper.kerasLayer.parameterValues -> object of set parameter values
//   $boardInterface.getActiveElements()-> selected layer wrappers
//   $boardInterface.isDirty()          -> changed since last checkpoint/load

import { trainingConfig } from '../Training/trainingConfig';
import { readConceptIds } from './concepts/readState';

export interface TutorialLayerLike {
  id?: unknown;
  inputLayers?: unknown;
  kerasLayer?: {
    name?: string;
    parameterValues?: Record<string, unknown> | null;
  } | null;
}

export interface TutorialBoardLike {
  getLayers?: () => unknown;
  getEdges?: () => unknown;
  getActiveElements?: () => unknown;
  isDirty?: () => unknown;
}

/** What a predicate accepts: the facade, a test fake, or nothing at all. */
export type TutorialBoard = TutorialBoardLike | null | undefined;

/** A declarative "do it for me" step action, interpreted by TutorialOverlay. */
export interface TutorialStepAction {
  kind: 'loadTemplate';
  template: string;
}

export interface TutorialStep {
  id: string;
  title: string;
  instruction: string;
  /** Optional one/two-sentence concept explainer rendered under the instruction. */
  detail?: string;
  target: string | ((doc: Document) => Element | null);
  /** Optional shortcut the card offers as a "Do it for me" button. */
  action?: TutorialStepAction;
  /** Optional Concepts-book article ids — the card renders a 📖 link each. */
  concepts?: string[];
  isComplete: ($d3: TutorialBoard) => boolean;
}

// --- board reads -------------------------------------------------------------

/**
 * Return the array of placed layers for the active graph, or [] when the graph
 * (or interface) is not ready yet. Never throws so predicates stay safe to poll.
 * @param $d3 the $boardInterface instance (or a fake in tests)
 * @returns placed layers
 */
export function placedLayers($d3: TutorialBoard): TutorialLayerLike[] {
  if (!$d3 || typeof $d3.getLayers !== 'function') return [];
  const layers = $d3.getLayers();
  return Array.isArray(layers) ? layers : [];
}

/**
 * Count placed layers whose Keras type matches `name`.
 * @param $d3 the $boardInterface instance
 * @param name the Keras layer name (e.g. "Dense")
 */
export function countLayersNamed($d3: TutorialBoard, name: string): number {
  return placedLayers($d3).filter(
    layer => layer && layer.kerasLayer && layer.kerasLayer.name === name,
  ).length;
}

/** Edge count on the active graph, 0 when the editor is not ready. */
export function placedEdgeCount($d3: TutorialBoard): number {
  if (!$d3 || typeof $d3.getEdges !== 'function') return 0;
  const edges = $d3.getEdges();
  return Array.isArray(edges) ? edges.length : 0;
}

/** Number of currently selected layers, 0 when the editor is not ready. */
export function selectedLayerCount($d3: TutorialBoard): number {
  const selected = $d3 && typeof $d3.getActiveElements === 'function' && $d3.getActiveElements();
  return Array.isArray(selected) ? selected.length : 0;
}

/** True when a layer of the given Keras type is in the current selection. */
export function selectedLayerIs($d3: TutorialBoard, name: string): boolean {
  const selected = $d3 && typeof $d3.getActiveElements === 'function' && $d3.getActiveElements();
  if (!Array.isArray(selected)) return false;
  return selected.some((element) => {
    const layer = element as TutorialLayerLike | null;
    return !!(layer && layer.kerasLayer && layer.kerasLayer.name === name);
  });
}

/**
 * True when a placed Input layer's `shape` equals `expected` exactly —
 * length included. Values are compared after Number() coercion because the
 * options panel may store them as strings.
 */
export function inputShapeEquals($d3: TutorialBoard, expected: number[]): boolean {
  return placedLayers($d3).some((layer) => {
    if (!layer || !layer.kerasLayer || layer.kerasLayer.name !== 'Input') return false;
    const shape = (layer.kerasLayer.parameterValues || {}).shape;
    if (!Array.isArray(shape) || shape.length !== expected.length) return false;
    return expected.every((value, i) => Number(shape[i]) === value);
  });
}

/**
 * True when some layer named `toName` is fed by a layer named `fromName`.
 * Reads the wiring off the getLayers() wrappers (wrapper.inputLayers holds
 * nnvp ids, wrapper.id is the nnvp id — the same id domain, unlike
 * getEdges() whose FlowEdge.source is the stringified id).
 * Output nodes are ordinary wrappers with kerasLayer.name === 'Output', so
 * layersConnected($d3, 'Dense', 'Output') covers output wiring too.
 */
export function layersConnected($d3: TutorialBoard, fromName: string, toName: string): boolean {
  const layers = placedLayers($d3);
  const fromIds = new Set(
    layers
      .filter(layer => layer && layer.kerasLayer && layer.kerasLayer.name === fromName)
      .map(layer => layer.id),
  );
  if (fromIds.size === 0) return false;
  return layers.some(layer => (
    !!layer && !!layer.kerasLayer && layer.kerasLayer.name === toName
    && Array.isArray(layer.inputLayers)
    && layer.inputLayers.some(id => fromIds.has(id))
  ));
}

/** True when the board has uncommitted changes (chapter 6's rename step).
 *  Guarded: isDirty is a facade getter a fake may not have. */
export function boardIsDirty($d3: TutorialBoard): boolean {
  try {
    return !!($d3 && typeof $d3.isDirty === 'function' && $d3.isDirty());
  } catch {
    return false;
  }
}

// --- trainingConfig reads (the reactive module singleton, sync by design) ----

/** True when the given dataset is selected in the training config. */
export function datasetSelected(name: string): boolean {
  return trainingConfig.selectedDataset === name;
}

/** True when epochs is set to a small count (1..n) — "keep it short" steps. */
export function epochsAtMost(n: number): boolean {
  const { epochs } = trainingConfig;
  return typeof epochs === 'number' && epochs >= 1 && epochs <= n;
}

/** True when curriculum fine-tuning is enabled onto the given dataset. */
export function phase2Configured(dataset: string): boolean {
  return trainingConfig.phase2Enabled === true && trainingConfig.phase2Dataset === dataset;
}

// --- Concepts-book reads -----------------------------------------------------

/** True once the given book article has been opened (any session — read
 *  marks persist in localStorage, and reading the book only once is fine). */
export function conceptRead(id: string): boolean {
  try {
    return readConceptIds().has(id);
  } catch {
    return false;
  }
}

// --- DOM probes (guarded so predicates are safe in non-DOM environments) -----

/**
 * True when the Training panel is currently open in the DOM. Guarded so the
 * predicate is safe to call in a non-DOM (unit test) environment.
 */
export function trainingPanelIsOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return document.getElementById('trainingZone') !== null;
}

/** The label of the active Training-panel tab ("Dataset", "Inspect", …), or null. */
export function activeTrainingTab(): string | null {
  if (typeof document === 'undefined') return null;
  const tab = document.querySelector('#TrainingZone .bar-button.active');
  const label = tab && tab.textContent;
  return label ? label.trim() : null;
}

/** True when the selector matches an element (e.g. '#modelsWindow'). */
export function elementPresent(selector: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.querySelector(selector) !== null;
  } catch {
    return false; // malformed selector: a predicate never throws
  }
}

/**
 * True when the Inspect panel's generation output holds model-generated text —
 * i.e. its total text is longer than the echoed seed span alone.
 */
export function generatedTextPresent(): boolean {
  if (typeof document === 'undefined') return false;
  const output = document.querySelector('[data-testid="inspect-generated-text"]');
  if (!output) return false;
  const seed = output.querySelector('.inspect-generated-seed');
  const totalLength = output.textContent ? output.textContent.length : 0;
  const seedLength = seed && seed.textContent ? seed.textContent.length : 0;
  return totalLength > seedLength;
}

// --- targets -----------------------------------------------------------------

/**
 * Function-target factory for menu steps: the visible dropdown item whose
 * label contains `text` (labels may carry tick prefixes like "✓ Training"),
 * falling back to the menu bar (#generalMenu) while the dropdown is closed —
 * dropdown items are display:none until their menu opens, so the coachmark
 * must never simply vanish.
 */
export function trainingTabTarget(label: string): (doc: Document) => Element | null {
  return (doc: Document): Element | null => {
    try {
      const tabs = Array.from(doc.querySelectorAll('#TrainingZone .bar-button'));
      const tab = tabs.find(el => (el.textContent || '').trim() === label);
      // Fallback: the Training window itself (or nothing while it's closed).
      return tab || doc.querySelector('#trainingZone');
    } catch {
      return null;
    }
  };
}

/**
 * Function-target for train steps: the Start Training button when the panel
 * is open, else the menu path that opens it.
 */
export function trainButtonTarget(doc: Document): Element | null {
  try {
    return doc.querySelector('.train-button') || menuTarget('Training')(doc);
  } catch {
    return null;
  }
}

export function menuTarget(text: string): (doc: Document) => Element | null {
  return (doc: Document): Element | null => {
    try {
      const labels = Array.from(doc.querySelectorAll('#GeneralMenu .dropdown-item-content'));
      const visible = labels.find((el) => {
        if (!el.textContent || !el.textContent.includes(text)) return false;
        return (el as HTMLElement).offsetParent != null;
      });
      if (visible) return visible.closest('.menuItem') || visible;
      return doc.querySelector('#generalMenu');
    } catch {
      return null;
    }
  };
}
