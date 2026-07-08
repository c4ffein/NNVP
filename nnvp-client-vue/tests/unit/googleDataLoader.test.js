import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import Dataset from '../../src/lib/JSDatasets/google-data-loader';

// load() orchestration tests: sprite-request fan-out and progress accounting for
// both constructor forms (single sprite path string / array of sprite chunks).
// The actual sprite decoding needs Image + canvas, so it is stubbed out.

class StubDataset extends Dataset {
  constructor(...args) {
    super(...args);
    this.requests = [];
  }

  buildImgRequest(path, offset, nbElem, checksum) {
    this.requests.push({ path, offset, nbElem, checksum });
    return Promise.resolve();
  }
}

const SHAPE = [2, 2, 1];
const N_ELEMENTS = 10;
const N_TRAIN = 8;

const makeDataset = (spritePath, checksum) => new StubDataset(
  spritePath, checksum, SHAPE, 'labels.bin', null, 2, N_ELEMENTS, N_TRAIN,
);

let realFetch;
let fetchedLabelPaths;

beforeEach(() => {
  realFetch = globalThis.fetch;
  fetchedLabelPaths = [];
  globalThis.fetch = (path) => {
    fetchedLabelPaths.push(path);
    return Promise.resolve({
      ok: true,
      arrayBuffer: async () => new Uint8Array(N_ELEMENTS).buffer,
    });
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('Dataset.load progress accounting', () => {
  it('loads a single-string sprite path and never reports progress above 1', async () => {
    const dataset = makeDataset('sprite.png', 'sha-single');
    const progress = [];
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

  it('loads the multi-sprite array form with per-chunk checksums', async () => {
    const dataset = makeDataset(
      [[0, 6, 'part1.png'], [6, 4, 'part2.png']],
      ['sha-1', 'sha-2'],
    );
    const progress = [];
    await dataset.load(p => progress.push(p));

    expect(dataset.requests).toEqual([
      { path: 'part1.png', offset: 0, nbElem: 6, checksum: 'sha-1' },
      { path: 'part2.png', offset: 6, nbElem: 4, checksum: 'sha-2' },
    ]);
    expect(progress.length).toBe(3);
    expect(progress.every(p => p <= 1)).toBe(true);
    expect(progress[progress.length - 1]).toBe(1);
  });

  it('splits train/test images and labels after loading', async () => {
    const dataset = makeDataset('sprite.png', null);
    await dataset.load();

    const imageByteSize = SHAPE[0] * SHAPE[1] * SHAPE[2];
    expect(dataset.requests[0].checksum).toBe(null);
    expect(dataset.trainImages.length).toBe(N_TRAIN * imageByteSize);
    expect(dataset.testImages.length).toBe((N_ELEMENTS - N_TRAIN) * imageByteSize);
    expect(dataset.trainLabels.length).toBe(N_TRAIN);
    expect(dataset.testLabels.length).toBe(N_ELEMENTS - N_TRAIN);
  });
});
