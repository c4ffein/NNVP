// Concept: recurrence — reading with a memory.

import type { ConceptDef } from './index';

const recurrence: ConceptDef = {
  id: 'recurrence',
  title: 'Recurrence and memory',
  part: 'Reading & writing',
  hook: 'Read one symbol at a time, carrying a memory forward — like a finger moving along the line.',
  related: ['embeddings', 'attention', 'training-loop'],
  body: `
<p class="concept-lead">A sequence has order, and order is information —
"dog bites man" is not "man bites dog". The recurrent answer: process the
sequence <strong>one step at a time</strong>, keeping a running summary — a
<strong>memory</strong> — that each new symbol updates.</p>

<figure>
<svg viewBox="0 0 300 140" class="concept-fig" role="img" aria-label="The same cell repeated over time: each step takes one character and the previous memory, and passes an updated memory forward">
  <g fill="var(--bg-elevated)" stroke="var(--accent)" stroke-width="1.5">
    <rect x="30" y="50" width="50" height="36" rx="8"/>
    <rect x="125" y="50" width="50" height="36" rx="8"/>
    <rect x="220" y="50" width="50" height="36" rx="8"/>
  </g>
  <g fill="var(--text-primary)" font-size="11" text-anchor="middle">
    <text x="55" y="72">cell</text><text x="150" y="72">cell</text><text x="245" y="72">cell</text>
  </g>
  <g stroke="var(--accent)" stroke-width="1.8" fill="none">
    <path d="M80 68 L122 68"/><path d="M175 68 L217 68"/>
  </g>
  <g fill="var(--accent)">
    <path d="M117 63 L125 68 L117 73 Z"/><path d="M212 63 L220 68 L212 73 Z"/>
  </g>
  <g stroke="var(--text-muted)" stroke-width="1.2" fill="none">
    <path d="M55 110 L55 90"/><path d="M150 110 L150 90"/><path d="M245 110 L245 90"/>
  </g>
  <g fill="var(--text-muted)">
    <path d="M50 94 L55 86 L60 94 Z"/><path d="M145 94 L150 86 L155 94 Z"/><path d="M240 94 L245 86 L250 94 Z"/>
  </g>
  <g font-size="14" font-family="monospace" fill="var(--text-primary)" text-anchor="middle">
    <text x="55" y="126">c</text><text x="150" y="126">a</text><text x="245" y="126">t</text>
  </g>
  <text x="99" y="60" text-anchor="middle" fill="var(--accent)" font-size="9">memory</text>
  <text x="196" y="60" text-anchor="middle" fill="var(--accent)" font-size="9">memory</text>
</svg>
<figcaption>The same cell (same weights!) applied at every position. All the
past has to squeeze through that one memory arrow.</figcaption>
</figure>

<p>After reading <em>c, a, t</em>, the memory is a vector that — if training
went well — encodes "recent letters spelled <em>cat</em>, we're mid-word,
English, lowercase". The next-character guess is made from that summary
alone.</p>

<h3>The vanishing past, and the LSTM</h3>
<p>Simple recurrent cells (like the Elman network) have a flaw: each step
reshuffles the whole memory, so information from twenty steps ago fades like
a rumor retold twenty times. The <strong>LSTM</strong> (Long Short-Term
Memory) fixes this with learned <em>gates</em> — little valves that decide,
at each step, what to write into memory, what to erase, and what to reveal.
An open quote can be remembered forty characters until it's closed.</p>

<p>The deeper limitation remains: the entire past, whatever its length, must
fit through one fixed-size vector. <a data-concept="attention">Attention</a>
was invented to remove exactly that bottleneck — but recurrence is the idea
that made machines read at all, and it still shines when memory-as-summary is
the right model.</p>

<p class="concept-try"><strong>See it in NNVP:</strong> the "Char-LSTM Poetry"
template is this figure made real — Embedding, then an LSTM whose
<code>units</code> parameter is the size of that memory vector. The "Elman
char-RNN" template is the simple cell, drawn with an explicit feedback loop
on the board.</p>
`,
};

export default recurrence;
