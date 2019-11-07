<template>
  <div class="parameter-block parameter-boolean">
    <label class="parameter-name parameter-boolean">
      <div class="parameter-name-text parameter-boolean">
        {{name}}
      </div>
      <select
        class="parameter-select parameter-boolean"
        v-bind:class="{greyed: selectedValue === undefined}"
        v-bind:value="selectedValue"
        v-on:click="switchValue()"
        v-on:mousedown="$event.preventDefault()"
      >
        <option value=undefined>{{defaultValue}}</option>
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
    defaultValue: [Boolean, undefined],
    activeLayer: null,
  },
  data() {
    return {
      selectedValue: this.activeLayer.parameterValues[this.name],
    };
  },
  methods: {
    switchValue() {
      if (this.activeLayer.parameterValues[this.name] === true || (
        this.activeLayer.parameterValues[this.name] === undefined && this.defaultValue === true)
      ) {
        this.activeLayer.setParameterValue(this.name, false);
      } else this.activeLayer.setParameterValue(this.name, true);
      this.selectedValue = this.activeLayer.parameterValues[this.name];
    },
  },
};
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
.parameter-select.parameter-boolean.greyed {
  color: rgba(0, 0, 0, 0.5);
}
.parameter-name-text.parameter-boolean {
  padding-right:4px;
}
</style>
