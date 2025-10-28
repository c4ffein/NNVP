<script lang="jsx">
export default {
  name: 'GeneralMenu',
  render(h) { // eslint-disable-line
    // Force reactivity by accessing refreshKey
    this.menuRefreshKey; // eslint-disable-line

    const generateMenu = (menu, level) => {
      if (typeof (menu) === 'string') menu = this[menu] || {}; // eslint-disable-line no-param-reassign
      if (typeof (menu) !== 'function' && !Array.isArray(menu)) {
        const rows = Object.entries(menu).map((entry, i) => (
          <li key={i}
            class={`menuItem GeneralMenu ${this.isItemDisabled(entry[0], entry[1]) ? 'disabled' : ''}`}
            onClick={() => this.levelNClickHandler(entry[0], entry[1])}
            onMouseover={event => this.levelNHoverHandler(entry[0], entry[1], event, level)}
          >
            <div class="GeneralMenu">{entry[0].replace('_', ' ')}</div>
            {generateMenu(entry[1], level + 1)}
          </li>
        ));
        return (<ul class="dropdown-content GeneralMenu">{rows}</ul>);
      }
      return undefined;
    };
    return (
      <ul id="GeneralMenu" class="GeneralMenu">
        { Object.entries(this.$data.menu).map((object, i) => (
          <li class="menu GeneralMenu" obj={object} key={i}>
            <div class="menuTitle GeneralMenu"
              onClick={event => this.level0ClickHandler(object[0], object[1], event)}
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
  data() {
    return {
      menu: {
        File: {
          New() { this.$d3Interface.clearBoard(); },
          Load() { this.$d3Interface.loadBoard(); },
          Templates: 'templatesMenu',
          Save() { this.$d3Interface.saveBoard(); },
          Generate() { this.$d3Interface.generatePythonInBrowser(this.$kerasInterface); },
          Generate_Javascript() {
            this.$d3Interface.generateJavascriptInBrowser(this.$kerasInterface);
          },
        },
        Edit: {
          Undo: [() => this.$d3Interface.undo(), () => (this.$d3Interface.getUndoStackContainer().e.length === 0)],
          Redo: [() => this.$d3Interface.redo(), () => (this.$d3Interface.getRedoStackContainer().e.length === 0)],
          Group() { this.$d3Interface.createGroup(); },
        },
        Training: () => { this.$emit('open-trainer'); },
        About: () => { this.$emit('open-about'); },
      },
      activatedState: false,
      activatedChain: [],
      undoStackContainer: this.$d3Interface.getUndoStackContainer(),
      redoStackContainer: this.$d3Interface.getRedoStackContainer(),
      templatesRefreshKey: 0,
      menuRefreshKey: 0,
    };
  },
  mounted() {
    // Subscribe to templates changes
    this.templatesChangeHandler = () => {
      this.templatesRefreshKey++;
      this.menuRefreshKey++; // Trigger menu re-render
    };
    this.$d3Interface.on('templates-changed', this.templatesChangeHandler);

    // Trigger initial refresh in case templates were loaded before this component mounted
    // (WhiteBoard mounts before GeneralMenu, so the templates-changed event fires before we subscribe)
    this.templatesRefreshKey++;
    this.menuRefreshKey++;
  },
  beforeUnmount() {
    // Unsubscribe from events
    if (this.templatesChangeHandler) {
      this.$d3Interface.off('templates-changed', this.templatesChangeHandler);
    }
  },
  computed: {
    templatesMenu() {
      // Access refreshKey to trigger reactivity
      this.templatesRefreshKey; // eslint-disable-line
      const container = this.$d3Interface.getTemplatesContainer();
      if (container === undefined
        || container.e === undefined
        || container.e.length === 0) {
        return {};
      }
      return container.e
        .map(name => [name, () => this.$d3Interface.loadTemplate(name)])
        .reduce((p, c) => { p[c[0]] = c[1]; return p; }, {}); // eslint-disable-line
    },
  },
  methods: {
    level0ClickHandler(menuTitle, menuContent, event) {
      event.stopPropagation();
      // Refresh menu state to update disabled items
      this.menuRefreshKey++;

      if (typeof (menuContent) === 'function') {
        this.deactivateChain();
        menuContent();
      } else if (this.$data.activatedState) {
        this.deactivateChain();
      } else {
        this.$data.activatedState = true;
        const menuElement = this.getMenuElement(event.target);
        this.$data.activatedChain = [menuElement];
        menuElement.classList.toggle('activated');
        document.body.addEventListener('click', this.clickElseWhere);
      }
    },
    clickElseWhere(event) {
      const menuElement = document.getElementById('GeneralMenu');
      if (menuElement && menuElement.contains(event.target)) return;
      this.deactivateChain();
      document.body.removeEventListener('click', this.clickElseWhere);
    },
    level0HoverHandler(menuTitle, menuContent, event) {
      if (typeof (menuContent) !== 'function') {
        if (this.$data.activatedState) {
          this.deactivateChain();
          const menuElement = this.getMenuElement(event.target);
          this.$data.activatedChain = [menuElement];
          this.$data.activatedState = true;
          menuElement.classList.toggle('activated');
          document.body.addEventListener('click', this.clickElseWhere);
        }
      }
    },
    levelNClickHandler(menuTitle, menuContent) {
      if (this.isItemDisabled(menuTitle, menuContent)) {
        return;
      }
      const content = Array.isArray(menuContent) ? menuContent[0] : menuContent;
      if (typeof (content) === 'function') {
        content.apply(this);
        this.deactivateChain();
      }
    },
    levelNHoverHandler(menuTitle, menuContent, event, level) {
      const { target } = event;
      const element = this.getMenuElement(target);
      if (element === undefined) {
        this.deactivateChain();
        return;
      }
      while (this.$data.activatedChain.length > level) {
        this.$data.activatedChain.pop().classList.remove('activated');
      }
      // Resolve string references (like 'templatesMenu') to actual menu objects
      let resolvedContent = menuContent;
      if (typeof (menuContent) === 'string') {
        resolvedContent = this[menuContent] || {};
      }
      if (typeof (resolvedContent) !== 'function' && !Array.isArray(resolvedContent)) {
        element.classList.add('activated');
        this.$data.activatedChain.push(element);
      }
      event.stopPropagation();
    },
    isItemDisabled(menuTitle, menuContent) {
      if (!Array.isArray(menuContent)) {
        return false;
      }
      return menuContent[1]();
    },
    deactivateChain() {
      for (let i = 0; i < this.$data.activatedChain.length; i += 1) {
        this.$data.activatedChain[i].classList.remove('activated');
      }
      this.$data.activatedState = false;
      this.$data.activatedChain = [];
    },
    getMenuElement(element) {
      let el = element;
      while (el.classList.contains('GeneralMenu')) {
        if (el.classList.contains('menu') || el.classList.contains('menuItem')) {
          return el;
        }
        el = el.parentElement;
      }
      return undefined;
    },
  },
};
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
  color: #000000;
  padding-left: 12px;  /* Add spacing for rounded corners */
}
.GeneralMenu {
  padding: 0;
  margin: 0;
  list-style: none;
  color: #000000;
}
#GeneralMenu > .menu {
  float:left;
  height: 100%;
  overflow: visible;
  position: relative;
}
/* Remove old hover background, use underline instead */
.menuItem:hover, .activated {
  background-color: rgba(100, 100, 100, 0.15);
}
.menuTitle {
  display: flex;
  align-items: center;
  padding: 0px 10px 0px 10px;
  box-sizing: border-box;
  height: 100%;
  width: 100%;
  position: relative;
}
/* Animated underline for top-level menu items */
.menu .menuTitle::after {
  content: '';
  position: absolute;
  bottom: 4px;
  left: 10px;
  right: 10px;
  height: 2px;
  background-color: #000000;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.2s ease-out;
}
.menu:hover .menuTitle::after {
  transform: scaleX(1);
}
#GeneralMenu .dropdown-content {
  display: none;
  position: absolute;
  background-color: #f9f9f9;
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
 color: black;
 padding: 2px 10px;
 text-decoration: none;
 display: block;
 text-align: left;
 margin: 2px 2px 2px 2px;
 border-radius: 2px;
 transition: 0.2s;
}
.dropdown-content .menuItem.disabled {
  color: #999999;
  opacity: 0.5;
  cursor: not-allowed;
}
#GeneralMenu .menuItem > .dropdown-content {
  left: 100%;
  top: 0;
}
</style>
