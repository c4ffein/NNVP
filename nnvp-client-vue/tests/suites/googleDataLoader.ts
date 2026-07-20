/**
 * Dataset.load orchestration (stubbed sprite decoding + fetch). Migrated from
 * tests/unit/googleDataLoader.test.js into the dual registry as logicTest. The
 * beforeEach/afterEach fetch swap became withFakeFetch(), restoring the real
 * fetch in a finally.
 */
import { logicTest } from '../harness/define';
import Dataset from '../../src/lib/JSDatasets/google-data-loader';
import type { SpriteEntry } from '../../src/lib/JSDatasets/datasets-sources';

// load() orchestration tests: sprite-request fan-out and progress accounting for
// both constructor forms (single sprite path string / array of sprite chunks).
// The actual sprite decoding needs Image + canvas, so it is stubbed out.

interface RecordedRequest {
  path: string;
  offset: number;
  nbElem: number;
  checksum: string | null;
}

class StubDataset extends Dataset {
  requests: RecordedRequest[];

  constructor(...args: ConstructorParameters<typeof Dataset>) {
    super(...args);
    this.requests = [];
  }

  override buildImgRequest(path: string, offset: number, nbElem: number, checksum: string | null): Promise<void> {
    this.requests.push({ path, offset, nbElem, checksum });
    return Promise.resolve();
  }
}

const SHAPE: [number, number, number] = [2, 2, 1];
const N_ELEMENTS = 10;
const N_TRAIN = 8;

const makeDataset = (spritePath: string | SpriteEntry[], checksum: string | string[] | null) => new StubDataset(
  spritePath, checksum, SHAPE, 'labels.bin', null, 2, N_ELEMENTS, N_TRAIN,
);

// Former beforeEach/afterEach: swap globalThis.fetch for a label-serving stub
// for the duration of the test, recording the requested label paths.
async function withFakeFetch(fn: (fetchedLabelPaths: string[]) => Promise<void>): Promise<void> {
  const realFetch = globalThis.fetch;
  const fetchedLabelPaths: string[] = [];
  // Deliberately partial Response fake — only what Dataset.load reads.
  globalThis.fetch = ((path: string) => {
    fetchedLabelPaths.push(path);
    return Promise.resolve({
      ok: true,
      arrayBuffer: async () => new Uint8Array(N_ELEMENTS).buffer,
    });
  }) as unknown as typeof fetch;
  try {
    await fn(fetchedLabelPaths);
  } finally {
    globalThis.fetch = realFetch;
  }
}

logicTest('googleDataLoader: loads a single-string sprite path and never reports progress above 1', async ({ expect }) => {
  await withFakeFetch(async (fetchedLabelPaths) => {
    const dataset = makeDataset('sprite.png', 'sha-single');
    const progress: number[] = [];
    await dataset.load(p => progress.push(p));

    expect(dataset.requests).toEqual([
      { path: 'sprite.png', offset: 0, nbElem: N_ELEMENTS, checksum: 'sha-single' },
    ]);
    // One sprite + the labels request -> two increments, ending exactly at 1.
    expect(progress.length).toBe(2);
    expect(progress.every(p => p <= 1)).toBe(true);
    expect(progress[progress.length - 1]).toBe(1);
    expect(fetchedLabelPaths).toEqual(['labels.bin']);
  });
});

logicTest('googleDataLoader: loads the multi-sprite array form with per-chunk checksums', async ({ expect }) => {
  await withFakeFetch(async () => {
    const dataset = makeDataset(
      [[0, 6, 'part1.png'], [6, 4, 'part2.png']],
      ['sha-1', 'sha-2'],
    );
    const progress: number[] = [];
    await dataset.load(p => progress.push(p));

    expect(dataset.requests).toEqual([
      { path: 'part1.png', offset: 0, nbElem: 6, checksum: 'sha-1' },
      { path: 'part2.png', offset: 6, nbElem: 4, checksum: 'sha-2' },
    ]);
    expect(progress.length).toBe(3);
    expect(progress.every(p => p <= 1)).toBe(true);
    expect(progress[progress.length - 1]).toBe(1);
  });
});

logicTest('googleDataLoader: splits train/test images and labels after loading', async ({ expect }) => {
  await withFakeFetch(async () => {
    const dataset = makeDataset('sprite.png', null);
    await dataset.load();

    const imageByteSize = SHAPE[0] * SHAPE[1] * SHAPE[2];
    expect(dataset.requests[0]!.checksum).toBe(null);
    expect(dataset.trainImages.length).toBe(N_TRAIN * imageByteSize);
    expect(dataset.testImages.length).toBe((N_ELEMENTS - N_TRAIN) * imageByteSize);
    expect(dataset.trainLabels.length).toBe(N_TRAIN);
    expect(dataset.testLabels.length).toBe(N_ELEMENTS - N_TRAIN);
  });
});
