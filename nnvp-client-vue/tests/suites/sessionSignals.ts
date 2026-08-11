/**
 * The tutorial session-signal cache: run/checkpoint facts, fed by the app bus,
 * read synchronously by course-step predicates. Everything here uses an
 * injected Emitter + fake instanceId — never the app singletons — so tests
 * are hermetic and order-independent (each test installs fresh, which resets
 * the module state by contract).
 */
import { logicTest } from '../harness/define';
import { Emitter } from '../../src/lib/Events/emitter';
import {
  installSessionSignals, resetSessionSignals,
  runStartedOn, epochsSeenOn, runFinishedOn, checkpointsThisSession,
} from '../../src/lib/Tutorial/sessionSignals';

const OWN = 'instance-under-test';

interface FakeEventInit {
  type: string;
  streamId?: string | null;
  instanceId?: string;
  payload?: unknown;
}

let uuidCounter = 0;
function mkEvent({
  type, streamId = null, instanceId = OWN, payload = {},
}: FakeEventInit) {
  uuidCounter += 1;
  return {
    uuid: `evt-${uuidCounter}`,
    type,
    streamId,
    deviceId: 'device-test',
    instanceId,
    seq: uuidCounter,
    dependsOn: [],
    wallTime: '2026-08-10T00:00:00.000Z',
    payload,
  };
}

function freshWorld() {
  const events = new Emitter();
  const uninstall = installSessionSignals({ events, ownInstanceId: OWN });
  const emit = (init: FakeEventInit) => events.emit(init.type, mkEvent(init));
  return { events, uninstall, emit };
}

const startedPayload = (dataset: string, extra: Record<string, unknown> = {}) => ({
  engineId: 'tfjs',
  config: { dataset, optimizer: 'adam', optimizerParams: {}, epochs: 3, loss: 'x', ...extra },
  graphJson: '{"layers":[]}',
});

logicTest('sessionSignals: run lifecycle — started, epochs, finished', ({ expect }) => {
  const { emit } = freshWorld();
  expect(runStartedOn('MNIST')).toBe(false);
  emit({ type: 'run.started', streamId: 'r1', payload: startedPayload('MNIST') });
  expect(runStartedOn('MNIST')).toBe(true);
  expect(runStartedOn('CIFAR10')).toBe(false);
  expect(epochsSeenOn('MNIST')).toBe(0);
  expect(runFinishedOn('MNIST')).toBe(false);
  emit({ type: 'run.epoch', streamId: 'r1', payload: { epoch: 0, loss: 1 } });
  emit({ type: 'run.epoch', streamId: 'r1', payload: { epoch: 1, loss: 0.5 } });
  expect(epochsSeenOn('MNIST')).toBe(2);
  expect(runFinishedOn('MNIST')).toBe(false);
  emit({ type: 'run.finished', streamId: 'r1', payload: { outcome: 'completed' } });
  expect(runFinishedOn('MNIST')).toBe(true);
});

logicTest('sessionSignals: cancelled counts as finished, error never does', ({ expect }) => {
  const { emit } = freshWorld();
  emit({ type: 'run.started', streamId: 'r1', payload: startedPayload('MNIST') });
  emit({ type: 'run.epoch', streamId: 'r1', payload: { epoch: 0 } });
  emit({ type: 'run.finished', streamId: 'r1', payload: { outcome: 'cancelled' } });
  expect(runFinishedOn('MNIST')).toBe(true);

  emit({ type: 'run.started', streamId: 'r2', payload: startedPayload('CIFAR10') });
  emit({ type: 'run.epoch', streamId: 'r2', payload: { epoch: 0 } });
  emit({ type: 'run.finished', streamId: 'r2', payload: { outcome: 'error', error: 'boom' } });
  expect(runFinishedOn('CIFAR10')).toBe(false);
});

logicTest('sessionSignals: a finish without any epoch does not complete', ({ expect }) => {
  const { emit } = freshWorld();
  emit({ type: 'run.started', streamId: 'r1', payload: startedPayload('MNIST') });
  emit({ type: 'run.finished', streamId: 'r1', payload: { outcome: 'completed' } });
  expect(runFinishedOn('MNIST')).toBe(false); // instant failure ≠ a lesson done
  expect(runStartedOn('MNIST')).toBe(true);
});

logicTest('sessionSignals: withLayer matches the layer names parsed from graphJson', ({ expect }) => {
  const { emit } = freshWorld();
  const graphJson = JSON.stringify({
    layers: [
      { kerasLayer: { name: 'Input' } },
      { kerasLayer: { name: 'Conv2D' } },
      { kerasLayer: { name: 'Output' } },
    ],
  });
  emit({
    type: 'run.started',
    streamId: 'r1',
    payload: { ...startedPayload('MNIST'), graphJson },
  });
  emit({ type: 'run.epoch', streamId: 'r1', payload: { epoch: 0 } });
  emit({ type: 'run.finished', streamId: 'r1', payload: { outcome: 'completed' } });
  expect(runStartedOn('MNIST', { withLayer: 'Conv2D' })).toBe(true);
  expect(runFinishedOn('MNIST', { withLayer: 'Conv2D' })).toBe(true);
  expect(runStartedOn('MNIST', { withLayer: 'TransformerBlock' })).toBe(false);
});

