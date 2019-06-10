<template>
  <div id="parameters-block">
    <span v-if="title">
      {{title}} :
      <br>
    </span>
    <div id="parameters-block-list" v-if="duplicates.length === 0">
      <div
        class="input-item"
        v-for="item in itemList"
        :key="idFunc(item)"
        :number="idFunc(item)"
        draggable="true"
        v-on:dragstart="itemDragStart(item, $event)"
        v-on:dragover="itemDragOver(item, $event)"
        v-on:drop="itemDragDrop(item, $event)"
      >
        {{nameFunc(item)}}(id:{{idFunc(item)}})
      </div>
    </div>
    <div id="parameters-block-list" v-else>
      Warning : found duplicates. Remove them before ordering :
      <div
        class="input-item"
        v-for="item in duplicates"
        :key="idFunc(item)"
        :number="idFunc(item)"
      >
        {{nameFunc(item)}}(id:{{idFunc(item)}})
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'OrderParameter',
  props: {
    title: String,
    itemList: null,
    idFunc: Function,
    nameFunc: Function,
  },
  computed: {
    duplicates() {
      return this.itemList.filter((e, i, a) => a.indexOf(e) === i && a.lastIndexOf(e) !== i);
    },
  },
  data() {
    return {
      draggedItem: null,
    };
  },
  methods: {
    id(item) {
      if (this.idFunc) return this.idFunc(item);
      return item.id;
    },
    name(item) {
      if (this.nameFunc) return this.nameFunc(item);
      return item.name;
    },
    itemDragStart(item, event) {
      this.draggedItem = item;
      event.dataTransfer.setData('text/html', this.draggedItem);
    },
    itemDragOver(targetId, event) {
      event.preventDefault();
      const sourceId = this.draggedItem;
      this.reorderList(this.itemList, sourceId, targetId);
    },
    itemDragDrop(targetId, event) {
      event.preventDefault();
      const sourceId = this.draggedItem;
      this.reorderList(this.itemList, sourceId, targetId);
    },
    reorderList(itemList, sourceItem, targetItem) {
      if (itemList.indexOf(sourceItem) === itemList.indexOf(targetItem)) {
        return;
      } if (itemList.indexOf(sourceItem) > itemList.indexOf(targetItem)) {
        itemList.splice(itemList.indexOf(sourceItem), 1);
        itemList.splice(itemList.indexOf(targetItem), 0, sourceItem);
      } else {
        itemList.splice(itemList.indexOf(sourceItem), 1);
        itemList.splice(itemList.indexOf(targetItem) + 1, 0, sourceItem);
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
