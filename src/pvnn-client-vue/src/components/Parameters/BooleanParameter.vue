<template>
  <div class="parameter-block parameter-boolean">
    <label class="parameter-name parameter-boolean">
      <div class="parameter-name-text parameter-boolean">
        {{name}}
      </div>
      <select
        class="parameter-select parameter-boolean"
        v-model="valueSelected"
        v-on:click="switchValue()"
        v-on:mousedown="$event.preventDefault()"
      >
        <option value=true>True</option>
        <option value=false>False</option>
      </select>
    </label>
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
    switchValue() {
      if (this.activeLayer.parameterValues[this.name] === true) {
        this.activeLayer.setParameterValue(this.name, false);
      } else this.activeLayer.setParameterValue(this.name, true);
      this.valueSelected = this.activeLayer.parameterValues[this.name];
    },
  },
};
// TODO Maybe manage int range in the component getting spec from parameter Details
</script>

<style >
label.parameter-boolean {
  display: flex;
  overflow: hidden;
  width: 100%;
  align-items: center;
}
.parameter-select.parameter-boolean {
  flex-grow: 1;
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  align-items: center;
}
.parameter-name-text.parameter-boolean {
  padding-right:4px;
}
</style>
