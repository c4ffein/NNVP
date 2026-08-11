// Concept: what a neural network actually is. The book's front door.

import type { ConceptDef } from './index';

const whatIsANeuralNetwork: ConceptDef = {
  id: 'what-is-a-neural-network',
  title: 'What is a neural network?',
  part: 'The machine',
  hook: 'A pile of adjustable numbers, arranged so that adjusting them is learning.',
  related: ['tensors-and-shapes', 'activations', 'gradient-descent'],
  body: `
<p class="concept-lead">Strip away the mystique and a neural network is a
<strong>function</strong>: numbers go in, numbers come out. What makes it special
is that the function is full of little dials — and it can turn its own dials.</p>

<figure>
<svg viewBox="0 0 300 170" class="concept-fig" role="img" aria-label="A small neural network: three input circles, four hidden circles, two output circles, connected by lines of different thickness">
  <g stroke="var(--text-muted)" fill="none">
    <path d="M50 40 L150 25" stroke-width="2.6"/><path d="M50 40 L150 65" stroke-width="0.8"/><path d="M50 40 L150 105" stroke-width="1.6"/><path d="M50 40 L150 145" stroke-width="0.6"/>
    <path d="M50 85 L150 25" stroke-width="0.7"/><path d="M50 85 L150 65" stroke-width="2.2"/><path d="M50 85 L150 105" stroke-width="1.1"/><path d="M50 85 L150 145" stroke-width="1.9"/>
    <path d="M50 130 L150 25" stroke-width="1.4"/><path d="M50 130 L150 65" stroke-width="0.6"/><path d="M50 130 L150 105" stroke-width="2.8"/><path d="M50 130 L150 145" stroke-width="1.0"/>
    <path d="M150 25 L250 60" stroke-width="2.4"/><path d="M150 25 L250 110" stroke-width="0.8"/>
    <path d="M150 65 L250 60" stroke-width="1.0"/><path d="M150 65 L250 110" stroke-width="2.0"/>
    <path d="M150 105 L250 60" stroke-width="1.8"/><path d="M150 105 L250 110" stroke-width="0.9"/>
    <path d="M150 145 L250 60" stroke-width="0.7"/><path d="M150 145 L250 110" stroke-width="2.5"/>
  </g>
  <g fill="var(--bg-elevated)" stroke="var(--accent)" stroke-width="2">
    <circle cx="50" cy="40" r="11"/><circle cx="50" cy="85" r="11"/><circle cx="50" cy="130" r="11"/>
    <circle cx="150" cy="25" r="11"/><circle cx="150" cy="65" r="11"/><circle cx="150" cy="105" r="11"/><circle cx="150" cy="145" r="11"/>
    <circle cx="250" cy="60" r="11"/><circle cx="250" cy="110" r="11"/>
  </g>
  <text x="50" y="163" text-anchor="middle" fill="var(--text-muted)" font-size="10">in</text>
  <text x="150" y="167" text-anchor="middle" fill="var(--text-muted)" font-size="10">hidden</text>
  <text x="250" y="163" text-anchor="middle" fill="var(--text-muted)" font-size="10">out</text>
</svg>
<figcaption>Every line is one <strong>weight</strong> — a plain number. Thicker line,
bigger number, stronger influence. This whole picture is just a recipe for
multiplying and adding.</figcaption>
</figure>

<p>Each circle is a <strong>neuron</strong>, and it does something almost
insultingly simple: it takes every number arriving on its incoming lines,
multiplies each by that line's weight, adds them up, and passes the total on.
That's it. Multiply, add, pass along.</p>

<p>The magic is not in any neuron — it's in the <em>arrangement</em>. Stack
enough layers of these simple units and the function they compute together can
be bent into nearly any shape: "these pixels are a 7", "after these 40
characters comes an <em>e</em>", "this sentence sounds like Shakespeare".
Which shape you get is decided entirely by the weights.</p>

<h3>Learning = turning the dials</h3>
<p>A fresh network's weights are random noise, and so are its answers. Training
is the process of nudging every weight, a tiny step at a time, so the answers
get less wrong — millions of little dial-turns, guided by a single score
(the <em>loss</em>). Nobody sets the dials by hand. The network finds its own
settings, and that is the entire trick.</p>

<p>The model you are chatting with when you talk to an AI assistant is this
exact picture — with the dial count grown from the dozens on this diagram
into the billions, and the layers stacked hundreds deep. Same multiply,
same add, same dials.</p>

<p class="concept-try"><strong>See it in NNVP:</strong> the layers you drag onto
the board each bundle a group of these neurons; every arrow you draw decides
whose outputs feed whose inputs. Click a Dense layer and look at
<em>units</em> — that's how many neurons you just placed.</p>
`,
};

export default whatIsANeuralNetwork;
