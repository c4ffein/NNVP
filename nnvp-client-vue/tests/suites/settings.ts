/**
 * Per-device settings (lib/Settings): the storage-injectable store and the
 * shared activation color ramps every consumer projects from (2D overlays'
 * CSS colors, the 3D shader's generated WGSL, the settings swatches).
 */
import { logicTest } from '../harness/define';
import { Settings, SETTINGS_DEFAULTS } from '../../src/lib/Settings/settings';
import {
  COLOR_SCHEMES, colorSchemeOrDefault, rampColor, rampCss, rampGradientCss, rampWgsl,
} from '../../src/lib/Settings/colorSchemes';
import { heatColor } from '../../src/lib/Inspector/drawInspection';
import type { StorageLike } from '../../src/lib/Backend/apiClient';

// Minimal StorageLike stub (same injection seam as apiClient/currentProject).
function makeStorage(initial: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    getItem: key => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    map,
  };
}

logicTest('settings: defaults, persistence and corrupted-storage fallback', ({ expect }) => {
  const storage = makeStorage();
  const fresh = new Settings(storage);
  expect(fresh.get('colorScheme')).toBe(SETTINGS_DEFAULTS.colorScheme);
  expect(fresh.get('viz3dIntroSeen')).toBe(false);
  fresh.set('colorScheme', 'viridis');
  fresh.set('viz3dIntroSeen', true);
  // A new instance over the same storage sees the persisted values.
  const reloaded = new Settings(storage);
  expect(reloaded.get('colorScheme')).toBe('viridis');
  expect(reloaded.get('viz3dIntroSeen')).toBe(true);
  // Corrupted JSON falls back to the defaults instead of throwing.
  const corrupted = new Settings(makeStorage({ nnvp_settings: '{oops' }));
  expect(corrupted.get('colorScheme')).toBe(SETTINGS_DEFAULTS.colorScheme);
  // No storage at all still works for the session.
  const memoryOnly = new Settings(null);
  memoryOnly.set('colorScheme', 'viridis');
  expect(memoryOnly.get('colorScheme')).toBe('viridis');
});

logicTest('settings: change listeners fire on real changes only, off unsubscribes', ({ expect }) => {
  const store = new Settings(makeStorage());
  let calls = 0;
  const listener = () => { calls += 1; };
  store.onChange(listener);
  store.set('colorScheme', 'viridis');
  expect(calls).toBe(1);
  store.set('colorScheme', 'viridis'); // no-op: same value
  expect(calls).toBe(1);
  store.offChange(listener);
  store.set('colorScheme', 'coolwarm');
  expect(calls).toBe(1);
});

logicTest('color schemes: ramps hit their stops, clamp, and stay distinct', ({ expect }) => {
  const coolwarm = COLOR_SCHEMES.coolwarm;
  const viridis = COLOR_SCHEMES.viridis;
  const expectRgbCloseTo = (actual: readonly number[], expected: readonly number[]) => {
    expect(actual.length).toBe(3);
    actual.forEach((channel, i) => expect(channel).toBeCloseTo(expected[i]!, 10));
  };
  // Endpoints are the first/last stops; out-of-range clamps to them.
  expectRgbCloseTo(rampColor(coolwarm, 0), coolwarm.stops[0]!);
  expectRgbCloseTo(rampColor(coolwarm, 1), coolwarm.stops[2]!);
  expectRgbCloseTo(rampColor(coolwarm, -5), coolwarm.stops[0]!);
  expectRgbCloseTo(rampColor(viridis, 99), viridis.stops[4]!);
  // Coolwarm midpoint is the light-gray hinge.
  expectRgbCloseTo(rampColor(coolwarm, 0.5), coolwarm.stops[1]!);
  // The two ramps genuinely differ (blue→red vs blue→yellow at the hot end).
  const [redR, , redB] = rampColor(coolwarm, 1);
  const [yelR, yelG] = rampColor(viridis, 1);
  expect(redR).toBeGreaterThan(redB);
  expect(yelG).toBeGreaterThan(0.8);
  expect(yelR).toBeGreaterThan(0.8);
  // Unknown ids fall back to the default scheme.
  expect(colorSchemeOrDefault('nope').id).toBe('coolwarm');
  expect(colorSchemeOrDefault('viridis').id).toBe('viridis');
});

logicTest('color schemes: CSS, gradient and WGSL projections agree with the stops', ({ expect }) => {
  const viridis = COLOR_SCHEMES.viridis;
  expect(rampCss(viridis, 1)).toBe('rgb(253, 231, 37)');
  expect(rampGradientCss(viridis).startsWith('linear-gradient(to right, rgb(68, 1, 84)')).toBe(true);
  const wgsl = rampWgsl(viridis);
  expect(wgsl.includes('fn ramp(a : f32) -> vec3<f32>')).toBe(true);
  expect(wgsl.includes(`array<vec3<f32>, ${viridis.stops.length}>`)).toBe(true);
  expect(wgsl.includes('vec3<f32>(0.9930, 0.9060, 0.1440)')).toBe(true);
  // heatColor projects the scheme it is given (the singleton only supplies
  // the default), so the 2D overlays follow the settings.
  expect(heatColor(1, 'viridis')).toBe('rgb(253, 231, 37)');
  expect(heatColor(1, 'coolwarm')).toBe('rgb(181, 5, 38)');
  expect(heatColor(1, 'coolwarm')).not.toBe(heatColor(1, 'viridis'));
});
