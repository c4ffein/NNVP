/**
 * The Concepts book: registry integrity, the visual mandate (every article
 * carries at least one accessible SVG figure), cross-link resolution, the
 * course→book links, the catalog-topic mapping, and read-state persistence.
 */
import { logicTest } from '../harness/define';
import {
  concepts, getConcept, conceptParts, nextConceptId, prevConceptId, conceptForCatalogTopic,
} from '../../src/lib/Tutorial/concepts';
import { readConceptIds, markConceptRead, resetConceptReads } from '../../src/lib/Tutorial/concepts/readState';
import tutorials from '../../src/lib/Tutorial/tutorials';

logicTest('concepts: the book has 15 well-formed articles with unique kebab-case ids', ({ expect }) => {
  expect(concepts.length).toBe(15);
  const ids = new Set<string>();
  for (const concept of concepts) {
    expect(concept.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(ids.has(concept.id)).toBe(false);
    ids.add(concept.id);
    expect(concept.title.length).toBeGreaterThan(0);
    expect(concept.part.length).toBeGreaterThan(0);
    expect(concept.hook.length).toBeGreaterThan(0);
    expect(concept.body.length).toBeGreaterThan(400);
  }
});

logicTest('concepts: every article is visual — at least one accessible SVG figure', ({ expect }) => {
  for (const concept of concepts) {
    expect(concept.body).toContain('<svg');
    expect(concept.body).toContain('<figcaption');
    // Figures must scale and must speak: viewBox + img role + a label.
    expect(concept.body).toContain('viewBox=');
    expect(concept.body).toContain('role="img"');
    expect(concept.body).toContain('aria-label=');
  }
});

logicTest('concepts: related links and in-body cross-links all resolve, without self-loops', ({ expect }) => {
  for (const concept of concepts) {
    for (const related of concept.related) {
      expect(getConcept(related), `${concept.id} relates to unknown "${related}"`).toBeDefined();
      expect(related).not.toBe(concept.id);
    }
    for (const match of concept.body.matchAll(/data-concept="([^"]+)"/g)) {
      expect(getConcept(match[1]!), `${concept.id} links unknown "${match[1]}"`).toBeDefined();
      expect(match[1]).not.toBe(concept.id);
    }
  }
});

logicTest('concepts: parts are contiguous in book order', ({ expect }) => {
  const parts = conceptParts();
  expect(parts.length).toBeGreaterThanOrEqual(3);
  // Once a part ends, it never reappears — the book reads front to back.
  const seen = new Set<string>();
  let current: string | null = null;
  for (const concept of concepts) {
    if (concept.part !== current) {
      expect(seen.has(concept.part)).toBe(false);
      seen.add(concept.part);
      current = concept.part;
    }
  }
});

logicTest('concepts: prev/next walk the book and stop at the covers', ({ expect }) => {
  expect(prevConceptId(concepts[0]!.id)).toBe(null);
  expect(nextConceptId(concepts[concepts.length - 1]!.id)).toBe(null);
  for (let i = 0; i + 1 < concepts.length; i += 1) {
    expect(nextConceptId(concepts[i]!.id)).toBe(concepts[i + 1]!.id);
    expect(prevConceptId(concepts[i + 1]!.id)).toBe(concepts[i]!.id);
  }
  expect(nextConceptId('ghost')).toBe(null);
  expect(prevConceptId('ghost')).toBe(null);
});

logicTest('concepts: every course step concept link points at a real article', ({ expect }) => {
  let linked = 0;
  for (const tutorial of tutorials) {
    for (const step of tutorial.steps) {
      if (step.concepts === undefined) continue;
      expect(step.concepts.length).toBeGreaterThan(0);
      linked += 1;
      for (const id of step.concepts) {
        expect(getConcept(id), `${tutorial.id}/${step.id} → unknown "${id}"`).toBeDefined();
      }
    }
  }
  // The course is meant to be threaded into the book — not decorated with
  // one token link.
  expect(linked).toBeGreaterThanOrEqual(20);
});

logicTest('concepts: every chapter links into the book at least twice', ({ expect }) => {
  for (const tutorial of tutorials) {
    const linked = tutorial.steps.filter(step => step.concepts !== undefined).length;
    expect(linked, `${tutorial.id} has ${linked} concept links`).toBeGreaterThanOrEqual(2);
  }
});

logicTest('concepts: catalog-topic mapping resolves to real articles', ({ expect }) => {
  expect(conceptForCatalogTopic('Conv2D')).toBe('convolutions');
  expect(conceptForCatalogTopic('LSTM')).toBe('recurrence');
  expect(conceptForCatalogTopic('TransformerBlock')).toBe('transformers');
  expect(conceptForCatalogTopic('Text (NNVP)')).toBe('transformers');
  expect(conceptForCatalogTopic('Dense')).toBe('what-is-a-neural-network');
  expect(conceptForCatalogTopic('SomeFutureLayer')).toBe(null);
  // Whatever the table says, it must say it about real articles.
  const topics = ['Input', 'Output', 'Flatten', 'Dense', 'Activation', 'ReLU', 'Softmax',
    'Conv2D', 'MaxPooling2D', 'Embedding', 'LSTM', 'GRU', 'Attention', 'MultiHeadAttention',
    'TransformerBlock', 'PositionalEmbedding', 'LastToken', 'Dropout'];
  for (const topic of topics) {
    const id = conceptForCatalogTopic(topic);
    expect(id, `no mapping for ${topic}`).not.toBe(null);
    expect(getConcept(id!)).toBeDefined();
  }
});

logicTest('concepts: read state persists, dedupes, and survives corrupted storage', ({ expect }) => {
  localStorage.removeItem('nnvp-concepts-read');
  expect(readConceptIds().size).toBe(0);
  markConceptRead('attention');
  markConceptRead('attention');
  markConceptRead('loss');
  expect([...readConceptIds()].sort()).toEqual(['attention', 'loss']);
  localStorage.setItem('nnvp-concepts-read', '{oops');
  expect(readConceptIds().size).toBe(0);
  localStorage.removeItem('nnvp-concepts-read');
});

logicTest('concepts: resetConceptReads clears the read marks', ({ expect }) => {
  localStorage.removeItem('nnvp-concepts-read');
  markConceptRead('attention');
  expect(readConceptIds().size).toBe(1);
  resetConceptReads();
  expect(readConceptIds().size).toBe(0);
});
