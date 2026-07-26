/**
 * NNVP's text/transformer layers — the three building blocks the transformer
 * poetry template needs beyond stock Keras layers usable in the browser:
 *
 *   PositionalEmbedding  learned [seqLen, dim] position table added to the
 *                        token embeddings (keras-nlp style);
 *   TransformerBlock     one pre-LN causal self-attention + FFN block
 *                        (params: num_heads, ff_dim, dropout);
 *   LastToken            slice of the last timestep — the next-char head.
 *
 * They are NOT Keras built-ins, so every code generator emits a matching
 * self-contained class definition (below, as source strings) ahead of the
 * model-building code: the exported artifact stays dependency-free on every
 * target, and the browser trainer's eval contract (only `tf` in scope) holds.
 * tfjs has no MultiHeadAttention layer at all — the tfjs TransformerBlock
 * implements attention from raw ops, which is exactly why these exist.
 *
 * The catalog entries are merged into the layer palette in main.ts (and the
 * templates embed them), NOT into generatedKerasLayers.json — that file is
 * regenerated from the Keras docs and would silently drop them.
 */

import type { KerasLayerCatalogEntry } from '../../types/model';

export const TEXT_LAYER_CATEGORY = 'Text (NNVP)';

/** Names in emission order (class definitions are prepended in this order). */
export const TEXT_LAYER_NAMES = ['PositionalEmbedding', 'TransformerBlock', 'LastToken'] as const;

export type TextLayerName = typeof TEXT_LAYER_NAMES[number];

export function isTextLayer(name: string): name is TextLayerName {
  return (TEXT_LAYER_NAMES as readonly string[]).includes(name);
}

/** The generated class name every target shares (Nnvp prefix avoids clashes). */
export function textLayerClassName(name: TextLayerName): string {
  return `Nnvp${name}`;
}

export const textLayerCatalogEntries: Record<TextLayerName, KerasLayerCatalogEntry> = {
  PositionalEmbedding: {
    category: TEXT_LAYER_CATEGORY,
    parameters: {},
    input: { shape: 'Arbitrary' },
    output: { shape: ['Arbitrary'] },
  },
  TransformerBlock: {
    category: TEXT_LAYER_CATEGORY,
    parameters: {
      num_heads: { type: 'int', default: 4 },
      ff_dim: { type: 'int', default: 128 },
      dropout: { type: 'float', default: 0.1 },
    },
    input: { shape: 'Arbitrary' },
    output: { shape: ['Arbitrary'] },
  },
  LastToken: {
    category: TEXT_LAYER_CATEGORY,
    parameters: {},
    input: { shape: 'Arbitrary' },
    output: { shape: ['Arbitrary'] },
  },
};

// --- tfjs sources -------------------------------------------------------------
// Constraints: only `tf` is in scope (the eval wrapper's contract), weights go
// through addWeight so fit()/getWeights() see them, and call() runs inside
// tf.tidy with the returned tensor kept alive by tidy itself.

const JS_POSITIONAL_EMBEDDING = `class NnvpPositionalEmbedding extends tf.layers.Layer {
  constructor(config) { super(config || {}); }
  build(inputShape) {
    this.posEmbedding = this.addWeight('pos_embedding', [inputShape[1], inputShape[2]],
      'float32', tf.initializers.randomNormal({ stddev: 0.02 }), undefined, true);
    super.build(inputShape);
  }
  computeOutputShape(inputShape) { return inputShape; }
  call(inputs) {
    return tf.tidy(() => {
      const x = Array.isArray(inputs) ? inputs[0] : inputs;
      return tf.add(x, this.posEmbedding.read());
    });
  }
  getClassName() { return 'NnvpPositionalEmbedding'; }
}`;

