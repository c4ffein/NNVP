/**
 * bus.ts — the ONE app-wide event bus (module singleton, like chatSession).
 *
 * An Emitter typed by the registry's AppEvents table. Emitting a type that is
 * not in lib/Events/registry.ts warns in dev builds (and under TypeScript it
 * simply won't compile) but is still delivered — an unregistered event must
 * never brick the app.
 *
 * main.ts exposes this instance on window.nnvp.debug.bus in dev builds so the
 * browser test world can reach it (the window.nnvp.debug pattern).
 */

import { Emitter } from './emitter';
import { isKnownEventType } from './registry';
import type { AppEvents } from './registry';

// import.meta.env is Vite-only (absent under bun/unit tests) — typed locally
// instead of pulling in vite/client types (same pattern as main.ts).
type ImportMetaWithEnv = ImportMeta & { env?: { DEV?: boolean } };

export const bus = new Emitter<AppEvents>({
  isKnownType: isKnownEventType,
  onUnknownType: (type) => {
    if ((import.meta as ImportMetaWithEnv).env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn(
        `nnvp events: "${type}" is not declared in lib/Events/registry.ts — `
        + 'add it to the retention table (the event was still delivered).',
      );
    }
  },
});
