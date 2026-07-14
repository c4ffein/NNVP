// Save-format versioning for the .nnvp model JSON.
//
// Every load entry point funnels through adapter.nnvpToFlow, which calls
// migrateModel; every save funnels through adapter.flowToNnvp, which stamps
// `formatVersion: CURRENT_FORMAT_VERSION`. A model with no `formatVersion` is
// version 1 — everything that exists in the wild today (D3-era saves, the
// shipped BoardTemplates), whose keys (`"class":"D3Layer"`, `d3-layer-*`, ...)
// must remain readable forever.

import type { NnvpModel } from '../../types/model';

/** One migration step: rewrites a version-N model into a version-N+1 model. */
export type NnvpMigration = (model: NnvpModel) => NnvpModel;

/**
 * The ordered migration ladder: MIGRATIONS[i] takes a version i+1 model to
 * version i+2. Append-only — never reorder, edit or remove entries, or old
 * files stop loading. Empty today: the current format IS version 1.
 */
export const MIGRATIONS: readonly NnvpMigration[] = [];

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
