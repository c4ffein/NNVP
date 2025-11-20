<template>
  <div class="ParamsBlock">
    <div class="ParamsBlock layer-title" @click="toggleLayer()">
      {{title}}
      <div class="layer-title-actions">
        <span v-if="layerType" class="help-icon" @click.stop="openModal" title="Learn about this layer">?</span>
        <div class="arrow">▲</div>
      </div>
    </div>
    <div class="ParamsBlock params-list" v-bind:class="{ closed: isClosed}">
      <slot></slot>
    </div>

    <!-- Help Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="layer-help-modal-overlay" @click="closeModal">
        <div class="layer-help-modal-container" @click.stop>
          <button class="layer-help-modal-close" @click="closeModal">&times;</button>
          <div class="layer-help-modal-body">
            <div v-html="getLayerHelp()"></div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script>

export default {
  name: 'ParamsBlock',
  props: {
    title: String,
    layerType: String, // The Keras layer type (e.g., 'Dense', 'Conv2D', etc.)
  },
  data() {
    return {
      isClosed: false,
      showModal: false,
    };
  },
  methods: {
    toggleLayer() {
      this.isClosed = !this.isClosed;
    },
    openModal() {
      this.showModal = true;
    },
    closeModal() {
      this.showModal = false;
    },
    getLayerHelp() {
      const layerHelp = {
        'Dense': `
          <h2>Dense Layer (Fully Connected)</h2>
          <p><strong>What it does:</strong> A Dense layer connects every input to every output. It's the most basic and common layer type in neural networks.</p>
          <h3>How it works:</h3>
          <p>Each neuron in a Dense layer receives input from ALL neurons in the previous layer, multiplies each by a weight, adds them up, and applies an activation function.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Classification:</strong> Final layer for predicting classes</li>
            <li><strong>Feature learning:</strong> Hidden layers to learn patterns</li>
            <li><strong>After flattening:</strong> To process flattened convolutional outputs</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>units:</strong> Number of neurons in the layer</li>
            <li><strong>activation:</strong> Function applied to output (relu, sigmoid, softmax, etc.)</li>
          </ul>
          <p><em>💡 Tip: Use 'relu' activation for hidden layers, 'softmax' for multi-class output, 'sigmoid' for binary output!</em></p>
        `,
        'Conv2D': `
          <h2>Conv2D Layer (2D Convolution)</h2>
          <p><strong>What it does:</strong> Applies sliding filters over 2D images to detect patterns like edges, textures, and shapes.</p>
          <h3>How it works:</h3>
          <p>A small filter (e.g., 3×3) slides across the image, computing dot products at each position. This creates a feature map highlighting where patterns appear.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Image recognition:</strong> Detecting features in photos</li>
            <li><strong>Computer vision:</strong> Object detection, segmentation</li>
            <li><strong>Spatial patterns:</strong> Any grid-like data with local patterns</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of different patterns to learn</li>
            <li><strong>kernel_size:</strong> Size of the sliding window (e.g., 3×3)</li>
            <li><strong>strides:</strong> How far the filter moves each step</li>
            <li><strong>padding:</strong> 'same' keeps size, 'valid' shrinks output</li>
          </ul>
          <p><em>💡 Tip: Start with 32 filters and 3×3 kernels. Use 'same' padding to preserve dimensions!</em></p>
        `,
        'MaxPooling2D': `
          <h2>MaxPooling2D Layer</h2>
          <p><strong>What it does:</strong> Reduces the spatial size of feature maps by taking the maximum value in each region.</p>
          <h3>How it works:</h3>
          <p>Divides the input into regions (e.g., 2×2) and outputs only the maximum value from each region. This reduces computation and helps the network focus on the strongest features.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>After Conv layers:</strong> To reduce size and computation</li>
            <li><strong>Translation invariance:</strong> Makes the network less sensitive to small shifts</li>
            <li><strong>Overfitting prevention:</strong> Reduces parameters to learn</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>pool_size:</strong> Size of pooling window (typically 2×2)</li>
            <li><strong>strides:</strong> How far the window moves (usually same as pool_size)</li>
          </ul>
          <p><em>💡 Tip: 2×2 pooling is standard. Apply after 1-2 Conv layers!</em></p>
        `,
        'Flatten': `
          <h2>Flatten Layer</h2>
          <p><strong>What it does:</strong> Converts multi-dimensional data (like images) into a 1D vector.</p>
          <h3>How it works:</h3>
          <p>Takes a multi-dimensional input (e.g., 28×28×32) and reshapes it into a single vector (e.g., 25088 values).</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Before Dense layers:</strong> Dense layers need 1D input</li>
            <li><strong>After Conv layers:</strong> To transition from spatial features to classification</li>
            <li><strong>Required transition:</strong> Between convolutional and fully connected parts</li>
          </ul>
          <h3>Key parameters:</h3>
          <p>No parameters! It just reshapes the data.</p>
          <p><em>💡 Tip: Always use Flatten before Dense layers when working with images!</em></p>
        `,
        'Dropout': `
          <h2>Dropout Layer</h2>
          <p><strong>What it does:</strong> Randomly "drops" (sets to zero) a percentage of neurons during training to prevent overfitting.</p>
          <h3>How it works:</h3>
          <p>During training, each neuron has a random chance of being temporarily removed. This forces the network to learn redundant representations and not rely too heavily on any single neuron.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Overfitting:</strong> When training accuracy is much higher than validation</li>
            <li><strong>After Dense layers:</strong> Especially in deep networks</li>
            <li><strong>Regularization:</strong> To make the model generalize better</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>rate:</strong> Fraction of neurons to drop (0.2 = 20%, 0.5 = 50%)</li>
          </ul>
          <p><em>💡 Tip: Start with 0.2-0.5. Higher rates for larger layers!</em></p>
        `,
        'LSTM': `
          <h2>LSTM Layer (Long Short-Term Memory)</h2>
          <p><strong>What it does:</strong> Processes sequences of data while remembering important information from the past and forgetting irrelevant details.</p>
          <h3>How it works:</h3>
          <p>Uses special gates (forget, input, output) to control information flow through time. This allows it to learn long-term dependencies in sequential data.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Time series:</strong> Stock prices, weather forecasting</li>
            <li><strong>Text:</strong> Language modeling, translation</li>
            <li><strong>Sequential data:</strong> Any data with temporal dependencies</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>units:</strong> Number of LSTM cells (memory capacity)</li>
            <li><strong>return_sequences:</strong> True if feeding to another RNN layer</li>
          </ul>
          <p><em>💡 Tip: Use 64-256 units. Set return_sequences=True for stacked LSTMs!</em></p>
        `,
        'Activation': `
          <h2>Activation Layer</h2>
          <p><strong>What it does:</strong> Applies a non-linear activation function to the input.</p>
          <h3>How it works:</h3>
          <p>Transforms values through a mathematical function. This adds non-linearity, allowing the network to learn complex patterns.</p>
          <h3>Common activations:</h3>
          <ul>
            <li><strong>ReLU:</strong> Max(0, x) - Fast and works well for hidden layers</li>
            <li><strong>Sigmoid:</strong> Squashes to 0-1 - Good for binary output</li>
            <li><strong>Tanh:</strong> Squashes to -1 to 1 - Centered around zero</li>
            <li><strong>Softmax:</strong> Converts to probabilities - Use for final classification</li>
          </ul>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Separate layer:</strong> When you want explicit control</li>
            <li><strong>Advanced activations:</strong> Like LeakyReLU, ELU</li>
          </ul>
          <p><em>💡 Tip: Usually better to specify activation in the layer itself (like Dense(activation='relu'))!</em></p>
        `,
        'BatchNormalization': `
          <h2>Batch Normalization Layer</h2>
          <p><strong>What it does:</strong> Normalizes the inputs of each layer to have mean 0 and variance 1, making training faster and more stable.</p>
          <h3>How it works:</h3>
          <p>For each mini-batch, it normalizes the activations, then applies learnable scaling and shifting parameters.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Deep networks:</strong> Helps train deeper models</li>
            <li><strong>After Conv/Dense:</strong> Before or after activation (both work)</li>
            <li><strong>Faster training:</strong> Allows higher learning rates</li>
          </ul>
          <h3>Benefits:</h3>
          <ul>
            <li>Reduces internal covariate shift</li>
            <li>Acts as regularization (slight effect)</li>
            <li>Allows higher learning rates</li>
          </ul>
          <p><em>💡 Tip: Place after Conv2D/Dense and before Activation. Very powerful for training stability!</em></p>
        `,
        'Input': `
          <h2>Input Layer</h2>
          <p><strong>What it does:</strong> Defines the shape of input data for your neural network.</p>
          <h3>How it works:</h3>
          <p>Specifies the dimensions of the data your model will receive. This is always the first layer in a model.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Always required:</strong> Every model needs an Input layer</li>
            <li><strong>Functional API:</strong> Explicitly defined when using Model API</li>
            <li><strong>Multiple inputs:</strong> When your model has several input sources</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>shape:</strong> Dimensions of input (e.g., (28, 28, 1) for MNIST)</li>
          </ul>
          <p><em>💡 Tip: Don't include batch size in shape. For images: (height, width, channels)!</em></p>
        `,
        'Output': `
          <h2>Output Layer</h2>
          <p><strong>What it does:</strong> Marks the final output of your neural network.</p>
          <h3>How it works:</h3>
          <p>This is typically a Dense layer with activation matching your task: softmax for multi-class, sigmoid for binary, or linear for regression.</p>
          <h3>Common configurations:</h3>
          <ul>
            <li><strong>Multi-class classification:</strong> Dense(num_classes, activation='softmax')</li>
            <li><strong>Binary classification:</strong> Dense(1, activation='sigmoid')</li>
            <li><strong>Regression:</strong> Dense(1, activation='linear' or None)</li>
          </ul>
          <p><em>💡 Tip: Match activation to your loss function! Softmax + categorical_crossentropy, Sigmoid + binary_crossentropy!</em></p>
        `,
        'GRU': `
          <h2>GRU Layer (Gated Recurrent Unit)</h2>
          <p><strong>What it does:</strong> Like LSTM but simpler - processes sequences with fewer parameters while still capturing long-term dependencies.</p>
          <h3>How it works:</h3>
          <p>Uses two gates (reset and update) instead of LSTM's three. This makes it faster to train while maintaining similar performance for many tasks.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Faster alternative to LSTM:</strong> When you want speed without sacrificing much performance</li>
            <li><strong>Limited data:</strong> Fewer parameters mean less overfitting</li>
            <li><strong>Sequential modeling:</strong> Time series, text, any temporal data</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>units:</strong> Number of GRU cells</li>
            <li><strong>return_sequences:</strong> True if feeding to another RNN layer</li>
          </ul>
          <p><em>💡 Tip: Try GRU before LSTM - it's often faster with similar results!</em></p>
        `,
        'SimpleRNN': `
          <h2>SimpleRNN Layer</h2>
          <p><strong>What it does:</strong> Basic recurrent layer that processes sequences. Simpler than LSTM/GRU but struggles with long-term dependencies.</p>
          <h3>How it works:</h3>
          <p>Maintains a hidden state that gets updated at each time step based on the current input and previous state. No special gating mechanisms.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Short sequences:</strong> When dependencies are nearby</li>
            <li><strong>Learning/experimentation:</strong> Understanding RNN basics</li>
            <li><strong>Simple patterns:</strong> When LSTM/GRU is overkill</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>units:</strong> Number of RNN cells</li>
            <li><strong>return_sequences:</strong> True if feeding to another RNN layer</li>
          </ul>
          <p><em>💡 Tip: For real applications, prefer LSTM or GRU. SimpleRNN is mainly for learning!</em></p>
        `,
        'Conv1D': `
          <h2>Conv1D Layer (1D Convolution)</h2>
          <p><strong>What it does:</strong> Applies sliding filters over 1D sequences to detect local patterns in sequential data.</p>
          <h3>How it works:</h3>
          <p>Like Conv2D but for 1D data. Slides a filter across a sequence (like text or time series) to extract features.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Text processing:</strong> Character or word-level features</li>
            <li><strong>Time series:</strong> Sensor data, audio, signals</li>
            <li><strong>Sequence patterns:</strong> Any 1D sequential data</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of different patterns to learn</li>
            <li><strong>kernel_size:</strong> Width of the sliding window</li>
            <li><strong>strides:</strong> How far the filter moves each step</li>
          </ul>
          <p><em>💡 Tip: Great alternative to RNNs for sequence data - often faster to train!</em></p>
        `,
        'Conv3D': `
          <h2>Conv3D Layer (3D Convolution)</h2>
          <p><strong>What it does:</strong> Applies 3D filters for video, volumetric, or spatio-temporal data.</p>
          <h3>How it works:</h3>
          <p>Like Conv2D but slides in 3 dimensions. Useful for data with depth/time dimension (videos, medical scans).</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Video analysis:</strong> Action recognition, video classification</li>
            <li><strong>Medical imaging:</strong> CT scans, MRI volumes</li>
            <li><strong>3D data:</strong> Point clouds, volumetric data</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of 3D patterns to learn</li>
            <li><strong>kernel_size:</strong> 3D filter size (e.g., 3×3×3)</li>
          </ul>
          <p><em>💡 Tip: Computationally expensive - use smaller kernel sizes!</em></p>
        `,
        'AveragePooling2D': `
          <h2>AveragePooling2D Layer</h2>
          <p><strong>What it does:</strong> Like MaxPooling but takes the average instead of maximum value in each region.</p>
          <h3>How it works:</h3>
          <p>Divides input into regions and outputs the average of values in each region. Smoother downsampling than MaxPooling.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Smooth features:</strong> When you want to preserve subtle information</li>
            <li><strong>Alternative to MaxPooling:</strong> Try both and see what works better</li>
            <li><strong>Less aggressive downsampling:</strong> Retains more information</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>pool_size:</strong> Size of pooling window (typically 2×2)</li>
          </ul>
          <p><em>💡 Tip: MaxPooling is more common, but AveragePooling can work better for some tasks!</em></p>
        `,
        'GlobalMaxPooling2D': `
          <h2>GlobalMaxPooling2D Layer</h2>
          <p><strong>What it does:</strong> Takes the maximum value across the entire spatial dimensions, reducing to 1 value per channel.</p>
          <h3>How it works:</h3>
          <p>For each channel, finds the single maximum value. Converts (height, width, channels) to just (channels).</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Before final Dense:</strong> Alternative to Flatten</li>
            <li><strong>Translation invariance:</strong> Position doesn't matter</li>
            <li><strong>Reduce parameters:</strong> Fewer values than Flatten</li>
          </ul>
          <h3>Key parameters:</h3>
          <p>No parameters!</p>
          <p><em>💡 Tip: Often used in modern architectures instead of Flatten. More compact!</em></p>
        `,
        'GlobalAveragePooling2D': `
          <h2>GlobalAveragePooling2D Layer</h2>
          <p><strong>What it does:</strong> Takes the average value across entire spatial dimensions, one value per channel.</p>
          <h3>How it works:</h3>
          <p>For each channel, computes the average. More robust to outliers than GlobalMaxPooling.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Before final Dense:</strong> Popular in modern CNNs</li>
            <li><strong>Regularization:</strong> Reduces overfitting</li>
            <li><strong>Smooth features:</strong> Less sensitive to noise</li>
          </ul>
          <h3>Key parameters:</h3>
          <p>No parameters!</p>
          <p><em>💡 Tip: Very popular in modern architectures (ResNet, MobileNet). Try it!</em></p>
        `,
        'Embedding': `
          <h2>Embedding Layer</h2>
          <p><strong>What it does:</strong> Converts integers (like word IDs) into dense vectors of fixed size.</p>
          <h3>How it works:</h3>
          <p>Learns a lookup table mapping each integer to a dense vector. Similar words end up with similar vectors.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Text processing:</strong> Converting words to vectors</li>
            <li><strong>Categorical features:</strong> With many categories</li>
            <li><strong>First layer for sequences:</strong> Before LSTM/GRU</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>input_dim:</strong> Size of vocabulary</li>
            <li><strong>output_dim:</strong> Dimension of embedding vectors</li>
          </ul>
          <p><em>💡 Tip: Start with 50-300 dimensions. Can use pre-trained embeddings like Word2Vec!</em></p>
        `,
        'Reshape': `
          <h2>Reshape Layer</h2>
          <p><strong>What it does:</strong> Changes the shape of tensors without changing the data.</p>
          <h3>How it works:</h3>
          <p>Reorganizes the same data into a different shape. Total number of elements must stay the same.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Dimension changes:</strong> Converting between formats</li>
            <li><strong>Before Conv layers:</strong> Preparing data for convolution</li>
            <li><strong>Custom architectures:</strong> When you need specific shapes</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>target_shape:</strong> New shape (product must equal original)</li>
          </ul>
          <p><em>💡 Tip: Use -1 in one dimension to auto-calculate it!</em></p>
        `,
        'Concatenate': `
          <h2>Concatenate Layer (Merge)</h2>
          <p><strong>What it does:</strong> Joins multiple tensors along a specified axis.</p>
          <h3>How it works:</h3>
          <p>Takes multiple inputs and stacks them together. Like putting arrays side-by-side.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Multi-input models:</strong> Combining different features</li>
            <li><strong>Skip connections:</strong> ResNet-style architectures</li>
            <li><strong>Feature fusion:</strong> Merging different pathways</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>axis:</strong> Which dimension to concatenate along</li>
          </ul>
          <p><em>💡 Tip: Common in advanced architectures. Enables skip connections!</em></p>
        `,
        'Add': `
          <h2>Add Layer (Merge)</h2>
          <p><strong>What it does:</strong> Element-wise addition of multiple tensors.</p>
          <h3>How it works:</h3>
          <p>Takes inputs of the same shape and adds them element by element. Used in skip connections.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Residual connections:</strong> ResNet-style architectures</li>
            <li><strong>Skip connections:</strong> Helping gradient flow</li>
            <li><strong>Combining features:</strong> When addition makes sense</li>
          </ul>
          <h3>Key parameters:</h3>
          <p>No parameters! Inputs must have same shape.</p>
          <p><em>💡 Tip: Core of ResNet architecture. Helps train very deep networks!</em></p>
        `,
        'Multiply': `
          <h2>Multiply Layer (Merge)</h2>
          <p><strong>What it does:</strong> Element-wise multiplication of multiple tensors.</p>
          <h3>How it works:</h3>
          <p>Takes inputs of the same shape and multiplies them element by element.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Attention mechanisms:</strong> Gating information flow</li>
            <li><strong>Feature weighting:</strong> Emphasizing important features</li>
            <li><strong>Custom operations:</strong> When multiplication is meaningful</li>
          </ul>
          <h3>Key parameters:</h3>
          <p>No parameters! Inputs must have same shape.</p>
          <p><em>💡 Tip: Useful for attention-like mechanisms and gating!</em></p>
        `,
      };

      return layerHelp[this.layerType] || `
        <h2>${this.layerType}</h2>
        <p>This is a ${this.layerType} layer. Documentation coming soon!</p>
        <p>Check the <a href="https://keras.io/api/layers/" target="_blank">Keras documentation</a> for more details.</p>
      `;
    },
  },
};
</script>

