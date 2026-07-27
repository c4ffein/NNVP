/**
 * The app's non-Vue service wiring — everything main.ts starts that isn't a
 * component singleton. It is a callable function (not boot side effects) so
 * the bun test world runs THE SAME wiring the real app does
 * (tests/harness/worldBun.ts): world/app parity is the point, not a
 * convenience. Defaults are evaluated at call time, so whatever RecordStore
 * singleton is installed (the app's IndexedDB one, or a test's memory one)
 * is the one that syncs.
 */
import ApiClient from './Backend/apiClient';
import { installSyncOnAuth } from './Backend/sync';
import type { AuthedSyncApiClient } from './Backend/sync';
import { getRecordStore } from './LocalStore/db';
import type { RecordStore } from './LocalStore/recordStore';

/**
 * Local↔cloud sync (events, conversations): syncs now when a token is
 * already stored, and again on every 'auth.changed' bus event. Progressive
 * enhancement — failures only warn, and logged-out is a no-op. Returns the
 * uninstaller.
 */
export function installAppServices({
  apiClient = new ApiClient(),
  store = getRecordStore(),
}: {
  apiClient?: AuthedSyncApiClient;
  store?: RecordStore;
} = {}): () => void {
  return installSyncOnAuth({ apiClient, store });
}
