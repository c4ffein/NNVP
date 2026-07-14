// Keras 3 `.keras` archive -> NnvpModel (architecture only).
//
// A .keras file is a ZIP holding metadata.json, config.json (the
// architecture: class_name Sequential/Functional plus the layer list) and
// model.weights.h5. V1 imports the ARCHITECTURE from config.json and IGNORES
// the weights — reading model.weights.h5 back onto the layers is future work.
//
// Each Keras layer is mapped onto its definition in
// KerasInterface/generatedKerasLayers.json: every config key that exists in
// the definition's parameters becomes a parameterValue, everything else is
// tolerated and reported through `ignoredParams`. Unsupported layer
// class_names abort the import with an error listing them — no silent
// placeholders. Like the app's own graphs, the imported model ends in
// synthetic Output node(s) fed by the Keras model's outputs.

import type {
  NnvpModel, NnvpLayer, NnvpEdge, KerasLayerJSON, ParameterDef, ParameterValue,
} from '../../types/model';
import generatedKerasLayers from '../KerasInterface/generatedKerasLayers.json';
import { readZipText, type Inflate } from './zip';

interface LayerDefJSON { category: string; parameters: Record<string, ParameterDef> }

const kerasDefs = generatedKerasLayers as unknown as {
  aliasToCanonical: Record<string, string>;
  layers: Record<string, LayerDefJSON>;
};

// Simple deterministic layered placement: x by topological depth, y by index
// within a depth. A real auto-layout feature is coming — keep this minimal.
const X_ORIGIN = 60;
const Y_ORIGIN = 60;
const X_STEP = 180;
const Y_STEP = 90;

export interface KerasImportResult {
  model: NnvpModel;
  /** Keras config keys with no matching parameter definition, per layer name. */
  ignoredParams: Record<string, string[]>;
}

/** A Keras layer resolved to a definition but not yet laid out on the board. */
interface ImportedLayer {
  kerasName: string;
  kerasLayer: KerasLayerJSON;
  /** kerasNames of the layers feeding this one, in argument order. */
  sources: string[];
}

interface BuiltLayer { kerasLayer: KerasLayerJSON; ignoredKeys: string[] }

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord => (
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const canonicalName = (name: string): string => kerasDefs.aliasToCanonical[name] ?? name;

function defOf(name: string): LayerDefJSON {
  const def = kerasDefs.layers[name];
  if (def === undefined) throw new Error(`keras import: no layer definition for "${name}"`);
  return def;
}

function layerJSON(
  name: string,
  def: LayerDefJSON,
  parameterValues: Record<string, ParameterValue>,
): KerasLayerJSON {
  return {
    name,
    category: def.category,
    searchTerms: [name, def.category],
    parameterDef: def.parameters,
    parameterValues,
    customUserLayer: false,
  };
}

// --- Parameter mapping -------------------------------------------------------

function mapParameterValue(value: unknown): ParameterValue | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value) && value.every(item => typeof item === 'number')) {
    return value as number[];
  }
  // Serialized objects (initializers, regularizers...) keep their class name:
  // the definitions model these parameters as plain strings.
  const className = asRecord(value).class_name;
  if (typeof className === 'string') return className;
  return undefined;
}

const NO_SKIPPED_KEYS: ReadonlySet<string> = new Set();

/**
 * Copies onto parameterValues every config key present in the definition's
 * parameters; null values keep Keras' own default (unset, like the editor).
 * Returns the keys that could not be mapped so callers can report them.
 */
function mapConfigOntoDef(
  def: LayerDefJSON,
  config: JsonRecord,
  skip: ReadonlySet<string>,
): { values: Record<string, ParameterValue>; ignored: string[] } {
  const values: Record<string, ParameterValue> = {};
  const ignored: string[] = [];
  Object.entries(config).forEach(([key, raw]) => {
    if (skip.has(key) || raw === null) return;
    const mapped = def.parameters[key] === undefined ? undefined : mapParameterValue(raw);
    if (mapped === undefined) ignored.push(key);
    else values[key] = mapped;
  });
  return { values, ignored };
}

// --- Layer building ----------------------------------------------------------

/** [null, 28, 28] -> [28, 28]; refuses shapes with variable (null) dims. */
function batchlessShape(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const dims = raw.slice(1);
  if (dims.length === 0 || !dims.every(dim => typeof dim === 'number')) return undefined;
  return dims as number[];
}

function plainShape(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every(dim => typeof dim === 'number')) {
    return undefined;
  }
  return raw as number[];
}

const INPUT_SHAPE_KEYS: ReadonlySet<string> = new Set(['batch_shape', 'batch_input_shape', 'shape']);

