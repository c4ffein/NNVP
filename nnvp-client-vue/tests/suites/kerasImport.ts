/**
 * Keras 3 `.keras` import (KerasImport/zip + kerasImport): fixtures are built
 * IN CODE — a tiny ZIP writer (stored entries, plus one deflated entry to
 * exercise the inflate path) wraps handcrafted config.json payloads that
 * follow the real Keras 3 saving format (module/class_name/config/
 * registered_name, build_config, inbound_nodes with args/kwargs
 * __keras_tensor__ histories).
 */
import { appTest, logicTest } from '../harness/define';
import KerasGenerator from '../../src/lib/KerasInterface/KerasGenerator';
import { listZipEntries, readZipText } from '../../src/lib/KerasImport/zip';
import { importKerasArchive, kerasConfigToNnvp } from '../../src/lib/KerasImport/kerasImport';
import type { NnvpModel } from '../../src/types/model';

// --- Minimal ZIP writer -------------------------------------------------------

const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipFileSpec {
  name: string;
  content: string | Uint8Array;
  /** Raw-deflated bytes of `content`; presence makes a method 8 entry. */
  compressed?: Uint8Array;
}

/**
 * files: [{ name, content: string|Uint8Array, compressed?: Uint8Array }].
 * Entries are stored (method 0) unless `compressed` carries the raw-deflated
 * bytes of `content`, which makes a method 8 entry.
 */
function buildZip(files: ZipFileSpec[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  files.forEach((file) => {
    const name = encoder.encode(file.name);
    const data = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const payload = file.compressed === undefined ? data : file.compressed;
    const method = file.compressed === undefined ? 0 : 8;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header signature
    local.setUint16(4, 20, true); // version needed to extract
    local.setUint16(8, method, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, payload.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, payload);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); // central directory signature
    dir.setUint16(4, 20, true); // version made by
    dir.setUint16(6, 20, true); // version needed to extract
    dir.setUint16(10, method, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, payload.length, true);
    dir.setUint32(24, data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true); // local header offset
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + payload.length;
  });
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); // end of central directory signature
  eocd.setUint16(8, files.length, true); // entries on this disk
  eocd.setUint16(10, files.length, true); // total entries
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true); // central directory offset
  const parts = [...chunks, ...central, new Uint8Array(eocd.buffer)];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  parts.forEach((part) => {
    out.set(part, cursor);
    cursor += part.length;
  });
  return out;
}

async function deflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// --- Keras 3 config fixtures ---------------------------------------------------
// The fixtures mirror the on-disk Keras 3 JSON, which the importer consumes as
// `unknown` — plain inferred literals are all the typing they need.

const dtypePolicy = () => ({
  module: 'keras', class_name: 'DTypePolicy', config: { name: 'float32' }, registered_name: null,
});

const denseEntry = (name: string, units: number, activation: string, inputShape: (number | null)[]) => ({
  module: 'keras.layers',
  class_name: 'Dense',
  config: {
    name,
    trainable: true,
    dtype: dtypePolicy(),
    units,
    activation,
    use_bias: true,
    kernel_initializer: {
      module: 'keras.initializers', class_name: 'GlorotUniform', config: { seed: null }, registered_name: null,
    },
    bias_initializer: {
      module: 'keras.initializers', class_name: 'Zeros', config: {}, registered_name: null,
    },
    kernel_regularizer: null,
    bias_regularizer: null,
    kernel_constraint: null,
    bias_constraint: null,
  },
  registered_name: null,
  build_config: { input_shape: inputShape },
});

// (1) Sequential MNIST MLP: Input 28×28 → Flatten → Dense relu → Dense softmax.
// (`layers` is widened so the unsupported-layer test can push a foreign entry.)
const sequentialMnistConfig = () => ({
  module: 'keras',
  class_name: 'Sequential',
  config: {
    name: 'sequential',
    trainable: true,
    dtype: dtypePolicy(),
    layers: [
      {
        module: 'keras.layers',
        class_name: 'InputLayer',
        config: {
          batch_shape: [null, 28, 28], dtype: 'float32', sparse: false, name: 'input_layer',
        },
        registered_name: null,
      },
      {
        module: 'keras.layers',
        class_name: 'Flatten',
        config: {
          name: 'flatten', trainable: true, dtype: dtypePolicy(), data_format: 'channels_last',
        },
        registered_name: null,
        build_config: { input_shape: [null, 28, 28] },
      },
      denseEntry('dense', 128, 'relu', [null, 784]),
      denseEntry('dense_1', 10, 'softmax', [null, 128]),
    ] as Record<string, unknown>[],
    build_input_shape: [null, 28, 28],
  },
  registered_name: null,
  build_config: { input_shape: [null, 28, 28] },
});

const kerasTensor = (shape: (number | null)[], sourceName: string) => ({
  class_name: '__keras_tensor__',
  config: { shape, dtype: 'float32', keras_history: [sourceName, 0, 0] },
});

