<template>
  <div id="CompileOptions" class="CompileOptions">
    <div class="CompileOptions options-container">

      <!-- Optimizer Section -->
      <div class="option-section optimizer-section">
        <div class="section-header">
          <span class="section-title">Optimizer</span>
          <span class="help-icon" @click="openModal('optimizer')">?</span>
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
            <span class="help-icon" @click="openModal('param-' + param.name)">?</span>
          </div>
        </div>
      </div>

      <!-- Loss Function Section -->
      <div class="option-section loss-section">
        <div class="section-header">
          <span class="section-title">Loss Function</span>
          <span class="help-icon" @click="openModal('loss')">?</span>
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
      <div class="option-section training-params-section">
        <div class="section-header">
          <span class="section-title">Training Parameters</span>
          <span class="help-icon" @click="openModal('training-params')">?</span>
        </div>
        <div class="section-content">
          <div class="option-row">
            <label>Epochs</label>
            <input
              type="number"
              v-bind:value="epochs"
              v-on:input="$emit('changeEpochs', Number($event.target.value))"
            />
            <span class="help-icon" @click="openModal('epochs')">?</span>
          </div>
        </div>
      </div>

    </div>

    <!-- Train Button -->
    <div class="train-button-container">
      <button
        class="train-button"
        :class="{ 'is-training': isTraining }"
        @click="$emit('trainClicked')"
      >
        {{ isTraining ? '■ Stop Training' : '▶ Start Training' }}
      </button>
    </div>

    <!-- Help Modal - Teleported to body to escape stacking context -->
    <Teleport to="body">
      <div v-if="activeModal" class="help-modal-overlay" @click="closeModal">
        <div class="help-modal-container" @click.stop>
          <button class="help-modal-close" @click="closeModal">&times;</button>
          <div class="help-modal-body">
          <!-- Modal content will go here -->
          <div v-if="activeModal === 'optimizer'">
            <h2>What is an Optimizer?</h2>
            <p>An optimizer is the algorithm that adjusts your neural network's weights during training to minimize the loss function.</p>
            <h3>How it works:</h3>
            <ol>
              <li>The model makes predictions</li>
              <li>The loss function measures how wrong those predictions are</li>
              <li>The optimizer uses this error to update the weights</li>
              <li>This process repeats, gradually improving the model</li>
            </ol>
            <h3>Choosing an Optimizer:</h3>
            <ul>
              <li><strong>Adam:</strong> Great default choice. Adapts learning rates automatically. Works well for most problems.</li>
              <li><strong>SGD:</strong> Classic optimizer. Simpler but requires more tuning. Good for understanding basics.</li>
              <li><strong>RMSprop:</strong> Good for recurrent networks. Adapts learning rates per parameter.</li>
            </ul>
            <p><em>💡 Tip: Start with Adam if you're unsure!</em></p>
          </div>

          <div v-else-if="activeModal === 'loss'">
            <h2>What is a Loss Function?</h2>
            <p>The loss function measures how wrong your model's predictions are. Lower loss = better predictions.</p>
            <h3>Common Loss Functions:</h3>
            <ul>
              <li><strong>Categorical Crossentropy:</strong> For classifying into multiple categories (e.g., recognizing digits 0-9). Use when labels are one-hot encoded.</li>
              <li><strong>Sparse Categorical Crossentropy:</strong> Same as above, but for integer labels instead of one-hot encoding.</li>
              <li><strong>Binary Crossentropy:</strong> For yes/no classification (e.g., cat vs dog).</li>
              <li><strong>Mean Squared Error:</strong> For predicting continuous values (e.g., house prices, temperatures).</li>
              <li><strong>Mean Absolute Error:</strong> Also for continuous values, but less sensitive to outliers.</li>
            </ul>
            <p><em>💡 Tip: Match the loss to your problem type!</em></p>
          </div>

          <div v-else-if="activeModal === 'training-params'">
            <h2>Training Parameters</h2>
            <p>Training parameters control how the learning process runs. These are separate from the optimizer and loss function.</p>
            <h3>Key Parameters:</h3>
            <ul>
              <li><strong>Epochs:</strong> How many times to go through the entire dataset. More epochs = more learning, but watch out for overfitting!</li>
              <li><strong>Batch Size:</strong> How many examples to process before updating weights. Larger batches are faster but use more memory.</li>
              <li><strong>Validation Split:</strong> Percentage of data to hold back for testing. Helps detect overfitting.</li>
            </ul>
            <h3>The Training Loop:</h3>
            <ol>
              <li>Take a batch of data</li>
              <li>Make predictions</li>
              <li>Calculate loss (error)</li>
              <li>Update weights using optimizer</li>
              <li>Repeat until all batches are done (1 epoch complete)</li>
              <li>Repeat for all epochs</li>
            </ol>
            <p><em>💡 Tip: Start simple - 10 epochs is a good starting point!</em></p>
          </div>

          <div v-else-if="activeModal === 'epochs'">
            <h2>What are Epochs?</h2>
            <p>An epoch is one complete pass through your entire training dataset.</p>
            <h3>Understanding Epochs:</h3>
            <ul>
              <li><strong>1 Epoch:</strong> The model sees each training example once</li>
              <li><strong>10 Epochs:</strong> The model sees each example 10 times, learning more each time</li>
              <li><strong>Too few:</strong> Model doesn't learn enough (underfitting)</li>
              <li><strong>Too many:</strong> Model memorizes training data (overfitting)</li>
            </ul>
            <h3>How to choose:</h3>
            <p>Start with 10-20 epochs. Watch the training charts:</p>
            <ul>
              <li>If loss is still decreasing → train longer</li>
              <li>If validation loss increases while training loss decreases → stop! (overfitting)</li>
            </ul>
            <p><em>💡 Tip: More epochs ≠ better model. Find the sweet spot!</em></p>
          </div>

          <div v-else-if="activeModal.startsWith('param-')">
            <!-- Learning Rate -->
            <div v-if="activeModal === 'param-learningRate'">
              <h2>Learning Rate</h2>
              <p><strong>What it does:</strong> Controls how big the steps are when updating the model's weights.</p>
              <p><strong>Too high:</strong> Training becomes unstable, the model might not learn at all (diverges).</p>
              <p><strong>Too low:</strong> Training is very slow, might get stuck in local minima.</p>
              <p><strong>How to choose:</strong> Start with the default value. If training is unstable, make it smaller (divide by 10). If training is too slow, make it larger (multiply by 2-3).</p>
              <p><em>Default: {{ getParamHelp(activeModal).hint }}</em></p>
            </div>

            <!-- Momentum -->
            <div v-else-if="activeModal === 'param-momentum'">
              <h2>Momentum</h2>
              <p><strong>What it does:</strong> Helps the optimizer "remember" previous updates and keep moving in consistent directions.</p>
              <p><strong>Benefits:</strong> Can speed up training and help escape shallow local minima. Like a ball rolling down a hill that builds up speed.</p>
              <p><strong>Typical values:</strong> 0.9 is a common choice. Higher values (up to 0.99) mean more "memory" of past updates.</p>
              <p><em>Default: {{ getParamHelp(activeModal).hint }}</em></p>
            </div>

            <!-- Decay -->
            <div v-else-if="activeModal === 'param-decay'">
              <h2>Learning Rate Decay</h2>
              <p><strong>What it does:</strong> Gradually reduces the learning rate as training progresses.</p>
              <p><strong>Why use it:</strong> Start with big steps to learn quickly, then take smaller steps to fine-tune. Like zooming in on a target.</p>
              <p><strong>When to use:</strong> Usually leave at 0. Only add decay if your model seems to be "bouncing around" near the end of training instead of converging smoothly.</p>
              <p><em>Default: {{ getParamHelp(activeModal).hint }}</em></p>
            </div>

            <!-- Epsilon -->
            <div v-else-if="activeModal === 'param-epsilon'">
              <h2>Epsilon</h2>
              <p><strong>What it does:</strong> A tiny number added to denominators to prevent division by zero.</p>
              <p><strong>Technical detail:</strong> Some optimizers divide by gradient statistics. Without epsilon, you might divide by zero and crash.</p>
              <p><strong>Should you change it?</strong> Almost never. The default value (0.0000001) works for nearly all cases.</p>
              <p><em>Default: {{ getParamHelp(activeModal).hint }}</em></p>
            </div>

            <!-- Beta 1 (Adam) -->
            <div v-else-if="activeModal === 'param-beta1'">
              <h2>Beta 1 (First Moment)</h2>
              <p><strong>What it does:</strong> Controls the exponential decay rate for the first moment estimate (the mean of gradients).</p>
              <p><strong>In simple terms:</strong> This is like momentum for Adam. It helps the optimizer build up speed in consistent directions.</p>
              <p><strong>Typical values:</strong> 0.9 is the standard. Values closer to 1.0 mean more "memory" of past gradients.</p>
              <p><strong>Should you change it?</strong> Rarely. The default 0.9 works well for most problems. Only adjust if you have a specific reason.</p>
              <p><em>Default: {{ getParamHelp(activeModal).hint }}</em></p>
            </div>

            <!-- Beta 2 (Adam) -->
            <div v-else-if="activeModal === 'param-beta2'">
              <h2>Beta 2 (Second Moment)</h2>
              <p><strong>What it does:</strong> Controls the exponential decay rate for the second moment estimate (the variance of gradients).</p>
              <p><strong>In simple terms:</strong> This helps Adam adapt the learning rate for each parameter individually. Parameters with high variance get smaller learning rates.</p>
              <p><strong>Typical values:</strong> 0.999 is standard. Should be higher than Beta 1. Values closer to 1.0 mean slower adaptation.</p>
              <p><strong>Should you change it?</strong> Very rarely. The default 0.999 is well-tuned for most use cases.</p>
              <p><em>Default: {{ getParamHelp(activeModal).hint }}</em></p>
            </div>

            <!-- Other parameters - use generic help -->
            <div v-else-if="getParamHelp(activeModal)">
              <h2>{{ getParamHelp(activeModal).label }}</h2>
              <p>{{ getParamHelp(activeModal).help }}</p>
              <p><em>Default: {{ getParamHelp(activeModal).hint }}</em></p>
            </div>
          </div>

          <div v-else>
            <h2>Help</h2>
            <p>Click on any ? icon to learn more about that feature!</p>
          </div>
        </div>
      </div>
    </div>
    </Teleport>
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
    'isTraining',
  ],
  data() {
    return {
      activeModal: null, // Tracks which help modal is open
    };
  },
  methods: {
    openModal(topic) {
      this.activeModal = topic;
    },
    closeModal() {
      this.activeModal = null;
    },
    getParamHelp(modalId) {
      const paramName = modalId.replace('param-', '');
      return this.currentOptimizerParams.find(p => p.name === paramName);
    },
  },
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
  grid-template-columns: 130px 1fr auto;
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
  width: 100%;
  max-width: 300px;
  min-height: 36px;
  height: 36px;
  padding: 7px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-family: var(--font-regular);
  font-size: 14px;
  line-height: 20px;
  background: #fff;
  transition: border-color 0.2s ease;
  box-sizing: border-box;
  vertical-align: middle;
  display: inline-block;
}

