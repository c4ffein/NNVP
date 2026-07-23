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
    const wrapper = mount(TutorialMenu, { props: { show: true } });
    const items = wrapper.findAll('.tutorial-menu-item');
    expect(items.length).toBeGreaterThan(0);
    await items[0]!.trigger('click');
    expect(wrapper.emitted('start')).toBeTruthy();
  });
});
