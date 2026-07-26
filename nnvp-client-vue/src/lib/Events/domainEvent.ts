/**
 * domainEvent.ts — the client event envelope (PLAN.md locked decision 1).
 *
 * One shape for every domain event the frontend persists and syncs:
 *
 *   { uuid, type, streamId, deviceId, instanceId, seq, dependsOn, wallTime,
 *     payload }
 *
 * Ordering is causal: (deviceId, instanceId, seq) totally orders one
 * instance's stream; cross-instance order comes ONLY from `dependsOn`.
 * `wallTime` is display garnish, never logic. The wire shape is snake_case
 * (event_type, stream_id, …) — apiClient owns that mapping; everything on
 * this side of the sync boundary speaks THIS camelCase shape.
 *
 * This module is deliberately import-free so the registry, the event store,
 * runEvents and apiClient can all name the envelope without cycles.
 */

export interface DomainEvent<P = unknown> {
  /** Client-minted, globally unique — THE sync identity (set-difference key). */
  uuid: string;
  /** Namespaced "a.b" event type, declared in lib/Events/registry.ts. */
  type: string;
  /** The aggregate this event belongs to (e.g. a training run's uuid). */
  streamId: string | null;
  deviceId: string;
  instanceId: string;
  /** Monotonic within (deviceId, instanceId) — see lib/Events/identity.ts. */
  seq: number;
  /** Uuids of events this one causally follows (cross-instance ordering). */
  dependsOn: string[];
  /** ISO timestamp, display-only. Never drives ordering or liveness logic. */
  wallTime: string;
  payload: P;
}

/**
 * A DomainEvent as the local 'events' store holds it. `localOnly` is the one
 * mutable, device-private flag (never sent on the wire): set after a cloud
 * purge so sync never re-uploads the surviving local copies.
 */
export interface StoredDomainEvent<P = unknown> extends DomainEvent<P> {
  localOnly?: boolean;
}
