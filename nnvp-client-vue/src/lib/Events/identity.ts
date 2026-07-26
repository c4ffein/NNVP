/**
 * identity.ts — who is speaking on the event bus (PLAN.md locked decision 1).
 *
 *   - deviceId:   stable per browser. A uuid lazily minted on first use and
 *                 persisted under localStorage 'nnvp_device_id'; when storage
 *                 is unavailable (private mode) it stays session-only.
 *   - instanceId: minted fresh at every page load (once per Identity — the
 *                 module singleton is built once per module load).
 *   - nextSeq():  in-memory monotonic counter per instance. Nothing is
 *                 persisted, so two tabs never race over it.
 *
 * (deviceId, instanceId, seq) totally orders one instance's event stream;
 * cross-instance ordering is causal (dependsOn), never wall-clock.
 *
 * Storage is injectable for tests (the StorageLike pattern of
 * lib/Settings/settings.ts); the app uses the module singleton.
 */

import type { StorageLike } from '../Backend/apiClient';

export const DEVICE_ID_STORAGE_KEY = 'nnvp_device_id';

export class Identity {
  private storage: StorageLike | null;
  private cachedDeviceId: string | null = null;
  /** Fresh per instance — never persisted, identifies this page load. */
  readonly instanceId: string;
  private seq = 0;

  constructor(
    storage: StorageLike | null = typeof localStorage !== 'undefined' ? localStorage : null,
  ) {
    this.storage = storage;
    this.instanceId = crypto.randomUUID();
  }

  /** The stable per-device uuid, minted and persisted on first use. */
  deviceId(): string {
    if (this.cachedDeviceId) return this.cachedDeviceId;
    let stored: string | null = null;
    try {
      stored = this.storage ? this.storage.getItem(DEVICE_ID_STORAGE_KEY) : null;
    } catch {
      stored = null; // storage unavailable: mint a session-only id below
    }
    const deviceId = stored || crypto.randomUUID();
    if (!stored) {
      try {
        this.storage?.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
      } catch { /* private mode / quota: the id still holds for this session */ }
    }
    this.cachedDeviceId = deviceId;
    return deviceId;
  }

  /** The next sequence number: 1, 2, 3, … — monotonic within this instance. */
  nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }
}

/** The app-wide identity; tests build their own with an injected storage. */
export const identity = new Identity();

export function deviceId(): string {
  return identity.deviceId();
}

/** This page load's id (one Identity per module load = one id per load). */
export const instanceId = identity.instanceId;

export function nextSeq(): number {
  return identity.nextSeq();
}
