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
    <div class="catalog-scroll">
    <div
      v-for="(layers, categoryName) in orderedCategories"
      v-bind:key="(categoryName as any).id"
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
          :key="(layerName as any).id" :id="'layer-template-' + layerName"
          @show-help="helpLayerType = $event"
        />
      </div>
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
          <div v-if="helpConceptTitle" class="layer-help-ask-row">
            <button type="button" class="layer-help-ask" @click="openConceptFromHelp">
              📖 Read the concept: {{ helpConceptTitle }}
            </button>
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

<script lang="ts">
import { defineComponent } from 'vue';
import LayerTemplate from './LayerTemplate.vue';
import layerHelp from '../../lib/KerasInterface/layerHelp';
import categoryHelp from '../../lib/KerasInterface/categoryHelp';
import { askAssistant } from '../../lib/Assistant/askAssistant';
import { conceptForCatalogTopic, getConcept } from '../../lib/Tutorial/concepts';
import { bus } from '../../lib/Events/bus';
import type KerasLayer from '../../lib/KerasInterface/KerasLayer';

// import.meta.env is Vite-only (absent under bun/unit tests) — typed locally
// instead of pulling in vite/client types (same choice as BoardInterface.ts).
type ImportMetaWithEnv = ImportMeta & { env?: { VITE_ENABLE_BACKEND?: string } };

// Non-reactive instance field assigned outside data() (pure typing pass:
// keeping it out of data() preserves its non-reactive nature — same pattern
// as CornerControls.vue).
interface LayerCatalogInstanceExtra { handleEscape?: (event: KeyboardEvent) => void }

export default defineComponent({
  name: 'LayerCatalog',
  components: {
    LayerTemplate,
  },
  computed: {
    /**
     * The catalog's categories with "Input / Output" pinned first — every
     * model starts there, so it must not sit buried in the generated JSON's
     * order. A display choice made HERE: the KerasInterface data (and the
     * assistant's view of it) keeps its natural order.
     */
    orderedCategories(): Record<string, Record<string, KerasLayer>> {
      const categories = this.$kerasInterface.getCategories();
      const ordered: Record<string, Record<string, KerasLayer>> = {};
      const pinned = 'Input / Output';
      if (categories[pinned]) ordered[pinned] = categories[pinned];
      for (const [name, layers] of Object.entries(categories)) {
        if (name !== pinned) ordered[name] = layers;
      }
      return ordered;
    },
    /** The Concepts-book article behind the open help topic, if one exists. */
    helpConceptId(): string | null {
      const topic = this.helpLayerType || this.helpCategory;
      return topic ? conceptForCatalogTopic(topic) : null;
    },
    helpConceptTitle(): string | null {
      const concept = this.helpConceptId ? getConcept(this.helpConceptId) : undefined;
      return concept ? concept.title : null;
    },
    helpHtml(): string {
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
    toggleCategory(categoryDiv: string) {
      document.getElementById(categoryDiv)!.classList.toggle('closed');
      this.refreshAllCollapsed();
    },
    divId: (categoryName: string) => `category_${categoryName.replace(' ', '_')}`,
    categoryHelpHtmlFor: (categoryName: string) => categoryHelp[categoryName] || '',
    closeHelp() {
      this.helpLayerType = null;
      this.helpCategory = null;
    },
    /** Hand the topic to the Concepts book (App hosts it) and step aside. */
    openConceptFromHelp() {
      if (!this.helpConceptId) return;
      bus.emit('ui.open-concept', { id: this.helpConceptId });
      this.closeHelp();
    },
    // Hand the topic over to the chat widget (which opens and seeds the
    // conversation) and get the modal out of its way.
    askInChat() {
      // Only reachable while the modal is open, so one of the two is set.
      askAssistant((this.helpLayerType || this.helpCategory)!);
      this.closeHelp();
    },
    // The open/closed state lives in the DOM (classList), so the master
    // button's state is recomputed from it: as soon as ANY category is open,
    // the arrow flips back to "collapse all" — one click always re-closes.
    refreshAllCollapsed() {
      const categories = [...this.$el.querySelectorAll('.layerCategory')] as HTMLElement[];
      this.allCollapsed = categories.length > 0
        && categories.every((el) => el.classList.contains('closed'));
    },
    toggleAllCategories() {
      const collapse = !this.allCollapsed;
      (this.$el.querySelectorAll('.layerCategory') as NodeListOf<HTMLElement>).forEach((el) => {
        el.classList.toggle('closed', collapse);
      });
      this.allCollapsed = collapse;
    },
    inSearch(layer: KerasLayer): boolean {
      if (this.$data.searchBox === '') {
        return true;
      }
      const searchStrings = this.$data.searchBox.split(' ');
      for (let i = 0; i < searchStrings.length; i += 1) {
        const searchString = searchStrings[i]!.toLowerCase();
        for (let j = 0; j < layer.searchTerms.length; j += 1) {
          if (layer.searchTerms[j]!.toLowerCase().includes(searchString)) {
            return true;
          }
        }
      }
      return false;
    },
    filteredSearchList(layers: Record<string, KerasLayer>): Record<string, KerasLayer> {
      const result: Record<string, KerasLayer> = {};
      const layersEntries = Object.entries(layers);
      for (let i = 0; i < layersEntries.length; i += 1) {
        const layerContent = layersEntries[i]![1];
        if (this.inSearch(layerContent)) {
          const layerName = layersEntries[i]![0];
          result[layerName] = layerContent;
        }
      }
      return result;
    },
    // The second argument has always been passed by the template and ignored.
    layersNotEmptyAfterSearch(layers: Record<string, KerasLayer>, _categoryName?: string): boolean {
      const layerArray = Object.values(layers);
      for (let i = 0; i < layerArray.length; i += 1) {
        if (this.inSearch(layerArray[i]!)) {
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
    helpLayerType: null as string | null,
    helpCategory: null as string | null,
    allCollapsed: false,
    // The ask-the-assistant handoff only exists where the chat does (same
    // gate as App.vue's ChatBubble mount).
    backendEnabled: !!(import.meta as ImportMetaWithEnv).env?.VITE_ENABLE_BACKEND,
  }),
  mounted() {
    const self = this as unknown as LayerCatalogInstanceExtra;
    this.$boardInterface.setLeftBarRemountCallback(this.remount);
    self.handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (this.helpLayerType || this.helpCategory)) this.closeHelp();
    };
    document.addEventListener('keydown', self.handleEscape);
  },
  beforeUnmount() {
    const self = this as unknown as LayerCatalogInstanceExtra;
    document.removeEventListener('keydown', self.handleEscape!);
  },
});
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
  /* Fill the window body: the search bar is a fixed header, only the list
     below it scrolls. */
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.search-container {
  /* A real header OUTSIDE the scroller (a sticky element bounces along with
     rubber-band overscroll; a header cannot). */
  position: relative;
  z-index: 2;
  flex: none;
  width: 100%;
  background-color: var(--bg-panel);
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--panel-border);
}
.catalog-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
/* The search bar above already draws this line — a border-top on the first
   category would double it. */