const JS_TRANSFORMER_BLOCK = `class NnvpTransformerBlock extends tf.layers.Layer {
  constructor(config) {
    super(config || {});
    const c = config || {};
    this.numHeads = c.numHeads !== undefined ? c.numHeads : 4;
    this.ffDim = c.ffDim !== undefined ? c.ffDim : 128;
    this.dropoutRate = c.dropout !== undefined ? c.dropout : 0.1;
  }
  build(inputShape) {
    const dim = inputShape[2];
    if (dim % this.numHeads !== 0) {
      throw new Error('TransformerBlock: embedding dim ' + dim +
        ' is not divisible by num_heads ' + this.numHeads);
    }
    const glorot = tf.initializers.glorotUniform({});
    const zeros = tf.initializers.zeros();
    const ones = tf.initializers.ones();
    this.wq = this.addWeight('wq', [dim, dim], 'float32', glorot, undefined, true);
    this.wk = this.addWeight('wk', [dim, dim], 'float32', glorot, undefined, true);
    this.wv = this.addWeight('wv', [dim, dim], 'float32', glorot, undefined, true);
    this.wo = this.addWeight('wo', [dim, dim], 'float32', glorot, undefined, true);
    this.ffnW1 = this.addWeight('ffn_w1', [dim, this.ffDim], 'float32', glorot, undefined, true);
    this.ffnB1 = this.addWeight('ffn_b1', [this.ffDim], 'float32', zeros, undefined, true);
    this.ffnW2 = this.addWeight('ffn_w2', [this.ffDim, dim], 'float32', glorot, undefined, true);
    this.ffnB2 = this.addWeight('ffn_b2', [dim], 'float32', zeros, undefined, true);
    this.ln1Gamma = this.addWeight('ln1_gamma', [dim], 'float32', ones, undefined, true);
    this.ln1Beta = this.addWeight('ln1_beta', [dim], 'float32', zeros, undefined, true);
    this.ln2Gamma = this.addWeight('ln2_gamma', [dim], 'float32', ones, undefined, true);
    this.ln2Beta = this.addWeight('ln2_beta', [dim], 'float32', zeros, undefined, true);
    super.build(inputShape);
  }
  computeOutputShape(inputShape) { return inputShape; }
  layerNorm(x, gamma, beta) {
    const mean = tf.mean(x, -1, true);
    const variance = tf.mean(tf.square(tf.sub(x, mean)), -1, true);
    const normed = tf.div(tf.sub(x, mean), tf.sqrt(tf.add(variance, 1e-5)));
    return tf.add(tf.mul(normed, gamma.read()), beta.read());
  }
  call(inputs, kwargs) {
    return tf.tidy(() => {
      let x = Array.isArray(inputs) ? inputs[0] : inputs;
      const batch = x.shape[0];
      const seq = x.shape[1];
      const dim = x.shape[2];
      const headDim = dim / this.numHeads;
      const training = !!(kwargs && kwargs.training);
      const h = this.layerNorm(x, this.ln1Gamma, this.ln1Beta);
      const project = (w) => tf.transpose(tf.reshape(
        tf.matMul(tf.reshape(h, [-1, dim]), w.read()),
        [batch, seq, this.numHeads, headDim]), [0, 2, 1, 3]);
      const q = project(this.wq);
      const k = project(this.wk);
      const v = project(this.wv);
      let scores = tf.div(tf.matMul(q, k, false, true), Math.sqrt(headDim));
      const causal = tf.linalg.bandPart(tf.ones([seq, seq]), -1, 0);
      scores = tf.add(scores, tf.mul(tf.sub(tf.scalar(1), causal), tf.scalar(-1e9)));
      let attnWeights = tf.softmax(scores);
      if (training && this.dropoutRate > 0) {
        attnWeights = tf.dropout(attnWeights, this.dropoutRate);
      }
      const context = tf.reshape(
        tf.transpose(tf.matMul(attnWeights, v), [0, 2, 1, 3]), [batch, seq, dim]);
      const attnOut = tf.reshape(
        tf.matMul(tf.reshape(context, [-1, dim]), this.wo.read()), [batch, seq, dim]);
      x = tf.add(x, attnOut);
      const h2 = this.layerNorm(x, this.ln2Gamma, this.ln2Beta);
      let ffn = tf.relu(tf.add(
        tf.matMul(tf.reshape(h2, [-1, dim]), this.ffnW1.read()), this.ffnB1.read()));
      if (training && this.dropoutRate > 0) {
        ffn = tf.dropout(ffn, this.dropoutRate);
      }
      ffn = tf.reshape(tf.add(tf.matMul(ffn, this.ffnW2.read()), this.ffnB2.read()),
        [batch, seq, dim]);
      return tf.add(x, ffn);
    });
  }
  getClassName() { return 'NnvpTransformerBlock'; }
}`;

