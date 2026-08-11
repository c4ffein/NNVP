// Concept: convolutions — pattern detectors that slide.

import type { ConceptDef } from './index';

const convolutions: ConceptDef = {
  id: 'convolutions',
  title: 'Convolutions',
  part: 'Seeing',
  hook: 'One tiny pattern detector, slid across the whole image.',
  related: ['what-is-a-neural-network', 'tensors-and-shapes', 'activations'],
  body: `
<p class="concept-lead">A Dense layer looking at an image is wasteful: it wires
every pixel to every neuron, as if the top-left corner and the center had
nothing in common. But images have structure — an edge is an edge wherever it
appears. A <strong>convolution</strong> exploits that: learn one small
detector, then <strong>slide it everywhere</strong>.</p>

<figure>
<svg viewBox="0 0 300 150" class="concept-fig" role="img" aria-label="A small 3 by 3 window sliding over an input grid, producing one highlighted cell in a smaller output grid">
  <g stroke="var(--text-muted)" stroke-width="0.6" fill="none">
    <path d="M20 25 H120 M20 45 H120 M20 65 H120 M20 85 H120 M20 105 H120 M20 125 H120"/>
    <path d="M20 25 V125 M40 25 V125 M60 25 V125 M80 25 V125 M100 25 V125 M120 25 V125"/>
  </g>
  <rect x="40" y="45" width="60" height="60" fill="var(--accent)" opacity="0.18"/>
  <rect x="40" y="45" width="60" height="60" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
  <g stroke="var(--text-muted)" stroke-width="0.6" fill="none">
    <path d="M195 40 H275 M195 60 H275 M195 80 H275 M195 100 H275"/>
    <path d="M195 40 V100 M215 40 V100 M235 40 V100 M255 40 V100 M275 40 V100"/>
  </g>
  <rect x="215" y="60" width="20" height="20" fill="var(--accent)" opacity="0.85"/>
  <path d="M105 75 Q150 60 190 70" stroke="var(--text-muted)" fill="none" stroke-width="1.3"/>
  <path d="M185 66 L194 71 L185 75 Z" fill="var(--text-muted)"/>
  <text x="70" y="143" text-anchor="middle" fill="var(--text-muted)" font-size="10">input pixels + sliding 3×3 filter</text>
  <text x="235" y="118" text-anchor="middle" fill="var(--text-muted)" font-size="10">feature map: "was my pattern here?"</text>
</svg>
<figcaption>At each position, the filter asks one question — "does my little
pattern appear under me right now?" — and writes the answer into the feature map.</figcaption>
</figure>

<p>The filter itself is a tiny grid of weights, 3×3 or 5×5, learned like any
other weights. One filter might come to detect vertical strokes, another a
curve opening left, another a bright-on-dark corner. A Conv2D layer with
32 filters runs 32 such detectors and stacks their answer-maps — the image,
re-described as <em>where each pattern occurs</em>.</p>

<h3>Stacking builds vocabulary</h3>
<p>The second convolution layer slides its detectors over the first one's
answer-maps — so its patterns are patterns <em>of</em> patterns: strokes
combine into loops, loops into "the top of an 8". Between layers,
<strong>pooling</strong> (MaxPooling2D) shrinks the maps by keeping each
neighborhood's strongest response — caring <em>that</em> a loop was found,
not precisely which pixel it sat on. Meaning condenses as resolution drops:
that's the CNN recipe that read your handwriting in chapter 3.</p>

<p class="concept-try"><strong>See it in NNVP:</strong> train the CNN template,
then open Inspect and step through samples — the early feature maps light up
on strokes and edges, the deeper ones on whole digit-parts. The 3D view shows
the same story in space.</p>
`,
};

export default convolutions;
