/**
 * Checkpoints (Phase G2): graph.checkpoint stored events with RECORDED,
 * content-addressed parentage (parent = the prior state's docHash), plus the
 * BoardInterface lineage side state that stamps them — dedupe by identity,
 * loads re-enter the tree, New starts a root, dirty tracking replaces the
 * board-non-empty unload heuristic.
 */
import { logicTest } from '../harness/define';
import BoardInterface from '../../src/lib/BoardInterface/BoardInterface';
import FlowGraphEditor from '../../src/lib/FlowInterface/FlowGraphEditor';
import type { FlowStore, KerasLayerInstance } from '../../src/lib/FlowInterface/FlowGraphEditor';
import { appendCheckpoint, listCheckpoints } from '../../src/lib/Training/checkpoints';
import { modelIdentityOf } from '../../src/lib/Training/modelIdentity';
import { listAllEvents } from '../../src/lib/Events/store';
import { MemoryRecordStore } from '../../src/lib/LocalStore/recordStore';
import { setRecordStoreForTests } from '../../src/lib/LocalStore/db';
import type { FlowEdge, FlowNode } from '../../src/types/model';

function makeEditor() {
  const state: {
    nodes: FlowNode[]; edges: FlowEdge[]; selectedNodes: FlowNode[]; selectedEdges: FlowEdge[];
  } = {
    nodes: [], edges: [], selectedNodes: [], selectedEdges: [],
  };
  const store: FlowStore = {
    getNodes: () => state.nodes,
    getEdges: () => state.edges,
    setGraph: (nodes, edges) => { state.nodes = nodes; state.edges = edges; },
    getSelectedNodes: () => state.selectedNodes,
    getSelectedEdges: () => state.selectedEdges,
  };
  return new FlowGraphEditor(store);
}

const kl = (name: string): KerasLayerInstance => {
  const layer = {
    name, category: 'test', parameterDef: {}, parameterValues: {}, customUserLayer: false,
    clone() { return { ...this, parameterValues: { ...this.parameterValues } }; },
  };
  return layer as unknown as KerasLayerInstance;
};

/** A fresh facade over a fresh editor, journaling into a fresh store. */
function makeWorld() {
  const store = new MemoryRecordStore();
  setRecordStoreForTests(store);
  const iface = new BoardInterface();
  const editor = makeEditor();
  iface.addGraphEditor(editor);
  return { store, iface, editor };
}

logicTest('checkpoints: append + list round-trip graphJson and parent', async ({ expect }) => {
  const store = new MemoryRecordStore();
  const first = await appendCheckpoint('{"layers":[]}', null, store);
  await appendCheckpoint('{"layers":[],"edges":[]}', 'some-doc-hash', store);
  const listed = await listCheckpoints(store);
  expect(listed.length).toBe(2);
  expect(listed[0]!.uuid).toBe(first);
  expect(listed[0]!.parent).toBeNull();
  expect(listed[0]!.graphJson).toBe('{"layers":[]}');
  expect(listed[1]!.parent).toBe('some-doc-hash');
  const events = await listAllEvents(store);
  expect(events.every(event => event.type === 'graph.checkpoint')).toBe(true);
});

logicTest('checkpoints: the facade verb chains parents by docHash and dedupes unchanged boards', async ({ expect }) => {
  const { store, iface, editor } = makeWorld();
  editor.addLayer(kl('Dense'));
  const first = (await iface.checkpoint())!;
  expect(first.appended).toBe(true);
  // Unchanged board: appending would record a self-parented duplicate — no-op.
  expect((await iface.checkpoint())!.appended).toBe(false);
  editor.addLayer(kl('Dropout'));
  const second = (await iface.checkpoint())!;
  expect(second.appended).toBe(true);
  const checkpoints = await listCheckpoints(store);
  expect(checkpoints.length).toBe(2);
  expect(checkpoints[0]!.parent).toBeNull(); // the session's root
  expect(checkpoints[1]!.parent).toBe(first.docHash);
});

logicTest('checkpoints: loading a graph re-enters the lineage tree', async ({ expect }) => {
  const { store, iface, editor } = makeWorld();
  editor.addLayer(kl('Dense'));
  const savedJson = iface.getGraphJSON()!;
  const savedIdentity = (await modelIdentityOf(savedJson))!;
  editor.clearBoard(true);
  await iface.loadGraphFromJSON(savedJson);
  editor.addLayer(kl('Dropout'));
  const forked = (await iface.checkpoint())!;
  expect(forked.appended).toBe(true);
  const checkpoints = await listCheckpoints(store);
  expect(checkpoints[checkpoints.length - 1]!.parent).toBe(savedIdentity.docHash);
});

logicTest('checkpoints: New starts a root; dirty tracks changed-since-checkpoint', async ({ expect }) => {
  const { store, iface, editor } = makeWorld();
  const originalConfirm = window.confirm;
  window.confirm = () => true;
  try {
    editor.addLayer(kl('Dense'));
    expect(iface.isDirty()).toBe(true);
    await iface.checkpoint();
    expect(iface.isDirty()).toBe(false);
    editor.addLayer(kl('Dropout'));
    expect(iface.isDirty()).toBe(true);
    iface.clearBoard();
    expect(iface.getLineageParent()).toBeNull();
    expect(iface.isDirty()).toBe(false);
    editor.addLayer(kl('Dense'));
    const root = (await iface.checkpoint())!;
    expect(root.appended).toBe(true);
    const checkpoints = await listCheckpoints(store);
    expect(checkpoints[checkpoints.length - 1]!.parent).toBeNull(); // fresh root
  } finally {
    window.confirm = originalConfirm;
  }
});

logicTest('checkpoints: an empty board cannot be checkpointed', async ({ expect }) => {
  const { store, iface } = makeWorld();
  expect(await iface.checkpoint()).toBeNull(); // nothing to pin
  expect((await listCheckpoints(store)).length).toBe(0);
});
