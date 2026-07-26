/**
 * The character-level text pipeline behind the poetry templates: the fixed
 * vocab, TextDataset windowing/batching (real tfjs on the cpu backend, fake
 * fetch), the temperature sampler, the engine's dataset-driven fit slice
 * sizes, and the Char-LSTM Poetry template's generated code on every target.
 */
import { appTest, logicTest } from '../harness/define';
import type { Expect } from '../harness/define';
import {
  VOCAB_SIZE, NEWLINE_INDEX, SPACE_INDEX, charToIndex, indexToChar, encodeText, decodeIndices,
} from '../../src/lib/JSDatasets/text-vocab';
import TextDataset from '../../src/lib/JSDatasets/text-data-loader';
import { sampleFromProbs } from '../../src/lib/Inspector/textSampler';
import { createTfjsEngine } from '../../src/lib/Training/tfjsEngine';
import type { TrainingDataset } from '../../src/lib/Training/engine';
import BoardTemplates from '../../src/lib/BoardInterface/BoardTemplates';
import KerasInterface from '../../src/lib/KerasInterface/KerasInterface';
import KerasGeneratorJavascriptHelper from '../../src/lib/KerasInterface/KerasGeneratorJavascriptHelper';
import catalog from '../../src/lib/KerasInterface/generatedKerasLayers.json';

type Tfjs = typeof import('@tensorflow/tfjs');

// Same lazy + muted tfjs setup as tests/suites/trainingEngine.ts (see the
// rationale there); null until the first test awaits setup().
let tf = null as unknown as Tfjs;

async function setup(expect: Expect): Promise<void> {
  if (!tf) {
    const muted = (['log', 'warn', 'error'] as const).map((level) => {
      const original = console[level];
      console[level] = () => {};
      return [level, original] as const;
    });
    try {
      tf = await import('@tensorflow/tfjs');
      await tf.setBackend('cpu');
      await tf.ready();
      tf.scalar(0).dispose();
    } finally {
      for (const [level, original] of muted) console[level] = original;
    }
  }
  expect(tf.getBackend()).toBe('cpu');
}

