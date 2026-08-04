/**
 * checkpoints.ts — board checkpoints as `graph.checkpoint` stored events
 * (Phase G2). Ctrl+S pins a moment: the graph snapshot plus its RECORDED
 * parent — the docHash of the state this editing session evolved from.
 * Content-addressed parentage means two devices forking the same state
 * record the same parent, so the evolution graph converges after sync with
 * no coordination (the same argument as the rest of the merge-free design).
 *
 * Checkpoints are not streams — streamId stays null; per-checkpoint cloud
 * purge is parked with the rest of the purge UX. Log growth is accepted
 * (events are small and forever); dedupe-by-identity lives in the facade
 * verb (BoardInterface.checkpoint), not here.
 */

import { appendEvent, listAllEvents, makeEvent } from '../Events/store';
import { getRecordStore } from '../LocalStore/db';
import type { RecordStore } from '../LocalStore/recordStore';

export interface GraphCheckpointPayload {
  graphJson: string;
  /** The parent STATE's docHash; null = a root (New / first ever save). */
  parent: string | null;
}

export interface CheckpointRecord {
  uuid: string;
  /** The event's wall time — display only, like everywhere else. */
  at: string | null;
  graphJson: string;
  parent: string | null;
}

/** Append one checkpoint event; returns its uuid. */
export async function appendCheckpoint(
  graphJson: string,
  parent: string | null,
  store: RecordStore = getRecordStore(),
): Promise<string> {
  const event = makeEvent<GraphCheckpointPayload>('graph.checkpoint', {
    payload: { graphJson, parent },
  });
  await appendEvent(event, { store });
  return event.uuid;
}

/** Every checkpoint, oldest-first by wall time (uuid as the stable tiebreak). */
export async function listCheckpoints(
  store: RecordStore = getRecordStore(),
): Promise<CheckpointRecord[]> {
  const kept: { record: CheckpointRecord; seq: number }[] = [];
  for (const event of await listAllEvents(store)) {
    if (event.type !== 'graph.checkpoint') continue; // eslint-disable-line no-continue
    const payload = event.payload as Partial<GraphCheckpointPayload> | null;
    if (typeof payload?.graphJson !== 'string') continue; // eslint-disable-line no-continue
    kept.push({
      seq: typeof event.seq === 'number' ? event.seq : 0,
      record: {
        uuid: event.uuid,
        at: typeof event.wallTime === 'string' && event.wallTime ? event.wallTime : null,
        graphJson: payload.graphJson,
        parent: typeof payload.parent === 'string' ? payload.parent : null,
      },
    });
  }
  // Same-millisecond checkpoints from one device order by their seq — the
  // wall time alone cannot break that tie (and uuids would shuffle it).
  return kept
    .sort((a, b) => {
      const timeA = a.record.at ?? '';
      const timeB = b.record.at ?? '';
      if (timeA !== timeB) return timeA < timeB ? -1 : 1;
      if (a.seq !== b.seq) return a.seq - b.seq;
      return a.record.uuid < b.record.uuid ? -1 : 1;
    })
    .map(entry => entry.record);
}