// (2) Functional with a Concatenate merge: Input → (Dense a, Dense b) → Concatenate → Dense.
const functionalConcatConfig = () => ({
  module: 'keras',
  class_name: 'Functional',
  config: {
    name: 'functional',
    trainable: true,
    layers: [
      {
        module: 'keras.layers',
        class_name: 'InputLayer',
        config: {
          batch_shape: [null, 16], dtype: 'float32', sparse: false, name: 'input_layer',
        },
        registered_name: null,
        inbound_nodes: [],
      },
      {
        ...denseEntry('dense_a', 8, 'relu', [null, 16]),
        inbound_nodes: [{ args: [kerasTensor([null, 16], 'input_layer')], kwargs: {} }],
      },
      {
        ...denseEntry('dense_b', 4, 'relu', [null, 16]),
        inbound_nodes: [{ args: [kerasTensor([null, 16], 'input_layer')], kwargs: {} }],
      },
      {
        module: 'keras.layers',
        class_name: 'Concatenate',
        config: {
          name: 'concatenate', trainable: true, dtype: dtypePolicy(), axis: -1,
        },
        registered_name: null,
        build_config: { input_shape: [[null, 8], [null, 4]] },
        inbound_nodes: [{
          args: [[kerasTensor([null, 8], 'dense_a'), kerasTensor([null, 4], 'dense_b')]],
          kwargs: {},
        }],
      },
      {
        ...denseEntry('dense_out', 2, 'softmax', [null, 12]),
        inbound_nodes: [{ args: [kerasTensor([null, 12], 'concatenate')], kwargs: {} }],
      },
    ],
    input_layers: [['input_layer', 0, 0]],
    output_layers: [['dense_out', 0, 0]],
  },
  registered_name: 'Functional',
  build_config: { input_shape: null },
});

/** A complete .keras archive: metadata.json + config.json + (junk) weights. */
const makeKerasZip = (config: unknown) => buildZip([
  { name: 'metadata.json', content: JSON.stringify({ keras_version: '3.5.0', date_saved: '2026-01-01@00:00:00' }) },
  { name: 'config.json', content: JSON.stringify(config) },
  // V1 ignores the weights; enough that the entry exists like in a real file.
  { name: 'model.weights.h5', content: new Uint8Array([0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a]) },
]);

// KerasGenerator mutates the graph it is given, so always feed it a fresh copy.
const pythonOf = (model: NnvpModel): string => new KerasGenerator(JSON.parse(JSON.stringify(model))).generatePythonFromGraph();

// --- Tests ----------------------------------------------------------------------

logicTest('kerasImport: zip reader lists entries and reads stored (method 0) data', async ({ expect }) => {
  const zip = buildZip([
    { name: 'a.txt', content: 'alpha' },
    { name: 'dir/b.json', content: '{"b":2}' },
  ]);
  const entries = listZipEntries(zip);
  expect(entries.map(entry => entry.name)).toEqual(['a.txt', 'dir/b.json']);
  expect(entries[0]!.method).toBe(0);
  expect(await readZipText(zip, 'dir/b.json')).toBe('{"b":2}');
});

logicTest('kerasImport: zip reader inflates deflated (method 8) entries', async ({ expect }) => {
  const text = JSON.stringify(sequentialMnistConfig());
  const compressed = await deflateRaw(encoder.encode(text));
  const zip = buildZip([{ name: 'config.json', content: text, compressed }]);
  expect(listZipEntries(zip)[0]!.method).toBe(8);
  expect(await readZipText(zip, 'config.json')).toBe(text);
  // and the whole import works through the inflate path too
  const { model } = await importKerasArchive(zip);
  expect(model.layers.length).toBe(5);
});

logicTest('kerasImport: Sequential MNIST MLP becomes a linear Input→Flatten→Dense→Dense→Output graph', async ({ expect }) => {
  const { model, ignoredParams } = await importKerasArchive(makeKerasZip(sequentialMnistConfig()));
  expect(model.layers.map(layer => layer.name)).toEqual(['Input', 'Flatten', 'Dense', 'Dense', 'Output']);
  expect(model.layers[0]!.kerasLayer!.parameterValues.shape).toEqual([28, 28]);
  const dense = model.layers[2]!.kerasLayer!.parameterValues;
  expect(dense.units).toBe(128);
  expect(dense.activation).toBe('relu');
  // serialized objects keep their class name (the defs model these as strings)
  expect(dense.kernel_initializer).toBe('GlorotUniform');
  // null config values keep Keras' own defaults instead of becoming "null"
  expect('kernel_regularizer' in dense).toBe(false);
  expect(model.layers[3]!.kerasLayer!.parameterValues.units).toBe(10);
  expect(model.layers[3]!.kerasLayer!.parameterValues.activation).toBe('softmax');
  expect(model.edges.map(edge => [edge.source, edge.target])).toEqual([[0, 1], [1, 2], [2, 3], [3, 4]]);
  expect(model.inputs).toEqual([0]);
  expect(model.outputs).toEqual([3]);
  // config keys with no matching parameter definition are tolerated + reported
  expect(ignoredParams.dense).toContain('trainable');
  // deterministic layered placement: one column per topological depth
  expect(model.layers.map(layer => layer.x)).toEqual([60, 240, 420, 600, 780]);
  // and generating code from the imported model works
  const python = pythonOf(model);
  expect(python).toContain('Flatten');
  expect(python).toContain('128');
});

