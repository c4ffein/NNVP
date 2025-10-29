<template>
  <div class="LayerCatalog" :key="reloadKey">
    <div class="search-container">
      <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5"/>
        <path d="M11 11L14.5 14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <input id="layerSearchBox" v-model="searchBox" placeholder="Search">
    </div>
    <div
      v-for="(layers, categoryName) in $kerasInterface.getCategories()"
      v-bind:key="categoryName.id"
      v-bind:id="divId(categoryName)"
      class="layerCategory"
    >
      <div
        class="title"
        v-on:click="toggleCategory(divId(categoryName))"
        v-if="layersNotEmptyAfterSearch(layers, categoryName)"
        @mouseenter="hoveredCategory = categoryName"
        @mouseleave="hoveredCategory = null"
      >
        <div class="text">{{ categoryName }}</div>
        <div class="arrow">▲</div>
        <AnimatedUnderline :isHovered="hoveredCategory === categoryName" />
      </div>
      <div class="layerList">
        <LayerTemplate
          v-for="(layerContent, layerName) in filteredSearchList(layers)"
          v-bind:layerName="layerName" v-bind:layerContent="layerContent"
          :key="layerName.id" :id="'layer-template-' + layerName"
        />
      </div>
    </div>
  </div>
</template>

<script>
import LayerTemplate from './LayerTemplate.vue';
import AnimatedUnderline from '../AnimatedUnderline.vue';

export default {
  name: 'LayerCatalog',
  components: {
    LayerTemplate,
    AnimatedUnderline,
  },
  methods: {
    toggleCategory: categoryDiv => document.getElementById(categoryDiv).classList.toggle('closed'),
    divId: categoryName => `category_${categoryName.replace(' ', '_')}`,
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
    hoveredCategory: null,
  }),
  mounted() {
    this.$d3Interface.setLeftBarRemountCallback(this.remount);
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
  color: #000000;
}
.search-container {
  position: relative;
  width: 100%;
  background-color: #ffffff;
}
.search-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: #000000;
  pointer-events: none;
}
#layerSearchBox {
  background-color: transparent;
  box-sizing: border-box;
  width: 100%;
  border: none;
  color: #000000;
  padding: 14px 16px 14px 44px;
  font-family: var(--font-regular);
  font-weight: var(--font-weight-medium);
  font-size: 14px;
}
#layerSearchBox:focus {
  outline: none;
}
#layerSearchBox::placeholder {
  color: #000000;
}
.LayerCatalog > .layerCategory > .title {
  background-color: transparent;
  overflow: hidden;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas: "arrow text";
  border-top: 1px solid #000000;
  border-left: 1px solid #000000;
  border-right: 1px solid #000000;
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
  color: #000000;
}
.LayerCatalog > .layerCategory > .title > .arrow {
  color: #000000;
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
.LayerCatalog > .layerCategory.closed > .layerList {
  height: 0;
  overflow: hidden;
}
.LayerCatalog > .layerCategory > .layerList > .layer {
  text-align: left;
  padding: 8px 12px;
  color: #000000;
  border-left: 3px solid transparent;
  transition: all 0.15s ease;
}
.LayerCatalog > .layerCategory > .layerList > .layer:hover {
  cursor: pointer;
}
</style>
