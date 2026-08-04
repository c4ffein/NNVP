/**
 * engineInfo.ts — engine provenance for display (Phase F).
 *
 * engineId stays the RECORDED fact in run.started; the History columns
 * ("Ran on", "Lib", "Hardware") are derived here and only here. ENGINE_TABLE
 * follows the event-registry pattern: one auditable table, a new engine must
 * register a row (an unknown id degrades to nulls — legacy and
 * future-executor ids must never break the panel).
 *
 * Hardware is the other direction: captureBrowserHardware collects the FACT
 * at startRun time (best-effort — what the platform hides is omitted, never
 * null-stuffed), and hardwareLabel compresses a recorded fact into the short
 * table cell. Facts are recorded at event time and never recomputed —
 * that rule extends to future remote runs' cost (locked-decision-4
 * discipline applied to money).
 */

import type { RunHardware } from './runEvents';

export type RanOn = 'browser' | 'remote';
/** 'tinyloop' is NNVP's ahead-of-time tinygrad→WebGPU binder (trace once,
 *  loop the pre-recorded step); plain 'tinygrad' is reserved for a future
 *  remote python executor, 'tf' for remote Keras. */
export type EngineLib = 'tf' | 'tfjs' | 'tinygrad' | 'tinyloop';

export interface EngineInfo {
  ranOn: RanOn | null;
  lib: EngineLib | null;
  /** True when the engine runs in a Web Worker (a detail, not a column). */
  worker: boolean;
}

const ENGINE_TABLE: Record<string, EngineInfo> = {
  tfjs: { ranOn: 'browser', lib: 'tfjs', worker: false },
  'tfjs-worker': { ranOn: 'browser', lib: 'tfjs', worker: true },
  // The bench engine: pre-traced WebGPU steps looped in the browser.
  tinygrad: { ranOn: 'browser', lib: 'tinyloop', worker: false },
};

export function describeEngine(engineId: string | null | undefined): EngineInfo {
  return (engineId && ENGINE_TABLE[engineId]) || { ranOn: null, lib: null, worker: false };
}

/**
 * "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)"
 * → "NVIDIA GeForce RTX 3060". Non-ANGLE strings pass through untouched.
 */
function shortGpu(gpu: string): string {
  const angle = /^ANGLE \((.*)\)$/.exec(gpu.trim());
  if (!angle) return gpu;
  const parts = angle[1]!.split(',').map(part => part.trim());
  // ANGLE's middle part is the device; strip the D3D shader-model suffix.
  const device = parts.length >= 2 ? parts[1]! : parts[0]!;
  return device.replace(/ Direct3D\d+.*$/, '');
}

/** The short Hardware cell: stamped label > GPU > backend/cores > '—'. */
export function hardwareLabel(hardware: RunHardware | null | undefined): string {
  if (!hardware) return '—';
  if (hardware.label) return hardware.label;
  if (hardware.gpu) return shortGpu(hardware.gpu);
  const parts: string[] = [];
  if (hardware.backend) parts.push(hardware.backend);
  if (hardware.cores !== undefined) parts.push(`${hardware.cores}c`);
  return parts.length ? parts.join(' · ') : '—';
}

/** The narrow navigator surface the collector reads (injectable for tests). */
interface NavigatorLike {
  hardwareConcurrency?: number;
}

/**
 * Collect what THIS browser will run on, at startRun time. Every probe is
 * best-effort: a masked WebGL renderer, a missing API, a throwing context —
 * the field is simply omitted (payloads stay byte-stable, '—' in the UI).
 */
export function captureBrowserHardware(
  nav: NavigatorLike | undefined = typeof navigator === 'undefined' ? undefined : navigator,
): RunHardware {
  const hardware: RunHardware = {};
  if (nav && typeof nav.hardwareConcurrency === 'number') {
    hardware.cores = nav.hardwareConcurrency;
  }
  try {
    if (typeof document !== 'undefined') {
      const gl = document.createElement('canvas').getContext('webgl');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      const renderer = info && gl!.getParameter(info.UNMASKED_RENDERER_WEBGL);
      if (typeof renderer === 'string' && renderer) hardware.gpu = renderer;
    }
  } catch {
    // No WebGL, no gpu field — exactly the degraded case the UI expects.
  }
  return hardware;
}
