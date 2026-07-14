// The NNVP model format: what .nnvp files contain, what D3Model.toJSON
// emitted historically, and what FlowInterface/adapter's flowToNnvp emits /
// nnvpToFlow accepts today. This is the persisted contract — change it only
// in ways old saved files still satisfy.

// --- Keras layer definitions -------------------------------------------------

/**
 * One entry of a layer's `parameters` in generatedKerasLayers.json, and of
 * `KerasLayer.parameterDef`. Discriminated on `type`, which picks the editor
 * component in LayerOptions (FloatParameter, TupleIntParameter, ...).
 *
 * `default` is Python-flavored: "None" (the string) means Keras' own default,
 * and int/float defaults can be "None" too.
 */
export type ParameterDef =
  | { type: 'string'; default?: string }
  | { type: 'boolean'; default?: boolean | 'None' }
  | { type: 'int'; default?: number | 'None' }
  | { type: 'float'; default?: number | 'None' }
  | { type: 'tuple_int'; default?: number[] | 'None' }
  // Legacy variants still dispatched by LayerOptions; nothing generates them
  // today but old custom-layer payloads may carry them.
  | { type: 'list'; default?: unknown }
  | { type: 'type_selecter'; default?: unknown };

export type ParameterValue = string | number | boolean | number[] | null;

/**
 * The serialized shape of a KerasLayer instance (KerasLayer.js). Live
 * instances have methods on top (clone/load/setParameterValue...); after any
 * JSON round-trip they MUST be revived with `new KerasLayer().load(json)` or
 * the params panel crashes on setParameterValue.
 */
export interface KerasLayerJSON {
  name: string;
  category: string;
  searchTerms: string[];
  parameterDef: Record<string, ParameterDef>;
  parameterValues: Record<string, ParameterValue>;
  customUserLayer: boolean;
}

// --- Layer catalog (generatedKerasLayers.json) --------------------------------

/**
 * One layer's entry in generatedKerasLayers.json. `input`/`output` are
 * doc-style shape hints (e.g. { shape: "Arbitrary" }), NOT ParameterDefs.
 */
export interface KerasLayerCatalogEntry {
  category: string;
  preferredName?: string;
  parameters: Record<string, ParameterDef>;
  input?: { shape: string | string[] };
  output?: { shape: string | string[] };
}

/**
 * The whole generatedKerasLayers.json: nested { aliasToCanonical, layers }
 * today; the old flat format was just the `layers` record on its own, and
 * KerasInterface.load still accepts both.
 */
export interface KerasLayerCatalog {
  aliasToCanonical?: Record<string, string>;
  layers?: Record<string, KerasLayerCatalogEntry>;
}

// --- Persisted graph (.nnvp files) -------------------------------------------

/** Layer ids are integers from the editor, but old files may carry strings. */
export type NnvpLayerId = number | string;

export interface NnvpEdge {
  id: NnvpLayerId;
  htmlID: string;
  source: NnvpLayerId;
  target: NnvpLayerId;
}

export interface NnvpLayer {
  class: 'D3Layer' | 'D3LayerComposite';
  id: NnvpLayerId;
  htmlID: string;
  name: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Ids of layers feeding this one, in edge order. */
  inputLayers: NnvpLayerId[];
  /** Ids of layers this one feeds, in edge order. */
  outputLayers: NnvpLayerId[];
  /** Composite children, with ABSOLUTE board coordinates. */
  children?: NnvpLayer[] | null;
  kerasLayer: KerasLayerJSON | null;
  parentID: NnvpLayerId | null;
}

export interface NnvpModel {
  /**
   * Save-format version (see lib/ModelFormat/migrations.ts). Absent on files
   * saved before versioning existed, which reads as version 1.
   */
  formatVersion?: number;
  layers: NnvpLayer[];
  edges: NnvpEdge[];
  /** Ids of the Input layers, in creation order. */
  inputs: NnvpLayerId[];
  /**
   * NOT the Output nodes: the ids of the layers FEEDING an Output node, in
   * edge order (see D3LayerComponent.addInputLayer's historical behavior).
   */
  outputs: NnvpLayerId[];
}

// --- Board elements (Vue Flow side of the adapter) ---------------------------

/** What the adapter stashes on every node so load -> save is lossless. */
export interface NnvpNodeData {
  label: string;
  nnvp: {
    id: NnvpLayerId;
    htmlID: string;
    name: string;
    width?: number;
    height?: number;
    kerasLayer: KerasLayerJSON | null;
  };
}

/**
 * The subset of a Vue Flow node/edge the FlowInterface reads and writes.
 * Deliberately NOT imported from @vue-flow/core: lib/ stays importable under
 * bun without Vue, and the facade only relies on this narrow surface.
 */
export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NnvpNodeData;
  parentNode?: string;
  extent?: 'parent';
  style?: Record<string, string>;
  selected?: boolean;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  data?: { nnvp: NnvpEdge };
}
