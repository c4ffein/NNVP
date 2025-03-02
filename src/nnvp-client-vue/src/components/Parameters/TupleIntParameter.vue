<template>
  <div id="parameters-block">
    <span>
        {{name}} :
        <button @click="addElementToArray">Add</button>
        <button @click="removeElementToArray">Delete</button>
        <input v-for="i of values.keys()" :key="i"
          v-model.number="values[i]" type="number" placeholder="1">
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
    addElementToArray() {
      if (this.values === undefined) {
        this.values = [];
      }
      this.values.push(parseInt(1, 10));
      this.updateParamFromKerasLayer();
    },
    removeElementToArray() {
      if (this.values === undefined) {
        this.values = [];
      }
      this.values.splice(-1);
      this.updateParamFromKerasLayer();
    },
    updateParamFromKerasLayer() {
      this.activeLayer.setParameterValue(this.name, this.values);
    },
  },
  created() {
    if (this.values === undefined) {
      this.values = [];
    }
  },
};
</script>

<style >
</style>
