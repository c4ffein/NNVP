<template>
  <div id="parameters-block">
    <span>
        {{name}} :
        <button :aria-label="'Add ' + name + ' value'" @click="addElementToArray">Add</button>
        <button :aria-label="'Remove last ' + name + ' value'" @click="removeElementToArray">Delete</button>
        <input v-for="i of values.keys()" :key="i"
          v-model.number="values[i]" type="number" placeholder="1"
          :aria-label="name + ' value ' + (i + 1)">
    </span>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import type { PropType } from 'vue';
import type KerasLayer from '../../lib/KerasInterface/KerasLayer';

export default defineComponent({
  name: 'TupleIntParameter',
  props: {
    name: { type: String, required: true },
    activeLayer: { type: Object as PropType<KerasLayer>, required: true },
  },
  data() {
    return {
      inputValue: 0,
      // Undefined until created() backfills it; typed as the array the
      // template iterates (the stored value is a number[] for tuple_int).
      values: this.activeLayer.parameterValues[this.name] as number[],
    };
  },
  methods: {
    addElementToArray() {
      if ((this.values as number[] | undefined) === undefined) {
        this.values = [];
      }
      // Historical quirk: parseInt is called on a number (works, returns 1).
      this.values.push(parseInt(1 as unknown as string, 10));
      this.updateParamFromKerasLayer();
    },
    removeElementToArray() {
      if ((this.values as number[] | undefined) === undefined) {
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
    if ((this.values as number[] | undefined) === undefined) {
      this.values = [];
    }
  },
});
</script>

<style >
</style>
