<template>
  <div class="RightBar">
    <h4 v-if="selectedNode.e.length === 0">No layers selected</h4>
    <div id="rightbar-block" class="rightbar-block" v-if="nodeIsSelected()">
      <ParamsBlock
        v-for="(selectedLayer, index) in activeLayers"
        v-bind:key="selectedLayer.id"
        v-bind:title="selectedLayer.kerasLayer.name"
      >
        <div class="RightBar param"
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
          <OrderParameter
            v-if="isMergeLayer(selectedLayer.kerasLayer.category)"
            v-bind:title="paramK"
            v-bind:itemList="selectedLayer.inputLayers"
            v-bind:idFunc="e => e"
            v-bind:nameFunc="e => $d3Interface.getLayerById(e).kerasLayer.name"
          />
        </div>
        <div v-if="index != selectedNode.e.length - 1">
          <br>
        </div>
      </ParamsBlock>

      <ParamsBlock title="Model Inputs" v-if="inputInLayersAndMoreThanOneInModel">
        <div class="RightBar param">
          <OrderParameter
            v-bind:itemList="$d3Interface.activeGraph.model.modelInputs"
            :idFunc="e => e.id"
            :nameFunc="e => e.name"
        />
        </div>
      </ParamsBlock>

      <ParamsBlock title="Model Outputs" v-if="outputInLayers">
        <div class="RightBar param">
          <OrderParameter
            v-bind:itemList="$d3Interface.activeGraph.model.modelOutputs"
            :idFunc="e => e.id"
            :nameFunc="e => e.name"
          />
        </div>
      </ParamsBlock>
    </div>
  </div>
</template>

<script>
import ParamsBlock from './ParamsBlock.vue';
import ListParameter from '../Parameters/ListParameter.vue';
import IntParameter from '../Parameters/IntParameter.vue';
import BooleanParameter from '../Parameters/BooleanParameter.vue';
import TupleIntParameter from '../Parameters/TupleIntParameter.vue';
import FloatParameter from '../Parameters/FloatParameter.vue';
import StringParameter from '../Parameters/StringParameter.vue';
import OrderParameter from '../Parameters/OrderParameter.vue';


export default {
  name: 'RightBar',
  components: {
    ParamsBlock,
    ListParameter,
    IntParameter,
    FloatParameter,
    BooleanParameter,
    TupleIntParameter,
    StringParameter,
    OrderParameter,
  },
  data() {
    return {
      selectedNode: this.$d3Interface.getActiveElementsContainer(),
    };
  },
  computed: {
    activeLayers() {
      const activeLayers = [];
      for (const d3Layer of this.selectedNode.e) { // eslint-disable-line
        if (!this.isOutputLayer(d3Layer.kerasLayer)) activeLayers.push(d3Layer);
      }
      return activeLayers;
    },
    inputInLayersAndMoreThanOneInModel() {
      for (const layer of this.selectedNode.e) { // eslint-disable-line
        if (this.isInputLayer(layer)) {
          if (this.$d3Interface.activeGraph.model.modelInputs.length > 1) {
            return true;
          }
          return false;
        }
      }
      return false;
    },
    outputInLayers() {
      for (const layer of this.selectedNode.e) { // eslint-disable-line
        if (this.isOutputLayer(layer)) {
          return true;
        }
      }
      return false;
    },
  },
  methods: {
    nodeIsSelected() {
      return this.selectedNode !== null
          && this.selectedNode.e !== null
          && this.selectedNode.e.length > 0;
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
    isInputLayer(kerasLayer) {
      return kerasLayer.name === 'Input';
    },
    isOutputLayer(kerasLayer) {
      return kerasLayer.name === 'Output';
    },
    toggleLayer(id) {
      document.getElementById(id).classList.toggle('closed');
    },
  },
};
</script>

<style >
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
.RightBar.param {
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
