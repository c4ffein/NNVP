/**
 * Suite auto-discovery: imports every suite in tests/suites for its
 * registration side effect (appTest/logicTest/e2eOnly push into the
 * define.ts registry at import time), replacing the old hand-listed
 * tests/suites/index.ts manifest — whose failure mode was SILENT zero
 * coverage when a new file wasn't listed.
 *
 * Convention: a suite is any single-extension `<name>.ts` directly in
 * tests/suites. Double-extension files (`*.diff.ts` review companions,
 * `*.skip.ts`, …) and `index.ts` are artifacts, not suites. Files import in
 * sorted order so the registry is deterministic across machines.
 *
 * The discovery is its own guard: a matching file that registers ZERO tests
 * throws by name — a suite can no longer be silently empty, and a file can
 * no longer be forgotten.
 */
import { readdirSync } from 'node:fs';
import { getRegistry } from './define';

export async function discoverSuites(): Promise<string[]> {
  const dir = new URL('../suites/', import.meta.url);
  const files = readdirSync(dir)
    .filter(name => name.endsWith('.ts')
      && !name.slice(0, -'.ts'.length).includes('.')
      && name !== 'index.ts')
    .sort();
  for (const name of files) {
    const before = getRegistry().length;
    await import(new URL(name, dir).href);
    if (getRegistry().length === before) {
      throw new Error(
        `discoverSuites: tests/suites/${name} registered no tests — a suite `
        + 'must call appTest/logicTest/e2eOnly at import time (rename '
        + 'non-suite artifacts to a double extension, e.g. *.notes.ts).',
      );
    }
  }
  return files;
}
