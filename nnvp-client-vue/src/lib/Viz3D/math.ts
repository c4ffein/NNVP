// Pure 3D math for the experimental Viz3D view: vec3/mat4 helpers and the
// orbit-camera state machine. No DOM, no WebGPU — everything here runs (and
// is tested) under bun. Matrices are COLUMN-MAJOR, matching WGSL's
// mat4x4<f32> memory layout, with WebGPU clip-space depth in [0, 1].

export type Vec3 = [number, number, number];

/** Column-major 4x4: element (row r, col c) lives at index c * 4 + r. */
export type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

// --- vec3 ---------------------------------------------------------------------

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vec3Scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function vec3Length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

/** Normalizes a; a zero vector stays zero instead of going NaN. */
export function vec3Normalize(a: Vec3): Vec3 {
  const len = vec3Length(a);
  return len === 0 ? [0, 0, 0] : vec3Scale(a, 1 / len);
}

// --- mat4 ---------------------------------------------------------------------

export function mat4Identity(): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

/** Matrix product a · b (apply b first, then a), both column-major. */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = Array.from({ length: 16 }, () => 0);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] = (a[r] ?? 0) * (b[c * 4] ?? 0)
        + (a[4 + r] ?? 0) * (b[c * 4 + 1] ?? 0)
        + (a[8 + r] ?? 0) * (b[c * 4 + 2] ?? 0)
        + (a[12 + r] ?? 0) * (b[c * 4 + 3] ?? 0);
    }
  }
  return out as Mat4;
}

/**
 * Right-handed perspective projection with WebGPU's [0, 1] clip-space depth
 * (NOT OpenGL's [-1, 1]). fovY in radians.
 */
export function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far / (near - far), -1,
    0, 0, (near * far) / (near - far), 0,
  ];
}

/** Right-handed view matrix: camera at eye looking at target, up ~ +y. */
export function mat4LookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const zAxis = vec3Normalize(vec3Sub(eye, target));
  const xAxis = vec3Normalize(vec3Cross(up, zAxis));
  const yAxis = vec3Cross(zAxis, xAxis);
  return [
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -vec3Dot(xAxis, eye), -vec3Dot(yAxis, eye), -vec3Dot(zAxis, eye), 1,
  ];
}

/**
 * Inverse of a rigid transform (rotation + translation only): transposes the
 * rotation block and counter-rotates the translation. NOT valid for scaled
 * or projective matrices.
 */
export function mat4InvertRigid(m: Mat4): Mat4 {
  const tx = m[12];
  const ty = m[13];
  const tz = m[14];
  return [
    m[0], m[4], m[8], 0,
    m[1], m[5], m[9], 0,
    m[2], m[6], m[10], 0,
    -(m[0] * tx + m[1] * ty + m[2] * tz),
    -(m[4] * tx + m[5] * ty + m[6] * tz),
    -(m[8] * tx + m[9] * ty + m[10] * tz),
    1,
  ];
}

/** Transforms a point (w = 1) and applies the perspective divide when w ≠ 1. */
export function mat4TransformPoint(m: Mat4, p: Vec3): Vec3 {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  if (w === 0 || w === 1) return [x, y, z];
  return [x / w, y / w, z / w];
}

// --- orbit camera ---------------------------------------------------------------

export interface OrbitState {
  /** Rotation around +y, radians. 0 puts the eye on the +z side of target. */
  yaw: number;
  /** Elevation, radians, clamped to ±ORBIT_PITCH_LIMIT (never the poles). */
  pitch: number;
  distance: number;
  target: Vec3;
}

export const ORBIT_PITCH_LIMIT = Math.PI / 2 - 0.05;
export const ORBIT_MIN_DISTANCE = 1;
export const ORBIT_MAX_DISTANCE = 2000;
export const ORBIT_DRAG_SENSITIVITY = 0.008; // radians per pixel
export const ORBIT_ZOOM_SENSITIVITY = 0.0015; // exponent per wheel-delta unit

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createOrbitState(overrides: Partial<OrbitState> = {}): OrbitState {
  return {
    yaw: 0.6,
    pitch: 0.35,
    distance: 60,
    target: [0, 0, 0],
    ...overrides,
    ...(overrides.target ? { target: [...overrides.target] as Vec3 } : {}),
  };
}

export function orbitEye(state: OrbitState): Vec3 {
  const cp = Math.cos(state.pitch);
  return vec3Add(state.target, [
    state.distance * cp * Math.sin(state.yaw),
    state.distance * Math.sin(state.pitch),
    state.distance * cp * Math.cos(state.yaw),
  ]);
}

export function orbitViewMatrix(state: OrbitState): Mat4 {
  return mat4LookAt(orbitEye(state), state.target, [0, 1, 0]);
}

/** Pointer-drag orbit: dx/dy in pixels. Returns a NEW state, pitch clamped. */
export function applyOrbitDrag(
  state: OrbitState, dx: number, dy: number, sensitivity: number = ORBIT_DRAG_SENSITIVITY,
): OrbitState {
  return {
    ...state,
    yaw: state.yaw - dx * sensitivity,
    pitch: clamp(state.pitch + dy * sensitivity, -ORBIT_PITCH_LIMIT, ORBIT_PITCH_LIMIT),
  };
}

/** Wheel zoom: multiplicative on distance so it feels uniform, clamped. */
export function applyOrbitZoom(
  state: OrbitState, deltaY: number, sensitivity: number = ORBIT_ZOOM_SENSITIVITY,
): OrbitState {
  return {
    ...state,
    distance: clamp(
      state.distance * Math.exp(deltaY * sensitivity),
      ORBIT_MIN_DISTANCE, ORBIT_MAX_DISTANCE,
    ),
  };
}

export const ORBIT_PAN_SENSITIVITY = 0.0015; // fraction of distance per pixel

/**
 * Shift-drag pan: slide the orbit TARGET in the camera plane, grab-the-world
 * style (dragging right moves the scene right, i.e. the target left; dragging
 * down moves the target up — screen y grows downward). Speed scales with the
 * distance so a pan covers a comparable fraction of the view at any zoom.
 */
export function applyOrbitPan(
  state: OrbitState, dx: number, dy: number, sensitivity: number = ORBIT_PAN_SENSITIVITY,
): OrbitState {
  // Camera right/up in world space = rows of the view rotation (column-major).
  const view = orbitViewMatrix(state);
  const right: Vec3 = [view[0]!, view[4]!, view[8]!];
  const up: Vec3 = [view[1]!, view[5]!, view[9]!];
  const k = state.distance * sensitivity;
  return {
    ...state,
    target: [
      state.target[0] - right[0] * dx * k + up[0] * dy * k,
      state.target[1] - right[1] * dx * k + up[1] * dy * k,
      state.target[2] - right[2] * dx * k + up[2] * dy * k,
    ],
  };
}
