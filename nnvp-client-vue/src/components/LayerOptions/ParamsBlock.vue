<template>
  <div class="ParamsBlock">
    <div class="ParamsBlock layer-title" @click="toggleLayer()">
      {{title}}
      <div class="arrow">▲</div>
    </div>
    <div class="ParamsBlock params-list" v-bind:class="{ closed: isClosed}">
      <slot></slot>
    </div>
  </div>
</template>

<script>

export default {
  name: 'ParamsBlock',
  props: {
    title: String,
  },
  data() {
    return {
      isClosed: false,
    };
  },
  methods: {
    toggleLayer() {
      this.isClosed = !this.isClosed;
    },
  },
};
</script>

<style >
.ParamsBlock {
  height: 100%;
  box-sizing: border-box;
  -moz-box-sizing: border-box;
  -webkit-box-sizing: border-box;
  margin-bottom: 12px;
}
.ParamsBlock > h4 {
  display: inline-block;
}
.ParamsBlock.layer-title {
  background-color: transparent;
  overflow: hidden;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid #000000;
  border-radius: 15px;
  cursor: pointer;
  padding: 10px 12px;
  font-weight: var(--font-weight-semibold);
  color: #000000;
  transition: all 0.15s ease;
}
.ParamsBlock > .layer-title > .arrow {
  color: #000000;
  height: 15px;
  width: 15px;
  transform: rotate(180deg);
  vertical-align: middle;
  text-align: center;
  font-size: 10px;
  transition: transform 0.2s ease;
}
.ParamsBlock.closed > .layer-title > .arrow {
  transform: rotate(90deg);
}
.ParamsBlock.params-list {
  padding: 12px 4px;
  color: #000000;
}
.ParamsBlock.params-list.closed {
  height: 0;
  overflow: hidden;
  padding: 0;
}
</style>
