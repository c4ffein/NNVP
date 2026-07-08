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
export function quoteString(value) {
  return JSON.stringify(String(value));
}

// Identifiers (layer type names, parameter names) end up unquoted in the
// generated code — as `tf.layers.<name>`, Python kwargs, or attribute names —
// so they cannot be escaped, only validated.
export function assertSafeIdentifier(name, what = 'identifier') {
  if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe ${what} in model: ${JSON.stringify(name)}`);
  }
  return name;
}

// Node ids are used as variable-name suffixes (layer_<id>); real models use
// numeric ids, so anything outside [A-Za-z0-9_] means a tampered file.
export function assertSafeIdSuffix(id) {
  const asString = String(id);
  if (!/^[A-Za-z0-9_]+$/.test(asString)) {
    throw new Error(`Unsafe node id in model: ${JSON.stringify(asString)}`);
  }
  return asString;
}
