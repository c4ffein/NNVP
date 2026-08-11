// Concept: sampling and temperature — how probabilities become words.

import type { ConceptDef } from './index';

const samplingTemperature: ConceptDef = {
  id: 'sampling-temperature',
  title: 'Sampling and temperature',
  part: 'Reading & writing',
  hook: 'The model never picks a word — it rolls a weighted die. Temperature loads the die.',
  related: ['transformers', 'activations', 'loss'],
  body: `
<p class="concept-lead">A language model's output is not a word. It is a
<strong>probability for every symbol it knows</strong> — a full distribution
over what could come next. Something must then <em>choose</em>, and that
choice, repeated symbol by symbol, is generation. The choosing knob is
<strong>temperature</strong>.</p>

<figure>
<svg viewBox="0 0 300 170" class="concept-fig" role="img" aria-label="Two bar charts of next-character probabilities: at low temperature one bar dominates; at high temperature the bars flatten out">
  <g>
    <g fill="var(--accent)">
      <rect x="25" y="33" width="14" height="97" opacity="0.95"/>
      <rect x="45" y="120" width="14" height="10"/>
      <rect x="65" y="127" width="14" height="3"/>
      <rect x="85" y="129" width="14" height="1"/>
      <rect x="105" y="129.6" width="14" height="0.4"/>
    </g>
    <g font-size="10" font-family="monospace" fill="var(--text-muted)" text-anchor="middle">
      <text x="32" y="142">e</text><text x="52" y="142">a</text><text x="72" y="142">o</text><text x="92" y="142">t</text><text x="112" y="142">h</text>
    </g>
    <text x="70" y="20" text-anchor="middle" fill="var(--text-primary)" font-size="11">T = 0.4</text>
    <text x="70" y="160" text-anchor="middle" fill="var(--text-muted)" font-size="10">confident, repetitive</text>
  </g>
  <line x1="150" y1="15" x2="150" y2="150" stroke="var(--text-muted)" stroke-width="0.5"/>
  <g>
    <g fill="var(--accent)">
      <rect x="170" y="94" width="14" height="36" opacity="0.95"/>
      <rect x="190" y="107" width="14" height="23"/>
      <rect x="210" y="112" width="14" height="18"/>
      <rect x="230" y="115" width="14" height="15"/>
      <rect x="250" y="119" width="14" height="11"/>
    </g>
    <g font-size="10" font-family="monospace" fill="var(--text-muted)" text-anchor="middle">
      <text x="177" y="142">e</text><text x="197" y="142">a</text><text x="217" y="142">o</text><text x="237" y="142">t</text><text x="257" y="142">h</text>
    </g>
    <text x="215" y="20" text-anchor="middle" fill="var(--text-primary)" font-size="11">T = 2.0</text>
    <text x="215" y="160" text-anchor="middle" fill="var(--text-muted)" font-size="10">adventurous, error-prone</text>
  </g>
</svg>
<figcaption>The same model, the same moment in the text — real softmax values,
reshaped only by temperature. Low T sharpens the favorite; high T hands the
long shots real chances.</figcaption>
</figure>

<p>Mechanically, the model's raw scores are divided by T before the softmax
turns them into percentages. Below 1, gaps between scores widen — the favorite
soaks up nearly all the probability. Above 1, gaps shrink — underdogs come
alive. At the extreme low end you get <em>greedy</em> decoding: always the
single favorite, which reads safe, then repetitive, then stuck in loops.</p>

<h3>Why not always pick the best?</h3>
<p>Because "most probable next character, every time" does not produce the
most probable — or the most interesting — <em>text</em>. Language is a long
game; a locally safe choice can paint the sentence into a corner. A bit of
randomness keeps variety alive, at the price of occasional nonsense. There is
no correct setting — only a mood dial: recite at 0.4, write at 0.8, dream
at 1.5.</p>

<p>And yes — the assistant you talk to generates every reply this way, one
weighted die roll per token. What you read as a voice is a distribution,
sampled.</p>

<p class="concept-try"><strong>See it in NNVP:</strong> after training a text
model, the Inspect tab is a sampling console. Same seed, three generations at
T = 0.4 / 0.8 / 1.5 — feel the die change in your hand.</p>
`,
};

export default samplingTemperature;