/** Serve `text` to every fetch for the duration of `fn`, then restore. */
async function withTextFetch(
  text: string,
  fn: (requests: { path: string; integrity: string | undefined }[]) => Promise<void>,
): Promise<void> {
  const realFetch = globalThis.fetch;
  const requests: { path: string; integrity: string | undefined }[] = [];
  globalThis.fetch = ((path: string, init?: { integrity?: string }) => {
    requests.push({ path, integrity: init ? init.integrity : undefined });
    return Promise.resolve({ ok: true, text: async () => text });
  }) as unknown as typeof fetch;
  try {
    await fn(requests);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// --- text-vocab ---------------------------------------------------------------

logicTest('text-vocab: encodes and decodes printable ASCII + newline losslessly', ({ expect }) => {
  const text = 'To be, or not to be?\nThat ~is~ the question! 42';
  expect(decodeIndices(encodeText(text))).toBe(text);
  expect(charToIndex('\n')).toBe(NEWLINE_INDEX);
  expect(charToIndex(' ')).toBe(SPACE_INDEX);
  expect(charToIndex('~')).toBe(VOCAB_SIZE - 1);
  expect(indexToChar(VOCAB_SIZE - 1)).toBe('~');
});

logicTest('text-vocab: maps out-of-vocabulary characters to the space fallback', ({ expect }) => {
  expect(charToIndex('é')).toBe(SPACE_INDEX);
  expect(charToIndex('\t')).toBe(SPACE_INDEX);
  expect(decodeIndices(encodeText('café'))).toBe('caf ');
  expect(indexToChar(VOCAB_SIZE)).toBe(' ');
  expect(indexToChar(-1)).toBe(' ');
});

// --- TextDataset ----------------------------------------------------------------

// 'abc' repeated: every window's next character is fully determined by the
// window's last character, so batches can be verified sample by sample.
const PATTERN_NEXT: Record<string, string> = { a: 'b', b: 'c', c: 'a' };
const PATTERN_CORPUS = 'abc'.repeat(200);
const SEQ_LEN = 5;

logicTest('textDataset: load fetches the corpus (integrity only when given) and splits 90/10', async ({ expect }) => {
  await setup(expect);
  await withTextFetch(PATTERN_CORPUS, async (requests) => {
    const dataset = new TextDataset('corpus.txt', null, SEQ_LEN);
    const progress: number[] = [];
    await dataset.load(p => progress.push(p));
    expect(requests).toEqual([{ path: 'corpus.txt', integrity: undefined }]);
    expect(progress[progress.length - 1]).toBe(1);
    expect(dataset.isLoaded()).toBe(true);
    expect(dataset.testStart).toBe(Math.floor(PATTERN_CORPUS.length * 0.9));
    expect(dataset.shape).toEqual([SEQ_LEN]);
    expect(dataset.numClasses).toBe(VOCAB_SIZE);

    const withIntegrity = new TextDataset('corpus.txt', 'sha256-fake', SEQ_LEN);
    await withIntegrity.load();
    expect(requests[1]).toEqual({ path: 'corpus.txt', integrity: 'sha256-fake' });
  });
});

logicTest('textDataset: batches pair each window with exactly the next character', async ({ expect }) => {
  await setup(expect);
  await withTextFetch(PATTERN_CORPUS, async () => {
    const dataset = new TextDataset('corpus.txt', null, SEQ_LEN);
    await dataset.load();
    for (const which of ['train', 'test'] as const) {
      const { xs, labels } = which === 'train'
        ? dataset.nextTrainBatch(8) : dataset.nextTestBatch(8);
      expect((xs as { shape: number[] }).shape).toEqual([8, SEQ_LEN]);
      expect((labels as { shape: number[] }).shape).toEqual([8, VOCAB_SIZE]);
      const xsData = await (xs as { data(): Promise<Float32Array> }).data();
      const labelsData = await (labels as { data(): Promise<Float32Array> }).data();
      for (let row = 0; row < 8; row += 1) {
        const window = decodeIndices(xsData.subarray(row * SEQ_LEN, (row + 1) * SEQ_LEN));
        const labelRow = labelsData.subarray(row * VOCAB_SIZE, (row + 1) * VOCAB_SIZE);
        const labelIndex = labelRow.indexOf(1);
        expect(indexToChar(labelIndex)).toBe(PATTERN_NEXT[window[SEQ_LEN - 1]!]);
      }
      (xs as { dispose(): void }).dispose();
      (labels as { dispose(): void }).dispose();
    }
  });
});

logicTest('textDataset: advertises fit slice sizes capped by the corpus', async ({ expect }) => {
  await setup(expect);
  await withTextFetch(PATTERN_CORPUS, async () => {
    const dataset = new TextDataset('corpus.txt', null, SEQ_LEN);
    await dataset.load();
    // 600 chars: 540 train region - 5 = 535 train windows, 60 - 5 = 55 test.
    expect(dataset.trainSliceSize).toBe(535);
    expect(dataset.testSliceSize).toBe(55);
  });
});

logicTest('textDataset: excerpt decodes the start of the test region', async ({ expect }) => {
  await setup(expect);
  await withTextFetch(PATTERN_CORPUS, async () => {
    const dataset = new TextDataset('corpus.txt', null, SEQ_LEN);
    await dataset.load();
    expect(dataset.excerpt(12)).toBe(PATTERN_CORPUS.slice(dataset.testStart, dataset.testStart + 12));
  });
});

logicTest('textDataset: encodeContext left-pads short seeds and keeps the tail of long ones', async ({ expect }) => {
  await setup(expect);
  await withTextFetch(PATTERN_CORPUS, async () => {
    const dataset = new TextDataset('corpus.txt', null, SEQ_LEN);
    await dataset.load();
    expect(Array.from(dataset.encodeContext('ab')))
      .toEqual([SPACE_INDEX, SPACE_INDEX, SPACE_INDEX, charToIndex('a'), charToIndex('b')]);
    expect(decodeIndices(dataset.encodeContext('abcdefgh'))).toBe('defgh');
  });
});

logicTest('textDataset: refuses a corpus too short for the window size', async ({ expect }) => {
  await setup(expect);
  await withTextFetch('tiny', async () => {
    const dataset = new TextDataset('corpus.txt', null, SEQ_LEN);
    let thrown: unknown = null;
    try {
      await dataset.load();
    } catch (error) {
      thrown = error;
    }
    expect(String(thrown)).toContain('too short');
  });
});

// --- textSampler ----------------------------------------------------------------

logicTest('textSampler: near-zero temperature is greedy argmax', ({ expect }) => {
  expect(sampleFromProbs([0.1, 0.7, 0.2], 0)).toBe(1);
  expect(sampleFromProbs([0.9, 0.05, 0.05], 0.001)).toBe(0);
});

logicTest('textSampler: temperature 1 with an injected rng walks the distribution as-is', ({ expect }) => {
  const probs = [0.1, 0.7, 0.2];
  expect(sampleFromProbs(probs, 1, () => 0.05)).toBe(0);
  expect(sampleFromProbs(probs, 1, () => 0.5)).toBe(1);
  expect(sampleFromProbs(probs, 1, () => 0.95)).toBe(2);
});

logicTest('textSampler: zero-probability classes stay unreachable at temperature 1', ({ expect }) => {
  // p=0 becomes exp(log(1e-12)/1) — vanishing next to real mass, so even an
  // rng draw of ~1 lands on the last class with actual probability.
  expect(sampleFromProbs([0, 0.5, 0.5, 0], 1, () => 0.999999)).toBe(2);
});

logicTest('textSampler: rejects an empty distribution', ({ expect }) => {
  let thrown: unknown = null;
  try {
    sampleFromProbs([], 1);
  } catch (error) {
    thrown = error;
  }
  expect(String(thrown)).toContain('empty distribution');
});

// --- engine slice sizes -----------------------------------------------------------

logicTest('tfjsEngine: fit draws the dataset-advertised slice sizes, not the demo constants', async ({ expect }) => {
  await setup(expect);
  (window as Window & { tf?: unknown }).tf = tf;
  const engine = createTfjsEngine({ loadTf: async () => tf });
  const session = await engine.prepare(null, {
    generateCode: () => [
      'function createModel() {',
      '  const model = tf.sequential();',
      "  model.add(tf.layers.dense({ units: 4, activation: 'softmax', inputShape: [3] }));",
      '  return model;',
      '}',
    ].join('\n'),
    optimizer: 'sgd',
    optimizerParams: {},
    loss: 'categoricalCrossentropy',
    epochs: 1,
  });
  const requested: { train: number[]; test: number[] } = { train: [], test: [] };
  const makeBatch = (n: number) => ({
    xs: tf.zeros([n, 3]),
    labels: tf.oneHot(tf.zeros([n], 'int32'), 4),
  });
  const dataset: TrainingDataset = {
    shape: [3],
    trainSliceSize: 24,
    testSliceSize: 6,
    nextTrainBatch: (n: number) => { requested.train.push(n); return makeBatch(n); },
    nextTestBatch: (n: number) => { requested.test.push(n); return makeBatch(n); },
  };
  await session.fit(dataset, {});
  expect(requested.train).toEqual([24]);
  expect(requested.test).toEqual([6]);
});

// --- the template -----------------------------------------------------------------

const kerasInterface = new KerasInterface(catalog as never);
const poetryTemplate = () => new BoardTemplates().get('Char-LSTM Poetry')!;

logicTest('Char-LSTM Poetry template: generates runnable tfjs code (lstm lowercased)', ({ expect }) => {
  const code = kerasInterface.generateJavascript(poetryTemplate());
  expect(code).toContain('tf.layers.embedding({inputDim:96,outputDim:64,inputShape:[40,],})');
  expect(code).toContain('tf.layers.lstm({units:128,})');
  expect(code).toContain('tf.layers.dropout({rate:0.2,})');
  expect(code).toContain('tf.layers.dense({units:96,activation:"softmax",})');
  expect(code).not.toContain('lSTM');
});

logicTest('Char-LSTM Poetry template: generates Keras and PyTorch code', ({ expect }) => {
  const python = kerasInterface.generatePython(poetryTemplate());
  expect(python).toContain('keras.layers.Embedding(input_dim=96,output_dim=64');
  expect(python).toContain('keras.layers.LSTM(units=128)');
  expect(python).toContain('keras.layers.Dense(units=96,activation="softmax")');
  const pytorch = kerasInterface.generatePyTorch(poetryTemplate());
  expect(pytorch).toContain('nn.Embedding(96, 64)');
  expect(pytorch).toContain('nn.LSTM(64, 128, batch_first=True)');
});

logicTest('pythonToJsLayerName: lowercases acronym layer factories, leaves the rest alone', ({ expect }) => {
  const helper = new KerasGeneratorJavascriptHelper({}, [], [], []);
  expect(helper.pythonToJsLayerName('LSTM')).toBe('lstm');
  expect(helper.pythonToJsLayerName('GRU')).toBe('gru');
  expect(helper.pythonToJsLayerName('ELU')).toBe('elu');
  expect(helper.pythonToJsLayerName('PReLU')).toBe('prelu');
  expect(helper.pythonToJsLayerName('Conv2D')).toBe('conv2d');
  expect(helper.pythonToJsLayerName('SimpleRNN')).toBe('simpleRNN');
  expect(helper.pythonToJsLayerName('LeakyReLU')).toBe('leakyReLU');
  expect(helper.pythonToJsLayerName('BatchNormalization')).toBe('batchNormalization');
});

appTest('Char-LSTM Poetry template: loads onto the board as a 6-layer chain', async ({ board, expect }) => {
  await board.loadTemplate('Char-LSTM Poetry');
  expect(await board.layerCount()).toBe(6);
  expect(await board.edgeCount()).toBe(5);
  const labels = await board.layerLabels();
  expect(labels).toContain('Embedding');
  expect(labels).toContain('LSTM');
});

// --- the transformer template + NNVP text-layer codegen ----------------------------

const transformerTemplate = () => new BoardTemplates().get('Mini Transformer Poetry')!;

logicTest('Mini Transformer template: tfjs code carries the text-layer classes inline', ({ expect }) => {
  const code = kerasInterface.generateJavascript(transformerTemplate());
  // Self-contained: the class definitions ship inside the generated code.
  expect(code).toContain('class NnvpPositionalEmbedding extends tf.layers.Layer');
  expect(code).toContain('class NnvpTransformerBlock extends tf.layers.Layer');
  expect(code).toContain('class NnvpLastToken extends tf.layers.Layer');
  expect(code).toContain('model.add(new NnvpPositionalEmbedding({}));');
  expect(code).toContain('model.add(new NnvpTransformerBlock({numHeads:4,ffDim:128,dropout:0.1,}));');
  expect(code).toContain('model.add(new NnvpLastToken({}));');
  // Each class is emitted once, even with two TransformerBlocks in the graph.
  expect(code.split('class NnvpTransformerBlock').length).toBe(2);
});

logicTest('Mini Transformer template: tfjs code builds a trainable causal model', async ({ expect }) => {
  await setup(expect);
  const code = kerasInterface.generateJavascript(transformerTemplate());
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const createModel = new Function('tf', `${code}; return createModel;`)(tf) as () => {
    countParams(): number;
    layers: { getClassName(): string }[];
    compile(opts: object): void;
    predict(x: unknown): { data(): Promise<Float32Array>; dispose(): void };
  };
  const model = createModel();
  expect(model.countParams()).toBeGreaterThan(50000);
  // The probe contract: one tf layer per real graph node, Input/Output excluded.
  expect(model.layers.map(l => l.getClassName())).toEqual([
    'Embedding', 'NnvpPositionalEmbedding', 'NnvpTransformerBlock',
    'NnvpTransformerBlock', 'NnvpLastToken', 'Dense',
  ]);
  model.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy' });
  const out = model.predict(tf.ones([2, 40]));
  try {
    const probs = await out.data();
    expect(probs.length).toBe(2 * 96);
    const sum = probs.subarray(0, 96).reduce((acc, v) => acc + v, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-3);
  } finally {
    out.dispose();
  }
});

logicTest('Mini Transformer template: Keras code defines the custom layers before build_model', ({ expect }) => {
  const python = kerasInterface.generatePython(transformerTemplate());
  expect(python).toContain('class NnvpPositionalEmbedding(keras.layers.Layer)');
  expect(python).toContain('class NnvpTransformerBlock(keras.layers.Layer)');
  expect(python).toContain('class NnvpLastToken(keras.layers.Layer)');
  expect(python).toContain('use_causal_mask=True');
  expect(python).toContain('model.add(NnvpTransformerBlock(num_heads=4,ff_dim=128,dropout=0.1))');
  expect(python.indexOf('class NnvpTransformerBlock')).toBeLessThan(python.indexOf('def build_model'));
});

logicTest('Mini Transformer template: PyTorch code infers dims and slices the last token', ({ expect }) => {
  const pytorch = kerasInterface.generatePyTorch(transformerTemplate());
  expect(pytorch).toContain('class NnvpPositionalEmbedding(nn.Module)');
  expect(pytorch).toContain('class NnvpTransformerBlock(nn.Module)');
  // seq_len/dim resolved from the graph: Input [40] and Embedding output_dim 64.
  expect(pytorch).toContain('NnvpPositionalEmbedding(40, 64)');
  expect(pytorch).toContain('NnvpTransformerBlock(64, num_heads=4, ff_dim=128, dropout=0.1)');
  expect(pytorch).toContain('x = x[:, -1, :]');
  expect(pytorch).not.toContain('TODO');
});

logicTest('Mini Transformer template: tinygrad code infers dims and slices the last token', ({ expect }) => {
  const tinygrad = kerasInterface.generateTinygrad(transformerTemplate());
  expect(tinygrad).toContain('class NnvpPositionalEmbedding:');
  expect(tinygrad).toContain('class NnvpTransformerBlock:');
  expect(tinygrad).toContain('nn.Embedding(96, 64)');
  expect(tinygrad).toContain('NnvpPositionalEmbedding(40, 64)');
  expect(tinygrad).toContain('NnvpTransformerBlock(64, num_heads=4, ff_dim=128, dropout=0.1)');
  expect(tinygrad).toContain('x = x[:, -1, :]');
  expect(tinygrad).toContain('scaled_dot_product_attention');
  expect(tinygrad).not.toContain('TODO');
});

logicTest('GPT-Mini template: 96-window, 4-block transformer generating on every target', ({ expect }) => {
  const template = new BoardTemplates().get('GPT-Mini Poetry')!;
  const code = kerasInterface.generateJavascript(template);
  expect(code).toContain('inputShape:[96,]');
  expect(code).toContain('model.add(new NnvpTransformerBlock({numHeads:4,ffDim:512,dropout:0.1,}));');
  expect(code.split('model.add(new NnvpTransformerBlock').length).toBe(5); // 4 blocks
  expect(code.split('class NnvpTransformerBlock').length).toBe(2); // class emitted once
  const pytorch = kerasInterface.generatePyTorch(template);
  // Dim inference must survive a 4-deep custom-layer chain.
  expect(pytorch).toContain('NnvpPositionalEmbedding(96, 128)');
  expect(pytorch).toContain('NnvpTransformerBlock(128, num_heads=4, ff_dim=512, dropout=0.1)');
  expect(pytorch).not.toContain('TODO');
});

appTest('Mini Transformer template: loads onto the board as an 8-layer chain', async ({ board, expect }) => {
  await board.loadTemplate('Mini Transformer Poetry');
  expect(await board.layerCount()).toBe(8);
  expect(await board.edgeCount()).toBe(7);
  const labels = await board.layerLabels();
  expect(labels).toContain('PositionalEmbedding');
  expect(labels).toContain('TransformerBlock');
  expect(labels).toContain('LastToken');
});

// --- generateText (headless sampling: curriculum boundary samples) -----------------

logicTest('generateText: deterministic continuation from a fake model with injected rng', async ({ expect }) => {
  const { default: generateText } = await import('../../src/lib/Inspector/generateText');
  const seqLen = 4;
  const dataset = {
    seqLen,
    encodeContext(text: string) {
      const window = new Float32Array(seqLen).fill(SPACE_INDEX);
      const encoded = encodeText(text.slice(-seqLen));
      window.set(encoded, seqLen - encoded.length);
      return window;
    },
  };
  const seenWindows: string[] = [];
  // A fake model that always predicts 'b' with certainty.
  const probs = new Float32Array(VOCAB_SIZE);
  probs[charToIndex('b')] = 1;
  const model = {
    predict: (x: { values: Float32Array }) => {
      seenWindows.push(decodeIndices(x.values));
      return { data: async () => probs, dispose: () => {} };
    },
  };
  const fakeTf = {
    tensor: (values: Float32Array) => ({ values, dispose: () => {} }),
  };
  const text = await generateText({
    tf: fakeTf as never,
    model: model as never,
    dataset,
    seed: 'a',
    count: 3,
    temperature: 0, // greedy
    rng: () => 0.5,
  });
  expect(text).toBe('bbb');
  // The rolling window really rolls: seed then seed+generated tails.
  expect(seenWindows).toEqual(['   a', '  ab', ' abb']);
});
