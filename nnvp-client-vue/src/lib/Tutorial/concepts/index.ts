// The Concepts book — "what is actually happening in there".
//
// Each concept is one article of checked-in HTML with inline, theme-aware SVG
// figures (stroke/fill via the app's CSS variables), written for visual
// learners: intuition first, real curves and real numbers, no equations.
// Articles cross-link with <a data-concept="id"> anchors (the ConceptBook
// component delegates the clicks) and tutorial steps point in via their
// `concept` field — the book is the theory layer under the guided course.
//
// Content is trusted, checked-in HTML (the layerHelp precedent) rendered via
// v-html; nothing user-supplied ever flows into these strings.

import whatIsANeuralNetwork from './whatIsANeuralNetwork';
import tensorsAndShapes from './tensorsAndShapes';
import activations from './activations';
import loss from './loss';
import gradientDescent from './gradientDescent';
import trainingLoop from './trainingLoop';
import generalization from './generalization';
import convolutions from './convolutions';
import embeddings from './embeddings';
import recurrence from './recurrence';
import attention from './attention';
import transformers from './transformers';
import samplingTemperature from './samplingTemperature';
import pretrainingFinetuning from './pretrainingFinetuning';
import aWordFromFable from './aWordFromFable';

export interface ConceptDef {
  id: string;
  title: string;
  /** The book part (chapter grouping) this article belongs to. */
  part: string;
  /** One-line hook shown in the table of contents. */
  hook: string;
  /** The article body: checked-in HTML with inline SVG figures. */
  body: string;
  /** Ids of related concepts, rendered as links at the end of the article. */
  related: string[];
}

/** The book, in reading order (parts stay contiguous). */
export const concepts: ConceptDef[] = [
  whatIsANeuralNetwork,
  tensorsAndShapes,
  activations,
  loss,
  gradientDescent,
  trainingLoop,
  generalization,
  convolutions,
  embeddings,
  recurrence,
  attention,
  transformers,
  samplingTemperature,
  pretrainingFinetuning,
  aWordFromFable,
];

/** Look up one concept by id. */
export function getConcept(id: string): ConceptDef | undefined {
  return concepts.find(concept => concept.id === id);
}

/** The part names in book order (deduped, order of first appearance). */
export function conceptParts(): string[] {
  const parts: string[] = [];
  for (const concept of concepts) {
    if (!parts.includes(concept.part)) parts.push(concept.part);
  }
  return parts;
}

/** The id of the article after `id` in book order, or null at the end. */
export function nextConceptId(id: string): string | null {
  const index = concepts.findIndex(concept => concept.id === id);
  if (index < 0 || index + 1 >= concepts.length) return null;
  return concepts[index + 1]!.id;
}

/** The id of the article before `id` in book order, or null at the start. */
export function prevConceptId(id: string): string | null {
  const index = concepts.findIndex(concept => concept.id === id);
  if (index <= 0) return null;
  return concepts[index - 1]!.id;
}

// Catalog topics (layer type names and category names, as the help modal
// knows them) → the book article that teaches the underlying idea. Only
// topics with a genuinely matching article are listed — no forced links.
const CONCEPT_FOR_CATALOG_TOPIC: Record<string, string> = {
  'Input': 'tensors-and-shapes',
  'Output': 'tensors-and-shapes',
  'Flatten': 'tensors-and-shapes',
  'Reshaping': 'tensors-and-shapes',
  'Dense': 'what-is-a-neural-network',
  'Core': 'what-is-a-neural-network',
  'Activation': 'activations',
  'ReLU': 'activations',
  'LeakyReLU': 'activations',
  'ELU': 'activations',
  'PReLU': 'activations',
  'Softmax': 'activations',
  'Conv1D': 'convolutions',
  'Conv2D': 'convolutions',
  'Conv3D': 'convolutions',
  'SeparableConv2D': 'convolutions',
  'DepthwiseConv2D': 'convolutions',
  'MaxPooling2D': 'convolutions',
  'AveragePooling2D': 'convolutions',
  'Convolution': 'convolutions',
  'Pooling': 'convolutions',
  'Embedding': 'embeddings',
  'LSTM': 'recurrence',
  'GRU': 'recurrence',
  'SimpleRNN': 'recurrence',
  'Bidirectional': 'recurrence',
  'Recurrent': 'recurrence',
  'Attention': 'attention',
  'MultiHeadAttention': 'attention',
  'GroupQueryAttention': 'attention',
  'TransformerBlock': 'transformers',
  'PositionalEmbedding': 'transformers',
  'LastToken': 'transformers',
  'Text (NNVP)': 'transformers',
  'Dropout': 'generalization',
  'SpatialDropout1D': 'generalization',
  'SpatialDropout2D': 'generalization',
  'GaussianDropout': 'generalization',
  'AlphaDropout': 'generalization',
  'Regularization': 'generalization',
};

/** The book article for a catalog topic (layer or category name), or null. */
export function conceptForCatalogTopic(topic: string): string | null {
  return CONCEPT_FOR_CATALOG_TOPIC[topic] ?? null;
}
