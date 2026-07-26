/**
 * store.ts — the domain event log (PLAN.md Phase C, locked decisions 1/2/7).
 *
 * One emitter, two retentions: appendEvent() persists a DomainEvent into the
 * 'events' RecordStore, then emits it on the app bus — live subscribers see
 * the same event future readers will fold. Only types the registry declares
 * 'stored' may be appended (appending an 'ephemeral' type is a call-site bug
 * and throws); unknown types still append — the registry warning fires at
 * emit time, and an unknown event must never brick the app.
 *
 * Events are immutable and deduped by uuid: appending an already-stored uuid
 * is a silent no-op (no rewrite, no re-emit) — that is what makes duplicate
 * delivery (sync pull, legacy re-explosion) safe by construction. The one
 * exception to immutability is the device-private `localOnly` flag, flipped
 * by setStreamLocalOnly() after a cloud purge so sync never re-uploads the
 * survivors; it never travels on the wire.
 *
 * Readers get raw event lists in NO guaranteed order (IndexedDB getAll is
 * key-ordered) — ordering is the fold's job (lib/Training/runEvents.ts).
 */

import { bus } from './bus';
import type { Emitter, EventMap } from './emitter';
import { identity as defaultIdentity, Identity } from './identity';
import { isKnownEventType, retentionOf } from './registry';
import type { DomainEvent, StoredDomainEvent } from './domainEvent';
import { getRecordStore } from '../LocalStore/db';
import type { RecordStore } from '../LocalStore/recordStore';

export interface AppendOptions {
  store?: RecordStore;
  /** The bus to emit on; the app-wide one by default. Tests inject theirs. */
  events?: Emitter<EventMap>;
  /** Store the event flagged device-private (a purge follow-up — see above). */
  localOnly?: boolean;
}

/**
 * Persist `event` then emit it on the bus. Returns true when the event was
 * new, false when its uuid was already stored (nothing written, nothing
 * emitted — duplicate delivery is a no-op by design).
 */
export async function appendEvent(
  event: DomainEvent,
  { store = getRecordStore(), events = bus as Emitter<EventMap>, localOnly = false }: AppendOptions = {},
): Promise<boolean> {
  if (isKnownEventType(event.type) && retentionOf(event.type) === 'ephemeral') {
    throw new Error(
      `nnvp events: "${event.type}" is declared 'ephemeral' in the registry — `
      + 'bus.emit() it, never append it to the event log.',
    );
  }
  const existing = await store.get<StoredDomainEvent>('events', event.uuid);
  if (existing) return false;
  const record: StoredDomainEvent = localOnly ? { ...event, localOnly: true } : { ...event };
  await store.put('events', record);
  events.emit(event.type, event);
  return true;
}

/** Every stored event of one stream, unordered — fold to make sense of them. */
export async function listEventsByStream(
  streamId: string,
  store: RecordStore = getRecordStore(),
): Promise<StoredDomainEvent[]> {
  return (await listAllEvents(store)).filter(event => event.streamId === streamId);
}

/** The whole local event log, unordered (sync's local side of the set diff). */
export async function listAllEvents(
  store: RecordStore = getRecordStore(),
): Promise<StoredDomainEvent[]> {
  return store.list<StoredDomainEvent & { uuid: string }>('events');
}

/**
 * Flag every local event of a stream device-private, so a cloud-purged
 * stream is never re-uploaded behind the user's back (the events themselves
 * survive locally — purge is a cloud operation, local removal is `hidden`).
 */
export async function setStreamLocalOnly(
  streamId: string,
  store: RecordStore = getRecordStore(),
): Promise<void> {
  for (const event of await listEventsByStream(streamId, store)) {
    if (!event.localOnly) {
      const flagged: StoredDomainEvent = { ...event, localOnly: true };
      await store.put('events', flagged);
    }
  }
}

/** Mint a new event under this device/instance identity (seq allocated here). */
export function makeEvent<P>(
  type: string,
  { streamId = null, payload, dependsOn = [] }: {
    streamId?: string | null;
    payload: P;
    dependsOn?: string[];
  },
  identity: Identity = defaultIdentity,
): DomainEvent<P> {
  return {
    uuid: crypto.randomUUID(),
    type,
    streamId,
    deviceId: identity.deviceId(),
    instanceId: identity.instanceId,
    seq: identity.nextSeq(),
    dependsOn,
    wallTime: new Date().toISOString(),
    payload,
  };
}
