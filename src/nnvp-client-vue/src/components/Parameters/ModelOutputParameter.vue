<template>
  <div id="parameters-block">
    <span>
      Model Outputs :
      <br>
      <div id="parameters-block-list">
        <div
          class="layer-input-item"
          v-for="layer in modelOutputs"
          :key="layer.id"
          :number="layer.id"
          draggable="true"
          v-on:dragstart="itemDragStart(layer, $event)"
          v-on:dragover="itemDragOver(layer, $event)"
          v-on:drop="itemDragDrop(layer, $event)"
        >
          {{layer.name}}(id:{{layer.id}})
        </div>
      </div>
    </span>
  </div>
</template>

<script>
export default {
  name: 'ModelOutputParameter',
  props: {
    name: String,
    activeLayer: null,
    modelOutputs: null,
    inputLayers: null,
  },
  data() {
    return {
      draggedId: null,
    };
  },
  methods: {
    itemDragStart(layerId, event) {
      this.draggedId = layerId;
      event.dataTransfer.setData('text/html', this.draggedId);
    },
    itemDragOver(targetId, event) {
      event.preventDefault();
      const sourceId = this.draggedId;
      this.reorderList(this.modelOutputs, sourceId, targetId);
    },
    itemDragDrop(targetId, event) {
      event.preventDefault();
      const sourceId = this.draggedId;
      this.reorderList(this.modelOutputs, sourceId, targetId);
    },
    reorderList(idList, sourceId, targetId) {
      if (idList.indexOf(sourceId) === idList.indexOf(targetId)) {
        return;
      } if (idList.indexOf(sourceId) > idList.indexOf(targetId)) {
        idList.splice(idList.indexOf(sourceId), 1);
        idList.splice(idList.indexOf(targetId), 0, sourceId);
      } else {
        idList.splice(idList.indexOf(sourceId), 1);
        idList.splice(idList.indexOf(targetId) + 1, 0, sourceId);
      }
    },
  },
};
</script>

<style >
.layer-input-item {
  width: 100%;
  cursor: move;
}
</style>
