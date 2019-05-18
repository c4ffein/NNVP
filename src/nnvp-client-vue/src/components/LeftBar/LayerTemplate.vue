<template>
  <div class="LayerTemplate"
    draggable="true"
    v-on:dragstart="$event.dataTransfer.setData('text/html', '<h1>test</h1>')"
    @click="$d3Interface.addLayer(layerContent.clone())"
  >{{ this.layerName }}</div>
</template>

<script>
export default {
  name: 'LayerTemplate',
  methods: {
    toggleCategory: categoryDiv => document.getElementById(categoryDiv).classList.toggle('closed'),
    divId: categoryName => `category_${categoryName.replace(' ', '_')}`,
  },
  mounted() {
    this.$d3Interface.addEventHandlerDragOnHtmlClass(this.layerContent, this.$el);
  },
  updated() {
    this.$d3Interface.addEventHandlerDragOnHtmlClass(this.layerContent, this.$el);
  },
  props: {
    layerName: String,
    layerContent: Object,
  },
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
.LayerTemplate {
  text-align: left;
  padding: 3px;
}
.LayerTemplate:hover {
  outline: 1px solid rgba(150, 150, 150, 0.8);
}
</style>
