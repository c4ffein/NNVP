<template>
  <div class="parameter-block parameter-boolean">
    <label class="parameter-name parameter-boolean">
      <div class="parameter-name-text parameter-boolean">
        {{name}}
      </div>
      <select
        class="parameter-select parameter-boolean"
        v-bind:class="{greyed: selectedValue === 'void'}"
        v-bind:value="selectedValue"
        v-on:click="switchValue()"
        v-on:mousedown="$event.preventDefault()"
      >
        <option value=void>{{defaultValue}}</option>
        <option value=true>True</option>
        <option value=false>False</option>
      </select>
    </label>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import type { PropType } from 'vue';
import type KerasLayer from '../../lib/KerasInterface/KerasLayer';
import type { ParameterValue } from '../../types/model';

export default defineComponent({
  name: 'BooleanParameter',
  props: {
    name: { type: String, required: true },
    value: Boolean,
    // Historical quirk: `undefined` was never a valid runtime prop type — the
    // cast keeps the exact array Vue has always seen.
    defaultValue: [Boolean, undefined] as unknown as PropType<boolean | 'None'>,
    activeLayer: { type: Object as PropType<KerasLayer>, required: true },
  },
  data() {
    return {
      selectedValue: (this.activeLayer.parameterValues[this.name] !== undefined
        ? this.activeLayer.parameterValues[this.name]
        : 'void') as ParameterValue | 'void' | undefined, // Ugly, needed for select
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
});
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