const JS_LAST_TOKEN = `class NnvpLastToken extends tf.layers.Layer {
  constructor(config) { super(config || {}); }
  computeOutputShape(inputShape) { return [inputShape[0], inputShape[2]]; }
  call(inputs) {
    return tf.tidy(() => {
      const x = Array.isArray(inputs) ? inputs[0] : inputs;
      return tf.squeeze(tf.slice(x, [0, x.shape[1] - 1, 0], [-1, 1, -1]), [1]);
    });
  }
  getClassName() { return 'NnvpLastToken'; }
}`;

// --- Keras (Python) sources -----------------------------------------------------
// Keras 3: MultiHeadAttention with use_causal_mask does the masking natively,
// so the Python block leans on stock sublayers instead of raw ops.

const PY_POSITIONAL_EMBEDDING = `class NnvpPositionalEmbedding(keras.layers.Layer):
    def build(self, input_shape):
        self.pos_embedding = self.add_weight(
            name="pos_embedding",
            shape=(input_shape[1], input_shape[2]),
            initializer=keras.initializers.RandomNormal(stddev=0.02),
        )
    def call(self, x):
        return x + self.pos_embedding`;

const PY_TRANSFORMER_BLOCK = `class NnvpTransformerBlock(keras.layers.Layer):
    def __init__(self, num_heads=4, ff_dim=128, dropout=0.1, **kwargs):
        super().__init__(**kwargs)
        self.num_heads = num_heads
        self.ff_dim = ff_dim
        self.dropout_rate = dropout
    def build(self, input_shape):
        dim = input_shape[-1]
        self.att = keras.layers.MultiHeadAttention(
            num_heads=self.num_heads,
            key_dim=max(1, dim // self.num_heads),
            dropout=self.dropout_rate,
        )
        self.ffn = keras.Sequential([
            keras.layers.Dense(self.ff_dim, activation="relu"),
            keras.layers.Dense(dim),
        ])
        self.ln1 = keras.layers.LayerNormalization(epsilon=1e-5)
        self.ln2 = keras.layers.LayerNormalization(epsilon=1e-5)
    def call(self, x, training=None):
        h = self.ln1(x)
        x = x + self.att(h, h, use_causal_mask=True, training=training)
        return x + self.ffn(self.ln2(x), training=training)`;

const PY_LAST_TOKEN = `class NnvpLastToken(keras.layers.Layer):
    def call(self, x):
        return x[:, -1, :]`;

// --- PyTorch sources --------------------------------------------------------------
// Shapes torch cannot lazily infer arrive as constructor args, computed by the
// PyTorch generator from the graph (KerasGeneratorDimInference).

const TORCH_POSITIONAL_EMBEDDING = `class NnvpPositionalEmbedding(nn.Module):
  def __init__(self, seq_len, dim):
    super().__init__()
    self.pos = nn.Parameter(torch.randn(seq_len, dim) * 0.02)

  def forward(self, x):
    return x + self.pos`;

const TORCH_TRANSFORMER_BLOCK = `class NnvpTransformerBlock(nn.Module):
  def __init__(self, dim, num_heads=4, ff_dim=128, dropout=0.1):
    super().__init__()
    self.ln1 = nn.LayerNorm(dim)
    self.ln2 = nn.LayerNorm(dim)
    self.att = nn.MultiheadAttention(dim, num_heads, dropout=dropout, batch_first=True)
    self.ffn = nn.Sequential(nn.Linear(dim, ff_dim), nn.ReLU(), nn.Linear(ff_dim, dim))

  def forward(self, x):
    h = self.ln1(x)
    mask = torch.triu(
      torch.ones(x.size(1), x.size(1), dtype=torch.bool, device=x.device), diagonal=1)
    attn_out, _ = self.att(h, h, h, attn_mask=mask, need_weights=False)
    x = x + attn_out
    return x + self.ffn(self.ln2(x))`;

