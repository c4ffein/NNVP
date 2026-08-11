// Concept: generalization and overfitting — memorizing vs understanding.

import type { ConceptDef } from './index';

const generalization: ConceptDef = {
  id: 'generalization',
  title: 'Generalization and overfitting',
  part: 'Learning',
  hook: 'A network can ace every example it has seen and still have learned nothing.',
  related: ['training-loop', 'loss', 'pretraining-finetuning'],
  body: `
<p class="concept-lead">There are two ways to get a perfect score on questions
you've seen before: understand the subject, or memorize the answer sheet.
Networks are shameless memorizers — given enough dials and enough epochs, they
will happily learn their training set <em>by heart</em>. That failure has a
name: <strong>overfitting</strong>.</p>

<figure>
<svg viewBox="0 0 300 160" class="concept-fig" role="img" aria-label="Two curves over epochs: training loss keeps falling, validation loss falls then rises again">
  <line x1="10" y1="140" x2="290" y2="140" stroke="var(--text-muted)" stroke-width="0.8"/>
  <line x1="10" y1="10" x2="10" y2="140" stroke="var(--text-muted)" stroke-width="0.8"/>
  <line x1="206" y1="15" x2="206" y2="140" stroke="var(--text-muted)" stroke-width="0.7" stroke-dasharray="4 3"/>
  <path d="M10 20 L24 32 L38 42 L52 52 L66 60 L80 68 L94 75 L108 81 L122 86 L136 91 L150 96 L164 100 L178 103 L192 106 L206 109 L220 112 L234 114 L248 116 L262 118 L276 119 L290 121" fill="none" stroke="var(--accent)" stroke-width="2.2"/>
  <path d="M10 18 L24 30 L38 40 L52 48 L66 56 L80 63 L94 69 L108 74 L122 79 L136 83 L150 86 L164 89 L178 92 L192 93 L206 94 L220 95 L234 94 L248 93 L262 92 L276 89 L290 87" fill="none" stroke="var(--error, #d9534f)" stroke-width="2.2"/>
  <text x="60" y="30" fill="var(--error, #d9534f)" font-size="10">unseen data</text>
  <text x="60" y="105" fill="var(--accent)" font-size="10">training data</text>
  <text x="210" y="24" fill="var(--text-muted)" font-size="10">memorization begins</text>
  <text x="286" y="136" text-anchor="end" fill="var(--text-muted)" font-size="10">epochs →</text>
</svg>
<figcaption>The tell: loss on the training data keeps improving while loss on
<em>unseen</em> data turns around and gets worse. Past the dashed line, every
epoch makes the network better at the past and worse at the future.</figcaption>
</figure>

<p>This is why datasets are split. The network trains on one part and is graded
on a held-out part it never gets to memorize — the <strong>validation
set</strong>. The validation curve is the only one that tells the truth about
whether the network learned the <em>pattern</em> (what makes a 7 seven-ish)
rather than the <em>examples</em> (these exact 60,000 pictures).</p>

<h3>What helps</h3>
<p>Stopping while the validation curve is still happy. More or more varied
data — the best cure by far. Smaller networks (fewer dials to memorize with).
And layers like <em>Dropout</em>, which randomly silence neurons during
training so no single pathway can quietly become a lookup table.</p>

<p class="concept-try"><strong>See it in NNVP:</strong> the charts draw both
curves — <em>val_loss</em> is the unseen-data one. Train the tiny
ShakespeareSonnets corpus for many epochs and you can produce this exact
picture: the sonnets are so few that memorizing them is easy.</p>
`,
};

export default generalization;
