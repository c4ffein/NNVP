<script lang="tsx">
import { defineComponent } from 'vue';
import type { ComponentPublicInstance, PropType, VNode } from 'vue';
import { clearCurrentProject } from '../lib/Backend/currentProject';

// import.meta.env is Vite-only (absent under bun/unit tests) — typed locally
// instead of pulling in vite/client types (same choice as BoardInterface.ts).
type ImportMetaWithEnv = ImportMeta & { env?: { VITE_ENABLE_BACKEND?: string } };

// Panel visibility flags owned by App.vue (the `views` prop).
interface ViewsState {
  left: boolean;
  right: boolean;
  training?: boolean;
  chat: boolean;
  chatAvailable: boolean;
}

// The menu tree: a leaf is an action (run with the component as `this` via
// levelNClickHandler's apply) or an [action, isDisabled] pair; a branch is a
// nested tree, or the name of a computed holding one (e.g. 'templatesMenu').
type MenuAction = (this: ComponentPublicInstance) => unknown;
type MenuEntry = MenuAction | [MenuAction, () => boolean] | MenuSubtree | string;
interface MenuSubtree { [label: string]: MenuEntry }

// Non-reactive instance field assigned outside data() (pure typing pass:
// keeping it out of data() preserves its non-reactive nature).
interface GeneralMenuInstanceExtra { templatesChangeHandler?: () => void }

// The render sticks the raw [title, content] entry on each top-level <li> as
// a plain `obj` attribute (kept as-is by this typing pass); teach Vue's JSX
// attribute types about it rather than dropping it.
declare module '@vue/runtime-dom' {
  interface LiHTMLAttributes { obj?: unknown }
}

