<script lang="tsx">
import { defineComponent } from 'vue';
import type { ComponentPublicInstance, PropType, VNode } from 'vue';
import { clearCurrentProject } from '../lib/Backend/currentProject';

// import.meta.env is Vite-only (absent under bun/unit tests) — typed locally
// instead of pulling in vite/client types (same choice as BoardInterface.ts).
type ImportMetaWithEnv = ImportMeta & { env?: { VITE_ENABLE_BACKEND?: string; DEV?: boolean } };

// Panel visibility flags owned by App.vue (the `views` prop).
interface ViewsState {
  left: boolean;
  right: boolean;
  training?: boolean;
  chat: boolean;
  chatAvailable: boolean;
  viz3d?: boolean;
  models?: boolean;
}

// The menu tree: a leaf is an action (run with the component as `this` via
// levelNClickHandler's apply) or an [action, isDisabled] pair; a branch is a
// nested tree, or the name of a computed holding one (e.g. 'templatesMenu').
type MenuAction = (this: ComponentPublicInstance) => unknown;
type MenuEntry = MenuAction | [MenuAction, () => boolean] | MenuSubtree | string;
interface MenuSubtree { [label: string]: MenuEntry }

// Non-reactive instance fields assigned outside data() (pure typing pass:
// keeping them out of data() preserves their non-reactive nature).
// `hoverSwitchedTo`: the title the LAST hover-switch opened — the click that
// carried the pointer there must not toggle it straight back closed.
interface GeneralMenuInstanceExtra {
  templatesChangeHandler?: () => void;
  hoverSwitchedTo?: HTMLElement | null;
}

