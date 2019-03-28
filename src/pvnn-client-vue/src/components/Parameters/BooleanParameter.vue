<template>
  <div id="parameters-block">
    <span>
        {{name}} :
        <select v-model="valueSelected" @change="updateParamFromKerasLayer">
            <option value=true>True</option>
            <option value=false>False</option>
        </select>
    </span>
  </div>
</template>

<script>
export default {
  name: 'BooleanParameter',
  props: {
    name: String,
    value: Boolean,
    activeLayer: null,
  },
  data() {
    return {
      valueSelected: this.activeLayer.parameterValues[this.name],
    };
  },
  methods: {
    updateParamFromKerasLayer() {
      this.activeLayer.setParameterValue(this.name, this.valueSelected);
    },
  },
};
// TODO Maybe manage int range in the component getting spec from parameter Details
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style >

</style>
