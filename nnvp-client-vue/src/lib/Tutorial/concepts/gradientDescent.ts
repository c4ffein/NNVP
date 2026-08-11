// Concept: gradient descent — how the dials actually get turned.

import type { ConceptDef } from './index';

const gradientDescent: ConceptDef = {
  id: 'gradient-descent',
  title: 'Gradient descent',
  part: 'Learning',
  hook: 'Learning is rolling downhill on a landscape made of wrongness.',
  related: ['loss', 'training-loop', 'what-is-a-neural-network'],
  body: `
<p class="concept-lead">Picture a landscape where every location is one
possible setting of all the network's weights, and the altitude at each spot is
the <a data-concept="loss">loss</a> — how wrong the network is with those
settings. Training is simple to state: <strong>start somewhere random, and
walk downhill</strong>.</p>

<figure>
<svg viewBox="0 0 300 160" class="concept-fig" role="img" aria-label="A bowl-shaped curve with a ball taking successively smaller steps down toward the bottom">
  <path d="M10 15 L24 38 L38 58 L52 76 L66 92 L80 105 L94 116 L108 125 L122 131 L136 134 L150 135 L164 134 L178 131 L192 125 L206 116 L220 105 L234 92 L248 76 L262 58 L276 38 L290 15" fill="none" stroke="var(--text-muted)" stroke-width="1.5"/>
  <g fill="var(--accent)">
    <circle cx="27" cy="43" r="7"/>
    <circle cx="111" cy="126" r="6" opacity="0.85"/>
    <circle cx="138" cy="134" r="5" opacity="0.7"/>
    <circle cx="146" cy="135" r="4" opacity="0.55"/>
    <circle cx="150" cy="135" r="3.5" opacity="0.45"/>
  </g>
  <g stroke="var(--accent)" fill="none" stroke-width="1" opacity="0.6">
    <path d="M34 50 Q70 95 103 122"/>
    <path d="M118 129 Q127 133 131 134"/>
  </g>
  <text x="27" y="28" text-anchor="middle" fill="var(--text-primary)" font-size="10">random start</text>
  <text x="150" y="153" text-anchor="middle" fill="var(--text-muted)" font-size="10">low loss — the network is good here</text>
</svg>
<figcaption>Each hop is one update. Steps shrink as the ground flattens —
near the bottom, the slope itself gets small.</figcaption>
</figure>

<p>The <strong>gradient</strong> is the mathematical answer to "which way is
downhill from here, and how steep?" — computed for every single weight at
once by an algorithm called <em>backpropagation</em>, which walks the
network's arithmetic backwards from the loss. Each weight learns its own
personal nudge: <em>you, a little up; you, a lot down</em>. Apply all the
nudges, and the network is standing somewhere slightly less wrong.</p>

<h3>The step size is a choice</h3>
<p>How far to hop each time is the <strong>learning rate</strong> — the most
temperamental number in the whole affair. Too small: training crawls. Too
large: the ball leaps clean over the valley and bounces around the walls.
Optimizers like <em>Adam</em> or <em>RMSprop</em> are gradient descent with
adaptive, per-weight step sizes — cruise control for the descent.</p>

<p>One honest caveat: with millions of dimensions the landscape isn't a neat
bowl; it's an unimaginable crumpled thing. The small miracle of deep learning
is that walking downhill works anyway.</p>

<p class="concept-try"><strong>See it in NNVP:</strong> the Options tab's
optimizer dropdown and learning-rate field configure exactly this walk. Try a
learning rate 10× larger and watch the loss curve bounce instead of sink.</p>
`,
};

export default gradientDescent;
