// The MERGED layer-catalog truth for codegen membership checks (Phase D2,
// the "cheap hardening" from Phase E's list).
//
// codegenSafety's pattern assertions stop syntax injection but accept any
// identifier-shaped name; a crafted .nnvp can rename a layer to `Dense_pwned`
// and the generated code would call keras.layers.Dense_pwned. This module
// answers "is that name real?": the generated catalog (canonical names AND
// their Keras aliases) plus NNVP's own text layers (textLayers.ts — they are
// deliberately NOT in the generated file) plus nothing else. It feeds the
// `isKnown` predicates of codegenSafety.assertKnownIdentifier so that module
// stays dependency-light.
//
// Pure module: no Vue, no DOM — runs identically under bun.

import generatedKerasLayers from './generatedKerasLayers.json';
import { textLayerCatalogEntries } from './textLayers';
import type { TextLayerName } from './textLayers';
import type { KerasLayerCatalog, KerasLayerCatalogEntry } from '../../types/model';

const catalog = generatedKerasLayers as unknown as KerasLayerCatalog;
const catalogLayers: Record<string, KerasLayerCatalogEntry> = catalog.layers ?? {};
const aliasToCanonical: Record<string, string> = catalog.aliasToCanonical ?? {};

/** Aliases (Convolution2D, MaxPool2D, ...) resolve to their canonical entry. */
function canonicalOf(name: string): string {
  return Object.prototype.hasOwnProperty.call(aliasToCanonical, name)
    ? aliasToCanonical[name]!
    : name;
}

function entryOf(name: string): KerasLayerCatalogEntry | undefined {
  const canonical = canonicalOf(name);
  if (Object.prototype.hasOwnProperty.call(catalogLayers, canonical)) {
    return catalogLayers[canonical];
  }
  if (Object.prototype.hasOwnProperty.call(textLayerCatalogEntries, canonical)) {
    return textLayerCatalogEntries[canonical as TextLayerName];
  }
  return undefined;
}

/** True when `name` is a real layer of the merged catalog (incl. aliases). */
export function isKnownLayerName(name: string): boolean {
  return entryOf(name) !== undefined;
}

/**
 * The parameter names a layer legitimately accepts, per the merged catalog.
 * Returns an empty set for unknown layers (callers refuse those by name
 * first). Mirrors KerasInterface.load's historical 'Merge' special case,
 * which stashes the input spec as an `input_order` pseudo parameter.
 */
export function knownParameterNames(layerName: string): ReadonlySet<string> {
  const entry = entryOf(layerName);
  const names = new Set<string>(Object.keys(entry?.parameters ?? {}));
  if (entry?.category === 'Merge') names.add('input_order');
  return names;
}
