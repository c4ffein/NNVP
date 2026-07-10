// Tutorial registry + completion tracking.
//
// One generic overlay component (TutorialOverlay) plays ANY tutorial listed
// here; the tutorial menu lists them with a completion bar. Definitions are
// declarative data — same step schema as mnistTutorial.js — and progress is
// persisted per tutorial id in localStorage, so the menu, the overlay and the
// About modal all read one source of truth.
//
// Like mnistTutorial.js this module is Vue-agnostic and unit-testable: DOM and
// localStorage access is guarded, predicates never throw.

import mnistSteps, { placedLayers, countLayersNamed, trainingPanelIsOpen } from './mnistTutorial';

/** Edge count on the active graph, 0 when the editor is not ready. */
export function placedEdgeCount($d3) {
  const graph = $d3 && $d3.activeGraph;
  if (!graph || !graph.model || !Array.isArray(graph.model.d3Edges)) return 0;
  return graph.model.d3Edges.length;
}

/** Number of currently selected layers, 0 when the editor is not ready. */
export function selectedLayerCount($d3) {
  const selected = $d3 && typeof $d3.getActiveElements === 'function' && $d3.getActiveElements();
  return Array.isArray(selected) ? selected.length : 0;
}

export const tutorials = [
  {
    id: 'mnist-cnn',
    title: 'Build an MNIST CNN',
    description: 'Place and configure the layers of a small convolutional network, step by step.',
    steps: mnistSteps,
  },
  {
    id: 'connect-layers',
    title: 'Connect layers',
    description: 'Add two layers and draw your first connection between them.',
    steps: [
      {
        id: 'add-first-dense',
        title: 'Add a Dense layer',
        instruction: 'Click "Dense" in the left Layer Catalog to place a layer on the canvas.',
        target: '#layer-template-Dense',
        isComplete: $d3 => countLayersNamed($d3, 'Dense') >= 1,
      },
      {
        id: 'add-second-dense',
        title: 'Add another Dense layer',
        instruction: 'Click "Dense" again — you need two layers to make a connection.',
        target: '#layer-template-Dense',
        isComplete: $d3 => countLayersNamed($d3, 'Dense') >= 2,
      },
      {
        id: 'connect-them',
        title: 'Connect the layers',
        instruction:
          'Hover a layer to reveal its connection dots, then drag from the right dot '
          + 'of one layer onto the other layer.',
        target: '#FlowBoard',
        isComplete: $d3 => placedEdgeCount($d3) >= 1,
      },
    ],
  },
  {
    id: 'explore-templates',
    title: 'Explore a template',
    description: 'Load a ready-made network, inspect a layer, and open the training zone.',
    steps: [
      {
        id: 'load-template',
        title: 'Load a template',
        instruction: 'Open File > Templates in the top menu and pick any template.',
        target: '#generalMenu',
        isComplete: $d3 => placedLayers($d3).length >= 5,
      },
      {
        id: 'inspect-layer',
        title: 'Inspect a layer',
        instruction: 'Click a layer on the canvas — its parameters appear in the right panel.',
        target: '#layerOptions',
        isComplete: $d3 => selectedLayerCount($d3) >= 1,
      },
      {
        id: 'open-training',
        title: 'Open the training zone',
        instruction: 'Open "Training" in the top menu to see how you would train this network.',
        target: '#generalMenu',
        isComplete: () => trainingPanelIsOpen(),
      },
    ],
  },
];

/** Look up a tutorial definition by id. */
export function getTutorial(id) {
  return tutorials.find(tutorial => tutorial.id === id);
}

// --- Progress persistence ----------------------------------------------------

const STORAGE_KEY = 'nnvp-tutorial-progress';

function storage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* SSR / privacy mode */ }
  return null;
}

/** All stored progress: { [tutorialId]: { furthestStep, completed } }. */
export function readProgress() {
  const store = storage();
  if (!store) return {};
  try {
    return JSON.parse(store.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeProgress(all) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* quota / privacy mode */ }
}

/** Record that `stepIndex` of a tutorial was reached (monotonic). */
export function markStepReached(tutorialId, stepIndex) {
  const all = readProgress();
  const entry = all[tutorialId] || { furthestStep: 0, completed: false };
  entry.furthestStep = Math.max(entry.furthestStep, stepIndex);
  all[tutorialId] = entry;
  writeProgress(all);
}

/** Record that a tutorial was finished. */
export function markCompleted(tutorialId) {
  const all = readProgress();
  const entry = all[tutorialId] || { furthestStep: 0, completed: false };
  entry.completed = true;
  all[tutorialId] = entry;
  writeProgress(all);
}

/**
 * Completion ratio in [0, 1] for the menu's progress bars: 1 when finished,
 * otherwise the fraction of steps reached so far.
 */
export function completionRatio(tutorial, progress = readProgress()) {
  const entry = progress[tutorial.id];
  if (!entry) return 0;
  if (entry.completed) return 1;
  if (!tutorial.steps.length) return 0;
  return Math.min(entry.furthestStep / tutorial.steps.length, 1);
}

export default tutorials;
