// Concept: activation functions — the bend that makes depth worth having.

import type { ConceptDef } from './index';

const activations: ConceptDef = {
  id: 'activations',
  title: 'Activation functions',
  part: 'The machine',
  hook: 'Without a bend between layers, a hundred layers collapse into one.',
  related: ['what-is-a-neural-network', 'sampling-temperature'],
  body: `
<p class="concept-lead">Neurons multiply and add — but multiplying and adding,
no matter how many times you stack it, can only ever draw straight lines.
Stack ten purely linear layers and the whole tower collapses,
mathematically, into a single one. The fix is small and strange:
after each layer, <strong>bend the numbers</strong>.</p>

<div class="concept-fig-row">
<figure>
<svg viewBox="0 0 300 150" class="concept-fig" role="img" aria-label="The ReLU activation: flat at zero for negative inputs, then a rising line">
  <line x1="10" y1="130" x2="290" y2="130" stroke="var(--text-muted)" stroke-width="0.6"/>
  <line x1="150" y1="10" x2="150" y2="140" stroke="var(--text-muted)" stroke-width="0.6"/>
  <path d="M10 130 L150 130 L290 10" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
</svg>
<figcaption><strong>ReLU</strong> — negatives become 0, positives pass through.
The workhorse: brutal, fast, effective.</figcaption>
</figure>
<figure>
<svg viewBox="0 0 300 150" class="concept-fig" role="img" aria-label="The sigmoid activation: an S-shaped curve from 0 to 1">
  <line x1="10" y1="130" x2="290" y2="130" stroke="var(--text-muted)" stroke-width="0.6"/>
  <line x1="150" y1="10" x2="150" y2="140" stroke="var(--text-muted)" stroke-width="0.6"/>
  <path d="M10 129 L22 129 L33 128 L45 128 L57 127 L68 126 L80 124 L92 121 L103 116 L115 109 L127 100 L138 88 L150 75 L162 62 L173 50 L185 41 L197 34 L208 29 L220 26 L232 24 L243 23 L255 22 L267 22 L278 21 L290 21" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
</svg>
<figcaption><strong>Sigmoid</strong> — squashes anything into 0…1.
Reads naturally as a probability.</figcaption>
</figure>
<figure>
<svg viewBox="0 0 300 150" class="concept-fig" role="img" aria-label="The tanh activation: an S-shaped curve from minus 1 to 1, steeper than sigmoid">
  <line x1="10" y1="75" x2="290" y2="75" stroke="var(--text-muted)" stroke-width="0.6"/>
  <line x1="150" y1="10" x2="150" y2="140" stroke="var(--text-muted)" stroke-width="0.6"/>
  <path d="M10 129 L22 129 L33 129 L45 129 L57 129 L68 129 L80 129 L92 128 L103 127 L115 124 L127 116 L138 100 L150 75 L162 50 L173 34 L185 26 L197 23 L208 22 L220 21 L232 21 L243 21 L255 21 L267 21 L278 21 L290 21" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
</svg>
<figcaption><strong>Tanh</strong> — like sigmoid but centered on zero
(−1…1). The classic choice inside recurrent networks.</figcaption>
</figure>
</div>

<p>These curves are the actual functions, drawn to scale. Each one is applied
to every neuron's output, number by number. That little nonlinearity is what
lets stacked layers build genuinely new shapes instead of restating the same
straight line — bends compose into curves, curves into ridges and valleys,
until the function can trace something as crumpled as "handwriting" or
"English".</p>

<h3>Which one, where?</h3>
<p>Modern habit: <strong>ReLU</strong> (or a relative) between hidden layers,
and a task-shaped function at the very end — <strong>sigmoid</strong> for
yes/no answers, <strong>softmax</strong> (sigmoid's many-way sibling) when the
answer is one-of-N, like "which digit?" or "which character comes next?".</p>

<p class="concept-try"><strong>See it in NNVP:</strong> almost every layer has
an <em>activation</em> parameter — that dropdown is you choosing the bend. The
final Dense layer of the MNIST templates says <code>softmax</code>: ten scores
in, ten probabilities out.</p>
`,
};

export default activations;
