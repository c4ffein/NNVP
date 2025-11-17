<template>
  <div class="LayerTemplate"
    draggable="true"
    v-on:dragstart="$event.dataTransfer.setData('text/html', '<h1>test</h1>')"
    @click="$d3Interface.addLayer(layerContent.clone())"
  >
    {{ this.layerName }}
  </div>
</template>

<script>
export default {
  name: 'LayerTemplate',
  components: {
  },
  data() {
    return {
    };
  },
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
.LayerTemplate {
  text-align: left;
  padding: 4px 4px 4px 12px;
  position: relative;
  transition: transform 0.15s ease;
}

.LayerTemplate:hover {
  transform: translate(1px, -1px);
  cursor: pointer;
}
</style>
