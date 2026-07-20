<template>
  <div class="parameter-block">
    <label>
      {{name}}
      <div
        class="list-parameter reset-button"
        role="button"
        tabindex="0"
        :aria-label="'Reset ' + name"
        v-on:click="resetParamFromKerasLayer"
        v-on:keydown.enter.prevent="resetParamFromKerasLayer"
        v-on:keydown.space.prevent="resetParamFromKerasLayer"
      >╳</div>
      <div class="parameter-select list-parameter">
        <select v-model="selectedParameterValue" @change="updateParamFromKerasLayer" :aria-label="name">
          <option v-bind:key="item" v-for="item in valueList" v-bind:value="item">{{item}}</option>
        </select>
      </div>
    </label>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import type { PropType } from 'vue';
import type KerasLayer from '../../lib/KerasInterface/KerasLayer';
import type { ParameterValue } from '../../types/model';

export default defineComponent({
  name: 'ListParameter',
  props: {
    name: { type: String, required: true },
    valueList: { type: Array as PropType<string[]>, required: true },
    activeLayer: { type: Object as PropType<KerasLayer>, required: true },
  },
  data() {
    return {
      selectedParameterValue:
        this.activeLayer.parameterValues[this.name] as ParameterValue | undefined,
    };
  },
  methods: {
    updateParamFromKerasLayer() {
      this.activeLayer.setParameterValue(this.name, this.selectedParameterValue!);
    },
    resetParamFromKerasLayer() {
      // Historical quirk: deleteParameterValue only takes the name; the extra
      // value argument has always been ignored.
      (this.activeLayer.deleteParameterValue as (name: string, value?: unknown) => void)(
        this.name, this.selectedParameterValue,
      );
      this.selectedParameterValue = undefined;
    },
  },
});
</script>

<style>
.parameter-select.list-parameter {
  width: 100%;
  display: block;
}
.parameter-select.list-parameter > select {
  width: 100%;
}
.list-parameter.reset-button {
  float: right;
  visibility: hidden;
  font-size: small;
}
:hover > * > .list-parameter.reset-button {
  visibility: visible;
}
</style>
