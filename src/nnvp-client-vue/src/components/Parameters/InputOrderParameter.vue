<template>
  <div id="parameters-block">
    <span>
      {{name}} :
      <br>
      <div id="parameters-block-list">
        <div
          class="layer-input-item"
          v-for="item in inputListLayers"
          :key="item.id"
          :number="item.id"
          draggable="true"
          v-on:dragstart="itemDragStart(item.id, $event)"
          v-on:dragover="$event.preventDefault()"
          v-on:drop="itemDragDrop(item.id, $event)"
        >
          {{item.kerasLayer.name}}(id:{{item.id}})
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
    // value: {},
    activeLayer: null,
    inputLayers: null,
  },
  data() {
    return {
      // valueList: this.value,
      // inputListData: this.inputLayers,
      inputListData: this.activeLayer.inputLayers,
      draggedId: null,
    };
  },
  computed: {
    inputListLayers() {
      const ret = [];
      for (let i = 0; i < this.inputListData.length; i += 1) {
        ret.push(this.$d3Interface.getLayerById(this.inputListData[i]));
      }
      return ret;
    },
  },
  methods: {
    itemDragStart(layerId, event) {
      this.draggedId = layerId;
      event.dataTransfer.setData('text/html', this.draggedId);
    },
    itemDragDrop(targetId, event) {
      event.preventDefault();
      const sourceId = this.draggedId;
      const idList = this.inputListData;
      if (idList.indexOf(sourceId) > idList.indexOf(targetId)) {
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
