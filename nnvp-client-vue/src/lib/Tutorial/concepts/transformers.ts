// Concept: the transformer — attention, industrialized.

import type { ConceptDef } from './index';

const transformers: ConceptDef = {
  id: 'transformers',
  title: 'The transformer',
  part: 'Reading & writing',
  hook: 'A block worth repeating: attention to gather, a small network to think, stacked N times.',
  related: ['attention', 'embeddings', 'sampling-temperature', 'pretraining-finetuning'],
  body: `
<p class="concept-lead">Once <a data-concept="attention">attention</a> existed,
the winning move turned out to be almost boring: wrap it in a tidy, repeatable
<strong>block</strong>, and stack that block until the money runs out. The
result is the transformer — the architecture behind essentially every modern
language model, including the one writing this sentence.</p>

<figure>
<svg viewBox="0 0 300 190" class="concept-fig" role="img" aria-label="The transformer pipeline: characters become embeddings plus positions, flow through repeated blocks of attention and feed-forward, and end in next-character probabilities">
  <g font-size="12" font-family="monospace" fill="var(--text-primary)" text-anchor="middle">
    <text x="150" y="180">…s h a l l   i</text>
  </g>
  <g fill="var(--bg-elevated)" stroke="var(--text-muted)" stroke-width="1.2">
    <rect x="75" y="140" width="150" height="22" rx="6"/>
  </g>
  <text x="150" y="155" text-anchor="middle" fill="var(--text-primary)" font-size="10">embedding + position</text>
  <g fill="var(--bg-elevated)" stroke="var(--accent)" stroke-width="1.6">
    <rect x="60" y="72" width="180" height="56" rx="8"/>
  </g>
  <g fill="none" stroke="var(--accent)" stroke-width="1">
    <rect x="72" y="98" width="112" height="22" rx="5"/>
    <rect x="196" y="98" width="34" height="22" rx="5"/>
  </g>
  <text x="128" y="113" text-anchor="middle" fill="var(--text-primary)" font-size="10">attention (gather)</text>
  <text x="213" y="113" text-anchor="middle" fill="var(--text-primary)" font-size="10">FFN</text>
  <text x="150" y="90" text-anchor="middle" fill="var(--accent)" font-size="10">× N blocks</text>
  <g fill="var(--bg-elevated)" stroke="var(--text-muted)" stroke-width="1.2">
    <rect x="75" y="34" width="150" height="22" rx="6"/>
  </g>
  <text x="150" y="49" text-anchor="middle" fill="var(--text-primary)" font-size="10">last position → softmax</text>
  <g font-size="10" font-family="monospace" text-anchor="middle">
    <text x="110" y="18" fill="var(--accent)">c: 62%</text>
    <text x="160" y="18" fill="var(--text-muted)">b: 14%</text>
    <text x="205" y="18" fill="var(--text-muted)">d: 9%</text>
  </g>
  <g stroke="var(--text-muted)" stroke-width="1.1" fill="none">
    <path d="M150 168 L150 163"/><path d="M150 140 L150 129"/><path d="M150 72 L150 57"/><path d="M150 34 L150 26"/>
  </g>
</svg>
<figcaption>"shall i" flowing up the stack — the model votes <em>c</em>,
dreaming of "shall i compare thee".</figcaption>
</figure>

<p>Each block does two things, in rhythm. <strong>Attention gathers</strong>:
every position pulls in what it needs from the positions before it.
Then a small <strong>feed-forward network thinks</strong>: it processes each
position's gathered bundle on its own. Gather, think. Gather, think.
Early blocks settle spelling; middle blocks, words and grammar; late blocks,
long arcs like rhyme and meter. (Two quiet helpers — residual connections and
layer normalization — keep the signal healthy on the way up; the pre-LN
wiring NNVP uses is the one modern models favor.)</p>

<p>Because attention alone has no sense of order, positions are injected at
the door: a <em>PositionalEmbedding</em> adds "I am 17th" into each
character's vector. And for next-character prediction the attention is
<em>causal</em> — position 17 may look at 1–16, never at 18. No peeking at
the answer.</p>

<p>Your GPT-Mini is this figure with 4 blocks and a 96-character
vocabulary. The assistant you're talking to is the same figure — with more
blocks, wider vectors, a vast token vocabulary, and nothing conceptually new.
Truly: you have now seen the whole trick.</p>

<p class="concept-try"><strong>See it in NNVP:</strong> "GPT-Mini Poetry" IS
this diagram, laid out on the board — count the TransformerBlocks, then click
one and find <code>ff_dim</code>: the width of its little thinking network.</p>
`,
};

export default transformers;
