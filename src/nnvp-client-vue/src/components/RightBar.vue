<template>
  <div class="RightBar">
    <h4 v-if="selectedNode.e.length === 0">No layers selected</h4>
    <div id="rightbar-block" class="rightbar-block" v-if="nodeIsSelected()">
      <div
        v-for="(selectedLayer, index) in selectedNode.e"
        v-bind:key="selectedLayer.id"
        v-bind:id="blockId(selectedLayer.id)"
        class="layerBlock"
      >
        <div class="title" @click="toggleLayer(blockId(selectedLayer.id))">
          {{selectedLayer.kerasLayer.name}}
          <div class="arrow">▲</div>
        </div>
        <div class="parametersList">
          <div class="layer"
            :key="paramK"
            v-for="(paramV, paramK) in selectedLayer.kerasLayer.parameterDef"
          >
            <ListParameter
              v-if="isListType(paramV)"
              v-bind:name="paramK"
              v-bind:value="paramV.list"
              v-bind:activeLayer="selectedLayer.kerasLayer"
            />
            <IntParameter
              v-if="isIntType(paramV)"
              v-bind:name="paramK"
              v-bind:activeLayer="selectedLayer.kerasLayer"
              v-bind:conditions="paramV.conditions"
            />
            <BooleanParameter
              v-if="isBooleanType(paramV)"
              v-bind:name="paramK"
              v-bind:activeLayer="selectedLayer.kerasLayer"
            />
            <TupleIntParameter
              v-if="isTupleIntType(paramV)"
              v-bind:name="paramK"
              v-bind:activeLayer="selectedLayer.kerasLayer"
            />
            <FloatParameter
              v-if="isFloatType(paramV)"
              v-bind:name="paramK"
              v-bind:activeLayer="selectedLayer.kerasLayer"
              v-bind:conditions="paramV.conditions"
            />
            <StringParameter
              v-if="isStringTypeOrTypeSelecter(paramV)"
              v-bind:name="paramK"
              v-bind:activeLayer="selectedLayer.kerasLayer"
            />
            <InputOrderParameter
              v-if="isMergeLayer(selectedLayer.kerasLayer.category)"
              v-bind:name="paramK"
              v-bind:activeLayer="selectedLayer"
            />
          </div>
          <div class="layer" v-if="isOutputLayer(selectedLayer.kerasLayer)">
            <ModelOutputParameter
              v-bind:modelOutputs="$d3Interface.activeGraph.modelOutputs"
            />
          </div>
          <div v-if="index != selectedNode.e.length - 1">
            <br>
          </div>
        </div>
      </div>
    </div>
  </div>

  </template>

<script>
import ListParameter from './Parameters/ListParameter.vue';
import IntParameter from './Parameters/IntParameter.vue';
import BooleanParameter from './Parameters/BooleanParameter.vue';
import TupleIntParameter from './Parameters/TupleIntParameter.vue';
import FloatParameter from './Parameters/FloatParameter.vue';
import InputOrderParameter from './Parameters/InputOrderParameter.vue';
import StringParameter from './Parameters/StringParameter.vue';
import ModelOutputParameter from './Parameters/ModelOutputParameter.vue';


export default {
  name: 'RightBar',
  components: {
    ListParameter,
    IntParameter,
    FloatParameter,
    BooleanParameter,
    TupleIntParameter,
    StringParameter,
    InputOrderParameter,
    ModelOutputParameter,
  },
  props: {
    msg: String,
  },
  data() {
    return {
      selectedNode: this.$d3Interface.getActiveElementsContainer(),
    };
  },
  methods: {
    nodeIsSelected() {
      return this.selectedNode !== null
          && this.selectedNode.e !== null
          && this.selectedNode.e.length > 0;
    },
    blockId(n) {
      return `rightbar-block-${n}`;
    },
    isFloatType(parameter) {
      return parameter.type === 'float';
    },
    isIntType(parameter) {
      return parameter.type === 'int';
    },
    isTupleIntType(parameter) {
      return parameter.type === 'tuple_int';
    },
    isListType(parameter) {
      return parameter.type === 'list';
    },
    isBooleanType(parameter) {
      return parameter.type === 'boolean';
    },
    isStringTypeOrTypeSelecter(parameter) {
      return (parameter.type === 'string') || (parameter.type === 'type_selecter');
    },
    isMergeLayer(nodeCategory) {
      return nodeCategory === 'Merge';
    },
    isOutputLayer(selectedLayer) {
      return selectedLayer.name === 'Output';
    },
    toggleLayer(id) {
      document.getElementById(id).classList.toggle('closed');
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style >
@font-face {
  font-family: "Roboto Regular";
  src: url("/assets/fonts/Roboto-Regular-webfont.woff") format("woff");
}
@font-face {
  font-family: "Roboto Thin";
  src: url("/assets/fonts/Roboto-Thin-webfont.woff") format("woff");
}
.RightBar {
  height: 100%;
  box-sizing: border-box;
  -moz-box-sizing: border-box;
  -webkit-box-sizing: border-box;
}
.RightBar > h4 {
  display: inline-block;
}
.rightbar-block {
  font-family: "Roboto Thin";
  font-size: 15px;
  user-select: none;
  min-height: 100%;
}
.rightbar-block > .layerBlock > .title {
  background-color: rgba(200, 200, 200, 0.2);
  overflow: hidden;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas: "arrow text";
  border-top: 1px solid rgba(200, 200, 200, 0.5);
  border-bottom: 1px solid rgba(200, 200, 200, 0.5);
}
.rightbar-block > .layerBlock > .title:hover {
  background-color: rgba(200, 200, 200, 0.6);
}
.rightbar-block > .layerBlock > .title > .text {
  grid-area: text;
  text-align: left;
  padding: 5px;
}
.rightbar-block > .layerBlock > .title > .arrow {
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
.rightbar-block > .layerBlock.closed > .title > .arrow {
  transform: rotate(90deg) translateY(-10%);
}
.rightbar-block > .layerBlock > .parametersList {
  padding-left: 1px;
  padding-right: 1px;
}
.rightbar-block > .layerBlock.closed > .parametersList {
  height: 0;
  overflow: hidden;
}
.rightbar-block > .layerBlock > .parametersList > .layer {
  text-align: left;
  padding: 4px;
}
button, input[type="button"], input[type="submit"], input, select {
  color: #000000;
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  background-color: #FFFFFF;
  border: 1px solid;
  border-color: rgba(200,200,200,0.8);
  //width: 100%;
}
input.arrows {
  color: #FFFFFF;
  background-color: #FFFFFF;
  border: 1px solid;
  border-color: rgba(200,200,200,0.8);
}
select:-moz-focusring {
  color: transparent;
  text-shadow: 0 0 0 #000000;
}
option:not(:checked) {
  color: black; /* prevent <option>s from becoming transparent as well */
}
</style>
