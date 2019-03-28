<template>
  <div class="LeftBar">
    <button
      id="interfaceTest"
      v-on:click="
        $kerasInterface.load(
          {'TestLayer': {'category': 'Test Layers', 'parameters': {}, }, }
        );
        $forceUpdate();"
    >Interface Test Add</button>
    <input id="layerSearchBox" v-model="searchBox" placeholder="Search">
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
      >
        <div class="text">{{ categoryName }}</div>
        <div class="arrow">▲</div>
      </div>
      <div class="layerList">
        <div
          class="layer"
          v-for="(layerContent, layerName) in filteredSearchList(layers)"
          v-bind:key="layerName.id"
          v-bind:id="'layer-template-' + layerName"
          draggable="true"
          @mouseover="addDragAndDropToCanvas(layerContent, $event.target)"
          v-on:dragstart="$event.dataTransfer.setData('text/html', '<h1>test</h1>')"
          @click="$d3Interface.addLayer(layerContent.clone())"
        >{{ layerName }}</div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'LeftBar',
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
    addDragAndDropToCanvas(layer, element) {
      this.$d3Interface.addEventHandlerDragOnHtmlClass(layer.clone(), element);
    },
  },
  data: () => ({
    searchBox: '',
  }),
};
</script>

<style>
@font-face {
  font-family: "Roboto Regular";
  src: url("/assets/fonts/Roboto-Regular-webfont.woff") format("woff");
}
@font-face {
  font-family: "Roboto Thin";
  src: url("/assets/fonts/Roboto-Thin-webfont.woff") format("woff");
}
.LeftBar {
  font-family: "Roboto Thin";
  font-size: 15px;
  user-select: none;
}
#layerSearchBox {
  background-color: #ffffff;
  overflow: hidden;
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #c0c0c0;
  color: #000000;
  border: 1px;
  padding: 5px;
  font-family: "Roboto Thin";
}
.LeftBar > .layerCategory > .title {
  background-color: rgba(200, 200, 200, 0.2);
  overflow: hidden;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas: "arrow text";
  border-top: 1px solid rgba(200, 200, 200, 0.5);
  border-bottom: 1px solid rgba(200, 200, 200, 0.5);
}
.LeftBar > .layerCategory > .title:hover {
  background-color: rgba(200, 200, 200, 0.6);
}
.LeftBar > .layerCategory > .title > .text {
  grid-area: text;
  text-align: left;
  padding: 5px;
}
.LeftBar > .layerCategory > .title > .arrow {
  color: rgba(100, 100, 100, 0.7);
  grid-area: arrow;
  height: 15px;
  width: 15px;
  transform: rotate(180deg) translateY(-10%);
  vertical-align: middle;
  text-align: center;
  padding: 5px;
  font-size: 10px;
}
.LeftBar > .layerCategory.closed > .title > .arrow {
  transform: rotate(90deg) translateY(-10%);
}
.LeftBar > .layerCategory.closed > .layerList {
  height: 0;
  overflow: hidden;
}
.LeftBar > .layerCategory > .layerList > .layer {
  text-align: left;
  padding: 3px;
}
.LeftBar > .layerCategory > .layerList > .layer:hover {
  outline: 1px solid rgba(150, 150, 150, 0.8);
}
.LeftBar > #hidden-file-upload {
  display: none;
}
</style>
