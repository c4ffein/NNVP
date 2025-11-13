<template>
  <div id="parameters-block">
    <span>
        {{name}} :
        <input
          type="text"
          v-model="valueSet"
          v-bind:class="{ 'invalid-input': !isValid }"
          @input="validateInput"
          @change="updateParamFromKerasLayer"
        />
        <div v-if="!isValid && errorMessage" class="error-message">{{errorMessage}}</div>
    </span>
  </div>
</template>

<script>
export default {
  name: 'StringParameter',
  props: {
    name: String,
    value: String,
    activeLayer: null,
  },
  data() {
    return {
      valueSet: this.activeLayer.parameterValues[this.name],
      errorMessage: '',
    };
  },

  computed: {
    isValid() {
      // Empty values are valid - Keras will use defaults for optional parameters
      if (this.valueSet === null || this.valueSet === undefined || this.valueSet === '') {
        return true;
      }
      // If a value is provided, it should not be only whitespace
      const trimmed = this.valueSet.trim();
      return trimmed.length > 0;
    },
  },

  methods: {
    validateInput() {
      // Empty is fine - Keras has defaults
      if (this.valueSet === null || this.valueSet === undefined || this.valueSet === '') {
        this.errorMessage = '';
        return;
      }
      // If value is provided but only whitespace, that's an error
      const trimmed = String(this.valueSet).trim();
      if (trimmed === '') {
        this.errorMessage = 'Value cannot be only whitespace';
      } else {
        this.errorMessage = '';
      }
    },
    updateParamFromKerasLayer() {
      this.activeLayer.setParameterValue(this.name, this.valueSet);
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style>
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
