<script>
export default {
  name: 'TopBar',
  render(h) { // eslint-disable-line
    const generateMenu = (menu, level) => {
      if (typeof (menu) !== 'function' && !Array.isArray(menu)) {
        const rows = Object.entries(menu).map((entry, i) => (
          <li key={i}
            class={`menuItem TopBar ${this.isItemDisabled(entry[0], entry[1]) ? 'disabled' : ''}`}
            onClick={() => this.levelNClickHandler(entry[0], entry[1])}
            onMouseover={event => this.levelNHoverHandler(entry[0], entry[1], event, level)}
          >
            <div class="TopBar">{entry[0]}</div>
            {generateMenu(entry[1], level + 1)}
          </li>
        ));
        return (<ul class="dropdown-content TopBar">{rows}</ul>);
      }
      return undefined;
    };
    return (
      <ul id="TopBar" class="TopBar">
        { Object.entries(this.$data.menu).map((object, i) => (
          <li class="menu TopBar" obj={object} key={i}>
            <div class="menuTitle TopBar"
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
          OpenRecent: {
            template1: () => { },
            template2: () => { },
            template3: () => { },
          },
          Save() { this.$d3Interface.saveBoard(); },
          // TODO : if connected to backend, should call
          // generatePythonOnBackend('/api/generate') instead
          Generate() { this.$d3Interface.generatePythonInBrowser(this.$kerasInterface); },
        },
        Edit: {
          Undo: [() => this.$d3Interface.undo(), () => (this.undoStackContainer.e.length === 0)],
          Redo: [() => this.$d3Interface.redo(), () => (this.redoStackContainer.e.length === 0)],
          Group() { this.$d3Interface.createGroup(); },
        },
        Help: () => { },
      },
      activatedState: false,
      activatedChain: [],
      undoStackContainer: this.$d3Interface.getUndoStackContainer(),
      redoStackContainer: this.$d3Interface.getRedoStackContainer(),
    };
  },
  methods: {
    level0ClickHandler(menuTitle, menuContent, event) {
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
      if (event.target.classList.contains('TopBar')) return;
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
      if (typeof (menuContent) !== 'function' && !Array.isArray(menuContent)) {
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
      while (el.classList.contains('TopBar')) {
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
#TopBar {
  height: 100%;
  user-select: none;
  font-family: "Roboto Thin";
  font-size: 15px;
  box-sizing: border-box;
  border-bottom: 1px solid #cccccc;
  overflow: hidden;
}
.TopBar {
  padding: 0;
  margin: 0;
  list-style: none;
}
#TopBar > .menu {
  float:left;
  height: 100%;
  overflow: hidden;
}
.menu:hover, .menuItem:hover, .activated {
  background-color: rgba(100, 100, 100, 0.15);
}
.menuTitle {
  display: flex;
  align-items: center;
  padding: 0px 5px 0px 5px;
  box-sizing: border-box;
  height: 100%;
  width: 100%;
}
#TopBar .dropdown-content {
  display: none;
  position: absolute;
  background-color: #f9f9f9;
  min-width: 180px;
  box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
  z-index: 1;
  border-radius: 3px;
  box-sizing: border-box;
}
#TopBar .activated > .dropdown-content {
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
.menuItem.disabled {
  color: grey;
}
#TopBar .menuItem > .dropdown-content {
  left: 100%;
  top: 0;
}
</style>
