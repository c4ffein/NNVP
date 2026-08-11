// Concept: the training loop — batches, epochs, and the falling curve.

import type { ConceptDef } from './index';

const trainingLoop: ConceptDef = {
  id: 'training-loop',
  title: 'The training loop',
  part: 'Learning',
  hook: 'Guess, get graded, adjust — a million times, on a clock made of batches and epochs.',
  related: ['loss', 'gradient-descent', 'generalization'],
  body: `
<p class="concept-lead">Training isn't one grand event; it's a small ritual
repeated until it adds up to something. Show the network a handful of
examples, score its guesses, nudge every weight downhill, repeat.</p>

<figure>
<svg viewBox="0 0 300 120" class="concept-fig" role="img" aria-label="A four-step cycle: forward pass, loss, backward pass, update, arranged in a loop">
  <g fill="var(--bg-elevated)" stroke="var(--accent)" stroke-width="1.5">
    <rect x="15" y="45" width="70" height="30" rx="8"/>
    <rect x="110" y="10" width="80" height="30" rx="8"/>
    <rect x="215" y="45" width="70" height="30" rx="8"/>
    <rect x="110" y="80" width="80" height="30" rx="8"/>
  </g>
  <g fill="var(--text-primary)" font-size="11" text-anchor="middle">
    <text x="50" y="64">guess</text>
    <text x="150" y="29">score (loss)</text>
    <text x="250" y="64">find slopes</text>
    <text x="150" y="99">nudge weights</text>
  </g>
  <g stroke="var(--text-muted)" fill="var(--text-muted)" stroke-width="1.2">
    <path d="M85 52 Q95 40 108 32" fill="none"/><path d="M104 28 L112 31 L105 37 Z" stroke="none"/>
    <path d="M192 32 Q205 40 215 52" fill="none"/><path d="M210 48 L218 54 L215 44 Z" stroke="none"/>
    <path d="M215 68 Q205 80 192 88" fill="none"/><path d="M188 84 L196 92 L195 85 Z" stroke="none"/>
    <path d="M108 88 Q95 80 85 68" fill="none"/><path d="M82 72 L88 64 L89 73 Z" stroke="none"/>
  </g>
</svg>
<figcaption>One turn of this wheel = one <strong>batch</strong>. Everything in
deep learning is this wheel, spinning fast.</figcaption>
</figure>

<p>Two clock-words organize the repetition:</p>
<ul>
<li>A <strong>batch</strong> is the handful shown per turn — say 32 images at
once. Averaging the nudge over a batch smooths out the noise of any single
weird example.</li>
<li>An <strong>epoch</strong> is one full pass through the entire training set.
"3 epochs on MNIST" means the network saw all 60,000 digits three times,
in a freshly shuffled order each time.</li>
</ul>

<figure>
<svg viewBox="0 0 300 150" class="concept-fig" role="img" aria-label="A loss curve falling steeply at first, then flattening, over epochs">
  <line x1="10" y1="140" x2="290" y2="140" stroke="var(--text-muted)" stroke-width="0.8"/>
  <line x1="10" y1="10" x2="10" y2="140" stroke="var(--text-muted)" stroke-width="0.8"/>
  <path d="M10 20 L24 32 L38 42 L52 52 L66 60 L80 68 L94 75 L108 81 L122 86 L136 91 L150 96 L164 100 L178 103 L192 106 L206 109 L220 112 L234 114 L248 116 L262 118 L276 119 L290 121" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
  <text x="286" y="136" text-anchor="end" fill="var(--text-muted)" font-size="10">epochs →</text>
  <text x="16" y="18" fill="var(--text-muted)" font-size="10">loss</text>
</svg>
<figcaption>The signature of learning: fast progress while the network fixes
its biggest mistakes, then diminishing returns as only subtleties remain.</figcaption>
</figure>

<p>Reading this curve is a skill worth having. Falling: learning. Flat from the
start: something's broken (often the learning rate or the wiring). Flattened
after a while: the easy lessons are learned — more epochs now buy little, and
can even hurt (see <a data-concept="generalization">generalization</a>).</p>

<p class="concept-try"><strong>See it in NNVP:</strong> press Train and keep
the Charts tab open. The per-batch chart jitters (small handfuls are noisy);
the per-epoch chart is the honest trend line.</p>
`,
};

export default trainingLoop;
