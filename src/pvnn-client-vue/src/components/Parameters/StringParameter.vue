<template>
  <div id="parameters-block">
    <span>
        {{name}} :
        <input type="text" v-model="valueSet" @change="updateParamFromKerasLayer"/>
    </span>
  </div>
</template>

<script>
export default {
  name: 'StringParameter',
  props: {
    name: String,
    value: String,
    activeLayer: null,
  },
  data() {
    return {
      valueSet: this.activeLayer.parameterValues[this.name],
    };
  },
  methods: {
    updateParamFromKerasLayer() {
      this.activeLayer.setParameterValue(this.name, this.valueSet);
    },
  },
};
// TODO Maybe manage int range in the component getting spec from parameter Details
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style >

</style>
