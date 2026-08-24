/**
 * The UI contract the browser-world tests depend on — labels and selectors
 * that exist only as strings on the Playwright side and would otherwise rot
 * silently when the UI moves (it happened: the Phase G1 menu split renamed
 * the generate entries and 10 e2e tests clicked ghosts for three weeks).
 *
 * Both sides import THIS module: the e2e suites / browser drivers consume the
 * strings, and uiContract.test.ts mounts the real components under bun and
 * asserts every entry is honored — so a rename or a selector collision fails
 * in the fast half, not in CI's slow half.
 */

/** Export-menu entries (GeneralMenu.vue menuTree.Export keys). */
export const EXPORT_MENU_LABELS = {
  python: 'Python (Keras)',
  javascript: 'JavaScript (tfjs)',
  pytorch: 'PyTorch',
  tinygrad: 'tinygrad',
  nnvp: 'Model (.nnvp)',
} as const;

/**
 * Selectors the browser world CLICKS by class. Each must match exactly ONE
 * element in its rendered context — a second element sharing the class
 * silently redirects the click (it happened: the help modal's concept link
 * once shadowed `.layer-help-ask` and broke the whole chat family).
 */
export const HELP_MODAL_ASK_SELECTOR = '.layer-help-ask';
export const HELP_MODAL_CONCEPT_SELECTOR = '.layer-help-concept';
