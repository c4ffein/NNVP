/**
 * Dataset source URL construction (pure data). Migrated from
 * tests/unit/datasets-sources.test.js into the dual registry as logicTest.
 */
import { logicTest } from '../harness/define';
import loadableDatasets from '../../src/lib/JSDatasets/datasets-sources';
import type { DatasetSourceConfig } from '../../src/lib/JSDatasets/datasets-sources';

// datasets-sources exports (cdnDir) => ({ NAME: [config, description, ...], ... }).
// The default cdnDir (see TrainingZone.vue) ends with a trailing slash, so every
// per-dataset path must be relative (no leading slash) to avoid emitting a "//"
// in the URL — strict CDNs/object stores treat "datasets//cifar10" as a distinct,
// missing path.
const CDN_DIR = 'https://datasets.nnvp.io/datasets/';

// Collect every fully-qualified URL a dataset config references.
function urlsForDataset(config: DatasetSourceConfig): string[] {
  const urls: string[] = [];
  if (Array.isArray(config.imagesSpritePath)) {
    for (const entry of config.imagesSpritePath) {
      // entries are [offset, count, url]
      urls.push(entry[entry.length - 1] as string);
    }
  }
  if (typeof config.labelsPath === 'string') urls.push(config.labelsPath);
  return urls;
}

// Strip the scheme so the "//" check only looks at the path portion.
function pathAfterScheme(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

const datasets = loadableDatasets(CDN_DIR);

logicTest('datasets-sources: defines the expected datasets, each with a config and a description', ({ expect }) => {
  expect(Object.keys(datasets).sort()).toEqual(['CIFAR10', 'FashionMNIST', 'MNIST']);
  for (const [name, entry] of Object.entries(datasets)) {
    expect(Array.isArray(entry), `${name} entry is a tuple`).toBe(true);
    expect(typeof entry[0], `${name} has a config object`).toBe('object');
    expect(typeof entry[1], `${name} has a description string`).toBe('string');
    expect(entry[1].length, `${name} description is non-empty`).toBeGreaterThan(0);
  }
});

logicTest('datasets-sources: builds well-formed URLs with no double slash after the scheme', ({ expect }) => {
  for (const [name, entry] of Object.entries(datasets)) {
    for (const url of urlsForDataset(entry[0])) {
      expect(url.startsWith(CDN_DIR), `${name}: ${url} should start with the CDN dir`).toBe(true);
      expect(
        pathAfterScheme(url).includes('//'),
        `${name}: ${url} must not contain a double slash`,
      ).toBe(false);
    }
  }
});

logicTest('datasets-sources: references each dataset under its own directory', ({ expect }) => {
  const dirByName = { MNIST: 'mnist/', FashionMNIST: 'fashion_mnist/', CIFAR10: 'cifar10/' };
  for (const [name, dir] of Object.entries(dirByName)) {
    for (const url of urlsForDataset(datasets[name]![0])) {
      expect(url.includes(dir), `${name}: ${url} should live under ${dir}`).toBe(true);
    }
  }
});