.option-row select {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23333' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 32px;
  background-color: #fff;
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

/* Help Icon */
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
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  flex-shrink: 0;
}

.help-icon:hover {
  background: #666;
  color: #fff;
}

/* Help Modal Styles - Matching AboutModal */
.help-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: transparent;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 10000;
  padding-top: 40px;
}

.help-modal-container {
  background: #ffffff;
  border-radius: 15px;
  border: 1px solid #000000;
  max-width: 600px;
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: none;
  position: relative;
  padding: 32px;
  font-family: var(--font-regular);
  font-weight: var(--font-weight-regular);
  color: #000000;
  line-height: 1.6;
  text-align: left;
}

.help-modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  font-size: 32px;
  line-height: 1;
  color: #000000;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;
}

.help-modal-close:hover {
  opacity: 0.6;
}

.help-modal-close:focus {
  outline: none;
}

.help-modal-body h2 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-medium);
  font-size: 1.4em;
  margin: 0 0 12px 0;
  color: #000000;
  border-bottom: 1px solid #000000;
  padding-bottom: 6px;
}

.help-modal-body h3 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-medium);
  font-size: 1.1em;
  margin: 20px 0 12px 0;
  color: #000000;
}

.help-modal-body p {
  margin: 0 0 12px 0;
  font-size: 0.95em;
  color: #000000;
}

