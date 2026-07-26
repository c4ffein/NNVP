// Save-format versioning for the .nnvp model JSON.
//
// Every load entry point funnels through adapter.nnvpToFlow, which calls
// migrateModel; every save funnels through adapter.flowToNnvp, which stamps
// `formatVersion: CURRENT_FORMAT_VERSION`. A model with no `formatVersion` is
// version 1 — everything saved before versioning existed (D3-era saves, the
// originally shipped BoardTemplates), whose D3-flavored names
// (`"class":"D3Layer"`, `htmlID:"d3-layer-*"`, ...) must remain readable
// forever: the 1->2 migration below renames them to the honest v2 names.

import type { NnvpModel } from '../../types/model';

/** One migration step: rewrites a version-N model into a version-N+1 model. */
export type NnvpMigration = (model: NnvpModel) => NnvpModel;

// --- 1 -> 2: honest names ----------------------------------------------------
//
// Format v1 kept the D3-era spellings; v2 renames them, changing nothing else:
//   layer.class  "D3Layer"          -> "Layer"
//   layer.class  "D3LayerComposite" -> "Group"
//   layer.htmlID "d3-layer-<n>"     -> "layer-<n>"
// (Applied recursively through composite children. Edge ids/htmlIDs, layer
// ids, wiring and kerasLayer payloads carry no D3-flavored names — audited
// against src/types/model.ts, the shipped templates and the D3-era saves.)

/** A layer as a version-1 file spells it (superset of the v2 spelling). */
type NnvpLayerV1 = Omit<NnvpModel['layers'][number], 'class' | 'children'> & {
  class: 'Layer' | 'Group' | 'D3Layer' | 'D3LayerComposite';
  children?: NnvpLayerV1[] | null;
};

const V1_CLASS_RENAMES = { D3Layer: 'Layer', D3LayerComposite: 'Group' } as const;
const V1_HTML_ID = /^d3-layer-(\d+)$/;

function renameLayerV1(layer: NnvpLayerV1): NnvpLayerV1 {
  const renamedClass = layer.class in V1_CLASS_RENAMES
    ? V1_CLASS_RENAMES[layer.class as keyof typeof V1_CLASS_RENAMES]
    : layer.class;
  const htmlID = typeof layer.htmlID === 'string'
    ? layer.htmlID.replace(V1_HTML_ID, 'layer-$1')
    : layer.htmlID;
  return {
    ...layer,
    class: renamedClass,
    htmlID,
    children: layer.children ? layer.children.map(renameLayerV1) : layer.children,
  };
}

const migrateV1toV2: NnvpMigration = model => ({
  ...model,
  layers: ((model.layers || []) as NnvpLayerV1[]).map(renameLayerV1) as NnvpModel['layers'],
});

/**
 * The ordered migration ladder: MIGRATIONS[i] takes a version i+1 model to
 * version i+2. Append-only — never reorder, edit or remove entries, or old
 * files stop loading.
 */
export const MIGRATIONS: readonly NnvpMigration[] = [
  migrateV1toV2,
];

export const CURRENT_FORMAT_VERSION = MIGRATIONS.length + 1;

/** Thrown when a file declares a formatVersion newer than this build reads. */
export class FormatVersionError extends Error {
  constructor(fileVersion: number, supportedVersion: number) {
    super('This model was made with a newer version of NNVP '
      + `(format ${fileVersion}; this version reads up to ${supportedVersion}). `
      + 'Please reload the page to get the latest NNVP.');
    this.name = 'FormatVersionError';
  }
}

/**
 * Parse (if given a string) and migrate a model up to the current format,
 * applying the ladder in order from the file's version (absent ⇒ 1). Throws
 * FormatVersionError when the file comes from a NEWER format than this build
 * knows how to read. The returned model is stamped with the target version;
 * the input is never mutated. `migrations` is injectable so tests can
 * exercise the ladder mechanics — production callers always use the default.
 */
export function migrateModel(
  json: string | NnvpModel,
  migrations: readonly NnvpMigration[] = MIGRATIONS,
): NnvpModel {
  const parsed: NnvpModel = typeof json === 'string' ? JSON.parse(json) : json;
  const fileVersion = parsed.formatVersion ?? 1;
  const targetVersion = migrations.length + 1;
  if (fileVersion > targetVersion) throw new FormatVersionError(fileVersion, targetVersion);
  let model = parsed;
  for (let version = Math.max(fileVersion, 1); version < targetVersion; version += 1) {
    const step = migrations[version - 1];
    if (step) model = step(model);
  }
  return { ...model, formatVersion: targetVersion };
}
