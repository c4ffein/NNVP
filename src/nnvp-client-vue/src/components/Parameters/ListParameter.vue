<template>
  <div class="parameter-block">
    <label>
      {{name}}
      <div class="list-parameter reset-button" v-on:click="resetParamFromKerasLayer">╳</div>
      <div class="parameter-select list-parameter">
        <select v-model="selectedParameterValue" @change="updateParamFromKerasLayer">
          <option v-bind:key="item" v-for="item in valueList" v-bind:value="item">{{item}}</option>
        </select>
      </div>
    </label>
  </div>
</template>

<script>
export default {
  name: 'ListParameter',
  props: {
    name: String,
    valueList: {},
    activeLayer: null,
  },
  data() {
    return {
      selectedParameterValue: this.activeLayer.parameterValues[this.name],
    };
  },
  methods: {
    updateParamFromKerasLayer() {
      this.activeLayer.setParameterValue(this.name, this.selectedParameterValue);
    },
    resetParamFromKerasLayer() {
      this.activeLayer.deleteParameterValue(this.name, this.selectedParameterValue);
      this.selectedParameterValue = undefined;
    },
  },
};
</script>

<style>
.parameter-select.list-parameter {
  width: 100%;
  display: block;
}
.parameter-select.list-parameter > select {
  width: 100%;
}
.list-parameter.reset-button {
  float: right;
  visibility: hidden;
  font-size: small;
}
:hover > * > .list-parameter.reset-button {
  visibility: visible;
}
</style>
