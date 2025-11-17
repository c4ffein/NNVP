<template>
  <div id="CompileOptions" class="CompileOptions">
    <div class="CompileOptions options-container">

      <!-- Optimizer Section -->
      <div class="option-section">
        <div class="section-header">
          <span class="section-title">Optimizer</span>
          <span class="help-icon" data-tooltip="Algorithm that updates model weights during training">?</span>
        </div>
        <div class="section-content">
          <div class="option-row">
            <label>Algorithm</label>
            <select
              v-bind:value="selectedOptimizer"
              v-on:change="$emit('changeSelectedOptimizer', $event.target.value)"
            >
              <option
                v-bind:key="optimizer"
                v-for="optimizer in selectableOptimizers"
                v-bind:value="optimizer"
              >
                {{optimizer}}
              </option>
            </select>
          </div>

          <!-- Dynamic Optimizer Parameters -->
          <div
            v-for="param in currentOptimizerParams"
            v-bind:key="param.name"
            class="option-row optimizer-param"
          >
            <label>{{param.label}}</label>
            <input
              v-if="param.type === 'number'"
              type="number"
              v-bind:value="optimizerParams[param.name]"
              v-bind:step="param.step"
              v-bind:min="param.min"
              v-bind:max="param.max"
              v-bind:placeholder="param.hint"
              v-on:input="$emit('changeOptimizerParam', param.name, Number($event.target.value))"
            />
            <input
              v-else-if="param.type === 'checkbox'"
              type="checkbox"
              v-bind:checked="optimizerParams[param.name]"
              v-on:change="$emit('changeOptimizerParam', param.name, $event.target.checked)"
            />
            <span class="help-icon" v-bind:data-tooltip="param.help || param.hint">?</span>
          </div>
        </div>
      </div>

      <!-- Loss Function Section -->
      <div class="option-section">
        <div class="section-header">
          <span class="section-title">Loss Function</span>
          <span class="help-icon" data-tooltip="Measures how well the model predictions match the actual data">?</span>
        </div>
        <div class="section-content">
          <div class="option-row">
            <label>Function</label>
            <select
              v-bind:value="selectedLoss"
              v-on:change="$emit('changeSelectedLoss', $event.target.value)"
            >
              <option
                v-bind:key="loss"
                v-for="loss in selectableLosses"
                v-bind:value="loss"
              >
                {{loss}}
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- Training Parameters Section -->
      <div class="option-section">
        <div class="section-header">
          <span class="section-title">Training Parameters</span>
          <span class="help-icon" data-tooltip="Controls how the training process runs">?</span>
        </div>
        <div class="section-content">
          <div class="option-row">
            <label>Epochs</label>
            <input
              type="number"
              v-bind:value="epochs"
              v-on:input="$emit('changeEpochs', Number($event.target.value))"
            />
            <span class="help-icon" data-tooltip="Number of times to iterate over the entire training dataset">?</span>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script>
export default {
  name: 'CompileOptions',
  props: [
    'selectedOptimizer',
    'selectableOptimizers',
    'optimizerParams',
    'selectedLoss',
    'selectableLosses',
    'epochs',
  ],
  computed: {
    currentOptimizerParams() {
      // Define parameters for each optimizer
      const optimizerConfigs = {
        sgd: [
          { name: 'learningRate', label: 'Learning Rate', type: 'number', step: 0.001, min: 0.0001, max: 1, hint: 'default: 0.01', help: 'Controls how much to adjust weights. Higher = faster learning but less stable. Start with 0.01.' },
          { name: 'momentum', label: 'Momentum', type: 'number', step: 0.01, min: 0, max: 1, hint: 'default: 0', help: 'Helps accelerate SGD in relevant direction and dampen oscillations. Try 0.9 for faster convergence.' },
          { name: 'nesterov', label: 'Nesterov', type: 'checkbox', hint: 'momentum variant', help: 'Uses Nesterov momentum, a variant that often performs better. Enable when using momentum > 0.' },
        ],
        adam: [
          { name: 'learningRate', label: 'Learning Rate', type: 'number', step: 0.0001, min: 0.00001, max: 0.1, hint: 'default: 0.001', help: 'Step size for weight updates. Adam is less sensitive to this than SGD. Default 0.001 works well.' },
          { name: 'beta1', label: 'Beta 1', type: 'number', step: 0.01, min: 0, max: 1, hint: 'default: 0.9', help: 'Exponential decay rate for first moment estimates. Controls momentum. Usually keep at 0.9.' },
          { name: 'beta2', label: 'Beta 2', type: 'number', step: 0.001, min: 0, max: 1, hint: 'default: 0.999', help: 'Exponential decay rate for second moment estimates. Controls adaptive learning rate. Usually keep at 0.999.' },
          { name: 'epsilon', label: 'Epsilon', type: 'number', step: 0.0000001, min: 0, max: 1, hint: 'default: 1e-7', help: 'Small constant for numerical stability. Prevents division by zero. Rarely needs adjustment.' },
        ],
        rmsprop: [
          { name: 'learningRate', label: 'Learning Rate', type: 'number', step: 0.0001, min: 0.00001, max: 0.1, hint: 'default: 0.001', help: 'Step size for weight updates. RMSprop adapts the learning rate automatically. Start with 0.001.' },
          { name: 'momentum', label: 'Momentum', type: 'number', step: 0.01, min: 0, max: 1, hint: 'default: 0', help: 'Adds momentum to RMSprop. Can help speed up convergence. Try 0.9 if training is slow.' },
          { name: 'decay', label: 'Decay', type: 'number', step: 0.01, min: 0, max: 1, hint: 'default: 0', help: 'Learning rate decay over each update. Helps fine-tune at end of training. Usually leave at 0.' },
          { name: 'epsilon', label: 'Epsilon', type: 'number', step: 0.0000001, min: 0, max: 1, hint: 'default: 1e-7', help: 'Small constant for numerical stability. Prevents division by zero. Rarely needs adjustment.' },
        ],
        adagrad: [
          { name: 'learningRate', label: 'Learning Rate', type: 'number', step: 0.001, min: 0.0001, max: 1, hint: 'default: 0.01', help: 'Initial learning rate. Adagrad automatically decreases it during training. Start higher than other optimizers (0.01).' },
          { name: 'initialAccumulatorValue', label: 'Init Accumulator', type: 'number', step: 0.01, min: 0, max: 1, hint: 'default: 0.1', help: 'Starting value for gradient accumulation. Affects initial learning rate adaptation. Default 0.1 works well.' },
        ],
        adadelta: [
          { name: 'learningRate', label: 'Learning Rate', type: 'number', step: 0.001, min: 0.0001, max: 10, hint: 'default: 1', help: 'Scaling factor for weight updates. Adadelta is less sensitive to this. Default 1.0 is usually good.' },
          { name: 'rho', label: 'Rho', type: 'number', step: 0.01, min: 0, max: 1, hint: 'default: 0.95', help: 'Decay rate for moving averages. Controls how quickly old gradients are forgotten. Keep at 0.95.' },
          { name: 'epsilon', label: 'Epsilon', type: 'number', step: 0.0000001, min: 0, max: 1, hint: 'default: 1e-7', help: 'Small constant for numerical stability. Prevents division by zero. Rarely needs adjustment.' },
        ],
        adamax: [
          { name: 'learningRate', label: 'Learning Rate', type: 'number', step: 0.0001, min: 0.00001, max: 0.1, hint: 'default: 0.002', help: 'Step size for weight updates. Adamax uses slightly higher default (0.002) than Adam (0.001).' },
          { name: 'beta1', label: 'Beta 1', type: 'number', step: 0.01, min: 0, max: 1, hint: 'default: 0.9', help: 'Exponential decay rate for first moment estimates. Controls momentum. Usually keep at 0.9.' },
          { name: 'beta2', label: 'Beta 2', type: 'number', step: 0.001, min: 0, max: 1, hint: 'default: 0.999', help: 'Exponential decay rate for infinity norm. Controls adaptive learning rate. Usually keep at 0.999.' },
          { name: 'epsilon', label: 'Epsilon', type: 'number', step: 0.0000001, min: 0, max: 1, hint: 'default: 1e-7', help: 'Small constant for numerical stability. Prevents division by zero. Rarely needs adjustment.' },
        ],
      };
      return optimizerConfigs[this.selectedOptimizer] || [];
    },
  },
};
</script>