function buildInput(config: JsonRecord, fallbackBatchShape: unknown): BuiltLayer {
  const def = defOf('Input');
  const { values, ignored } = mapConfigOntoDef(def, config, INPUT_SHAPE_KEYS);
  const shape = batchlessShape(config.batch_shape ?? config.batch_input_shape)
    ?? plainShape(config.shape)
    ?? batchlessShape(fallbackBatchShape);
  if (shape !== undefined) values.shape = shape;
  return { kerasLayer: layerJSON('Input', def, values), ignoredKeys: ignored };
}

function buildLayer(className: string, config: JsonRecord): BuiltLayer {
  if (className === 'InputLayer') return buildInput(config, undefined);
  const name = canonicalName(className);
  const def = defOf(name);
  const { values, ignored } = mapConfigOntoDef(def, config, NO_SKIPPED_KEYS);
  return { kerasLayer: layerJSON(name, def, values), ignoredKeys: ignored };
}

function outputLayer(kerasName: string, sources: string[]): ImportedLayer {
  return { kerasName, kerasLayer: layerJSON('Output', defOf('Output'), {}), sources };
}

const entryClassName = (entry: JsonRecord): string => (
  typeof entry.class_name === 'string' ? entry.class_name : 'unknown'
);

const entryName = (config: JsonRecord, className: string, index: number): string => (
  typeof config.name === 'string' ? config.name : `${className.toLowerCase()}_${index}`
);

// --- Sequential --------------------------------------------------------------

function importSequential(
  root: JsonRecord,
  modelConfig: JsonRecord,
  entries: JsonRecord[],
  ignoredParams: Record<string, string[]>,
): ImportedLayer[] {
  const record = (name: string, keys: string[]) => {
    if (keys.length > 0) ignoredParams[name] = keys;
  };
  const layers: ImportedLayer[] = [];
  const fallbackShape = asRecord(root.build_config).input_shape ?? modelConfig.build_input_shape;
  // Built Sequential configs start with an explicit InputLayer; unbuilt ones
  // don't, so the Input node is synthesized from the build shape instead.
  const first = entries[0];
  let rest = entries;
  let inputConfig: JsonRecord = {};
  let inputName = 'nnvp_input';
  if (first !== undefined && first.class_name === 'InputLayer') {
    rest = entries.slice(1);
    inputConfig = asRecord(first.config);
    if (typeof inputConfig.name === 'string') inputName = inputConfig.name;
  }
  const input = buildInput(inputConfig, fallbackShape);
  record(inputName, input.ignoredKeys);
  layers.push({ kerasName: inputName, kerasLayer: input.kerasLayer, sources: [] });
  let previous = inputName;
  rest.forEach((entry, index) => {
    const className = entryClassName(entry);
    const config = asRecord(entry.config);
    const kerasName = entryName(config, className, index);
    const built = buildLayer(className, config);
    record(kerasName, built.ignoredKeys);
    layers.push({ kerasName, kerasLayer: built.kerasLayer, sources: [previous] });
    previous = kerasName;
  });
  layers.push(outputLayer('nnvp_output_0', [previous]));
  return layers;
}

// --- Functional ----------------------------------------------------------------

/**
 * Extracts the source layer names of a layer's inbound_nodes (Keras 3 format:
 * args/kwargs trees holding `__keras_tensor__` markers with a keras_history
 * of [layer_name, node_index, tensor_index]), in argument order — so merge
 * layers (Concatenate, Add...) keep their input order.
 */
function inboundSources(inboundNodes: unknown): string[] {
  const sources: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const node = value as JsonRecord;
    if (node.class_name === '__keras_tensor__') {
      const history = asRecord(node.config).keras_history;
      if (Array.isArray(history) && typeof history[0] === 'string') sources.push(history[0]);
      return;
    }
    Object.values(node).forEach(visit);
  };
  visit(inboundNodes);
  return sources;
}

/** config.output_layers: [["dense_1", 0, 0], ...] (or a single such triple). */
function outputLayerNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const list = typeof raw[0] === 'string' ? [raw] : raw;
  return list
    .map(item => (Array.isArray(item) && typeof item[0] === 'string' ? item[0] : undefined))
    .filter((name): name is string => name !== undefined);
}

function importFunctional(
  modelConfig: JsonRecord,
  entries: JsonRecord[],
  ignoredParams: Record<string, string[]>,
): ImportedLayer[] {
  const layers: ImportedLayer[] = entries.map((entry, index) => {
    const className = entryClassName(entry);
    const config = asRecord(entry.config);
    const kerasName = entryName(config, className, index);
    const built = buildLayer(className, config);
    if (built.ignoredKeys.length > 0) ignoredParams[kerasName] = built.ignoredKeys;
    return { kerasName, kerasLayer: built.kerasLayer, sources: inboundSources(entry.inbound_nodes) };
  });
  const known = new Set(layers.map(layer => layer.kerasName));
  layers.forEach((layer) => {
    layer.sources.forEach((source) => {
      if (!known.has(source)) {
        throw new Error(`keras import: layer "${layer.kerasName}" is fed by unknown layer "${source}"`);
      }
    });
  });
  let outputs = outputLayerNames(modelConfig.output_layers).filter(name => known.has(name));
  if (outputs.length === 0) {
    // No (usable) output_layers list: fall back to the layers nothing consumes.
    const consumed = new Set(layers.flatMap(layer => layer.sources));
    outputs = layers.filter(layer => !consumed.has(layer.kerasName)).map(layer => layer.kerasName);
  }
  outputs.forEach((name, index) => layers.push(outputLayer(`nnvp_output_${index}`, [name])));
  return layers;
}

