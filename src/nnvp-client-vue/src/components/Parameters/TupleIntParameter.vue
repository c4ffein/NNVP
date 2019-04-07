<template>
  <div id="parameters-block">
    <span>
        {{name}} :
        <!-- TODO implement tuple int render field -->
        <input v-model="inputValue" type="number" placeholder="1">
        <button @click="addValueToTupleArray(inputValue)">Add </button>
        <button @click="clearValues">Clear</button>
        {{values}}
    </span>
  </div>
</template>

<script>
export default {
  name: 'TupleIntParameter',
  props: {
    name: String,
    activeLayer: null,
  },
  data() {
    return {
      inputValue: 0,
      values: this.activeLayer.parameterValues[this.name],
    };
  },
  methods: {
    addValueToTupleArray(val) {
      if (this.values === undefined) {
        this.values = [];
      }
      // console.log(`last Val :: ${val}`);
      this.values.push(parseInt(val, 10));
      this.updateParamFromKerasLayer();
    },
    clearValues() {
      this.values = [];
      this.updateParamFromKerasLayer();
    },

    updateParamFromKerasLayer() {
      this.activeLayer.setParameterValue(this.name, this.values);
    },

  },
};

</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style >

</style>
