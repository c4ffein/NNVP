<template>
  <div id="parameters-block">
    <span>
      {{name}} :
      <br>
      <div id="parameters-block-list">
        <div
          class="layer-input-item"
          v-for="id in inputList"
          :key="id"
          :number="id"
          draggable="true"
          v-on:dragstart="itemDragStart(id, $event)"
          v-on:dragover="itemDragOver(id, $event)"
          v-on:drop="itemDragDrop(id, $event)"
        >
          {{$d3Interface.getLayerById(id).kerasLayer.name}}(id:{{id}})
        </div>
      </div>
    </span>
  </div>
</template>

<script>
export default {
  name: 'InputOrderParameter',
  props: {
    name: String,
    activeLayer: null,
    inputLayers: null,
  },
  data() {
    return {
      inputList: this.activeLayer.inputLayers,
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
      this.reorderList(this.inputList, sourceId, targetId);
    },
    itemDragDrop(targetId, event) {
      event.preventDefault();
      const sourceId = this.draggedId;
      this.reorderList(this.inputList, sourceId, targetId);
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

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style >
.layer-input-item {
  width: 100%;
  cursor: move;
}
</style>
