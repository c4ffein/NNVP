// Per-device user settings, persisted in localStorage. Deliberately tiny: a
// typed key/value bag with defaults and change listeners — components read
// through the singleton and re-render on onChange. Account-level sync is
// future work (it belongs with the device→account migration on tasks.md).

import type { StorageLike } from '../Backend/apiClient';
import type { ColorSchemeId } from './colorSchemes';
import { DEFAULT_COLOR_SCHEME } from './colorSchemes';

const STORAGE_KEY = 'nnvp_settings';

/**
 * Where the tfjs demo trainer runs: the historical main-thread engine
 * (lib/Training/tfjsEngine) or the Web Worker one (lib/Training/workerEngine
 * — generated-code eval and fit off the main thread).
 */
export type TrainingEngineChoice = 'tfjs' | 'tfjs-worker';

export interface SettingsValues {
  /** Activation color ramp shared by the 2D inspect overlays and the 3D view. */
  colorScheme: ColorSchemeId;
  /** The 3D view's first-open notice was acknowledged (per device). */
  viz3dIntroSeen: boolean;
  /** The 3D view's help legend is expanded (collapses to a "?" button). */
  viz3dLegendOpen: boolean;
  /** Training engine choice (TrainingZone.startTraining reads it per run). */
  trainingEngine: TrainingEngineChoice;
}

export const SETTINGS_DEFAULTS: SettingsValues = {
  colorScheme: DEFAULT_COLOR_SCHEME,
  viz3dIntroSeen: false,
  viz3dLegendOpen: true,
  trainingEngine: 'tfjs', // the worker engine is opt-in
};

type Listener = () => void;

export class Settings {
  private storage: StorageLike | null;
  private values: SettingsValues;
  private listeners: Listener[] = [];

  constructor(
    storage: StorageLike | null = typeof localStorage !== 'undefined' ? localStorage : null,
  ) {
    this.storage = storage;
    let stored: unknown = null;
    try {
      stored = JSON.parse(this.storage?.getItem(STORAGE_KEY) || 'null');
    } catch {
      stored = null; // corrupted settings fall back to the defaults
    }
    this.values = {
      ...SETTINGS_DEFAULTS,
      ...(stored && typeof stored === 'object' ? stored as Partial<SettingsValues> : {}),
    };
  }

  get<K extends keyof SettingsValues>(key: K): SettingsValues[K] {
    return this.values[key];
  }

  set<K extends keyof SettingsValues>(key: K, value: SettingsValues[K]): void {
    if (this.values[key] === value) return;
    this.values[key] = value;
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // Private mode / quota: settings still apply for the session.
    }
    this.listeners.forEach(listener => listener());
  }

  onChange(listener: Listener): void {
    this.listeners.push(listener);
  }

  offChange(listener: Listener): void {
    this.listeners = this.listeners.filter(candidate => candidate !== listener);
  }
}

/** The app-wide instance; tests build their own with an injected storage. */
export const settings = new Settings();
