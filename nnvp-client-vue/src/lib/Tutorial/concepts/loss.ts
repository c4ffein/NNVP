// Concept: loss — the single number the whole training process serves.

import type { ConceptDef } from './index';

const loss: ConceptDef = {
  id: 'loss',
  title: 'Loss — measuring wrongness',
  part: 'Learning',
  hook: 'One number that says how wrong the network just was. Everything else exists to shrink it.',
  related: ['gradient-descent', 'training-loop', 'generalization'],
  body: `
<p class="concept-lead">To improve, you must first be measurably wrong.
The <strong>loss</strong> is that measurement: a single number scoring how far
the network's answer landed from the truth. Zero would be perfect;
big means confused; and crucially, <em>confidently</em> wrong costs extra.</p>

<figure>
<svg viewBox="0 0 300 160" class="concept-fig" role="img" aria-label="Two bar charts of predicted digit probabilities: a confident correct prediction with low loss, and a confident wrong prediction with high loss">
  <g>
    <text x="75" y="18" text-anchor="middle" fill="var(--text-primary)" font-size="11">truth: 7</text>
    <g fill="var(--text-muted)" opacity="0.5">
      <rect x="25" y="108" width="12" height="12"/><rect x="41" y="112" width="12" height="8"/><rect x="57" y="104" width="12" height="16"/><rect x="73" y="110" width="12" height="10"/><rect x="105" y="106" width="12" height="14"/>
    </g>
    <rect x="89" y="40" width="12" height="80" fill="var(--success)"/>
    <text x="95" y="134" text-anchor="middle" fill="var(--success)" font-size="10">7</text>
    <text x="75" y="152" text-anchor="middle" fill="var(--text-muted)" font-size="10">said "7", was 7 → loss 0.1</text>
  </g>
  <line x1="150" y1="15" x2="150" y2="140" stroke="var(--text-muted)" stroke-width="0.5"/>
  <g>
    <text x="225" y="18" text-anchor="middle" fill="var(--text-primary)" font-size="11">truth: 7</text>
    <g fill="var(--text-muted)" opacity="0.5">
      <rect x="175" y="110" width="12" height="10"/><rect x="191" y="112" width="12" height="8"/><rect x="223" y="106" width="12" height="14"/><rect x="255" y="108" width="12" height="12"/>
    </g>
    <rect x="207" y="42" width="12" height="78" fill="var(--error, #d9534f)"/>
    <text x="213" y="134" text-anchor="middle" fill="var(--error, #d9534f)" font-size="10">1</text>
    <rect x="239" y="114" width="12" height="6" fill="var(--success)"/>
    <text x="245" y="134" text-anchor="middle" fill="var(--success)" font-size="10">7</text>
    <text x="225" y="152" text-anchor="middle" fill="var(--text-muted)" font-size="10">said "1", was 7 → loss 3.5</text>
  </g>
</svg>
<figcaption>Same network, two predictions. The loss barely notices the good one —
and punishes the confident miss hard.</figcaption>
</figure>

<p>For one-of-N answers the standard score is <strong>cross-entropy</strong>,
and its rule fits in a sentence: look at the probability the network gave to
the <em>correct</em> answer, and charge it more the closer that probability is
to zero. Gave the truth 90%? Tiny fee. Gave it 3%? Enormous fee. The network
is billed not for what it guessed but for how much belief it withheld from
reality.</p>

<h3>Why one number?</h3>
<p>Because one number can be <em>followed downhill</em>. With a single score,
"learn" stops being philosophy and becomes concrete: adjust the weights so the
score drops. The loss turns learning into navigation — and
<a data-concept="gradient-descent">gradient descent</a> is the navigator.</p>

<p class="concept-try"><strong>See it in NNVP:</strong> the falling curve in the
Charts tab during training is exactly this number, averaged over batches.
When you watched it drop in chapter 2, you were watching the total wrongness
of the network drain away in real time.</p>
`,
};

export default loss;