logicTest('sessionSignals: unparseable graphJson keeps the dataset facts, drops the layer facts', ({ expect }) => {
  const { emit } = freshWorld();
  emit({
    type: 'run.started',
    streamId: 'r1',
    payload: { ...startedPayload('MNIST'), graphJson: '{nope' },
  });
  expect(runStartedOn('MNIST')).toBe(true);
  expect(runStartedOn('MNIST', { withLayer: 'Conv2D' })).toBe(false);
});

logicTest('sessionSignals: phase2Dataset matches only fine-tuning runs', ({ expect }) => {
  const { emit } = freshWorld();
  emit({ type: 'run.started', streamId: 'plain', payload: startedPayload('GutenbergPoetryXL') });
  emit({ type: 'run.epoch', streamId: 'plain', payload: { epoch: 0 } });
  emit({ type: 'run.finished', streamId: 'plain', payload: { outcome: 'completed' } });
  expect(runFinishedOn('GutenbergPoetryXL')).toBe(true);
  expect(runFinishedOn('GutenbergPoetryXL', { phase2Dataset: 'ShakespeareSonnets' })).toBe(false);

  emit({
    type: 'run.started',
    streamId: 'tuned',
    payload: startedPayload('GutenbergPoetryXL', { phase2Dataset: 'ShakespeareSonnets', phase2Epochs: 10 }),
  });
  emit({ type: 'run.epoch', streamId: 'tuned', payload: { epoch: 0 } });
  emit({ type: 'run.finished', streamId: 'tuned', payload: { outcome: 'completed' } });
  expect(runFinishedOn('GutenbergPoetryXL', { phase2Dataset: 'ShakespeareSonnets' })).toBe(true);
});

logicTest('sessionSignals: minEpochs raises the finish bar', ({ expect }) => {
  const { emit } = freshWorld();
  emit({ type: 'run.started', streamId: 'r1', payload: startedPayload('MNIST') });
  emit({ type: 'run.epoch', streamId: 'r1', payload: { epoch: 0 } });
  emit({ type: 'run.finished', streamId: 'r1', payload: { outcome: 'completed' } });
  expect(runFinishedOn('MNIST', { minEpochs: 2 })).toBe(false);
  expect(runFinishedOn('MNIST', { minEpochs: 1 })).toBe(true);
});

logicTest('sessionSignals: orphan epochs are tolerated and count once started arrives', ({ expect }) => {
  const { emit } = freshWorld();
  emit({ type: 'run.epoch', streamId: 'r1', payload: { epoch: 0 } });
  expect(epochsSeenOn('MNIST')).toBe(0); // no dataset fact yet
  emit({ type: 'run.started', streamId: 'r1', payload: startedPayload('MNIST') });
  expect(epochsSeenOn('MNIST')).toBe(1); // the orphan epoch was retained
});

logicTest('sessionSignals: foreign-instance events are ignored', ({ expect }) => {
  const { emit } = freshWorld();
  emit({
    type: 'run.started', streamId: 'r1', instanceId: 'other-tab', payload: startedPayload('MNIST'),
  });
  emit({ type: 'graph.checkpoint', instanceId: 'other-tab', payload: { graphJson: '{}', parent: null } });
  expect(runStartedOn('MNIST')).toBe(false);
  expect(checkpointsThisSession()).toBe(0);
});

logicTest('sessionSignals: counts checkpoints from this instance', ({ expect }) => {
  const { emit } = freshWorld();
  expect(checkpointsThisSession()).toBe(0);
  emit({ type: 'graph.checkpoint', payload: { graphJson: '{}', parent: null } });
  emit({ type: 'graph.checkpoint', payload: { graphJson: '{}', parent: 'abc' } });
  expect(checkpointsThisSession()).toBe(2);
});

logicTest('sessionSignals: install resets, uninstall stops counting', ({ expect }) => {
  const first = freshWorld();
  first.emit({ type: 'run.started', streamId: 'r1', payload: startedPayload('MNIST') });
  expect(runStartedOn('MNIST')).toBe(true);

  // Re-install (fresh session): prior facts are gone.
  const second = freshWorld();
  expect(runStartedOn('MNIST')).toBe(false);

  // After uninstall, emits no longer land.
  second.uninstall();
  second.emit({ type: 'run.started', streamId: 'r2', payload: startedPayload('MNIST') });
  expect(runStartedOn('MNIST')).toBe(false);
});

logicTest('sessionSignals: malformed events and payloads never throw', ({ expect }) => {
  const { events, emit } = freshWorld();
  expect(() => {
    events.emit('run.started', null);
    events.emit('run.started', 42);
    events.emit('run.finished', { instanceId: OWN }); // no streamId
    emit({ type: 'run.started', streamId: 'r1', payload: null });
    emit({ type: 'run.finished', streamId: 'r1', payload: { outcome: 'weird' } });
  }).not.toThrow();
  expect(runStartedOn('MNIST')).toBe(false);
});

logicTest('sessionSignals: readers are safe with nothing installed', ({ expect }) => {
  resetSessionSignals();
  expect(runStartedOn('MNIST')).toBe(false);
  expect(epochsSeenOn('MNIST')).toBe(0);
  expect(runFinishedOn('MNIST')).toBe(false);
  expect(checkpointsThisSession()).toBe(0);
});
