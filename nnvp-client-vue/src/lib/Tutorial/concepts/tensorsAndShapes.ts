// Concept: data as numbers with a shape.

import type { ConceptDef } from './index';

const tensorsAndShapes: ConceptDef = {
  id: 'tensors-and-shapes',
  title: 'Tensors and shapes',
  part: 'The machine',
  hook: 'Everything the network sees — images, text, sound — is a grid of numbers first.',
  related: ['what-is-a-neural-network', 'embeddings'],
  body: `
<p class="concept-lead">A neural network cannot see a picture or read a word.
It can only do arithmetic. So before anything else happens, the world has to be
turned into <strong>numbers arranged in a grid</strong> — a tensor — and the
grid's dimensions are its <strong>shape</strong>.</p>

<figure>
<svg viewBox="0 0 300 130" class="concept-fig" role="img" aria-label="A pixel grid of a digit turning into a row of numbers">
  <g>
    <rect x="20" y="15" width="100" height="100" fill="none" stroke="var(--text-muted)"/>
    <g fill="var(--accent)">
      <rect x="40" y="25" width="20" height="10" opacity="0.9"/><rect x="60" y="25" width="20" height="10" opacity="0.95"/><rect x="80" y="25" width="20" height="10" opacity="0.8"/>
      <rect x="80" y="35" width="20" height="10" opacity="0.7"/>
      <rect x="70" y="45" width="20" height="10" opacity="0.85"/>
      <rect x="60" y="55" width="20" height="10" opacity="0.9"/>
      <rect x="55" y="65" width="20" height="10" opacity="0.95"/>
      <rect x="50" y="75" width="20" height="10" opacity="0.9"/>
      <rect x="45" y="85" width="20" height="10" opacity="0.85"/>
      <rect x="40" y="95" width="20" height="10" opacity="0.9"/>
    </g>
  </g>
  <path d="M135 65 L165 65" stroke="var(--text-muted)" stroke-width="1.5" marker-end="none"/>
  <path d="M160 60 L168 65 L160 70 Z" fill="var(--text-muted)"/>
  <g font-size="11" fill="var(--text-primary)" font-family="monospace">
    <text x="178" y="55">0.0  0.9  1.0  0.8</text>
    <text x="178" y="72">0.0  0.0  0.7  0.0</text>
    <text x="178" y="89">0.0  0.9  0.0  0.0 …</text>
  </g>
  <text x="70" y="127" text-anchor="middle" fill="var(--text-muted)" font-size="10">a "7", 28×28 pixels</text>
  <text x="225" y="110" text-anchor="middle" fill="var(--text-muted)" font-size="10">what the network gets</text>
</svg>
<figcaption>An MNIST digit is not a picture to the network — it's 784 brightness
values between 0 and 1, arranged 28 wide, 28 tall.</figcaption>
</figure>

<p>The shape says how those numbers are organized:</p>
<ul>
<li><code>[28, 28, 1]</code> — a grayscale image: 28 rows, 28 columns, 1 color
channel. A color photo would end in 3 (red, green, blue).</li>
<li><code>[40]</code> — a stretch of text: 40 characters, each stored as its
number in the vocabulary.</li>
<li><code>[10]</code> — a classifier's answer: one score per possible digit.</li>
</ul>

<p>Every layer transforms not just the numbers but the shape.
A Flatten layer unrolls <code>[28, 28, 1]</code> into <code>[784]</code> — same
values, grid forgotten. A Dense layer with 10 units outputs <code>[10]</code>
no matter what came in. Networks are shape pipelines, and most "it won't
train!" errors are two neighboring layers disagreeing about shape.</p>

<p class="concept-try"><strong>See it in NNVP:</strong> setting the Input
layer's shape to <code>28, 28, 1</code> is you telling the network what form
the world will arrive in. Watch how each following layer reports what it makes
of it — and try feeding a Dense layer an unflattened image to see the
disagreement for yourself.</p>
`,
};

export default tensorsAndShapes;