.catalog-scroll > .layerCategory:first-child > .title {
  border-top: none;
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
.catalog-scroll > .layerCategory > .title {
  background-color: transparent;
  overflow: hidden;
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas: "arrow text help";
  align-items: center;
  border-top: 1px solid var(--panel-border);
  border-left: 1px solid var(--panel-border);
  border-right: 1px solid var(--panel-border);
  font-weight: var(--font-weight-medium);
  position: relative;
  margin-left: -1px;
  margin-right: -1px;
}
.catalog-scroll > .layerCategory > .title > .text {
  grid-area: text;
  text-align: left;
  padding: 8px 12px;
  color: var(--text-primary);
  transition: transform 0.15s ease;
}

.catalog-scroll > .layerCategory > .title:hover > .text {
  transform: translate(1px, -1px);
  cursor: pointer;
}
.catalog-scroll > .layerCategory > .title:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.catalog-scroll > .layerCategory > .title > .arrow {
  color: var(--text-muted);
  grid-area: arrow;
  height: 15px;
  width: 15px;
  padding: 8px;
  font-size: 10px;
  /* Center the glyph geometrically and rotate around that center — a
     translate nudge here would run in the ROTATED frame and shift the arrow
     down/right depending on where it points. */
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transform: rotate(180deg);
  transition: transform 0.15s ease;
}
.catalog-scroll > .layerCategory.closed > .title > .arrow {
  transform: rotate(90deg);
}
/* The category (?) sits at the right end of the title row, visible on hover
   or focus (same behavior as the per-layer help dots). */
.catalog-scroll > .layerCategory > .title > .category-help {
  grid-area: help;
  margin-right: 8px;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.catalog-scroll > .layerCategory > .title:hover > .category-help,
.catalog-scroll > .layerCategory > .title:focus-visible > .category-help,
.catalog-scroll > .layerCategory > .title > .category-help:focus-visible {
  opacity: 1;
}
.catalog-scroll > .layerCategory.closed > .layerList {
  height: 0;
  overflow: hidden;
}
.catalog-scroll > .layerCategory > .layerList > .layer {
  text-align: left;
  padding: 8px 12px;
  color: var(--text-primary);
  border-left: 3px solid transparent;
  transition: all 0.15s ease;
}
.catalog-scroll > .layerCategory > .layerList > .layer:hover {
  cursor: pointer;
}
</style>