export default defineComponent({
  name: 'GeneralMenu',
  components: {
  },
  render(h: unknown): VNode { // eslint-disable-line
    // Force reactivity by accessing refreshKey
    this.menuRefreshKey; // eslint-disable-line

    const generateMenu = (menu: MenuEntry, level: number): VNode | undefined => {
      if (typeof (menu) === 'string') menu = (this as unknown as Record<string, MenuSubtree | undefined>)[menu] || {}; // eslint-disable-line no-param-reassign
      if (typeof (menu) !== 'function' && !Array.isArray(menu)) {
        const rows = Object.entries(menu).map((entry, i) => {
          const itemKey = `${level}-${i}-${entry[0]}`;
          const isDisabled = this.isItemDisabled(entry[0], entry[1]);
          const hasSubmenu = typeof entry[1] === 'string'
            || (typeof entry[1] === 'object' && !Array.isArray(entry[1]));
          return (
            <li key={i}
              class={`menuItem GeneralMenu ${isDisabled ? 'disabled' : ''}`}
              role="menuitem"
              tabindex="0"
              aria-disabled={isDisabled ? 'true' : undefined}
              aria-haspopup={hasSubmenu ? 'true' : undefined}
              onClick={() => this.levelNClickHandler(entry[0], entry[1])}
              onKeydown={event => this.levelNKeyHandler(entry[0], entry[1], event)}
              onMouseover={event => this.levelNHoverHandler(entry[0], entry[1], event, level)}
            >
              <div class="GeneralMenu dropdown-item-content">
                {entry[0].replaceAll('_', ' ')}
              </div>
              {generateMenu(entry[1], level + 1)}
            </li>
          );
        });
        return (<ul class="dropdown-content GeneralMenu" role="menu">{rows}</ul>);
      }
      return undefined;
    };
    return (
      <ul id="GeneralMenu" class="GeneralMenu" role="menubar" aria-label="Main menu">
        { Object.entries(this.menuTree).map((object, i) => (
          <li class="menu GeneralMenu" obj={object} key={i} role="none">
            <div class="menuTitle GeneralMenu"
              role="menuitem"
              tabindex="0"
              aria-haspopup={typeof object[1] !== 'function' ? 'true' : undefined}
              onClick={event => this.level0ClickHandler(object[0], object[1], event)}
              onKeydown={event => this.level0KeyHandler(object[0], object[1], event)}
              onMouseover={event => this.level0HoverHandler(object[0], object[1], event)}
            >
              {object[0]}
            </div>
            {generateMenu(object[1], 1)}
          </li>
        )) }
      </ul>
    );
  },
  props: {
    // Visibility of the toggleable views, owned by App.vue: { left, right,
    // chat, chatAvailable }. Drives the ticks in the Panels menu.
    views: {
      type: Object as PropType<ViewsState>,
      default: (): ViewsState => ({
        left: true, right: true, chat: false, chatAvailable: false,
      }),
    },
  },
  data() {
    // Cloud accounts need a deployed backend at same-origin /api; builds
    // without VITE_ENABLE_BACKEND (e.g. a static-only deploy) hide every
    // account entry point (see also App.vue).
    return {
      backendEnabled: !!(import.meta as ImportMetaWithEnv).env?.VITE_ENABLE_BACKEND,
      activatedState: false,
      activatedChain: [] as HTMLElement[],
      undoStackContainer: this.$boardInterface.getUndoStackContainer(),
      redoStackContainer: this.$boardInterface.getRedoStackContainer(),
      templatesRefreshKey: 0,
      menuRefreshKey: 0,
    };
  },
  mounted() {
    const self = this as unknown as GeneralMenuInstanceExtra;
    // Subscribe to templates changes
    self.templatesChangeHandler = () => {
      this.templatesRefreshKey++;
      this.menuRefreshKey++; // Trigger menu re-render
    };
    this.$boardInterface.on('templates-changed', self.templatesChangeHandler);

    // Trigger initial refresh in case templates were loaded before this component mounted
    // (the board mounts before GeneralMenu, so the templates-changed event fires before we subscribe)
    this.templatesRefreshKey++;
    this.menuRefreshKey++;
  },
  beforeUnmount() {
    const self = this as unknown as GeneralMenuInstanceExtra;
    // Unsubscribe from events
    if (self.templatesChangeHandler) {
      this.$boardInterface.off('templates-changed', self.templatesChangeHandler);
    }
  },
  computed: {
    // The menu is computed (not data) so the Panels ticks re-render when App's
    // visibility state changes. Handlers run with the component as `this`
    // (levelNClickHandler applies them), so shorthand methods work as before.
    menuTree(): MenuSubtree {
      const { backendEnabled } = this;
      const tick = (shown?: boolean) => (shown ? '✓' : ' '); // figure space aligns labels
      return {
        File: {
          New() {
            clearCurrentProject(); // a fresh board starts a new save history
            this.$boardInterface.clearBoard();
          },
          // With a backend build, Load/Save open the cloud-aware modal (which
          // still offers plain device files); without one they go straight to
          // the device dialogs.
          Load() {
            if (backendEnabled) this.$emit('open-save-load', 'load');
            else this.$boardInterface.loadBoard();
          },
          Templates: 'templatesMenu',
          Save() {
            if (backendEnabled) this.$emit('open-save-load', 'save');
            else this.$boardInterface.saveBoard();
          },
          'Generate TF - Python': function generateTfPython() {
            this.$boardInterface.generatePythonInBrowser(this.$kerasInterface);
          },
          'Generate TF - JavaScript': function generateTfJavascript() {
            this.$boardInterface.generateJavascriptInBrowser(this.$kerasInterface);
          },
          Generate_PyTorch() {
            this.$boardInterface.generatePyTorchInBrowser(this.$kerasInterface);
          },
          Generate_Tinygrad() {
            this.$boardInterface.generateTinygradInBrowser(this.$kerasInterface);
          },
        },
        Edit: {
          Undo: [() => this.$boardInterface.undo(), () => (this.$boardInterface.getUndoStackContainer().e.length === 0)],
          Redo: [() => this.$boardInterface.redo(), () => (this.$boardInterface.getRedoStackContainer().e.length === 0)],
          Group() { this.$boardInterface.createGroup(); },
          Auto_layout() { this.$boardInterface.autoLayout(); },
        },
        Panels: {
          [`${tick(this.views.left)} Layer Catalog`]: () => this.$emit('toggle-view', 'showLeftPanel'),
          [`${tick(this.views.right)} Layer Options`]: () => this.$emit('toggle-view', 'showRightPanel'),
          [`${tick(this.views.training)} Training`]: () => this.$emit('toggle-view', 'training'),
          ...(this.views.chatAvailable ? {
            [`${tick(this.views.chat)} Chat`]: () => this.$emit('toggle-view', 'showChat'),
          } : {}),
        },
        // Settings and About moved off the menubar: the corner controls'
        // gear and ? buttons open them as tabs of the account panel.
        Tutorial: () => { this.$emit('open-tutorial'); },
      };
    },
    templatesMenu(): MenuSubtree {
      // Access refreshKey to trigger reactivity
      this.templatesRefreshKey; // eslint-disable-line
      const container = this.$boardInterface.getTemplatesContainer();
      if (container === undefined
        || container.e === undefined
        || container.e.length === 0) {
        return {};
      }
      return container.e
        .map((name): [string, MenuAction] => [name, () => this.$boardInterface.loadTemplate(name)])
        .reduce((p, c) => { p[c[0]] = c[1]; return p; }, {} as MenuSubtree); // eslint-disable-line
    },
  },
  methods: {
    level0ClickHandler(menuTitle: string, menuContent: MenuEntry, event: MouseEvent | KeyboardEvent) {
      event.stopPropagation();
      // Refresh menu state to update disabled items
      this.menuRefreshKey++;

      if (typeof (menuContent) === 'function') {
        this.deactivateChain();
        // Level-0 leaves are always arrows over the component (see menuTree),
        // so the bare call never actually relies on `this`.
        (menuContent as () => unknown)();
      } else if (this.$data.activatedState) {
        this.deactivateChain();
      } else {
        this.$data.activatedState = true;
        const menuElement = this.getMenuElement(event.target)!;
        this.$data.activatedChain = [menuElement];
        menuElement.classList.toggle('activated');
        document.body.addEventListener('click', this.clickElseWhere);
      }
    },
    clickElseWhere(event: MouseEvent) {
      const menuElement = document.getElementById('GeneralMenu');
      if (menuElement && menuElement.contains(event.target as Node | null)) return;
      this.deactivateChain();
      document.body.removeEventListener('click', this.clickElseWhere);
    },
    level0HoverHandler(menuTitle: string, menuContent: MenuEntry, event: MouseEvent) {
      if (typeof (menuContent) !== 'function') {
        if (this.$data.activatedState) {
          this.deactivateChain();
          const menuElement = this.getMenuElement(event.target)!;
          this.$data.activatedChain = [menuElement];
          this.$data.activatedState = true;
          menuElement.classList.toggle('activated');
          document.body.addEventListener('click', this.clickElseWhere);
        }
      }
    },
    level0KeyHandler(menuTitle: string, menuContent: MenuEntry, event: KeyboardEvent) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.level0ClickHandler(menuTitle, menuContent, event);
      }
    },
    levelNKeyHandler(menuTitle: string, menuContent: MenuEntry, event: KeyboardEvent) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.levelNClickHandler(menuTitle, menuContent);
      }
    },
    levelNClickHandler(menuTitle: string, menuContent: MenuEntry) {
      if (this.isItemDisabled(menuTitle, menuContent)) {
        return;
      }
      const content = Array.isArray(menuContent) ? menuContent[0] : menuContent;
      if (typeof (content) === 'function') {
        content.apply(this);
        this.deactivateChain();
      }
    },
    levelNHoverHandler(menuTitle: string, menuContent: MenuEntry, event: MouseEvent, level: number) {
      const { target } = event;
      const element = this.getMenuElement(target);
      if (element === undefined) {
        this.deactivateChain();
        return;
      }
      while (this.$data.activatedChain.length > level) {
        this.$data.activatedChain.pop()!.classList.remove('activated');
      }
      // Resolve string references (like 'templatesMenu') to actual menu objects
      let resolvedContent = menuContent;
      if (typeof (menuContent) === 'string') {
        resolvedContent = (this as unknown as Record<string, MenuSubtree | undefined>)[menuContent] || {};
      }
      if (typeof (resolvedContent) !== 'function' && !Array.isArray(resolvedContent)) {
        element.classList.add('activated');
        this.$data.activatedChain.push(element);
      }
      event.stopPropagation();
    },
    isItemDisabled(menuTitle: string, menuContent: MenuEntry): boolean {
      if (!Array.isArray(menuContent)) {
        return false;
      }
      return menuContent[1]();
    },
    deactivateChain() {
      for (let i = 0; i < this.$data.activatedChain.length; i += 1) {
        this.$data.activatedChain[i]!.classList.remove('activated');
      }
      this.$data.activatedState = false;
      this.$data.activatedChain = [];
    },
    getMenuElement(element: EventTarget | null): HTMLElement | undefined {
      // The original walked whatever the event handed it; a non-element target
      // would throw then as it would now — the cast preserves that behavior.
      let el = element as HTMLElement;
      while (el.classList.contains('GeneralMenu')) {
        if (el.classList.contains('menu') || el.classList.contains('menuItem')) {
          return el;
        }
        el = el.parentElement!;
      }
      return undefined;
    },
  },
});
</script>

