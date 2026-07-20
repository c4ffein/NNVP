// Minimal ambient types for bun's built-in modules, declaring ONLY what the
// harness touches. bun-types is deliberately NOT a dependency — same policy
// as the module-scoped `declare const Bun` in
// src/lib/TinygradRuntime/py/check_runner.ts. Grow as needed, never
// speculatively.

declare module 'bun' {
  export interface OnLoadArgs {
    path: string;
  }
  export interface OnLoadResult {
    contents: string;
    loader: string;
  }
  export interface PluginBuilder {
    onLoad(
      constraints: { filter: RegExp },
      callback: (args: OnLoadArgs) => OnLoadResult | Promise<OnLoadResult>,
    ): void;
  }
  export function plugin(def: { name: string; setup(build: PluginBuilder): void }): void;
}

declare module 'bun:test' {
  export function describe(label: string, body: () => void): void;
  export function beforeAll(body: () => void | Promise<void>): void;
  export function it(
    label: string,
    body: () => void | Promise<void>,
    timeoutMs?: number,
  ): void;
  // bun's expect satisfies the runner-agnostic assertion seam (see define.ts).
  export const expect: import('./define').Expect;
}