<style >
.ParamsBlock {
  height: 100%;
  box-sizing: border-box;
  -moz-box-sizing: border-box;
  -webkit-box-sizing: border-box;
  margin-bottom: 12px;
}
.ParamsBlock > h4 {
  display: inline-block;
}
.ParamsBlock.layer-title {
  background-color: transparent;
  overflow: hidden;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid #000000;
  border-radius: 15px;
  cursor: pointer;
  padding: 10px 12px;
  font-weight: var(--font-weight-semibold);
  color: #000000;
  transition: all 0.15s ease;
}
.ParamsBlock > .layer-title > .arrow {
  color: #000000;
  height: 15px;
  width: 15px;
  transform: rotate(180deg);
  vertical-align: middle;
  text-align: center;
  font-size: 10px;
  transition: transform 0.2s ease;
}
.ParamsBlock.closed > .layer-title > .arrow {
  transform: rotate(90deg);
}
.ParamsBlock.params-list {
  padding: 12px 4px;
  color: #000000;
}
.ParamsBlock.params-list.closed {
  height: 0;
  overflow: hidden;
  padding: 0;
}

/* Help button and actions */
.layer-title-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.help-icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #000000;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.help-icon:hover {
  background: #333333;
  transform: scale(1.1);
}

/* Modal styling - matching CompileOptions theme */
.layer-help-modal-overlay {
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

.layer-help-modal-container {
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

.layer-help-modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: transparent;
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
  transition: transform 0.2s ease;
}

.layer-help-modal-close:hover {
  transform: scale(1.1);
}

.layer-help-modal-body h2 {
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 24px;
  font-weight: var(--font-weight-semibold);
  color: #000000;
}

.layer-help-modal-body h3 {
  margin-top: 20px;
  margin-bottom: 12px;
  font-size: 18px;
  font-weight: var(--font-weight-semibold);
  color: #000000;
}

.layer-help-modal-body p {
  margin-bottom: 12px;
}

.layer-help-modal-body ul,
.layer-help-modal-body ol {
  margin-bottom: 12px;
  padding-left: 24px;
}

.layer-help-modal-body li {
  margin-bottom: 8px;
}

.layer-help-modal-body em {
  display: block;
  margin-top: 16px;
  font-style: italic;
  color: #666666;
}

.layer-help-modal-body a {
  color: #0066cc;
  text-decoration: underline;
}

.layer-help-modal-body a:hover {
  color: #0052a3;
}
</style>
