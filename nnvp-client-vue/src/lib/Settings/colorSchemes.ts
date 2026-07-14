// The activation color ramps, defined ONCE as piecewise-linear RGB stops and
// projected to every consumer: CSS colors for the 2D inspect overlays
// (drawInspection), a generated WGSL function for the 3D view (renderer), and
// a CSS gradient for the settings preview swatches.

export type ColorSchemeId = 'coolwarm' | 'viridis';

export interface ColorScheme {
  id: ColorSchemeId;
  label: string;
  /** Shown in the settings; says who this ramp is for. */
  description: string;
  /** Evenly spaced RGB stops, channels 0..1, inactive → active. */
  stops: ReadonlyArray<readonly [number, number, number]>;
}

export const COLOR_SCHEMES: Record<ColorSchemeId, ColorScheme> = {
  coolwarm: {
    id: 'coolwarm',
    label: 'Coolwarm (blue → red)',
    description: 'Cold blue to hot red through light gray (Moreland). The red end can read washed-out with red-blindness.',
    stops: [
      [0.23, 0.30, 0.75],
      [0.87, 0.87, 0.87],
      [0.71, 0.02, 0.15],
    ],
  },
  viridis: {
    id: 'viridis',
    label: 'Viridis (blue → yellow)',
    description: 'Perceptually uniform and colorblind-safe; the standard scientific ramp.',
    stops: [
      [0.267, 0.005, 0.329],
      [0.229, 0.322, 0.545],
      [0.128, 0.567, 0.551],
      [0.369, 0.789, 0.383],
      [0.993, 0.906, 0.144],
    ],
  },
};

export const DEFAULT_COLOR_SCHEME: ColorSchemeId = 'coolwarm';

export function colorSchemeOrDefault(id: unknown): ColorScheme {
  return COLOR_SCHEMES[id as ColorSchemeId] ?? COLOR_SCHEMES[DEFAULT_COLOR_SCHEME];
}

/** Piecewise-linear ramp sample; v clamped to 0..1. Channels 0..1. */
export function rampColor(scheme: ColorScheme, v: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, v));
  const t = clamped * (scheme.stops.length - 1);
  const index = Math.min(Math.floor(t), scheme.stops.length - 2);
  const from = scheme.stops[index]!;
  const to = scheme.stops[index + 1]!;
  const local = t - index;
  return [
    from[0] + (to[0] - from[0]) * local,
    from[1] + (to[1] - from[1]) * local,
    from[2] + (to[2] - from[2]) * local,
  ];
}

/** CSS color for a 0..1 intensity — the 2D overlays' pixel color. */
export function rampCss(scheme: ColorScheme, v: number): string {
  const [r, g, b] = rampColor(scheme, v).map(channel => Math.round(channel * 255));
  return `rgb(${r}, ${g}, ${b})`;
}

/** CSS linear-gradient over the whole ramp — the settings preview swatch. */
export function rampGradientCss(scheme: ColorScheme): string {
  const steps = scheme.stops.map((_, index) => rampCss(scheme, index / (scheme.stops.length - 1)));
  return `linear-gradient(to right, ${steps.join(', ')})`;
}

/**
 * WGSL `fn ramp(a : f32) -> vec3<f32>` sampling the same stops — injected
 * into the neuron shader (renderer.neuronWgsl) so 2D and 3D always agree.
 */
export function rampWgsl(scheme: ColorScheme): string {
  const count = scheme.stops.length;
  const stops = scheme.stops
    .map(stop => `vec3<f32>(${stop.map(channel => channel.toFixed(4)).join(', ')})`)
    .join(', ');
  return `fn ramp(a : f32) -> vec3<f32> {
  var stops = array<vec3<f32>, ${count}>(${stops});
  let t = clamp(a, 0.0, 1.0) * ${(count - 1).toFixed(1)};
  let i = min(u32(t), ${count - 2}u);
  return mix(stops[i], stops[i + 1u], t - f32(i));
}`;
}
