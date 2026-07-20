// Minimal SFC module shim so TS entry points (main.ts) can import .vue files.
// Every SFC is one generically-typed component to plain tsc; real per-SFC
// types would come from vue-tsc, which checks .vue contents itself.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<object, object, any>;
  export default component;
}
