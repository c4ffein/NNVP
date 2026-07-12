<template>
  <div class="LayerCatalog" :key="reloadKey">
    <!-- Sticky toolbar: search + collapse-all stay visible while the list
         scrolls underneath. -->
    <div class="search-container">
      <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5"/>
        <path d="M11 11L14.5 14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <input id="layerSearchBox" v-model="searchBox" placeholder="Search" type="search" aria-label="Search layers">
      <button
        type="button"
        class="collapse-all-button"
        :aria-label="allCollapsed ? 'Expand all categories' : 'Collapse all categories'"
        :title="allCollapsed ? 'Expand all categories' : 'Collapse all categories'"
        @click="toggleAllCategories"
      ><span class="collapse-all-arrow" :class="{ collapsed: allCollapsed }" aria-hidden="true">▲</span></button>
    </div>
    <div
      v-for="(layers, categoryName) in $kerasInterface.getCategories()"
      v-bind:key="categoryName.id"
      v-bind:id="divId(categoryName)"
      class="layerCategory"
    >
      <div
        class="title"
        role="button"
        tabindex="0"
        :aria-label="'Toggle ' + categoryName + ' layers'"
        v-on:click="toggleCategory(divId(categoryName))"
        v-on:keydown.enter.prevent="toggleCategory(divId(categoryName))"
        v-on:keydown.space.prevent="toggleCategory(divId(categoryName))"
        v-if="layersNotEmptyAfterSearch(layers, categoryName)"
      >
        <div class="text">{{ categoryName }}</div>
        <button
          v-if="categoryHelpHtmlFor(categoryName)"
          type="button"
          class="help-icon category-help"
          :aria-label="'Learn about the ' + categoryName + ' category'"
          @click.stop="helpCategory = categoryName"
          @keydown.enter.stop
          @keydown.space.stop
        >?</button>
        <div class="arrow" aria-hidden="true">▲</div>
      </div>
      <div class="layerList">
        <LayerTemplate
          v-for="(layerContent, layerName) in filteredSearchList(layers)"
          v-bind:layerName="layerName" v-bind:layerContent="layerContent"
          :key="layerName.id" :id="'layer-template-' + layerName"
          @show-help="helpLayerType = $event"
        />
      </div>
    </div>

    <!-- One shared help modal for the whole catalog (layers AND categories;
         same styling/content family as the right panel's help in ParamsBlock). -->
    <Teleport to="body">
      <Transition name="modal">
      <div v-if="helpLayerType || helpCategory" class="layer-help-modal-overlay" @click="closeHelp">
        <div
          class="layer-help-modal-container"
          role="dialog"
          aria-modal="true"
          :aria-label="(helpLayerType || helpCategory) + ' help'"
          @click.stop
        >
          <button class="layer-help-modal-close" aria-label="Close" @click="closeHelp">&times;</button>
          <div class="layer-help-modal-body">
            <div v-html="helpHtml"></div>
          </div>
          <div v-if="backendEnabled" class="layer-help-ask-row">
            <button type="button" class="layer-help-ask" @click="askInChat">
              💬 Ask the assistant about {{ helpLayerType || helpCategory }}
            </button>
          </div>
        </div>
      </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script>
import LayerTemplate from './LayerTemplate.vue';
import layerHelp from '../../lib/KerasInterface/layerHelp';
import categoryHelp from '../../lib/KerasInterface/categoryHelp';
import { askAssistant } from '../../lib/Assistant/askAssistant';

export default {
  name: 'LayerCatalog',
  components: {
    LayerTemplate,
  },
  computed: {
    helpHtml() {
      if (this.helpCategory) return categoryHelp[this.helpCategory] || '';
      if (!this.helpLayerType) return '';
      return layerHelp[this.helpLayerType] || `
        <h2>${this.helpLayerType}</h2>
        <p>This is a ${this.helpLayerType} layer. Documentation coming soon!</p>
        <p>Check the <a href="https://keras.io/api/layers/" target="_blank">Keras documentation</a> for more details.</p>
      `;
    },
  },
  methods: {
    toggleCategory(categoryDiv) {
      document.getElementById(categoryDiv).classList.toggle('closed');
      this.refreshAllCollapsed();
    },
    divId: categoryName => `category_${categoryName.replace(' ', '_')}`,
    categoryHelpHtmlFor: categoryName => categoryHelp[categoryName] || '',
    closeHelp() {
      this.helpLayerType = null;
      this.helpCategory = null;
    },
    // Hand the topic over to the chat widget (which opens and seeds the
    // conversation) and get the modal out of its way.
    askInChat() {
      askAssistant(this.helpLayerType || this.helpCategory);
      this.closeHelp();
    },
    // The open/closed state lives in the DOM (classList), so the master
    // button's state is recomputed from it: as soon as ANY category is open,
    // the arrow flips back to "collapse all" — one click always re-closes.
    refreshAllCollapsed() {
      const categories = [...this.$el.querySelectorAll('.layerCategory')];
      this.allCollapsed = categories.length > 0
        && categories.every((el) => el.classList.contains('closed'));
    },
    toggleAllCategories() {
      const collapse = !this.allCollapsed;
      this.$el.querySelectorAll('.layerCategory').forEach((el) => {
        el.classList.toggle('closed', collapse);
      });
      this.allCollapsed = collapse;
    },
    inSearch(layer) {
      if (this.$data.searchBox === '') {
        return true;
      }
      const searchStrings = this.$data.searchBox.split(' ');
      for (let i = 0; i < searchStrings.length; i += 1) {
        const searchString = searchStrings[i].toLowerCase();
        for (let j = 0; j < layer.searchTerms.length; j += 1) {
          if (layer.searchTerms[j].toLowerCase().includes(searchString)) {
            return true;
          }
        }
      }
      return false;
    },
    filteredSearchList(layers) {
      const result = {};
      const layersEntries = Object.entries(layers);
      for (let i = 0; i < layersEntries.length; i += 1) {
        const layerContent = layersEntries[i][1];
        if (this.inSearch(layerContent)) {
          const layerName = layersEntries[i][0];
          result[layerName] = layerContent;
        }
      }
      return result;
    },
    layersNotEmptyAfterSearch(layers) {
      const layerArray = Object.values(layers);
      for (let i = 0; i < layerArray.length; i += 1) {
        if (this.inSearch(layerArray[i])) {
          return true;
        }
      }
      return false;
    },
    remount() {
      this.reloadKey += 1;
    },
  },
  data: () => ({
    searchBox: '',
    reloadKey: 0,
    helpLayerType: null,
    helpCategory: null,
    allCollapsed: false,
    // The ask-the-assistant handoff only exists where the chat does (same
    // gate as App.vue's ChatBubble mount).
    backendEnabled: !!import.meta.env.VITE_ENABLE_BACKEND,
  }),
  mounted() {
    this.$d3Interface.setLeftBarRemountCallback(this.remount);
    this.handleEscape = (event) => {
      if (event.key === 'Escape' && (this.helpLayerType || this.helpCategory)) this.closeHelp();
    };
    document.addEventListener('keydown', this.handleEscape);
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.handleEscape);
  },
};
</script>

