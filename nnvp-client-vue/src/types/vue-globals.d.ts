// App-level globalProperties (installed in main.ts) as seen from `this` in
// components — without this augmentation every lang="ts" SFC would fail on
// this.$boardInterface & co.
import type KerasInterface from '../lib/KerasInterface/KerasInterface';
import type BoardInterface from '../lib/BoardInterface/BoardInterface';
import type KeyboardListener from '../lib/KeyboardListener/KeyboardListener';

declare module 'vue' {
  interface ComponentCustomProperties {
    $kerasInterface: KerasInterface;
    $boardInterface: BoardInterface;
    $keyboardListener: KeyboardListener;
  }
}

export {};
