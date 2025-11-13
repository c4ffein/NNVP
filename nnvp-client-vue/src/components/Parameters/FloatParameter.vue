<template>
  <div id="parameters-block">
    <span>
        {{name}}<span v-if="hasRange" class="range-hint"> ({{minCond}}-{{maxCond}})</span> :
        <input
          v-if="isConditionsNotRanged()"
          type="number"
          v-bind:min="minCond"
          v-bind:max="maxCond"
          v-bind:class="{ 'invalid-input': !isValid }"
          placeholder="Enter Float Value"
          @input="validateInput"
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
            v-bind:step="setStepInputRange()"
          >
          : {{valueContainer}}
        </div>
        <div v-if="!isValid && errorMessage" class="error-message">{{errorMessage}}</div>
    </span>
  </div>
</template>

<script>
export default {
  name: 'FloatParameter',
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
      errorMessage: '',
    };
  },

  computed: {
    hasRange() {
      return this.minCond !== '' || this.maxCond !== '';
    },
    isValid() {
      if (this.valueContainer === '' || this.valueContainer === null) {
        return true; // Empty is valid, let HTML5 required handle it if needed
      }
      const numValue = parseFloat(this.valueContainer);
      if (isNaN(numValue)) {
        return false;
      }
      if (this.minCond !== '' && numValue < this.minCond) {
        return false;
      }
      if (this.maxCond !== '' && numValue > this.maxCond) {
        return false;
      }
      return true;
    },
  },

  created() {
    this.parseMinCond();
    this.parseMaxCond();
  },

  methods: {
    validateInput() {
      if (this.valueContainer === '' || this.valueContainer === null) {
        this.errorMessage = '';
        return;
      }
      const numValue = parseFloat(this.valueContainer);
      if (isNaN(numValue)) {
        this.errorMessage = 'Please enter a valid number';
        return;
      }
      if (this.minCond !== '' && this.maxCond !== '') {
        if (numValue < this.minCond) {
          this.errorMessage = `Value must be at least ${this.minCond}`;
        } else if (numValue > this.maxCond) {
          this.errorMessage = `Value must be at most ${this.maxCond}`;
        } else {
          this.errorMessage = '';
        }
      } else if (this.minCond !== '' && numValue < this.minCond) {
        this.errorMessage = `Value must be at least ${this.minCond}`;
      } else if (this.maxCond !== '' && numValue > this.maxCond) {
        this.errorMessage = `Value must be at most ${this.maxCond}`;
      } else {
        this.errorMessage = '';
      }
    },
    updateParamFromKerasLayer() {
      this.activeLayer.setParameterValue(this.name, parseFloat(this.valueContainer));
    },
    setStepInputRange() {
      return (this.maxCond - this.minCond) / 100.0;
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
      if (!this.isConditionsNull()) {
        if (this.conditions.length > 0) {
          const strMinCond = this.conditions[0];
          if (strMinCond.slice(0, 2) === '>=') {
            this.minCond = parseFloat(strMinCond.slice(2));
          } else { // cas du supérieur stricte
            this.minCond = parseFloat(strMinCond.slice(1)) + 0.01; // Small epsilon for strict inequality
          }
        }
      }
    },

    parseMaxCond() {
      if (!this.isConditionsNull()) {
        if (this.conditions.length === 2) {
          const strMaxCond = this.conditions[1];
          if (strMaxCond.slice(0, 2) === '<=') {
            this.maxCond = parseFloat(strMaxCond.slice(2));
          } else { // cas du inférieur stricte
            this.maxCond = parseFloat(strMaxCond.slice(1)) - 0.01; // Small epsilon for strict inequality
          }
        }
      }
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style>
.range-hint {
  font-size: 0.85em;
  color: #666;
  font-weight: normal;
}

.invalid-input {
  border: 1px solid #ff0000 !important;
  background-color: #fff5f5;
}

.error-message {
  color: #ff0000;
  font-size: 0.85em;
  margin-top: 4px;
}
</style>