.help-modal-body ul,
.help-modal-body ol {
  margin: 0 0 12px 0;
  padding-left: 24px;
  color: #000000;
  line-height: 1.6;
  font-size: 0.95em;
}

.help-modal-body li {
  margin-bottom: 6px;
}

.help-modal-body strong {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-medium);
  color: #000000;
}

.help-modal-body em {
  color: #000000;
  font-style: italic;
  font-size: 0.95em;
}

/* Scrollbar styling */
.help-modal-container::-webkit-scrollbar {
  width: 8px;
}

.help-modal-container::-webkit-scrollbar-track {
  background: #f5f5f5;
  border-radius: 4px;
}

.help-modal-container::-webkit-scrollbar-thumb {
  background: #000000;
  border-radius: 4px;
}

.help-modal-container::-webkit-scrollbar-thumb:hover {
  opacity: 0.7;
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

/* Train Button */
.train-button-container {
  padding: 16px;
  display: flex;
  justify-content: center;
}

.train-button {
  padding: 12px 32px;
  font-size: 16px;
  font-family: var(--font-medium);
  font-weight: var(--font-weight-medium);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #4CAF50;
  color: white;
}

.train-button:hover {
  background: #43A047;
  transform: translateY(-1px);
}

.train-button:active {
  transform: translateY(0);
}

.train-button.is-training {
  background: #f44336;
}

.train-button.is-training:hover {
  background: #e53935;
}
</style>
