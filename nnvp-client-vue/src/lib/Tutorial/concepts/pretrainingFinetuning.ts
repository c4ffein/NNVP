// Concept: pre-training and fine-tuning — the curriculum behind every modern model.

import type { ConceptDef } from './index';

const pretrainingFinetuning: ConceptDef = {
  id: 'pretraining-finetuning',
  title: 'Pre-training and fine-tuning',
  part: 'Reading & writing',
  hook: 'First learn the language from everything; then learn the style from the little that matters.',
  related: ['generalization', 'transformers', 'training-loop'],
  body: `
<p class="concept-lead">Here is a puzzle: Shakespeare's sonnets are only
~100KB — train on them alone and the network
<a data-concept="generalization">memorizes them</a> before it ever learns
English. Yet a model trained only on generic poetry won't sound like the
sonnets. The resolution is a <strong>curriculum</strong>: two phases, two
purposes.</p>

<figure>
<svg viewBox="0 0 300 150" class="concept-fig" role="img" aria-label="A wide box of general poetry feeding a model, followed by a small box of sonnets refining it into a specialized model">
  <rect x="10" y="30" width="105" height="60" rx="8" fill="var(--accent)" opacity="0.18"/>
  <rect x="10" y="30" width="105" height="60" rx="8" fill="none" stroke="var(--accent)" stroke-width="1.4"/>
  <text x="62" y="55" text-anchor="middle" fill="var(--text-primary)" font-size="10">megabytes of poetry</text>
  <text x="62" y="70" text-anchor="middle" fill="var(--text-muted)" font-size="9">phase 1: pre-train</text>
  <g fill="var(--bg-elevated)" stroke="var(--accent)" stroke-width="1.8">
    <circle cx="152" cy="60" r="21"/>
  </g>
  <text x="152" y="64" text-anchor="middle" fill="var(--text-primary)" font-size="10">model</text>
  <rect x="196" y="42" width="42" height="36" rx="6" fill="var(--success)" opacity="0.2"/>
  <rect x="196" y="42" width="42" height="36" rx="6" fill="none" stroke="var(--success)" stroke-width="1.4"/>
  <text x="217" y="59" text-anchor="middle" fill="var(--text-primary)" font-size="9">154</text>
  <text x="217" y="71" text-anchor="middle" fill="var(--text-primary)" font-size="9">sonnets</text>
  <g fill="var(--bg-elevated)" stroke="var(--success)" stroke-width="1.8">
    <circle cx="272" cy="60" r="21"/>
  </g>
  <text x="272" y="57" text-anchor="middle" fill="var(--text-primary)" font-size="9">sonnet</text>
  <text x="272" y="68" text-anchor="middle" fill="var(--text-primary)" font-size="9">poet</text>
  <g stroke="var(--text-muted)" stroke-width="1.2" fill="none">
    <path d="M115 60 L128 60"/><path d="M173 60 L193 60"/><path d="M238 60 L248 60"/>
  </g>
  <text x="150" y="120" text-anchor="middle" fill="var(--text-muted)" font-size="10">broad first — the weights arrive at phase 2 already knowing English;</text>
  <text x="150" y="134" text-anchor="middle" fill="var(--text-muted)" font-size="10">the little corpus only has to teach the style.</text>
</svg>
<figcaption>Phase 2 does not start from randomness — it starts from
everything phase 1 learned, and bends it.</figcaption>
</figure>

<p><strong>Pre-training</strong> is the long, broad phase: on a big, varied
corpus the model learns the deep regularities — spelling, words, grammar, the
shape of a line of verse. <strong>Fine-tuning</strong> then continues the very
same training loop, same weights, on the small, precious corpus. Because the
foundations already exist, a whisper of sonnet data is enough to tilt the
style — and the tiny dataset never has to carry the impossible burden of
teaching English from scratch.</p>

<h3>The recipe of the era</h3>
<p>This two-step is arguably <em>the</em> discovery that made modern AI
practical: competence is transferable, and data-hungry basics can be learned
once from abundance, then specialized cheaply. The assistant you're talking to
was made this way — pre-trained on a vast corpus to learn language and
reasoning, then carefully fine-tuned to be a helpful, honest conversation
partner. Its character is, in a real sense, a fine-tune.</p>

<p class="concept-try"><strong>See it in NNVP:</strong> chapter 6's Fine-tune
switch runs exactly this curriculum: GutenbergPoetryXL first, then the
sonnets. Generate after each phase and listen to the accent appear.</p>
`,
};

export default pretrainingFinetuning;