// --- Layout + assembly ---------------------------------------------------------

function layoutModel(imported: ImportedLayer[]): NnvpModel {
  const idByName = new Map(imported.map((layer, index) => [layer.kerasName, index]));
  const byName = new Map(imported.map(layer => [layer.kerasName, layer]));
  const depths = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (name: string): number => {
    const memo = depths.get(name);
    if (memo !== undefined) return memo;
    if (visiting.has(name)) throw new Error('keras import: the layer graph contains a cycle');
    visiting.add(name);
    const layer = byName.get(name);
    const depth = layer === undefined || layer.sources.length === 0
      ? 0
      : 1 + Math.max(...layer.sources.map(depthOf));
    visiting.delete(name);
    depths.set(name, depth);
    return depth;
  };
  const rows = new Map<number, number>();
  const layers: NnvpLayer[] = imported.map((layer, index) => {
    const depth = depthOf(layer.kerasName);
    const row = rows.get(depth) ?? 0;
    rows.set(depth, row + 1);
    return {
      class: 'D3Layer',
      id: index,
      htmlID: `d3-layer-${index}`,
      name: layer.kerasLayer.name,
      x: X_ORIGIN + depth * X_STEP,
      y: Y_ORIGIN + row * Y_STEP,
      inputLayers: [],
      outputLayers: [],
      children: null,
      kerasLayer: layer.kerasLayer,
      parentID: null,
    };
  });
  const edges: NnvpEdge[] = [];
  imported.forEach((layer, targetId) => {
    layer.sources.forEach((sourceName) => {
      const sourceId = idByName.get(sourceName);
      if (sourceId === undefined) {
        throw new Error(`keras import: unknown source layer "${sourceName}"`);
      }
      const htmlID = `s${sourceId}_t${targetId}`;
      edges.push({
        id: htmlID, htmlID, source: sourceId, target: targetId,
      });
    });
  });
  edges.forEach((edge) => {
    layers.find(layer => layer.id === edge.target)?.inputLayers.push(edge.source);
    layers.find(layer => layer.id === edge.source)?.outputLayers.push(edge.target);
  });
  return {
    layers,
    edges,
    inputs: layers.filter(layer => layer.kerasLayer?.name === 'Input').map(layer => layer.id),
    // NNVP's `outputs` are the layers FEEDING an Output node, in edge order.
    outputs: edges
      .filter(edge => layers.find(layer => layer.id === edge.target)?.kerasLayer?.name === 'Output')
      .map(edge => edge.source),
  };
}

// --- Entry points ----------------------------------------------------------------

/** Converts a parsed config.json (Sequential or Functional) to an NnvpModel. */
export function kerasConfigToNnvp(rootUnknown: unknown): KerasImportResult {
  const root = asRecord(rootUnknown);
  const modelClass = typeof root.class_name === 'string' ? root.class_name : 'unknown';
  if (modelClass !== 'Sequential' && modelClass !== 'Functional') {
    throw new Error(`keras import: unsupported model class_name "${modelClass}" — only Sequential and Functional models are supported`);
  }
  const modelConfig = asRecord(root.config);
  const entries = Array.isArray(modelConfig.layers) ? modelConfig.layers.map(asRecord) : [];
  if (entries.length === 0) throw new Error('keras import: config.json contains no layers');
  const unsupported = entries
    .map(entryClassName)
    .filter(name => name !== 'InputLayer' && kerasDefs.layers[canonicalName(name)] === undefined);
  if (unsupported.length > 0) {
    throw new Error(`keras import: unsupported Keras layers: ${[...new Set(unsupported)].join(', ')}`);
  }
  const ignoredParams: Record<string, string[]> = {};
  const imported = modelClass === 'Sequential'
    ? importSequential(root, modelConfig, entries, ignoredParams)
    : importFunctional(modelConfig, entries, ignoredParams);
  return { model: layoutModel(imported), ignoredParams };
}

/** Reads a whole `.keras` archive (as bytes) and imports its architecture. */
export async function importKerasArchive(
  bytes: Uint8Array,
  inflate?: Inflate,
): Promise<KerasImportResult> {
  const text = await readZipText(bytes, 'config.json', inflate);
  let config: unknown;
  try {
    config = JSON.parse(text);
  } catch {
    throw new Error('keras import: config.json is not valid JSON');
  }
  return kerasConfigToNnvp(config);
}
