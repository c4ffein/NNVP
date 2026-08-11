// Concept: attention — every position looks back at every other.

import type { ConceptDef } from './index';

const attention: ConceptDef = {
  id: 'attention',
  title: 'Attention',
  part: 'Reading & writing',
  hook: 'Instead of squeezing the past through a memory, let every word look directly at every other.',
  related: ['embeddings', 'recurrence', 'transformers'],
  body: `
<p class="concept-lead">Recurrence reads like a whisper chain — each step
passes a summary to the next, and details fade. <strong>Attention</strong>
throws the chain away: when the network processes a position, it looks
<em>directly</em> at every earlier position and decides, with learned
weights, <strong>who matters right now</strong>.</p>

<figure>
<svg viewBox="0 0 300 130" class="concept-fig" role="img" aria-label="The words of a sentence in a row, with arcs of different thickness from the word 'sat' back to earlier words — thickest to 'cat'">
  <g font-size="13" font-family="monospace" fill="var(--text-primary)" text-anchor="middle">
    <text x="35" y="110">the</text>
    <text x="90" y="110">cat</text>
    <text x="145" y="110">sat</text>
    <text x="200" y="110">on</text>
    <text x="255" y="110">the</text>
  </g>
  <rect x="128" y="96" width="35" height="20" rx="5" fill="none" stroke="var(--accent)" stroke-width="1.5"/>
  <g stroke="var(--accent)" fill="none">
    <path d="M140 94 Q88 30 92 94" stroke-width="3.4"/>
    <path d="M136 94 Q84 55 38 94" stroke-width="1.1"/>
  </g>
  <g stroke="var(--text-muted)" fill="none" opacity="0.85">
    <path d="M258 94 Q230 55 152 92" stroke-width="2.2"/>
    <path d="M204 94 Q178 66 150 92" stroke-width="1.0"/>
  </g>
  <text x="92" y="26" text-anchor="middle" fill="var(--accent)" font-size="10">who is sitting? → "cat"</text>
</svg>
<figcaption>Predicting what follows "sat" — the network attends hard to
"cat" (who sat?), lightly to "the". Every arc's strength is computed fresh,
for this sentence.</figcaption>
</figure>

<p>The mechanism is a soft lookup. Each position publishes a
<strong>key</strong> ("what I am": <em>noun, animal, subject</em>) and carries
a <strong>value</strong> (its actual content); a position that's thinking asks
with a <strong>query</strong> ("what I need: the subject of this verb").
Queries are compared against every key, the match scores become percentages,
and the position receives a <em>blend of values, weighted by relevance</em>.
Fuzzy database lookup, fully differentiable, learned end to end.</p>

<h3>Why it changed everything</h3>
<p>Nothing fades: character 1 is exactly as reachable from character 96 as
character 95 is — long-range connections cost nothing. Every position computes
at once instead of waiting for a chain — which is what lets modern models
train on oceans of text. And running several attention <em>heads</em> in
parallel lets one layer track grammar, spelling, and rhyme at the same time,
each head asking its own kind of question.</p>

<p>This is the honest answer to "what is the AI you talk to doing?" — when the
assistant reads your message, every token attends over everything before it,
layer after layer, heads by the dozen. The arcs in this figure, drawn a
billion times a second: that is most of what I am.</p>

<p class="concept-try"><strong>See it in NNVP:</strong> load "Mini Transformer
Poetry" and click the TransformerBlock — <code>num_heads</code> is how many
of these lookups run side by side over your 40 characters.</p>
`,
};

export default attention;
