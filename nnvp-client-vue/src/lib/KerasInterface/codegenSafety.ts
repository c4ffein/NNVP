// Shared escaping / validation for the code generators.
//
// Everything the generators interpolate into source code ultimately comes from
// the model graph, which can be loaded from a user-provided .nnvp file (or set
// through the assistant's set_param tool). The generated JavaScript is eval'd
// by the Training zone, so an unescaped string parameter would let a crafted
// file execute arbitrary code in the browser; the generated Python is "only"
// downloaded, but deserves the same treatment. Each generator must therefore
// pass strings through quoteString() and identifiers through the assert
// helpers instead of raw template interpolation.

// A JSON string literal is valid source in both JavaScript and Python
// (double-quoted, with `"`, `\`, and control characters escaped), so one
// quoting function serves every generator.
export function quoteString(value: unknown): string {
  return JSON.stringify(String(value));
}

// Identifiers (layer type names, parameter names) end up unquoted in the
// generated code — as `tf.layers.<name>`, Python kwargs, or attribute names —
// so they cannot be escaped, only validated.
export function assertSafeIdentifier(name: unknown, what = 'identifier'): string {
  if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe ${what} in model: ${JSON.stringify(name)}`);
  }
  return name;
}

// Pattern validity is necessary but not sufficient: `Dense_pwned` is a fine
// identifier and a hostile layer name. The generators therefore also check
// MEMBERSHIP for names whose truth set they know (layer names against the
// merged catalog, parameter names against the layer's catalog parameters).
// The truth set arrives as a predicate so this module stays dependency-light
// (no catalog import here — see catalogMembership.ts).
export function assertKnownIdentifier(
  name: unknown,
  what: string,
  isKnown: (name: string) => boolean,
): string {
  const identifier = assertSafeIdentifier(name, what);
  if (!isKnown(identifier)) {
    throw new Error(`Unknown ${what} in model: ${JSON.stringify(identifier)}`);
  }
  return identifier;
}

// Small integer counts interpolated into generated code (e.g. the feedback
// loop's `range(k)`): must be an actual small positive integer — anything
// else in the file is either corruption or an injection attempt.
export function assertSafeCount(value: unknown, what: string, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`Unsafe ${what} in model: ${JSON.stringify(value)} (expected an integer in [1, ${max}])`);
  }
  return value;
}

// Node ids are used as variable-name suffixes (layer_<id>); real models use
// numeric ids, so anything outside [A-Za-z0-9_] means a tampered file.
export function assertSafeIdSuffix(id: unknown): string {
  const asString = String(id);
  if (!/^[A-Za-z0-9_]+$/.test(asString)) {
    throw new Error(`Unsafe node id in model: ${JSON.stringify(asString)}`);
  }
  return asString;
}