<style>
#GeneralMenu {
  height: 100%;
  user-select: none;
  cursor: default;
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  font-size: 15px;
  box-sizing: border-box;
  overflow: visible;
  color: var(--text-primary);
  padding-left: 12px;  /* Add spacing for rounded corners */
}
.GeneralMenu {
  padding: 0;
  margin: 0;
  list-style: none;
  color: var(--text-primary);
}
/* The bar is a centered fit-content pill (see App.vue .general-menu): flex
   sizes it to its items and neutralizes the legacy floats. */
#GeneralMenu {
  display: flex;
  align-items: stretch;
  height: 100%;
  white-space: nowrap;
}
.theme-icon {
  display: block;
}
#GeneralMenu > .menu {
  float:left;
  height: 100%;
  overflow: visible;
  position: relative;
}
.menuTitle {
  display: flex;
  align-items: center;
  padding: 0px 10px 0px 10px;
  box-sizing: border-box;
  height: 100%;
  width: 100%;
  position: relative;
  transition: transform 0.15s ease;
}

.menuTitle:hover {
  transform: translate(1px, -1px);
  cursor: pointer;
}
.menuTitle:focus-visible,
.dropdown-content .menuItem:focus-visible {
  outline: 2px solid #000000;
  outline-offset: -2px;
}
#GeneralMenu .dropdown-content {
  display: none;
  position: absolute;
  background-color: var(--bg-elevated);
  min-width: 180px;
  box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
  z-index: 1000;
  border-radius: 3px;
  box-sizing: border-box;
}
#GeneralMenu .activated > .dropdown-content {
  display: block;
}
.dropdown-content .menuItem {
 position: relative;
 color: var(--text-primary);
 padding: 2px 10px;
 text-decoration: none;
 display: block;
 text-align: left;
 margin: 2px 2px 2px 2px;
 border-radius: 2px;
 transition: transform 0.15s ease;
}

.dropdown-content .menuItem:not(.disabled):hover {
  transform: translate(1px, -1px);
  cursor: pointer;
}
.dropdown-content .menuItem.disabled {
  color: var(--text-muted);
  opacity: 0.45;
  cursor: default;
}
.dropdown-item-content {
  position: relative;
}
#GeneralMenu .menuItem > .dropdown-content {
  left: 100%;
  top: 0;
}
</style>
