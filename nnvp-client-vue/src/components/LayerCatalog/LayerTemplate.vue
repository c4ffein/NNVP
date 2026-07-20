<template>
  <div class="LayerTemplate"
    role="button"
    tabindex="0"
    :aria-label="'Add ' + layerName + ' layer'"
    draggable="true"
    v-on:dragstart="$event.dataTransfer!.setData('text/html', '<h1>test</h1>')"
    @click="$boardInterface.addLayer(layerContent.clone())"
    @keydown.enter.prevent="$boardInterface.addLayer(layerContent.clone())"
    @keydown.space.prevent="$boardInterface.addLayer(layerContent.clone())"
  >
    <span class="layer-template-name">{{ layerName }}</span>
    <button
      type="button"
      class="help-icon layer-template-help"
      :aria-label="'Learn about the ' + layerName + ' layer'"
      @click.stop="$emit('show-help', layerName)"
      @keydown.enter.stop
      @keydown.space.stop
    >?</button>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import type { PropType } from 'vue';
import type { KerasLayerInstance } from '../../lib/FlowInterface/FlowGraphEditor';

export default defineComponent({
  name: 'LayerTemplate',
  components: {
  },
  emits: ['show-help'],
  data() {
    return {
    };
  },
  methods: {
    toggleCategory: (categoryDiv: string) => document.getElementById(categoryDiv)!.classList.toggle('closed'),
    divId: (categoryName: string) => `category_${categoryName.replace(' ', '_')}`,
  },
  mounted() {
    this.$boardInterface.addEventHandlerDragOnHtmlClass(this.layerContent, this.$el);
  },
  updated() {
    this.$boardInterface.addEventHandlerDragOnHtmlClass(this.layerContent, this.$el);
  },
  props: {
    layerName: String,
    layerContent: { type: Object as PropType<KerasLayerInstance>, required: true },
  },
});
</script>

<style>
.LayerTemplate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  text-align: left;
  padding: 4px 8px 4px 12px;
  position: relative;
  transition: transform 0.15s ease;
}

.LayerTemplate:hover {
  transform: translate(1px, -1px);
  cursor: pointer;
}

.LayerTemplate:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.layer-template-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The help dot only shows while the row is hovered or focused, like the
   connection grips on canvas nodes — and stays click-transparent otherwise
   so it never steals an "add layer" click. */
.layer-template-help {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.LayerTemplate:hover .layer-template-help,
.LayerTemplate:focus-visible .layer-template-help,
.layer-template-help:focus-visible {
  opacity: 1;
  pointer-events: all;
}
</style>
