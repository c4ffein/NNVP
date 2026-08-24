import { describe, it, expect } from 'bun:test';
import { mount } from '@vue/test-utils';
import GeneralMenu from '../../src/components/GeneralMenu.vue';
import LayerCatalog from '../../src/components/LayerCatalog/LayerCatalog.vue';
import {
  EXPORT_MENU_LABELS, HELP_MODAL_ASK_SELECTOR, HELP_MODAL_CONCEPT_SELECTOR,
} from './uiLabels';

// The fast half guards the slow half's assumptions (see uiLabels.ts): these
// mounts run in the bun suite, so a menu rename or a driver-selector
// collision fails here in seconds instead of only in CI's Playwright job.

const fakeBoardInterface = {
  on() {}, off() {},
  getTemplatesContainer: () => ({ e: [] as string[] }),
  getUndoStackContainer: () => ({ e: [] as unknown[] }),
  getRedoStackContainer: () => ({ e: [] as unknown[] }),
  setLeftBarRemountCallback() {},
};

describe('UI contract between the worlds', () => {
  it('the Export menu carries every label the e2e suites click', () => {
    const wrapper = mount(GeneralMenu, {
      props: {
        views: {
          left: true, right: true, training: false, chat: false,
          chatAvailable: false, viz3d: false, models: false,
        },
      },
      global: { mocks: { $boardInterface: fakeBoardInterface } },
    });
    const menuTree = (wrapper.vm as unknown as {
      menuTree: Record<string, Record<string, unknown>>;
    }).menuTree;
    expect(menuTree.Export).toBeDefined();
    const exportLabels = Object.keys(menuTree.Export!);
    for (const label of Object.values(EXPORT_MENU_LABELS)) {
      expect(exportLabels).toContain(label);
    }
    wrapper.unmount();
  });

  it('the help modal keeps the ask selector unique (concept link stays distinct)', async () => {
    const wrapper = mount(LayerCatalog, {
      attachTo: document.body,
      global: {
        mocks: {
          $boardInterface: fakeBoardInterface,
          // The catalog reads categories at render; one real-shaped entry is
          // enough to open the help modal for a mapped layer type.
          $kerasInterface: { getCategories: () => ({}) },
        },
      },
    });
    // Open the shared help modal for a layer that has BOTH buttons: a help
    // entry (ask row) and a concept mapping (concept row).
    (wrapper.vm as unknown as { helpLayerType: string | null }).helpLayerType = 'Conv2D';
    await wrapper.vm.$nextTick();
    // The modal teleports to body — assert against the document.
    const asks = document.querySelectorAll(HELP_MODAL_ASK_SELECTOR);
    const concepts = document.querySelectorAll(HELP_MODAL_CONCEPT_SELECTOR);
    expect(concepts.length).toBe(1); // the concept link renders...
    expect(asks.length).toBeLessThanOrEqual(1); // ...the ask row is backend-
    // gated (0 or 1 are legal), and the concept link must NEVER also match
    // the ask selector — that exact collision once redirected the drivers'
    // ask click into the book and broke the whole chat e2e family.
    expect(concepts[0]!.matches(HELP_MODAL_ASK_SELECTOR)).toBe(false);
    wrapper.unmount();
  });
});
