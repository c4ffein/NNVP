<template>
  <div class="parameter-block">
    <label>
      {{name}}
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

<style>
.parameter-select.list-parameter {
  width: 100%;
  display: block;
}
.parameter-select.list-parameter > select {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
}
</style>
