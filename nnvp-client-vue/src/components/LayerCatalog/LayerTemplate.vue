<template>
  <div class="LayerTemplate"
    draggable="true"
    v-on:dragstart="$event.dataTransfer.setData('text/html', '<h1>test</h1>')"
    @click="$d3Interface.addLayer(layerContent.clone())"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    {{ this.layerName }}
    <AnimatedUnderline :isHovered="isHovered" />
  </div>
</template>

<script>
import AnimatedUnderline from '../AnimatedUnderline.vue';

export default {
  name: 'LayerTemplate',
  components: {
    AnimatedUnderline,
  },
  data() {
    return {
      isHovered: false,
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
  padding: 3px;
  position: relative;
}
</style>
