/**
 * registry.ts — THE auditable event-type table (PLAN.md locked decision 2).
 *
 * Every event type the frontend emits is declared here with its retention:
 *   - 'ephemeral': bus-only signals (UI navigation, batch-level ticks) —
 *     delivered to live subscribers, never persisted, never synced.
 *   - 'stored':    domain events (run lifecycle, epochs, …) — persisted in
 *     the 'events' store and synced (lib/Events/store.ts appends then emits;
 *     the bus payload for a stored type is the full DomainEvent envelope).
 * Retention is decided HERE, per type, never at call sites. The backend owns
 * its own table.
 *
 * AppEvents maps each type to its payload so bus subscribers/emitters are
 * typed end to end. Types are namespaced "a.b"; the emitter supports
 * one-level prefix wildcard subscription ("ui.*").
 */

import type { DomainEvent } from './domainEvent';

export type Retention = 'ephemeral' | 'stored';

/** Payload per event type. `void` = the event carries no payload. Stored
 *  types carry their full DomainEvent envelope (the concrete payload shapes
 *  live with their domain — run.* in lib/Training/runEvents.ts). */
export interface AppEvents {
  /** The stored backend token changed: sign-in, sign-out, expiry cleanup. */
  'auth.changed': void;
  /** The assistant starts/switches a guided tutorial (App.vue drives the overlay). */
  'ui.start-tutorial': { id: string };
  /** The assistant opens the Training window (App.vue owns its height). */
  'ui.open-training': void;
  /** A help modal hands the user over to the chat ("Ask the assistant about X"). */
  'ui.ask-assistant': { topic: string };
  /** A training run opened: engine, config snapshot, graph JSON (stream = run uuid). */
  'run.started': DomainEvent;
  /** One journaled epoch metrics row of a run. */
  'run.epoch': DomainEvent;
  /** A run reached a terminal outcome (completed / cancelled / error). */
  'run.finished': DomainEvent;
  /** The run was hidden from history (reversible — the event-sourced "delete"). */
  'run.hidden': DomainEvent;
  /** The run was brought back into history. */
  'run.unhidden': DomainEvent;
  /** A board checkpoint: graph snapshot + recorded parent state (docHash). */
  'graph.checkpoint': DomainEvent;
  /** The user's rating claim: {workHash, score 0..1000} (Phase H3). */
  'model.rated': DomainEvent;
  /** RETIRED same-day pairwise experiment (2026-08-04) — kept so any
   *  recorded judgments stay known events; nothing folds them anymore. */
  'model.compared': DomainEvent;
  /** A model hard-linked into a folder: {path, workHash} (Phase H5). */
  'folder.linked': DomainEvent;
  /** One link removed (the model survives everywhere else). */
  'folder.unlinked': DomainEvent;
  /** An (empty) folder brought into existence: {path}. */
  'folder.created': DomainEvent;
  /** An empty folder removed; links are the truth and override this. */
  'folder.removed': DomainEvent;
}

export type AppEventType = keyof AppEvents;

/** The one table. Add every new event type here — emit warns in dev otherwise. */
export const EVENT_RETENTION: { readonly [K in AppEventType]: Retention } = {
  'auth.changed': 'ephemeral',
  'ui.start-tutorial': 'ephemeral',
  'ui.open-training': 'ephemeral',
  'ui.ask-assistant': 'ephemeral',
  'run.started': 'stored',
  'run.epoch': 'stored',
  'run.finished': 'stored',
  'run.hidden': 'stored',
  'run.unhidden': 'stored',
  'graph.checkpoint': 'stored',
  'model.rated': 'stored',
  'model.compared': 'stored',
  'folder.linked': 'stored',
  'folder.unlinked': 'stored',
  'folder.created': 'stored',
  'folder.removed': 'stored',
};

export function isKnownEventType(type: string): type is AppEventType {
  return Object.prototype.hasOwnProperty.call(EVENT_RETENTION, type);
}

export function retentionOf(type: AppEventType): Retention {
  return EVENT_RETENTION[type];
}
