<template>
  <div class="RightBar">
    <h4 v-if="selectedNode.e.length === 0">No layers selected</h4>
    <div id="rightbar-block" class="rightbar-block" v-if="nodeIsSelected()">
      <ParamsBlock
        v-for="(selectedLayer, index) in activeLayers"
        v-bind:key="selectedLayer.id"
        v-bind:title="selectedLayer.kerasLayer.name"
      >
        <component class="RightBar param"
          :key="paramK"
          v-for="(paramV, paramK) in selectedLayer.kerasLayer.parameterDef"
          v-bind:is="parameterToComponentName(paramV)"
          v-bind:name="paramK"
          v-bind:valueList="paramV.list"
          v-bind:defaultValue="paramV.default/*undefined*/"
          v-bind:activeLayer="selectedLayer.kerasLayer"
          v-bind:conditions="paramV.conditions"
        ></component>
        <OrderParameter
          v-if="isMergeLayer(selectedLayer.kerasLayer.category)"
          v-bind:title="selectedLayer.kerasLayer.parameterDef[1]"
          v-bind:itemList="selectedLayer.inputLayers"
          v-bind:idFunc="e => e"
          v-bind:nameFunc="e => $d3Interface.getLayerById(e).kerasLayer.name"
        />
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
    parameterToComponentName(parameter) {
      const typeToName = {
        float: 'FloatParameter',
        int: 'IntParameter',
        tuple_int: 'TupleIntParameter',
        list: 'ListParameter',
        boolean: 'BooleanParameter',
        string: 'StringParameter',
        type_selecter: 'StringParameter',
      };
      return typeToName[parameter.type];
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
</style>
