import { describe, it, expect } from 'bun:test';
import { mount } from '@vue/test-utils';
import AccountPanel from '../../src/components/Account/AccountPanel.vue';
import TutorialMenu from '../../src/components/Tutorial/TutorialMenu.vue';

// Smoke tests for tests/harness/vue-loader.ts (the bun .vue loader): real SFCs
// mount under bun + happy-dom, render their templates, react to props and emit.
describe('vue single-file components under bun', () => {
  it('mounts AccountPanel and reacts to props', async () => {
    const wrapper = mount(AccountPanel, {
      props: { show: true },
      global: { mocks: { $boardInterface: {} } },
    });
    expect(wrapper.find('#account-modal-title').exists()).toBe(true);
    await wrapper.setProps({ show: false });
    expect(wrapper.find('#account-modal-title').exists()).toBe(false);
    wrapper.unmount();
  });

  it('mounts TutorialMenu and emits start on item click', async () => {
    // Seed a started course so the book card is undimmed and emits directly
    // (the fresh-user interstitial is covered by the e2e suite).
    localStorage.setItem('nnvp-tutorial-progress',
      JSON.stringify({ welcome: { furthestStep: 1, completed: false } }));
    const wrapper = mount(TutorialMenu, { props: { show: true } });
    // The first .tutorial-menu-item is the Concepts-book card; chapters follow.
    const chapters = wrapper.findAll('.tutorial-menu-item:not(.concepts-book-link)');
    expect(chapters.length).toBeGreaterThan(0);
    await chapters[0]!.trigger('click');
    expect(wrapper.emitted('start')).toBeTruthy();
    await wrapper.find('.concepts-book-link').trigger('click');
    expect(wrapper.emitted('open-concepts')).toBeTruthy();
    localStorage.removeItem('nnvp-tutorial-progress');
  });
});
