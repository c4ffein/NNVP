/**
 * emitter.ts — the typed event core (PLAN.md Phase A, locked decision 2).
 *
 * A small synchronous pub/sub emitter. Event types are namespaced strings
 * ("training.epoch"); subscribers may target one exact type or a one-level
 * prefix wildcard ("training.*" — a simple split on the first '.', no trie),
 * which receives every event whose first segment matches.
 *
 * Deliberately dependency-free (no Vue, no DOM) so it runs identically under
 * bun, happy-dom and the browser. The retention registry lives in
 * ./registry.ts; the app-wide singleton wiring the two together is ./bus.ts.
 * Unknown-type policy (decision 2): the OPTIONAL isKnownType/onUnknownType
 * hooks let the bus warn about unregistered types in dev — but delivery is
 * never blocked, an unknown event must not brick the app.
 */

/** A handler; the concrete type rides along for wildcard subscribers. */
export type Handler<P = unknown> = (payload: P, type: string) => void;

/** Payload-per-type map an Emitter can be specialized with (see registry.ts).
 *  Kept as the unconstrained default so interfaces (no index signature, e.g.
 *  AppEvents) can specialize the class too. */
export type EventMap = Record<string, unknown>;

/** One-level prefix wildcard subscription key, e.g. "training.*". */
export type WildcardType = `${string}.*`;

export interface EmitterOptions {
  /** When provided, every emitted type is checked; misses call onUnknownType. */
  isKnownType?: (type: string) => boolean;
  /** Called once per emit of an unknown type. Delivery proceeds regardless. */
  onUnknownType?: (type: string) => void;
}

export class Emitter<M = EventMap> {
  private handlers = new Map<string, Set<Handler>>();
  private options: EmitterOptions;

  constructor(options: EmitterOptions = {}) {
    this.options = options;
  }

  /** Subscribe to one exact type, or to a namespace via "prefix.*". Returns the unsubscriber. */
  on<K extends keyof M & string>(type: K, handler: Handler<M[K]>): () => void;
  on(type: WildcardType, handler: Handler): () => void;
  on(type: string, handler: Handler<never>): () => void {
    const stored = handler as Handler;
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(stored);
    return () => this.off(type as WildcardType, stored);
  }

  off<K extends keyof M & string>(type: K, handler: Handler<M[K]>): void;
  off(type: WildcardType, handler: Handler): void;
  off(type: string, handler: Handler<never>): void {
    const set = this.handlers.get(type);
    if (!set) return;
    set.delete(handler as Handler);
    if (set.size === 0) this.handlers.delete(type);
  }

  /** Emit to the exact subscribers, then to the "<namespace>.*" ones. */
  emit<K extends keyof M & string>(
    type: K,
    ...payload: M[K] extends void ? [] : [M[K]]
  ): void {
    const { isKnownType, onUnknownType } = this.options;
    if (isKnownType && onUnknownType && !isKnownType(type)) onUnknownType(type);
    this.deliver(type, payload[0]);
    const dot = type.indexOf('.');
    if (dot > 0) {
      const wildcard = `${type.slice(0, dot)}.*`;
      if (wildcard !== type) this.deliver(wildcard, payload[0], type);
    }
  }

  /** Exact-key subscriber count (wildcard keys count under their own key). */
  listenerCount(type: string): number {
    return this.handlers.get(type)?.size ?? 0;
  }

  private deliver(key: string, payload: unknown, type: string = key): void {
    const set = this.handlers.get(key);
    if (!set) return;
    // Snapshot first: a handler may (un)subscribe while we iterate.
    for (const handler of Array.from(set)) {
      try {
        handler(payload, type);
      } catch (error) {
        // One bad subscriber must not starve the others (same isolation
        // window CustomEvent listeners had before this bus replaced them).
        console.error(`nnvp events: a "${key}" handler threw`, error); // eslint-disable-line no-console
      }
    }
  }
}
