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
}
.ParamsBlock > h4 {
  display: inline-block;
}
.ParamsBlock.layer-title {
  background-color: rgba(200, 200, 200, 0.2);
  overflow: hidden;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas: "arrow text";
  border-top: 1px solid rgba(200, 200, 200, 0.5);
  border-bottom: 1px solid rgba(200, 200, 200, 0.5);
  cursor: default;
}
.ParamsBlock.layer-title:hover {
  background-color: rgba(200, 200, 200, 0.6);
}
.ParamsBlock.layer-title > .text {
  grid-area: text;
  text-align: left;
  padding: 5px;
}
.ParamsBlock > .layer-title > .arrow {
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
.ParamsBlock.closed > .layer-title > .arrow {
  transform: rotate(90deg) translateY(-10%);
}
.ParamsBlock.params-list {
  padding-left: 1px;
  padding-right: 1px;
}
.ParamsBlock.params-list.closed {
  height: 0;
  overflow: hidden;
}
</style>