<style>
@font-face {
  font-family: var(--font-medium); font-weight: var(--font-weight-medium);
  src: url("/assets/fonts/Roboto-Regular-webfont.woff") format("woff");
}
@font-face {
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  src: url("/assets/fonts/Roboto-Thin-webfont.woff") format("woff");
}

/* Main Container */
#CompileOptions {
  height: 100%;
  width: 100%;
  cursor: default;
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  font-size: 15px;
  overflow-y: auto;
  overflow-x: hidden;
}

.CompileOptions.options-container {
  padding: 16px;
  display: flex;
  flex-direction: row;
  gap: 16px;
  align-items: flex-start;
}

/* Section Boxes */
.option-section {
  background: #fafafa;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 0;
  overflow: hidden;
  flex: 1;
  min-width: 280px;
}

/* Section Headers */
.section-header {
  background: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-medium);
  font-size: 14px;
  color: #333;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Section Content */
.section-content {
  padding: 12px 16px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Option Rows */
.option-row {
  display: grid;
  grid-template-columns: 130px 200px auto 1fr;
  align-items: center;
  gap: 12px;
}

.option-row label {
  text-align: left;
  color: #555;
  font-size: 14px;
}

.option-row select,
.option-row input[type="number"] {
  width: 200px;
  height: 34px;
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-family: var(--font-regular);
  font-size: 14px;
  line-height: 1.5;
  background: #fff;
  transition: border-color 0.2s ease;
  box-sizing: border-box;
}

.option-row select:focus,
.option-row input[type="number"]:focus {
  outline: none;
  border-color: #666;
}

.option-row select:hover,
.option-row input[type="number"]:hover {
  border-color: #999;
}

/* Parameter Labels with Hints */
.param-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.param-hint {
  font-size: 11px;
  color: #999;
  font-style: italic;
}

/* Checkbox Styling */
.optimizer-param input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: #333;
}

/* Help Icon with Tooltip */
.help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: #ddd;
  color: #666;
  border-radius: 50%;
  font-size: 12px;
  font-weight: bold;
  cursor: help;
  transition: all 0.2s ease;
  position: relative;
  flex-shrink: 0;
}

.help-icon:hover {
  background: #666;
  color: #fff;
}

/* Tooltip */
.help-icon[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  background: #333;
  color: #fff;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: normal;
  white-space: normal;
  width: 220px;
  text-align: left;
  z-index: 1000;
  pointer-events: none;
  line-height: 1.4;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

.help-icon[data-tooltip]:hover::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: calc(100% + 2px);
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: #333;
  z-index: 1001;
  pointer-events: none;
}

/* Scrollbar Styling */
#CompileOptions::-webkit-scrollbar {
  width: 8px;
}

#CompileOptions::-webkit-scrollbar-track {
  background: #f0f0f0;
}

#CompileOptions::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 4px;
}

#CompileOptions::-webkit-scrollbar-thumb:hover {
  background: #aaa;
}
</style>
