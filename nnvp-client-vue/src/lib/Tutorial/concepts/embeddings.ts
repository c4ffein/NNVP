// Concept: embeddings — meaning as position in space.

import type { ConceptDef } from './index';

const embeddings: ConceptDef = {
  id: 'embeddings',
  title: 'Embeddings',
  part: 'Reading & writing',
  hook: 'Give every symbol a place in space, and let "similar" mean "nearby".',
  related: ['tensors-and-shapes', 'recurrence', 'attention'],
  body: `
<p class="concept-lead">Text arrives as symbol numbers — <em>e</em> is 5,
<em>f</em> is 6. Those numbers are labels, not quantities: <em>f</em> isn't
"one more than" <em>e</em>. Feeding them to arithmetic as-is would teach the
network nonsense. An <strong>Embedding</strong> fixes this beautifully:
give every symbol its own learned <strong>list of coordinates</strong> —
a position in space.</p>

<figure>
<svg viewBox="0 0 300 160" class="concept-fig" role="img" aria-label="A 2D scatter plot where vowels cluster together, digits cluster together, and punctuation clusters together">
  <line x1="20" y1="145" x2="290" y2="145" stroke="var(--text-muted)" stroke-width="0.7"/>
  <line x1="20" y1="10" x2="20" y2="145" stroke="var(--text-muted)" stroke-width="0.7"/>
  <g font-size="13" fill="var(--accent)" text-anchor="middle">
    <text x="70" y="45">a</text><text x="92" y="32">e</text><text x="60" y="66">o</text><text x="88" y="58">i</text><text x="106" y="48">u</text>
  </g>
  <g font-size="13" fill="var(--success)" text-anchor="middle">
    <text x="215" y="40">1</text><text x="238" y="30">2</text><text x="228" y="55">7</text><text x="252" y="46">9</text>
  </g>
  <g font-size="13" fill="var(--text-muted)" text-anchor="middle">
    <text x="120" y="120">.</text><text x="142" y="112">,</text><text x="132" y="132">;</text><text x="158" y="124">!</text>
  </g>
  <text x="88" y="18" text-anchor="middle" fill="var(--text-muted)" font-size="9">vowels</text>
  <text x="233" y="16" text-anchor="middle" fill="var(--text-muted)" font-size="9">digits</text>
  <text x="139" y="98" text-anchor="middle" fill="var(--text-muted)" font-size="9">punctuation</text>
</svg>
<figcaption>Two of an embedding's dimensions, sketched. Nobody told the network
what a vowel is — symbols that behave alike in the training text simply drift
together, because nearby points are easier to treat alike.</figcaption>
</figure>

<p>The coordinates start random and are trained like every other weight. The
result is a space where <em>geometry is meaning</em>: distance is similarity,
and directions become semantic — famously, in word embeddings, the arrow from
<em>king</em> to <em>queen</em> runs roughly parallel to the one from
<em>man</em> to <em>woman</em>. The network invents these axes itself, because
they make its prediction job easier.</p>

<h3>Why this matters beyond text</h3>
<p>Embeddings are how neural networks handle <em>anything</em> discrete —
words, characters, users, products, chess moves. And it's how the assistant
you talk to holds meaning: every token you type becomes a point in a space of
thousands of dimensions, where "reads similarly" and "lies nearby" are the
same fact. Understanding-as-geometry: this page's whole book, compressed into
one idea.</p>

<p class="concept-try"><strong>See it in NNVP:</strong> every text template
starts with an Embedding layer — click it and look at <code>output_dim</code>:
that's how many coordinates each of the 96 characters gets.</p>
`,
};

export default embeddings;