// The dev-only Debug menu's tree key. Its TITLE renders as a drawn bug icon
// (same stroke language as the corner controls — an emoji here depends on
// the platform's emoji fonts and breaks the menubar's look).
const DEBUG_MENU_KEY = '🐞';
const bugIcon = () => (
  <svg class="menu-title-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <ellipse cx="12" cy="14" rx="5.5" ry="6.5"/>
      <path d="M12 7.5v13"/>
      <path d="M9.5 4.5 8 2.5M14.5 4.5 16 2.5"/>
      <path d="M6.5 11H3M6.5 15H3M7.5 18.5 4.5 21M17.5 11H21M17.5 15H21M16.5 18.5 19.5 21"/>
    </g>
  </svg>
);

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
          // Keys starting with an em dash are separators (values ignored) —
          // object keys must be unique, hence '—1', '—2', … (Phase G1).
          if (entry[0].startsWith('—')) {
            return (<li key={i} class="menuSeparator GeneralMenu" role="separator"></li>);
          }
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
              aria-label={object[0] === DEBUG_MENU_KEY ? 'Debug' : undefined}
              aria-haspopup={typeof object[1] !== 'function' ? 'true' : undefined}
              onClick={event => this.level0ClickHandler(object[0], object[1], event)}
              onKeydown={event => this.level0KeyHandler(object[0], object[1], event)}
              onMouseover={event => this.level0HoverHandler(object[0], object[1], event)}
            >
              {object[0] === DEBUG_MENU_KEY ? bugIcon() : object[0]}
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
          // Phase G2: Save is a CHECKPOINT (a graph.checkpoint event pinning
          // this state into the model's history) — deduped by identity, so an
          // unchanged board appends nothing. The .nnvp download moved to
          // Export; cloud Projects keep their modal under Projects….
          Save() {
            void this.$boardInterface.checkpoint();
          },
          ...(backendEnabled ? {
            'Projects…': function openProjects() {
              this.$emit('open-save-load', 'save');
            },
          } : {}),
        },
        // Code generation got its own menu (Phase G1): File is document
        // operations, Export is outputs — and the target list will grow.
        Export: {
          'Python (Keras)': function exportPython() {
            this.$boardInterface.generatePythonInBrowser(this.$kerasInterface);
          },
          'JavaScript (tfjs)': function exportJavascript() {
            this.$boardInterface.generateJavascriptInBrowser(this.$kerasInterface);
          },
          PyTorch() {
            this.$boardInterface.generatePyTorchInBrowser(this.$kerasInterface);
          },
          tinygrad() {
            this.$boardInterface.generateTinygradInBrowser(this.$kerasInterface);
          },
          '—1': '—',
          'Model (.nnvp)': function exportNnvp() {
            this.$boardInterface.saveBoard();
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
          [`${tick(this.views.viz3d)} 3D View`]: () => this.$emit('toggle-view', 'showViz3D'),
          [`${tick(this.views.models)} Models`]: () => this.$emit('toggle-view', 'showModels'),
          ...(this.views.chatAvailable ? {
            [`${tick(this.views.chat)} Chat`]: () => this.$emit('toggle-view', 'showChat'),
          } : {}),
        },
        // Settings and About moved off the menubar: the corner controls'
        // gear and ? buttons open them as tabs of the account panel.
        Tutorial: () => { this.$emit('open-tutorial'); },
        // Dev builds only (like window.nnvp.debug): UX-at-scale probes. The
        // seed is localOnly + content-addressed + 'debug-seed'-tagged, so it
        // never syncs, re-seeding appends nothing, and removal is exact.
        // Dynamic imports on purpose: DEV is statically false in prod builds,
        // so the whole seeder chunk drops out of the bundle — absent, not
        // merely hidden.
        ...((import.meta as ImportMetaWithEnv).env?.DEV ? {
          [DEBUG_MENU_KEY]: {
            'Seed a month of history': async () => {
              const { seedMonthOfHistory } = await import('../lib/Debug/monthOfUse');
              const { appended, total } = await seedMonthOfHistory();
              window.alert(`Debug seed: ${appended} of ${total} events appended `
                + '(0 appended = already seeded). See History and the Models window.');
            },
            'Remove seeded history': async () => {
              const { removeSeededHistory } = await import('../lib/Debug/monthOfUse');
              window.alert(`Debug seed: removed ${await removeSeededHistory()} events.`);
            },
          },
        } : {}),
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
        // Switching menus by CLICK: the hover that carried the pointer here
        // already opened this title (level0HoverHandler) — closing it now
        // would make every menu-to-menu click read as a dead click. Only a
        // second, deliberate click on the same title closes.
        const self = this as unknown as GeneralMenuInstanceExtra;
        const menuElement = this.getMenuElement(event.target);
        if (menuElement && self.hoverSwitchedTo === menuElement) {
          self.hoverSwitchedTo = null; // consumed: the next click closes
        } else {
          this.deactivateChain();
        }
      } else {
        // Guarded: an unresolvable target must never half-open the menu
        // state (that wedge is what killed the whole bar).
        const menuElement = this.getMenuElement(event.target);
        if (!menuElement) return;
        this.$data.activatedState = true;
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
          const menuElement = this.getMenuElement(event.target);
          if (!menuElement) return;
          const alreadyOpen = this.$data.activatedChain[0] === menuElement;
          this.deactivateChain();
          this.$data.activatedChain = [menuElement];
          this.$data.activatedState = true;
          menuElement.classList.toggle('activated');
          document.body.addEventListener('click', this.clickElseWhere);
          // Remember the switch so the incoming click doesn't toggle it
          // closed (re-entering the already-open title is not a switch).
          (this as unknown as GeneralMenuInstanceExtra).hoverSwitchedTo = alreadyOpen ? null : menuElement;
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
      // closest() instead of the historical parent-walk: a click on the
      // Debug title lands on the icon's SVG internals, which carry none of
      // the GeneralMenu classes the walk required — it returned undefined
      // and the caller's `.classList` blew up, wedging the whole menubar.
      // closest() crosses the svg→div boundary and needs no per-node class.
      if (!(element instanceof Element)) return undefined;
      return (element.closest('.menu.GeneralMenu, .menuItem.GeneralMenu') as HTMLElement | null)
        ?? undefined;
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

.menu-title-icon {
  vertical-align: -2px;
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
.menuSeparator {
  border-top: 1px solid var(--panel-border);
  margin: 4px 8px;
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
