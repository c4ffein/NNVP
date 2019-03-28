<template>
  <div id="parameters-block">
    <span>
      {{name}} :
      <select v-model="selectedParameterValue" @change="updateParamFromKerasLayer">
        <option v-bind:key="item" v-for="item in valueList" v-bind:value="item">{{item}}</option>
      </select>
    </span>
  </div>
</template>

<script>
export default {
  name: 'ListParameter',
  props: {
    name: String,
    value: {},
    activeLayer: null,
  },
  data() {
    return {
      valueList: this.value,
      selectedParameterValue: this.activeLayer.parameterValues[this.name],
    };
  },
  methods: {
    updateParamFromKerasLayer() {
      this.activeLayer.setParameterValue(this.name, this.selectedParameterValue);
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style >
</style>
