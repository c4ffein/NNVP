import { describe, it, expect } from 'bun:test';
import { mount } from '@vue/test-utils';
import AboutModal from '../../src/components/AboutModal.vue';
import TutorialMenu from '../../src/components/Tutorial/TutorialMenu.vue';

// Smoke tests for tests/vue-loader.js (the bun .vue loader): real SFCs mount
// under bun + happy-dom, render their templates, react to props and emit.
describe('vue single-file components under bun', () => {
  it('mounts AboutModal and reacts to props', async () => {
    const wrapper = mount(AboutModal, { props: { show: true } });
    expect(wrapper.find('#about-modal-title').text()).toBe('NNVP');
    await wrapper.setProps({ show: false });
    expect(wrapper.find('#about-modal-title').exists()).toBe(false);
  });

  it('mounts TutorialMenu and emits start on item click', async () => {
    const wrapper = mount(TutorialMenu, { props: { show: true } });
    const items = wrapper.findAll('.tutorial-menu-item');
    expect(items.length).toBeGreaterThan(0);
    await items[0].trigger('click');
    expect(wrapper.emitted('start')).toBeTruthy();
  });
});