// --- tinygrad sources ---------------------------------------------------------------
// Plain classes (tinygrad has no Module base); nn.state.get_parameters walks
// attributes, so weights held as Tensors/nn layers are found for the optimizer.

const TINYGRAD_POSITIONAL_EMBEDDING = `class NnvpPositionalEmbedding:
  def __init__(self, seq_len, dim):
    self.pos = Tensor.randn(seq_len, dim) * 0.02

  def __call__(self, x):
    return x + self.pos`;

const TINYGRAD_TRANSFORMER_BLOCK = `class NnvpTransformerBlock:
  def __init__(self, dim, num_heads=4, ff_dim=128, dropout=0.1):
    self.num_heads = num_heads
    self.dropout_rate = dropout
    self.ln1 = nn.LayerNorm(dim)
    self.ln2 = nn.LayerNorm(dim)
    self.wq = nn.Linear(dim, dim)
    self.wk = nn.Linear(dim, dim)
    self.wv = nn.Linear(dim, dim)
    self.wo = nn.Linear(dim, dim)
    self.ff1 = nn.Linear(dim, ff_dim)
    self.ff2 = nn.Linear(ff_dim, dim)

  def __call__(self, x):
    b, t, d = x.shape
    head_dim = d // self.num_heads
    h = self.ln1(x)
    q = self.wq(h).reshape(b, t, self.num_heads, head_dim).transpose(1, 2)
    k = self.wk(h).reshape(b, t, self.num_heads, head_dim).transpose(1, 2)
    v = self.wv(h).reshape(b, t, self.num_heads, head_dim).transpose(1, 2)
    attn = q.scaled_dot_product_attention(k, v, is_causal=True, dropout_p=self.dropout_rate)
    x = x + self.wo(attn.transpose(1, 2).reshape(b, t, d))
    return x + self.ff2(self.ff1(self.ln2(x)).relu().dropout(self.dropout_rate))`;

const JS_SOURCES: Record<TextLayerName, string> = {
  PositionalEmbedding: JS_POSITIONAL_EMBEDDING,
  TransformerBlock: JS_TRANSFORMER_BLOCK,
  LastToken: JS_LAST_TOKEN,
};

const PY_SOURCES: Record<TextLayerName, string> = {
  PositionalEmbedding: PY_POSITIONAL_EMBEDDING,
  TransformerBlock: PY_TRANSFORMER_BLOCK,
  LastToken: PY_LAST_TOKEN,
};

// LastToken is a pure slice in torch — emitted inline in forward(), no module.
const TORCH_SOURCES: Partial<Record<TextLayerName, string>> = {
  PositionalEmbedding: TORCH_POSITIONAL_EMBEDDING,
  TransformerBlock: TORCH_TRANSFORMER_BLOCK,
};

// Same for tinygrad: LastToken is an inline slice suffix.
const TINYGRAD_SOURCES: Partial<Record<TextLayerName, string>> = {
  PositionalEmbedding: TINYGRAD_POSITIONAL_EMBEDDING,
  TransformerBlock: TINYGRAD_TRANSFORMER_BLOCK,
};

export function textLayerJsSource(name: TextLayerName): string {
  return JS_SOURCES[name];
}

export function textLayerPythonSource(name: TextLayerName): string {
  return PY_SOURCES[name];
}

export function textLayerTorchSource(name: TextLayerName): string | undefined {
  return TORCH_SOURCES[name];
}

export function textLayerTinygradSource(name: TextLayerName): string | undefined {
  return TINYGRAD_SOURCES[name];
}

/**
 * The text layers a generator run must emit class definitions for, in
 * TEXT_LAYER_NAMES order: the ones that actually appear in the treatment list.
 */
export function usedTextLayers(names: Iterable<string>): TextLayerName[] {
  const present = new Set<string>();
  for (const name of names) present.add(name);
  return TEXT_LAYER_NAMES.filter(name => present.has(name));
}
