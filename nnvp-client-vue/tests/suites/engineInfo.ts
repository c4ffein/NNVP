/**
 * Engine provenance display (Phase F): engineId stays the recorded fact;
 * describeEngine derives the "Ran on" / "Lib" columns from ONE auditable
 * table (the event-registry pattern), and hardwareLabel compresses a
 * RunHardware payload into the short History cell. Unknown inputs degrade
 * to null/'—' — a legacy or future engineId must never break the table.
 */
import { logicTest } from '../harness/define';
import { describeEngine, hardwareLabel, captureBrowserHardware } from '../../src/lib/Training/engineInfo';

logicTest('engineInfo: the engine table maps the three shipped engines', ({ expect }) => {
  expect(describeEngine('tfjs')).toEqual({ ranOn: 'browser', lib: 'tfjs', worker: false });
  expect(describeEngine('tfjs-worker')).toEqual({ ranOn: 'browser', lib: 'tfjs', worker: true });
  // The bench engine loops the pre-traced WebGPU step in the browser — that
  // binder is 'tinyloop' (remote python tinygrad will register separately).
  expect(describeEngine('tinygrad')).toEqual({ ranOn: 'browser', lib: 'tinyloop', worker: false });
});

logicTest('engineInfo: unknown engine ids degrade to nulls, never throw', ({ expect }) => {
  expect(describeEngine('some-future-engine')).toEqual({ ranOn: null, lib: null, worker: false });
  expect(describeEngine('')).toEqual({ ranOn: null, lib: null, worker: false });
  expect(describeEngine(null)).toEqual({ ranOn: null, lib: null, worker: false });
});

logicTest('engineInfo: hardwareLabel prefers the stamped label, then GPU, then backend/cores', ({ expect }) => {
  expect(hardwareLabel({ label: 'A100 · 40GB', gpu: 'NVIDIA A100' })).toBe('A100 · 40GB');
  expect(hardwareLabel({ gpu: 'Apple M1', cores: 8 })).toBe('Apple M1');
  expect(hardwareLabel({ backend: 'webgl', cores: 8 })).toBe('webgl · 8c');
  expect(hardwareLabel({ cores: 4 })).toBe('4c');
  expect(hardwareLabel({ backend: 'cpu' })).toBe('cpu');
  expect(hardwareLabel({})).toBe('—');
  expect(hardwareLabel(null)).toBe('—');
});

logicTest('engineInfo: hardwareLabel unwraps ANGLE renderer strings to the device name', ({ expect }) => {
  expect(hardwareLabel({
    gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  })).toBe('NVIDIA GeForce RTX 3060');
  expect(hardwareLabel({ gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' }))
    .toBe('ANGLE Metal Renderer: Apple M2');
});

logicTest('engineInfo: captureBrowserHardware records cores and omits what the platform hides', ({ expect }) => {
  const captured = captureBrowserHardware({ hardwareConcurrency: 12 });
  expect(captured.cores).toBe(12);
  // No WebGL in the unit world: the gpu field must be ABSENT, not undefined-valued
  // (payloads are JSON-safe and byte-stable — see the run.started contract).
  expect('gpu' in captured).toBe(false);
  const bare = captureBrowserHardware({});
  expect('cores' in bare).toBe(false);
});
