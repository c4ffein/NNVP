<template>
  <div id="parameters-block">
    <span>
        {{name}} :
        <input
          v-if="isConditionsNotRanged()"
          type="number"
          v-bind:min="minCond"
          v-bind:max="maxCond"
          placeholder="Enter Int Value"
          @change="updateParamFromKerasLayer"
          v-model="valueContainer"
        >
        <div v-else>
          <input
            type="range"
            v-bind:min="minCond"
            v-bind:max="maxCond"
            @change="updateParamFromKerasLayer"
            v-model="valueContainer"
          >
           : {{valueContainer}}
        </div>
    </span>
  </div>
</template>

<script>
export default {
  name: 'IntParameter',
  props: {
    name: String,
    value: Number,
    conditions: null,
    activeLayer: null,
  },
  data() {
    return {
      valueContainer: this.activeLayer.parameterValues[this.name],
      minCond: '',
      maxCond: '',
    };
  },

  created() {
    this.parseMinCond();
    this.parseMaxCond();
  },

  methods: {
    updateParamFromKerasLayer() {
      this.activeLayer.setParameterValue(this.name, this.valueContainer);
    },
    isConditionsNotRanged() {
      const conditionsEmpty = (this.conditions == null);
      if (!conditionsEmpty) {
        return this.conditions.length !== 2;
      }
      return conditionsEmpty;
    },
    isConditionsNull() {
      return this.conditions == null;
    },
    parseMinCond() {
      if (!this.isConditionsNull()) { // To fix some warning
        if (this.conditions.length > 0) {
          const strMinCond = this.conditions[0];
          if (strMinCond.slice(0, 2) === '>=') {
            this.minCond = parseInt(strMinCond.slice(2), 10);
          } else { // cas du supérieur stricte
            this.minCond = (parseInt(strMinCond.slice(1), 10) + 1);
          }
        }
      }
    },
    parseMaxCond() {
      if (!this.isConditionsNull()) {
        if (this.conditions.length === 2) {
          const strMaxCond = this.conditions[1];
          if (strMaxCond.slice(0, 2) === '<=') {
            this.maxCond = parseInt(strMaxCond.slice(2), 10);
          } else { // cas du inférieur stricte
            this.maxCond = parseInt(strMaxCond.slice(1), 10) - 1;
          }
        }
      }
    },
  },
};
// TODO Maybe manage int range in the component getting spec from parameter Details
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style >

</style>