<style>
@font-face {
  font-family: var(--font-medium); font-weight: var(--font-weight-medium);
  src: url("/assets/fonts/Roboto-Regular-webfont.woff") format("woff");
}
@font-face {
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  src: url("/assets/fonts/Roboto-Thin-webfont.woff") format("woff");
}
.LayerCatalog {
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  font-size: 15px;
  user-select: none;
  -webkit-user-select: none;
  color: var(--text-primary);
}
.search-container {
  /* Stays pinned while the layer list scrolls under it. */
  position: sticky;
  top: 0;
  z-index: 2;
  width: 100%;
  background-color: var(--bg-panel);
  display: flex;
  align-items: center;
}
.collapse-all-button {
  flex: none;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1;
  padding: 8px 12px 8px 4px;
  cursor: pointer;
}
.collapse-all-button:hover { color: var(--text-primary); }
.collapse-all-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  border-radius: 4px;
}
/* Same triangle glyph as the category rows: pointing down while expanded
   (click to collapse), left once collapsed. */
.collapse-all-arrow {
  display: inline-block;
  transform: rotate(180deg);
  transition: transform 0.15s ease;
}
.collapse-all-arrow.collapsed {
  transform: rotate(-90deg);
}
.search-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: var(--text-muted);
  pointer-events: none;
}
#layerSearchBox {
  background-color: transparent;
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  border: none;
  color: var(--text-primary);
  padding: 14px 16px 14px 44px;
  font-family: var(--font-regular);
  font-weight: var(--font-weight-medium);
  font-size: 14px;
}
#layerSearchBox:focus {
  outline: none;
}
#layerSearchBox::placeholder {
  color: var(--text-muted);
}
.LayerCatalog > .layerCategory > .title {
  background-color: transparent;
  overflow: hidden;
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas: "arrow text help";
  align-items: center;
  border-top: 1px solid var(--panel-border);
  border-left: 1px solid var(--panel-border);
  border-right: 1px solid var(--panel-border);
  border-radius: 15px 15px 0 0;
  font-weight: var(--font-weight-medium);
  position: relative;
  margin-left: -1px;
  margin-right: -1px;
}
.LayerCatalog > .layerCategory > .title > .text {
  grid-area: text;
  text-align: left;
  padding: 8px 12px;
  color: var(--text-primary);
  transition: transform 0.15s ease;
}

.LayerCatalog > .layerCategory > .title:hover > .text {
  transform: translate(1px, -1px);
  cursor: pointer;
}
.LayerCatalog > .layerCategory > .title:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.LayerCatalog > .layerCategory > .title > .arrow {
  color: var(--text-muted);
  grid-area: arrow;
  height: 15px;
  width: 15px;
  transform: rotate(180deg) translateY(-10%);
  vertical-align: middle;
  text-align: center;
  padding: 8px;
  font-size: 10px;
}
.LayerCatalog > .layerCategory.closed > .title > .arrow {
  transform: rotate(90deg) translateY(-10%);
}
/* The category (?) sits at the right end of the title row, visible on hover
   or focus (same behavior as the per-layer help dots). */
.LayerCatalog > .layerCategory > .title > .category-help {
  grid-area: help;
  margin-right: 8px;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.LayerCatalog > .layerCategory > .title:hover > .category-help,
.LayerCatalog > .layerCategory > .title:focus-visible > .category-help,
.LayerCatalog > .layerCategory > .title > .category-help:focus-visible {
  opacity: 1;
}
.LayerCatalog > .layerCategory.closed > .layerList {
  height: 0;
  overflow: hidden;
}
.LayerCatalog > .layerCategory > .layerList > .layer {
  text-align: left;
  padding: 8px 12px;
  color: var(--text-primary);
  border-left: 3px solid transparent;
  transition: all 0.15s ease;
}
.LayerCatalog > .layerCategory > .layerList > .layer:hover {
  cursor: pointer;
}
</style>