logicTest('kerasImport: Functional model with Concatenate gets both inbound edges in argument order', async ({ expect }) => {
  const { model } = await importKerasArchive(makeKerasZip(functionalConcatConfig()));
  expect(model.layers.map(layer => layer.name)).toEqual(['Input', 'Dense', 'Dense', 'Concatenate', 'Dense', 'Output']);
  const concatenate = model.layers[3]!;
  expect(concatenate.inputLayers).toEqual([1, 2]);
  expect(concatenate.kerasLayer!.parameterValues.axis).toBe(-1);
  expect(model.edges.map(edge => [edge.source, edge.target]))
    .toEqual([[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [4, 5]]);
  expect(model.inputs).toEqual([0]);
  expect(model.outputs).toEqual([4]);
  // parallel branches share a depth column but get distinct rows
  expect(model.layers[1]!.x).toBe(model.layers[2]!.x);
  expect(model.layers[2]!.y).toBe(model.layers[1]!.y + 90);
  const python = pythonOf(model);
  expect(python).toContain('Concatenate');
});

logicTest('kerasImport: unsupported layer class names abort the import and are listed', async ({ expect }) => {
  const config = sequentialMnistConfig();
  config.config.layers.push({
    module: 'my_pkg',
    class_name: 'FancyCustomBlock',
    config: { name: 'fancy' },
    registered_name: 'my_pkg>FancyCustomBlock',
  });
  let error: Error | null = null;
  try {
    await importKerasArchive(makeKerasZip(config));
  } catch (caught) {
    error = caught as Error;
  }
  expect(error).not.toBeNull();
  expect(String(error!.message)).toContain('FancyCustomBlock');
});

logicTest('kerasImport: a zip without config.json is rejected before touching anything', async ({ expect }) => {
  const zip = buildZip([{ name: 'metadata.json', content: '{}' }]);
  let error: Error | null = null;
  try {
    await importKerasArchive(zip);
  } catch (caught) {
    error = caught as Error;
  }
  expect(error).not.toBeNull();
  expect(String(error!.message)).toContain('config.json');
});

logicTest('kerasImport: subclassed models are rejected with a clear error', ({ expect }) => {
  let error: Error | null = null;
  try {
    kerasConfigToNnvp({ class_name: 'MyModel', config: {} });
  } catch (caught) {
    error = caught as Error;
  }
  expect(error).not.toBeNull();
  expect(String(error!.message)).toContain('Sequential');
});

logicTest('kerasImport: alias class names map to their canonical layer (MaxPool2D → MaxPooling2D)', ({ expect }) => {
  const config = {
    class_name: 'Sequential',
    config: {
      name: 'sequential',
      layers: [
        { class_name: 'InputLayer', config: { batch_shape: [null, 8, 8, 1], name: 'input_layer' } },
        { class_name: 'MaxPool2D', config: { name: 'max_pooling2d', pool_size: [2, 2] } },
      ],
    },
  };
  const { model } = kerasConfigToNnvp(config);
  expect(model.layers.map(layer => layer.name)).toEqual(['Input', 'MaxPooling2D', 'Output']);
  expect(model.layers[1]!.kerasLayer!.parameterValues.pool_size).toEqual([2, 2]);
});

appTest('kerasImport: an imported model loads onto the board through the normal restore path', async ({ board, expect }) => {
  // The same NnvpModel -> restore() path uploadKerasToBoard routes through.
  const { model } = kerasConfigToNnvp(functionalConcatConfig());
  await board.loadJSON(JSON.stringify(model));
  expect(await board.layerCount()).toBe(6);
  expect(await board.edgeCount()).toBe(6);
  expect(await board.layerLabels()).toEqual(['Input', 'Dense', 'Dense', 'Concatenate', 'Dense', 'Output']);
});

logicTest('kerasImport: Sequential without an InputLayer synthesizes the Input from build_config', ({ expect }) => {
  const config = {
    class_name: 'Sequential',
    config: { name: 'sequential', layers: [denseEntry('dense', 4, 'relu', [null, 8])] },
    build_config: { input_shape: [null, 8] },
  };
  const { model } = kerasConfigToNnvp(config);
  expect(model.layers.map(layer => layer.name)).toEqual(['Input', 'Dense', 'Output']);
  expect(model.layers[0]!.kerasLayer!.parameterValues.shape).toEqual([8]);
});
