<template>
  <div class="parameter-block">
    <label class="parameter-name">
      {{name}}<span v-if="hasRange" class="range-hint"> ({{minCond}}-{{maxCond}})</span>
      <input
        v-if="isConditionsNotRanged()"
        type="number"
        v-bind:min="minCond"
        v-bind:max="maxCond"
        v-bind:class="{ 'invalid-input': !isValid }"
        placeholder="Enter Int Value"
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
        >
         : {{valueContainer}}
      </div>
      <div v-if="!isValid && errorMessage" class="error-message">{{errorMessage}}</div>
    </label>
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
      const numValue = parseInt(this.valueContainer, 10);
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
      const numValue = parseInt(this.valueContainer, 10);
      if (isNaN(numValue)) {
        this.errorMessage = 'Please enter a valid integer';
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
      this.activeLayer.setParameterValue(this.name, parseInt(this.valueContainer, 10));
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
          } else { // cas du inférieur strict
            this.maxCond = parseInt(strMaxCond.slice(1), 10) - 1;
          }
        }
      }
    },
  },
};
</script>

<style>
.parameter-select > input::-ms-expand {
  display: none;
}
.parameter-select > input{
  -webkit-appearance: none;
  appearance: none;
}

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
