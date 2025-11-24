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
          <h2>Dense Layer</h2>
          <p><strong>What it does:</strong> Creates a fully connected neural network layer where every input neuron connects to every output neuron with learnable weights.</p>
          <h3>How it works:</h3>
          <p>Performs a matrix multiplication between inputs and weights, adds a bias term, then applies an activation function. This operation transforms the input data into a new representation with the specified number of output dimensions.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Classification tasks:</strong> Use as final layers with softmax activation for multi-class or sigmoid for binary classification</li>
            <li><strong>Feature extraction:</strong> Add between convolutional layers to learn complex patterns and reduce dimensionality</li>
            <li><strong>Regression problems:</strong> Use as output layer with linear activation to predict continuous values</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>units:</strong> Number of output neurons (required) - determines the dimensionality of the output space</li>
            <li><strong>activation:</strong> Activation function to use (e.g., 'relu', 'sigmoid', 'softmax', 'linear')</li>
            <li><strong>use_bias:</strong> Whether to include a bias vector (default: True) - helps the model fit data better</li>
          </ul>
          <p><em>💡 Tip: Start with 'relu' activation for hidden layers and match your final layer's activation to your problem type - 'softmax' for multi-class, 'sigmoid' for binary classification, or 'linear' for regression!</em></p>
        `,
        'Conv2D': `
          <h2>Conv2D Layer</h2>
          <p><strong>What it does:</strong> Applies learnable filters to detect features like edges, textures, and patterns in 2D data (typically images).</p>
          <h3>How it works:</h3>
          <p>Slides multiple filter kernels across the input image, computing dot products at each position to create feature maps. Each filter learns to detect specific patterns during training.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Image classification:</strong> Extract hierarchical features from raw pixel data for recognizing objects</li>
            <li><strong>Feature detection:</strong> Identify edges, corners, textures, or specific patterns in images</li>
            <li><strong>Spatial data processing:</strong> Process any grid-like data where local patterns matter (e.g., game boards, heatmaps)</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of output filters (feature maps) - typically powers of 2 like 32, 64, 128</li>
            <li><strong>kernel_size:</strong> Size of the filter window - common values are (3,3) or (5,5)</li>
            <li><strong>activation:</strong> Activation function applied to outputs - 'relu' is most common for hidden layers</li>
            <li><strong>padding:</strong> 'same' preserves spatial dimensions, 'valid' reduces them</li>
          </ul>
          <p><em>💡 Tip: Start with fewer filters (32-64) in early layers and increase gradually in deeper layers - this builds from simple to complex features!</em></p>
        `,
        'MaxPooling2D': `
          <h2>MaxPooling2D Layer</h2>
          <p><strong>What it does:</strong> Reduces the spatial dimensions of feature maps by selecting the maximum value from each pooling window, helping to downsample data and extract dominant features.</p>
          <h3>How it works:</h3>
          <p>The layer slides a window (e.g., 2x2) across the input and outputs only the maximum value from each window region. This reduces the height and width of the data while preserving the most prominent features detected by previous layers.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Reducing computation:</strong> Decreases the number of parameters in subsequent layers by shrinking spatial dimensions</li>
            <li><strong>Feature extraction:</strong> Helps the network focus on the most important features while becoming more invariant to small translations</li>
            <li><strong>Preventing overfitting:</strong> Acts as a form of regularization by reducing the spatial resolution and model complexity</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>pool_size:</strong> Size of the pooling window (default: (2, 2)) - determines how much downsampling occurs</li>
            <li><strong>strides:</strong> Step size for moving the pooling window (default: None, which equals pool_size) - controls overlap between windows</li>
            <li><strong>padding:</strong> Either 'valid' (no padding) or 'same' (pad to keep output size same as input when stride=1)</li>
          </ul>
          <p><em>💡 Tip: A 2x2 pool with stride 2 is the most common configuration, reducing each dimension by half - use this as your starting point and adjust only if needed!</em></p>
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
        // Advanced Activations
        'LeakyReLU': `
          <h2>LeakyReLU Layer</h2>
          <p><strong>What it does:</strong> Like ReLU but allows small negative values instead of zero.</p>
          <h3>How it works:</h3>
          <p>For positive values: output = input. For negative values: output = alpha * input (where alpha is small, like 0.3).</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Dying ReLU problem:</strong> When ReLU neurons get stuck at zero</li>
            <li><strong>Better gradient flow:</strong> Gradients flow even for negative inputs</li>
            <li><strong>GANs:</strong> Very popular in generative models</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>alpha:</strong> Slope for negative values (default 0.3)</li>
          </ul>
          <p><em>💡 Tip: Good default alternative to ReLU. Try it if ReLU isn't working well!</em></p>
        `,
        'PReLU': `
          <h2>PReLU Layer (Parametric ReLU)</h2>
          <p><strong>What it does:</strong> Like LeakyReLU but learns the slope for negative values during training.</p>
          <h3>How it works:</h3>
          <p>The alpha parameter is learned rather than fixed. Each channel can have its own alpha.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>When you're unsure:</strong> Let the network learn the best slope</li>
            <li><strong>Complex models:</strong> Where different channels need different behaviors</li>
            <li><strong>Fine-tuning:</strong> Can improve over fixed LeakyReLU</li>
          </ul>
          <h3>Key parameters:</h3>
          <p>No parameters - alpha is learned automatically!</p>
          <p><em>💡 Tip: More flexible than LeakyReLU but adds a few more parameters to learn!</em></p>
        `,
        'ELU': `
          <h2>ELU Layer (Exponential Linear Unit)</h2>
          <p><strong>What it does:</strong> Smooth activation that can output negative values, reducing bias shift.</p>
          <h3>How it works:</h3>
          <p>For positive: output = input. For negative: output = alpha * (exp(input) - 1). Smooth transition!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Better than ReLU:</strong> Often faster convergence</li>
            <li><strong>Smooth gradients:</strong> No dead neurons problem</li>
            <li><strong>Deep networks:</strong> Helps with vanishing gradients</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>alpha:</strong> Controls saturation for negative values (default 1.0)</li>
          </ul>
          <p><em>💡 Tip: Often outperforms ReLU but slightly slower to compute!</em></p>
        `,
        'ThresholdedReLU': `
          <h2>ThresholdedReLU Layer</h2>
          <p><strong>What it does:</strong> ReLU with a threshold - only activates above a certain value.</p>
          <h3>How it works:</h3>
          <p>If input > theta: output = input. Otherwise: output = 0.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Sparse activations:</strong> Want even more sparsity than ReLU</li>
            <li><strong>Noise filtering:</strong> Ignore small activations</li>
            <li><strong>Experimental:</strong> Less common, try if you want sparsity</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>theta:</strong> Threshold value (default 1.0)</li>
          </ul>
          <p><em>💡 Tip: Not widely used - stick with ReLU/LeakyReLU for most cases!</em></p>
        `,
        'ReLU': `
          <h2>ReLU Layer (Rectified Linear Unit)</h2>
          <p><strong>What it does:</strong> Outputs input if positive, zero if negative. Simple and effective!</p>
          <h3>How it works:</h3>
          <p>output = max(0, input). Dead simple, but works amazingly well.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Default choice:</strong> Start here for hidden layers</li>
            <li><strong>Fast training:</strong> No vanishing gradient like sigmoid/tanh</li>
            <li><strong>Sparse activations:</strong> Many neurons output zero</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>max_value:</strong> Cap maximum output (optional)</li>
            <li><strong>negative_slope:</strong> Can make it behave like LeakyReLU</li>
            <li><strong>threshold:</strong> Can make it behave like ThresholdedReLU</li>
          </ul>
          <p><em>💡 Tip: The default activation for most deep learning! Start here!</em></p>
        `,
        'Softmax': `
          <h2>Softmax Layer</h2>
          <p><strong>What it does:</strong> Converts logits to probabilities that sum to 1.</p>
          <h3>How it works:</h3>
          <p>Applies exponential to each value, then normalizes so they sum to 1. Larger values get higher probabilities.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Multi-class output:</strong> Final layer for classification</li>
            <li><strong>Attention mechanisms:</strong> Computing attention weights</li>
            <li><strong>Probability distributions:</strong> When you need valid probabilities</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>axis:</strong> Which axis to apply softmax (default -1)</li>
          </ul>
          <p><em>💡 Tip: Use with categorical_crossentropy loss for multi-class classification!</em></p>
        `,
        // More Pooling
        'MaxPooling1D': `
          <h2>MaxPooling1D Layer</h2>
          <p><strong>What it does:</strong> MaxPooling for 1D sequences (like text or time series).</p>
          <h3>How it works:</h3>
          <p>Takes maximum value in each window along the sequence dimension.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>After Conv1D:</strong> Reduce sequence length</li>
            <li><strong>Text/sequences:</strong> Downsample temporal features</li>
            <li><strong>Extract strongest features:</strong> Focus on peaks</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>pool_size:</strong> Size of window (typically 2)</li>
            <li><strong>strides:</strong> How far to move the window</li>
          </ul>
          <p><em>💡 Tip: Use after Conv1D layers for efficient sequence processing!</em></p>
        `,
        'MaxPooling3D': `
          <h2>MaxPooling3D Layer</h2>
          <p><strong>What it does:</strong> MaxPooling for 3D data (videos, volumetric data).</p>
          <h3>How it works:</h3>
          <p>Takes maximum in 3D regions. Reduces spatial and temporal/depth dimensions.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>After Conv3D:</strong> Downsample videos or volumes</li>
            <li><strong>Medical imaging:</strong> 3D scans (CT, MRI)</li>
            <li><strong>Video processing:</strong> Reduce spatio-temporal size</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>pool_size:</strong> 3D window size (e.g., (2,2,2))</li>
          </ul>
          <p><em>💡 Tip: Computationally expensive - use wisely!</em></p>
        `,
        'AveragePooling1D': `
          <h2>AveragePooling1D Layer</h2>
          <p><strong>What it does:</strong> AveragePooling for 1D sequences.</p>
          <h3>How it works:</h3>
          <p>Takes average value in each window. Smoother than MaxPooling1D.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Smooth downsampling:</strong> Preserve more information</li>
            <li><strong>After Conv1D:</strong> Alternative to MaxPooling1D</li>
            <li><strong>Signal processing:</strong> When averaging makes sense</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>pool_size:</strong> Window size (typically 2)</li>
          </ul>
          <p><em>💡 Tip: Try both Max and Average pooling - depends on your data!</em></p>
        `,
        'AveragePooling3D': `
          <h2>AveragePooling3D Layer</h2>
          <p><strong>What it does:</strong> AveragePooling for 3D data.</p>
          <h3>How it works:</h3>
          <p>Takes average in 3D regions. Smoother downsampling than MaxPooling3D.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>After Conv3D:</strong> Alternative to MaxPooling3D</li>
            <li><strong>Smooth features:</strong> When you want less aggressive pooling</li>
            <li><strong>Medical/video:</strong> Preserve subtle patterns</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>pool_size:</strong> 3D window (e.g., (2,2,2))</li>
          </ul>
          <p><em>💡 Tip: Less common than Max but worth trying!</em></p>
        `,
        'GlobalMaxPooling1D': `
          <h2>GlobalMaxPooling1D Layer</h2>
          <p><strong>What it does:</strong> Takes max across entire sequence, one value per channel.</p>
          <h3>How it works:</h3>
          <p>For each channel, finds the single maximum value across all time steps.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Sequence classification:</strong> Before final Dense layer</li>
            <li><strong>Text classification:</strong> Capture most important features</li>
            <li><strong>After Conv1D:</strong> Reduce to fixed size for variable-length sequences</li>
          </ul>
          <h3>Key parameters:</h3>
          <p>No parameters!</p>
          <p><em>💡 Tip: Great for variable-length sequences. Position-invariant!</em></p>
        `,
        'GlobalAveragePooling1D': `
          <h2>GlobalAveragePooling1D Layer</h2>
          <p><strong>What it does:</strong> Takes average across entire sequence, one value per channel.</p>
          <h3>How it works:</h3>
          <p>For each channel, computes the average across all time steps.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Sequence classification:</strong> More robust to outliers than GlobalMax</li>
            <li><strong>After Conv1D:</strong> Fixed-size output from variable sequences</li>
            <li><strong>Smooth aggregation:</strong> When average is meaningful</li>
          </ul>
          <h3>Key parameters:</h3>
          <p>No parameters!</p>
          <p><em>💡 Tip: Often works better than GlobalMax for text classification!</em></p>
        `,
        // More Merge
        'Subtract': `
          <h2>Subtract Layer (Merge)</h2>
          <p><strong>What it does:</strong> Element-wise subtraction of two tensors.</p>
          <h3>How it works:</h3>
          <p>Takes two inputs of same shape and subtracts second from first: output = input1 - input2.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Difference detection:</strong> Finding changes between inputs</li>
            <li><strong>Residual learning:</strong> Computing residuals</li>
            <li><strong>Custom architectures:</strong> When subtraction is meaningful</li>
          </ul>
          <h3>Key parameters:</h3>
          <p>No parameters! Inputs must have same shape.</p>
          <p><em>💡 Tip: Less common than Add but useful for specific tasks!</em></p>
        `,
        'Average': `
          <h2>Average Layer (Merge)</h2>
          <p><strong>What it does:</strong> Element-wise average of multiple tensors.</p>
          <h3>How it works:</h3>
          <p>Takes multiple inputs of same shape and averages them element by element.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Ensemble-like:</strong> Averaging multiple pathways</li>
            <li><strong>Smoothing:</strong> Reduce variance in merged features</li>
            <li><strong>Model averaging:</strong> Combining predictions</li>
          </ul>
          <h3>Key parameters:</h3>
          <p>No parameters! All inputs must have same shape.</p>
          <p><em>💡 Tip: Good for combining features from different pathways!</em></p>
        `,
        'Maximum': `
          <h2>Maximum Layer (Merge)</h2>
          <p><strong>What it does:</strong> Element-wise maximum of multiple tensors.</p>
          <h3>How it works:</h3>
          <p>For each position, outputs the maximum value across all inputs.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Maxout networks:</strong> Specific architecture style</li>
            <li><strong>Feature competition:</strong> Let strongest feature win</li>
            <li><strong>Custom operations:</strong> When max makes sense</li>
          </ul>
          <h3>Key parameters:</h3>
          <p>No parameters! Inputs must have same shape.</p>
          <p><em>💡 Tip: Used in Maxout networks for regularization!</em></p>
        `,
        'Minimum': `
          <h2>Minimum Layer (Merge)</h2>
          <p><strong>What it does:</strong> Element-wise minimum of multiple tensors.</p>
          <h3>How it works:</h3>
          <p>For each position, outputs the minimum value across all inputs.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Rare:</strong> Not commonly used</li>
            <li><strong>Clamping:</strong> Enforce upper bounds</li>
            <li><strong>Custom operations:</strong> When min is meaningful</li>
          </ul>
          <h3>Key parameters:</h3>
          <p>No parameters! Inputs must have same shape.</p>
          <p><em>💡 Tip: Very uncommon - use only if you have specific needs!</em></p>
        `,
        'Dot': `
          <h2>Dot Layer (Merge)</h2>
          <p><strong>What it does:</strong> Computes dot product between samples in two tensors.</p>
          <h3>How it works:</h3>
          <p>Performs dot product along specified axes. Can compute attention-like operations.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Attention mechanisms:</strong> Query-key similarity</li>
            <li><strong>Similarity computation:</strong> Measure vector similarity</li>
            <li><strong>Custom operations:</strong> When dot product is needed</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>axes:</strong> Which axes to compute dot product along</li>
            <li><strong>normalize:</strong> Whether to normalize (cosine similarity)</li>
          </ul>
          <p><em>💡 Tip: Core operation for attention mechanisms!</em></p>
        `,
        // Image Processing
        'UpSampling2D': `
          <h2>UpSampling2D Layer</h2>
          <p><strong>What it does:</strong> Increases spatial dimensions by repeating rows and columns.</p>
          <h3>How it works:</h3>
          <p>Repeats each row and column a specified number of times. Simple upscaling without learning.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Decoder networks:</strong> Autoencoders, segmentation</li>
            <li><strong>GANs:</strong> Generating larger images</li>
            <li><strong>Before convolution:</strong> Increase resolution</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>size:</strong> Upsampling factors (e.g., (2,2) doubles dimensions)</li>
            <li><strong>interpolation:</strong> 'nearest' (default) or 'bilinear'</li>
          </ul>
          <p><em>💡 Tip: Fast but simple. Consider Conv2DTranspose for learnable upsampling!</em></p>
        `,
        'UpSampling1D': `
          <h2>UpSampling1D Layer</h2>
          <p><strong>What it does:</strong> Increases sequence length by repeating each timestep.</p>
          <h3>How it works:</h3>
          <p>Repeats each timestep a specified number of times along the temporal dimension.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Sequence generation:</strong> Decoder for sequences</li>
            <li><strong>Audio/signal:</strong> Increase sampling rate</li>
            <li><strong>Before Conv1D:</strong> Increase temporal resolution</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>size:</strong> Upsampling factor (e.g., 2 doubles length)</li>
          </ul>
          <p><em>💡 Tip: Simple repetition - no learning involved!</em></p>
        `,
        'UpSampling3D': `
          <h2>UpSampling3D Layer</h2>
          <p><strong>What it does:</strong> Increases 3D dimensions by repeating along all three axes.</p>
          <h3>How it works:</h3>
          <p>Repeats data in 3D space. Used for volumetric or video upsampling.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>3D segmentation:</strong> Medical imaging</li>
            <li><strong>Video generation:</strong> Increase resolution</li>
            <li><strong>Volumetric data:</strong> Decoder networks</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>size:</strong> Upsampling factors for 3 dimensions</li>
          </ul>
          <p><em>💡 Tip: Very memory intensive - use carefully!</em></p>
        `,
        'ZeroPadding2D': `
          <h2>ZeroPadding2D Layer</h2>
          <p><strong>What it does:</strong> Adds rows and columns of zeros around the input image.</p>
          <h3>How it works:</h3>
          <p>Pads borders with zeros. Used to control output size or prevent information loss at edges.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Before Conv2D:</strong> Control output dimensions</li>
            <li><strong>Preserve size:</strong> Keep spatial dimensions constant</li>
            <li><strong>Manual padding:</strong> When you need specific padding</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>padding:</strong> Number of rows/cols to add (e.g., (1,1) or ((1,1),(2,2)))</li>
          </ul>
          <p><em>💡 Tip: Usually Conv2D's 'same' padding is enough, but this gives more control!</em></p>
        `,
        'ZeroPadding1D': `
          <h2>ZeroPadding1D Layer</h2>
          <p><strong>What it does:</strong> Adds zeros at the beginning and end of sequences.</p>
          <h3>How it works:</h3>
          <p>Pads temporal dimension with zeros on both sides.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Before Conv1D:</strong> Control sequence length</li>
            <li><strong>Causal padding:</strong> Add padding at start only</li>
            <li><strong>Manual control:</strong> Specific padding requirements</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>padding:</strong> How much to add (e.g., 1 or (1,2) for asymmetric)</li>
          </ul>
          <p><em>💡 Tip: Useful for causal convolutions in time series!</em></p>
        `,
        'ZeroPadding3D': `
          <h2>ZeroPadding3D Layer</h2>
          <p><strong>What it does:</strong> Adds zeros around 3D data (videos, volumes).</p>
          <h3>How it works:</h3>
          <p>Pads all three spatial/temporal dimensions with zeros.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Before Conv3D:</strong> Control output dimensions</li>
            <li><strong>3D data processing:</strong> Medical imaging, videos</li>
            <li><strong>Manual padding:</strong> Specific 3D padding needs</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>padding:</strong> Padding for 3 dimensions</li>
          </ul>
          <p><em>💡 Tip: Rarely needed - Conv3D padding usually sufficient!</em></p>
        `,
        'Cropping2D': `
          <h2>Cropping2D Layer</h2>
          <p><strong>What it does:</strong> Removes rows and columns from the edges of images.</p>
          <h3>How it works:</h3>
          <p>Crops borders to reduce spatial dimensions. Opposite of padding.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Dimension matching:</strong> Make sizes compatible</li>
            <li><strong>U-Net architectures:</strong> Match encoder/decoder sizes</li>
            <li><strong>Remove borders:</strong> Eliminate edge artifacts</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>cropping:</strong> How much to remove (e.g., (1,1) or ((1,2),(3,4)))</li>
          </ul>
          <p><em>💡 Tip: Essential for U-Net style architectures!</em></p>
        `,
        'Cropping1D': `
          <h2>Cropping1D Layer</h2>
          <p><strong>What it does:</strong> Removes timesteps from beginning and/or end of sequences.</p>
          <h3>How it works:</h3>
          <p>Crops temporal dimension by removing steps from edges.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Sequence alignment:</strong> Match lengths</li>
            <li><strong>Remove padding:</strong> After processing</li>
            <li><strong>Temporal trimming:</strong> Focus on middle portion</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>cropping:</strong> How much to crop (e.g., (1,1))</li>
          </ul>
          <p><em>💡 Tip: Opposite of ZeroPadding1D!</em></p>
        `,
        'Cropping3D': `
          <h2>Cropping3D Layer</h2>
          <p><strong>What it does:</strong> Removes slices from 3D data edges.</p>
          <h3>How it works:</h3>
          <p>Crops three dimensions to reduce volume size.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>3D U-Net:</strong> Match encoder/decoder dimensions</li>
            <li><strong>Volume trimming:</strong> Remove unnecessary regions</li>
            <li><strong>Dimension matching:</strong> Make compatible sizes</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>cropping:</strong> Crop amounts for 3 dimensions</li>
          </ul>
          <p><em>💡 Tip: Useful in 3D segmentation architectures!</em></p>
        `,
        'SeparableConv2D': `
          <h2>SeparableConv2D Layer</h2>
          <p><strong>What it does:</strong> Efficient convolution that separates spatial and channel-wise operations.</p>
          <h3>How it works:</h3>
          <p>Performs depthwise convolution (spatial) followed by pointwise convolution (channels). Much fewer parameters than regular Conv2D!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Mobile models:</strong> Reduce parameters and computation</li>
            <li><strong>Limited resources:</strong> Faster and smaller models</li>
            <li><strong>Similar performance:</strong> Often works as well as Conv2D</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of output channels</li>
            <li><strong>kernel_size:</strong> Spatial filter size</li>
            <li><strong>depth_multiplier:</strong> Depthwise filter multiplier</li>
          </ul>
          <p><em>💡 Tip: Key to MobileNet efficiency. Much faster than regular Conv2D!</em></p>
        `,
        'SeparableConv1D': `
          <h2>SeparableConv1D Layer</h2>
          <p><strong>What it does:</strong> Efficient 1D convolution with separated operations.</p>
          <h3>How it works:</h3>
          <p>Like SeparableConv2D but for sequences. Depthwise then pointwise convolution.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Efficient sequence models:</strong> Reduce parameters</li>
            <li><strong>Mobile/embedded:</strong> Faster inference</li>
            <li><strong>Time series:</strong> When efficiency matters</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Output channels</li>
            <li><strong>kernel_size:</strong> Temporal filter size</li>
          </ul>
          <p><em>💡 Tip: More efficient than Conv1D with similar performance!</em></p>
        `,
        'DepthwiseConv2D': `
          <h2>DepthwiseConv2D Layer</h2>
          <p><strong>What it does:</strong> Applies a separate filter to each input channel independently.</p>
          <h3>How it works:</h3>
          <p>Unlike regular Conv2D, doesn't mix channels - each channel gets its own spatial filter.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Part of separable conv:</strong> First step before pointwise</li>
            <li><strong>Channel independence:</strong> When channels shouldn't mix</li>
            <li><strong>Efficient models:</strong> Fewer parameters</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>kernel_size:</strong> Spatial filter size</li>
            <li><strong>depth_multiplier:</strong> Output channels per input channel</li>
          </ul>
          <p><em>💡 Tip: Usually followed by pointwise (1x1) conv to mix channels!</em></p>
        `,
        'Conv2DTranspose': `
          <h2>Conv2DTranspose Layer (Deconvolution)</h2>
          <p><strong>What it does:</strong> Learnable upsampling - opposite of Conv2D.</p>
          <h3>How it works:</h3>
          <p>Also called "deconvolution". Learns how to upsample while processing features. More powerful than UpSampling2D!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Autoencoders:</strong> Decoder that learns upsampling</li>
            <li><strong>GANs:</strong> Generator networks</li>
            <li><strong>Segmentation:</strong> U-Net decoder paths</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of output channels</li>
            <li><strong>kernel_size:</strong> Filter size</li>
            <li><strong>strides:</strong> Upsampling factor (>1 increases size)</li>
          </ul>
          <p><em>💡 Tip: Better than UpSampling + Conv2D. Learns optimal upsampling!</em></p>
        `,
        'Conv1DTranspose': `
          <h2>Conv1DTranspose Layer</h2>
          <p><strong>What it does:</strong> Learnable upsampling for sequences.</p>
          <h3>How it works:</h3>
          <p>Opposite of Conv1D. Increases sequence length while learning features.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Sequence generation:</strong> Decoder networks</li>
            <li><strong>Audio synthesis:</strong> Upsampling audio signals</li>
            <li><strong>Time series:</strong> When you need learnable upsampling</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Output channels</li>
            <li><strong>kernel_size:</strong> Filter size</li>
            <li><strong>strides:</strong> Upsampling factor</li>
          </ul>
          <p><em>💡 Tip: Used in WaveNet and other audio generation models!</em></p>
        `,
        'Conv3DTranspose': `
          <h2>Conv3DTranspose Layer</h2>
          <p><strong>What it does:</strong> Learnable 3D upsampling.</p>
          <h3>How it works:</h3>
          <p>Opposite of Conv3D. Increases volumetric size with learned filters.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>3D generation:</strong> Volumetric GANs</li>
            <li><strong>Medical imaging:</strong> 3D segmentation decoders</li>
            <li><strong>Video generation:</strong> Spatio-temporal upsampling</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Output channels</li>
            <li><strong>kernel_size:</strong> 3D filter size</li>
            <li><strong>strides:</strong> Upsampling factors</li>
          </ul>
          <p><em>💡 Tip: Very computationally expensive!</em></p>
        `,
        // Advanced Recurrent
        'Bidirectional': `
          <h2>Bidirectional Layer (Wrapper)</h2>
          <p><strong>What it does:</strong> Processes sequences in both forward and backward directions.</p>
          <h3>How it works:</h3>
          <p>Wraps an RNN layer (LSTM/GRU) and runs it twice - once forward, once backward. Concatenates outputs.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Text classification:</strong> Context from both directions</li>
            <li><strong>Named entity recognition:</strong> See full context</li>
            <li><strong>Not for generation:</strong> Can't use when predicting next token</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>layer:</strong> The RNN layer to wrap (LSTM/GRU)</li>
            <li><strong>merge_mode:</strong> How to combine directions (concat, sum, etc.)</li>
          </ul>
          <p><em>💡 Tip: Great for classification tasks. Doubles the number of outputs!</em></p>
        `,
        'ConvLSTM2D': `
          <h2>ConvLSTM2D Layer</h2>
          <p><strong>What it does:</strong> LSTM with convolutional connections instead of fully connected.</p>
          <h3>How it works:</h3>
          <p>Like LSTM but uses convolutions for spatial patterns. Perfect for video and spatio-temporal data!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Video prediction:</strong> Next frame prediction</li>
            <li><strong>Weather forecasting:</strong> Spatial + temporal patterns</li>
            <li><strong>Action recognition:</strong> Motion in videos</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of convolutional filters</li>
            <li><strong>kernel_size:</strong> Spatial filter size</li>
            <li><strong>return_sequences:</strong> True for stacking layers</li>
          </ul>
          <p><em>💡 Tip: Powerful for video tasks. Combines CNN and RNN strengths!</em></p>
        `,
        'TimeDistributed': `
          <h2>TimeDistributed Layer (Wrapper)</h2>
          <p><strong>What it does:</strong> Applies a layer independently to each timestep in a sequence.</p>
          <h3>How it works:</h3>
          <p>Wraps any layer and applies it to every timestep separately. Useful for sequence-to-sequence tasks.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Dense after RNN:</strong> Apply Dense to each timestep</li>
            <li><strong>Video frames:</strong> Process each frame independently</li>
            <li><strong>Sequence labeling:</strong> Output for each input step</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>layer:</strong> The layer to apply at each timestep</li>
          </ul>
          <p><em>💡 Tip: Essential for sequence-to-sequence models!</em></p>
        `,
        // Utility
        'Permute': `
          <h2>Permute Layer</h2>
          <p><strong>What it does:</strong> Rearranges the dimensions of the input.</p>
          <h3>How it works:</h3>
          <p>Swaps axes around. Like transpose but for any number of dimensions.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Format conversion:</strong> Change data layout (channels first/last)</li>
            <li><strong>Dimension reordering:</strong> Prepare for specific layers</li>
            <li><strong>Custom architectures:</strong> When you need specific axis order</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>dims:</strong> New order of dimensions (e.g., (2, 1) swaps first two)</li>
          </ul>
          <p><em>💡 Tip: Useful for RNN input format changes!</em></p>
        `,
        'RepeatVector': `
          <h2>RepeatVector Layer</h2>
          <p><strong>What it does:</strong> Repeats input vector n times to create a sequence.</p>
          <h3>How it works:</h3>
          <p>Takes a 1D vector and copies it to create a 2D sequence of specified length.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Seq2Seq models:</strong> Connect encoder to decoder</li>
            <li><strong>After Dense:</strong> Create sequence from single vector</li>
            <li><strong>Broadcasting context:</strong> Repeat context across timesteps</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>n:</strong> Number of times to repeat</li>
          </ul>
          <p><em>💡 Tip: Common in encoder-decoder architectures!</em></p>
        `,
        'Lambda': `
          <h2>Lambda Layer</h2>
          <p><strong>What it does:</strong> Applies arbitrary operations/functions to inputs.</p>
          <h3>How it works:</h3>
          <p>Wraps any custom function as a layer. Great for simple operations without creating custom layers.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Custom operations:</strong> Simple math not in standard layers</li>
            <li><strong>Preprocessing:</strong> Normalization, scaling in model</li>
            <li><strong>Quick experiments:</strong> Test ideas without custom layer code</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>function:</strong> The function to apply</li>
          </ul>
          <p><em>💡 Tip: Great for quick custom operations, but can't be saved in all formats!</em></p>
        `,
        'Masking': `
          <h2>Masking Layer</h2>
          <p><strong>What it does:</strong> Masks timesteps in sequences so they're skipped during processing.</p>
          <h3>How it works:</h3>
          <p>Tells subsequent RNN layers to ignore certain timesteps (usually padding). Improves efficiency and accuracy!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Variable-length sequences:</strong> With padding</li>
            <li><strong>Before RNN layers:</strong> Skip padded timesteps</li>
            <li><strong>Irregular time series:</strong> Ignore missing values</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>mask_value:</strong> Value to mask (typically 0.0)</li>
          </ul>
          <p><em>💡 Tip: Essential for efficient variable-length sequence processing!</em></p>
        `,
        'ActivityRegularization': `
          <h2>ActivityRegularization Layer</h2>
          <p><strong>What it does:</strong> Adds regularization penalty based on layer activations.</p>
          <h3>How it works:</h3>
          <p>Applies L1 and/or L2 penalties to activations during training. Encourages specific activation patterns.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Sparse activations:</strong> L1 encourages sparsity</li>
            <li><strong>Prevent large activations:</strong> L2 keeps activations small</li>
            <li><strong>Autoencoders:</strong> Enforce sparse representations</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>l1:</strong> L1 regularization factor</li>
            <li><strong>l2:</strong> L2 regularization factor</li>
          </ul>
          <p><em>💡 Tip: Different from weight regularization - this regularizes outputs!</em></p>
        `,
        // Regularization
        'GaussianNoise': `
          <h2>GaussianNoise Layer</h2>
          <p><strong>What it does:</strong> Adds random Gaussian noise to inputs during training.</p>
          <h3>How it works:</h3>
          <p>Adds noise with mean 0 and specified standard deviation. Only active during training, not inference!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Regularization:</strong> Prevent overfitting</li>
            <li><strong>Robust models:</strong> More resilient to input variations</li>
            <li><strong>Data augmentation:</strong> In-model augmentation</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>stddev:</strong> Standard deviation of noise</li>
          </ul>
          <p><em>💡 Tip: Acts like data augmentation. Start with small stddev (0.1)!</em></p>
        `,
        'GaussianDropout': `
          <h2>GaussianDropout Layer</h2>
          <p><strong>What it does:</strong> Multiplicative Gaussian noise - like Dropout but continuous.</p>
          <h3>How it works:</h3>
          <p>Multiplies inputs by random values from Gaussian distribution. Smoother than binary Dropout.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Alternative to Dropout:</strong> More gradual regularization</li>
            <li><strong>Continuous scaling:</strong> When binary dropout is too harsh</li>
            <li><strong>Experimentation:</strong> See if it works better than Dropout</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>rate:</strong> Drop probability (like Dropout)</li>
          </ul>
          <p><em>💡 Tip: Less common than Dropout but worth trying!</em></p>
        `,
        'AlphaDropout': `
          <h2>AlphaDropout Layer</h2>
          <p><strong>What it does:</strong> Special Dropout that maintains self-normalizing properties.</p>
          <h3>How it works:</h3>
          <p>Designed for SELU activation. Keeps mean and variance stable unlike regular Dropout.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>With SELU:</strong> Specifically for self-normalizing networks</li>
            <li><strong>Deep networks:</strong> Using SELU activations</li>
            <li><strong>Not for ReLU:</strong> Use regular Dropout with ReLU</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>rate:</strong> Drop probability</li>
          </ul>
          <p><em>💡 Tip: Only use with SELU activation. Use regular Dropout otherwise!</em></p>
        `,
        // Spatial Dropout
        'SpatialDropout1D': `
          <h2>SpatialDropout1D Layer</h2>
          <p><strong>What it does:</strong> Drops entire 1D feature maps instead of individual elements.</p>
          <h3>How it works:</h3>
          <p>Unlike regular Dropout which drops random elements, this drops entire channels/feature maps. Promotes independence between feature maps!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>After Conv1D:</strong> When features are spatially correlated</li>
            <li><strong>Better for CNNs:</strong> More effective than regular Dropout for convolutional layers</li>
            <li><strong>Sequence models:</strong> When adjacent timesteps are correlated</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>rate:</strong> Fraction of feature maps to drop</li>
          </ul>
          <p><em>💡 Tip: Use this instead of regular Dropout after Conv1D layers!</em></p>
        `,
        'SpatialDropout2D': `
          <h2>SpatialDropout2D Layer</h2>
          <p><strong>What it does:</strong> Drops entire 2D feature maps instead of individual pixels.</p>
          <h3>How it works:</h3>
          <p>Drops entire channels from Conv2D outputs. Each dropped channel is completely zeroed out, promoting feature map independence.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>After Conv2D:</strong> Standard choice for CNN regularization</li>
            <li><strong>Better than Dropout:</strong> More effective for spatial data</li>
            <li><strong>Image processing:</strong> When nearby pixels are strongly correlated</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>rate:</strong> Fraction of feature maps to drop (0.2-0.5)</li>
          </ul>
          <p><em>💡 Tip: Standard practice for CNN regularization. Widely used in modern architectures!</em></p>
        `,
        'SpatialDropout3D': `
          <h2>SpatialDropout3D Layer</h2>
          <p><strong>What it does:</strong> Drops entire 3D feature maps for volumetric/video data.</p>
          <h3>How it works:</h3>
          <p>Like SpatialDropout2D but for 3D convolutions. Drops entire feature volumes.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>After Conv3D:</strong> Regularization for video/volumetric CNNs</li>
            <li><strong>Video processing:</strong> When spatio-temporal features are correlated</li>
            <li><strong>Medical imaging:</strong> 3D scan processing</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>rate:</strong> Fraction of 3D feature maps to drop</li>
          </ul>
          <p><em>💡 Tip: Essential for 3D CNN regularization!</em></p>
        `,
        // Attention
        'MultiHeadAttention': `
          <h2>MultiHeadAttention Layer</h2>
          <p><strong>What it does:</strong> Transformer-style multi-head attention mechanism - the core of modern NLP!</p>
          <h3>How it works:</h3>
          <p>Runs multiple attention operations in parallel (multiple "heads"), each learning different aspects. Concatenates results and projects them. Allows the model to attend to different positions simultaneously!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Transformers:</strong> Core building block (BERT, GPT, etc.)</li>
            <li><strong>Sequence-to-sequence:</strong> Modern alternative to RNNs</li>
            <li><strong>Any attention task:</strong> Translation, summarization, vision transformers</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>num_heads:</strong> Number of attention heads (typically 8 or 12)</li>
            <li><strong>key_dim:</strong> Dimension of query/key vectors</li>
            <li><strong>value_dim:</strong> Dimension of value vectors (optional)</li>
          </ul>
          <p><em>💡 Tip: The secret sauce of transformers! Start with 8 heads and key_dim=64!</em></p>
        `,
        'Attention': `
          <h2>Attention Layer</h2>
          <p><strong>What it does:</strong> Basic attention mechanism that computes weighted combinations based on similarity.</p>
          <h3>How it works:</h3>
          <p>Computes attention scores between query and key sequences, then uses these to weight value sequences. Simpler than MultiHeadAttention!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Seq2Seq models:</strong> Encoder-decoder attention</li>
            <li><strong>Simpler than multi-head:</strong> When you don't need multiple heads</li>
            <li><strong>Custom attention:</strong> Building your own attention mechanisms</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>use_scale:</strong> Whether to scale scores by sqrt(key_dim)</li>
            <li><strong>causal:</strong> For autoregressive models (mask future)</li>
          </ul>
          <p><em>💡 Tip: Good starting point for learning attention. Use MultiHeadAttention for production!</em></p>
        `,
        'AdditiveAttention': `
          <h2>AdditiveAttention Layer (Bahdanau Attention)</h2>
          <p><strong>What it does:</strong> Additive/Bahdanau attention - older but still useful attention mechanism.</p>
          <h3>How it works:</h3>
          <p>Computes attention using a feedforward network instead of dot product. Can handle different dimension queries and keys!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Different dimensions:</strong> When query and key have different sizes</li>
            <li><strong>Machine translation:</strong> Original attention mechanism</li>
            <li><strong>Alternative to dot-product:</strong> Sometimes works better</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>use_scale:</strong> Whether to apply scaling</li>
            <li><strong>causal:</strong> For autoregressive generation</li>
          </ul>
          <p><em>💡 Tip: Historical importance - used in early neural translation! Dot-product attention (MultiHeadAttention) is usually better!</em></p>
        `,
        // Normalization
        'LayerNormalization': `
          <h2>LayerNormalization Layer</h2>
          <p><strong>What it does:</strong> Normalizes activations across features (not batch) - key component of transformers!</p>
          <h3>How it works:</h3>
          <p>Unlike BatchNorm which normalizes across batch, this normalizes across features for each sample independently. Works better for sequences and small batches!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Transformers:</strong> Standard normalization for attention models</li>
            <li><strong>RNNs:</strong> Better than BatchNorm for sequences</li>
            <li><strong>Small batches:</strong> Works with batch size 1!</li>
            <li><strong>Reinforcement learning:</strong> When batch size varies</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>epsilon:</strong> Small constant for numerical stability</li>
            <li><strong>center:</strong> Whether to add learnable bias</li>
            <li><strong>scale:</strong> Whether to add learnable scale</li>
          </ul>
          <p><em>💡 Tip: Essential for transformers! Use this instead of BatchNorm for NLP tasks!</em></p>
        `,
        // Locally Connected
        'LocallyConnected1D': `
          <h2>LocallyConnected1D Layer</h2>
          <p><strong>What it does:</strong> Like Conv1D but each position has its own unique filters (no weight sharing).</p>
          <h3>How it works:</h3>
          <p>Applies filters locally like convolution, but filters are different at each position. Much more parameters than Conv1D!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Position-specific patterns:</strong> When different positions need different filters</li>
            <li><strong>Fixed-length sequences:</strong> Input length must be constant</li>
            <li><strong>Rare use case:</strong> Usually Conv1D is better</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of filters per position</li>
            <li><strong>kernel_size:</strong> Size of local window</li>
          </ul>
          <p><em>💡 Tip: Very parameter-heavy! Use Conv1D unless you specifically need position-specific filters!</em></p>
        `,
        'LocallyConnected2D': `
          <h2>LocallyConnected2D Layer</h2>
          <p><strong>What it does:</strong> Like Conv2D but each spatial position has unique filters.</p>
          <h3>How it works:</h3>
          <p>No weight sharing across positions - each location learns its own filters. Useful when different image regions need different processing.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Face recognition:</strong> Different facial regions (eyes, nose, mouth) need different filters</li>
            <li><strong>Fixed position objects:</strong> When object position is consistent</li>
            <li><strong>Lots of data:</strong> Needs much more data than Conv2D</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Output channels</li>
            <li><strong>kernel_size:</strong> Filter size (e.g., 3×3)</li>
          </ul>
          <p><em>💡 Tip: Used in DeepFace paper for face recognition. Usually Conv2D is better!</em></p>
        `,
        // Preprocessing
        'Rescaling': `
          <h2>Rescaling Layer</h2>
          <p><strong>What it does:</strong> Simple linear scaling of inputs - multiply by scale factor and add offset.</p>
          <h3>How it works:</h3>
          <p>Applies: output = input * scale + offset. Commonly used to normalize pixel values from [0, 255] to [0, 1].</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Image preprocessing:</strong> Scale pixels from 0-255 to 0-1</li>
            <li><strong>Inside model:</strong> Include preprocessing in model for deployment</li>
            <li><strong>Simple normalization:</strong> When you just need linear scaling</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>scale:</strong> Multiplication factor (e.g., 1./255)</li>
            <li><strong>offset:</strong> Addition offset (typically 0)</li>
          </ul>
          <p><em>💡 Tip: Use Rescaling(1./255) for image inputs! Keeps preprocessing in model!</em></p>
        `,
        'Normalization': `
          <h2>Normalization Layer (Feature Normalization)</h2>
          <p><strong>What it does:</strong> Normalizes features to have mean 0 and variance 1 based on training data statistics.</p>
          <h3>How it works:</h3>
          <p>Learns mean and variance from training data during adapt() call, then normalizes inputs using these statistics. Like StandardScaler in sklearn!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Tabular data:</strong> Normalize numerical features</li>
            <li><strong>Feature preprocessing:</strong> Before feeding to Dense layers</li>
            <li><strong>Inside model:</strong> Include normalization in model for deployment</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>axis:</strong> Which axis to normalize (typically -1 for features)</li>
            <li><strong>mean:</strong> Optional pre-computed mean</li>
            <li><strong>variance:</strong> Optional pre-computed variance</li>
          </ul>
          <p><em>💡 Tip: Call adapt(training_data) before training! Great for tabular data!</em></p>
        `,
        // Data Augmentation
        'RandomFlip': `
          <h2>RandomFlip Layer</h2>
          <p><strong>What it does:</strong> Randomly flips images horizontally and/or vertically during training.</p>
          <h3>How it works:</h3>
          <p>Randomly flips images with 50% probability. Only active during training, not inference!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Image classification:</strong> Standard data augmentation</li>
            <li><strong>Object detection:</strong> When orientation doesn't matter</li>
            <li><strong>Inside model:</strong> Include augmentation in model</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>mode:</strong> 'horizontal', 'vertical', or 'horizontal_and_vertical'</li>
          </ul>
          <p><em>💡 Tip: Use 'horizontal' for most natural images. Be careful with text/numbers!</em></p>
        `,
        'RandomRotation': `
          <h2>RandomRotation Layer</h2>
          <p><strong>What it does:</strong> Randomly rotates images by a random angle during training.</p>
          <h3>How it works:</h3>
          <p>Rotates images within specified range. Great for rotation-invariant tasks!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Image classification:</strong> When objects can appear at any angle</li>
            <li><strong>Medical imaging:</strong> Scans can be oriented differently</li>
            <li><strong>Satellite imagery:</strong> No canonical orientation</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>factor:</strong> Rotation range as fraction of 2π (e.g., 0.2 = ±36°)</li>
            <li><strong>fill_mode:</strong> How to fill empty space ('constant', 'reflect', 'wrap')</li>
          </ul>
          <p><em>💡 Tip: Start with small rotations (0.1-0.2). Large rotations can hurt performance!</em></p>
        `,
        'RandomZoom': `
          <h2>RandomZoom Layer</h2>
          <p><strong>What it does:</strong> Randomly zooms in or out on images during training.</p>
          <h3>How it works:</h3>
          <p>Randomly scales images within specified range. Simulates different camera distances!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Object detection:</strong> Objects at different scales</li>
            <li><strong>Image classification:</strong> Scale invariance</li>
            <li><strong>Real-world variance:</strong> Simulate camera zoom</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>height_factor:</strong> Zoom range for height (e.g., 0.2 = ±20%)</li>
            <li><strong>width_factor:</strong> Zoom range for width (optional, defaults to height)</li>
          </ul>
          <p><em>💡 Tip: Use 0.1-0.2 for subtle zooming. Too much can distort objects!</em></p>
        `,
        'RandomTranslation': `
          <h2>RandomTranslation Layer</h2>
          <p><strong>What it does:</strong> Randomly shifts images horizontally and/or vertically during training.</p>
          <h3>How it works:</h3>
          <p>Translates images by random amounts. Helps model learn position invariance!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Object detection:</strong> Objects can appear anywhere</li>
            <li><strong>Classification:</strong> Position shouldn't matter</li>
            <li><strong>Data augmentation:</strong> Very common technique</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>height_factor:</strong> Vertical shift as fraction of height</li>
            <li><strong>width_factor:</strong> Horizontal shift as fraction of width</li>
            <li><strong>fill_mode:</strong> How to fill empty regions</li>
          </ul>
          <p><em>💡 Tip: Standard augmentation! Use 0.1-0.2 for both directions!</em></p>
        `,
        'RandomContrast': `
          <h2>RandomContrast Layer</h2>
          <p><strong>What it does:</strong> Randomly adjusts image contrast during training.</p>
          <h3>How it works:</h3>
          <p>Randomly changes the difference between dark and light pixels. Simulates different lighting conditions!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Real-world images:</strong> Variable lighting conditions</li>
            <li><strong>Outdoor scenes:</strong> Different weather/times of day</li>
            <li><strong>Robust models:</strong> Handle contrast variations</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>factor:</strong> Contrast range (e.g., 0.2 = ±20%)</li>
          </ul>
          <p><em>💡 Tip: Combine with RandomBrightness for lighting robustness!</em></p>
        `,
        'RandomBrightness': `
          <h2>RandomBrightness Layer</h2>
          <p><strong>What it does:</strong> Randomly adjusts image brightness during training.</p>
          <h3>How it works:</h3>
          <p>Randomly makes images lighter or darker. Simulates different exposure levels!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Variable lighting:</strong> Indoor/outdoor scenes</li>
            <li><strong>Camera variations:</strong> Different exposure settings</li>
            <li><strong>Robust recognition:</strong> Handle lighting changes</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>factor:</strong> Brightness range (e.g., 0.2 or [-0.2, 0.3])</li>
            <li><strong>value_range:</strong> Input value range (e.g., [0, 255] or [0, 1])</li>
          </ul>
          <p><em>💡 Tip: Essential for real-world robustness! Use 0.1-0.2!</em></p>
        `,
        'RandomHeight': `
          <h2>RandomHeight Layer</h2>
          <p><strong>What it does:</strong> Randomly varies the height of images during training.</p>
          <h3>How it works:</h3>
          <p>Randomly resizes image height within specified range. Width stays constant or scales proportionally.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Aspect ratio changes:</strong> When height can vary</li>
            <li><strong>Vertical stretching:</strong> Simulate perspective changes</li>
            <li><strong>Custom augmentation:</strong> Specific to your data</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>factor:</strong> Height variation range</li>
          </ul>
          <p><em>💡 Tip: Less common than RandomZoom. Use when aspect ratio matters!</em></p>
        `,
        'RandomWidth': `
          <h2>RandomWidth Layer</h2>
          <p><strong>What it does:</strong> Randomly varies the width of images during training.</p>
          <h3>How it works:</h3>
          <p>Randomly resizes image width within specified range. Height stays constant or scales proportionally.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Aspect ratio changes:</strong> When width can vary</li>
            <li><strong>Horizontal stretching:</strong> Simulate perspective</li>
            <li><strong>Custom needs:</strong> Data-specific augmentation</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>factor:</strong> Width variation range</li>
          </ul>
          <p><em>💡 Tip: Pair with RandomHeight for full aspect ratio variation!</em></p>
        `,
        'RandomCrop': `
          <h2>RandomCrop Layer</h2>
          <p><strong>What it does:</strong> Randomly crops a fixed-size region from images during training.</p>
          <h3>How it works:</h3>
          <p>Extracts random crops of specified size. Each training sample gets a different crop!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Large images:</strong> Train on smaller crops for efficiency</li>
            <li><strong>Data augmentation:</strong> Many crops from one image</li>
            <li><strong>Position invariance:</strong> Focus on different regions</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>height:</strong> Crop height</li>
            <li><strong>width:</strong> Crop width</li>
          </ul>
          <p><em>💡 Tip: Popular for large images. Use with CenterCrop for inference!</em></p>
        `,
        'CenterCrop': `
          <h2>CenterCrop Layer</h2>
          <p><strong>What it does:</strong> Crops a fixed-size region from the center of images.</p>
          <h3>How it works:</h3>
          <p>Extracts center region of specified size. Deterministic, not random!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Inference time:</strong> After using RandomCrop in training</li>
            <li><strong>Consistent cropping:</strong> When you want reproducible results</li>
            <li><strong>Focus on center:</strong> Important objects usually centered</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>height:</strong> Crop height</li>
            <li><strong>width:</strong> Crop width</li>
          </ul>
          <p><em>💡 Tip: Use during inference with models trained on RandomCrop!</em></p>
        `,
        // More Preprocessing
        'CategoryEncoding': `
          <h2>CategoryEncoding Layer</h2>
          <p><strong>What it does:</strong> Converts integer category indices to one-hot or multi-hot encodings.</p>
          <h3>How it works:</h3>
          <p>Takes integer inputs (category IDs) and creates binary vectors. Each category becomes a dimension!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Categorical features:</strong> Convert to one-hot encoding</li>
            <li><strong>Inside model:</strong> Include encoding in model</li>
            <li><strong>Multi-label:</strong> Multi-hot for multiple categories</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>num_tokens:</strong> Total number of categories</li>
            <li><strong>output_mode:</strong> 'one_hot', 'multi_hot', or 'count'</li>
          </ul>
          <p><em>💡 Tip: Use one_hot for single categories, multi_hot for multiple!</em></p>
        `,
        'StringLookup': `
          <h2>StringLookup Layer</h2>
          <p><strong>What it does:</strong> Converts strings to integer indices based on vocabulary.</p>
          <h3>How it works:</h3>
          <p>Builds vocabulary from training data (via adapt()), then maps strings to integers. Like a dictionary!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Text processing:</strong> Convert words/tokens to integers</li>
            <li><strong>Categorical features:</strong> String categories to numbers</li>
            <li><strong>Inside model:</strong> Include lookup in model</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>max_tokens:</strong> Maximum vocabulary size</li>
            <li><strong>vocabulary:</strong> Optional pre-defined vocabulary</li>
            <li><strong>output_mode:</strong> 'int', 'one_hot', 'multi_hot', or 'count'</li>
          </ul>
          <p><em>💡 Tip: Call adapt(text_data) to build vocabulary! Essential for text models!</em></p>
        `,
        'IntegerLookup': `
          <h2>IntegerLookup Layer</h2>
          <p><strong>What it does:</strong> Converts integers to indices based on vocabulary (remapping).</p>
          <h3>How it works:</h3>
          <p>Maps input integers to consecutive indices. Useful when category IDs are sparse (e.g., 1, 5, 100).</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Sparse IDs:</strong> Remap to dense indices for embedding</li>
            <li><strong>Before Embedding:</strong> Convert sparse IDs to 0, 1, 2, ...</li>
            <li><strong>Categorical integers:</strong> Non-consecutive category IDs</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>max_tokens:</strong> Maximum vocabulary size</li>
            <li><strong>vocabulary:</strong> Optional pre-defined mapping</li>
            <li><strong>output_mode:</strong> 'int', 'one_hot', 'multi_hot', or 'count'</li>
          </ul>
          <p><em>💡 Tip: Use before Embedding when IDs aren't 0, 1, 2, ...!</em></p>
        `,
        'Hashing': `
          <h2>Hashing Layer</h2>
          <p><strong>What it does:</strong> Hashes inputs to fixed range using deterministic hash function.</p>
          <h3>How it works:</h3>
          <p>Applies hash function to convert arbitrary inputs (strings/integers) to fixed range. No vocabulary needed!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Large vocabularies:</strong> Too many categories to enumerate</li>
            <li><strong>No vocabulary building:</strong> Works without adapt()</li>
            <li><strong>Feature hashing:</strong> Dimensionality reduction trick</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>num_bins:</strong> Number of hash buckets</li>
            <li><strong>salt:</strong> Optional salt for hash function</li>
          </ul>
          <p><em>💡 Tip: Fast but can have collisions. Use when vocabulary is huge!</em></p>
        `,
        'Discretization': `
          <h2>Discretization Layer</h2>
          <p><strong>What it does:</strong> Bins continuous numerical features into discrete categories.</p>
          <h3>How it works:</h3>
          <p>Divides continuous range into bins. Each value gets assigned to a bin index. Like histogram binning!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Continuous to categorical:</strong> Convert numbers to bins</li>
            <li><strong>Decision trees in NNs:</strong> Discretize features</li>
            <li><strong>Embedding continuous:</strong> Bin then embed</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>bin_boundaries:</strong> Edges of bins (or use adapt())</li>
            <li><strong>num_bins:</strong> How many bins to create</li>
          </ul>
          <p><em>💡 Tip: Call adapt() to learn bins from data! Useful for embeddings!</em></p>
        `,
        'TextVectorization': `
          <h2>TextVectorization Layer</h2>
          <p><strong>What it does:</strong> Converts text strings to sequences of integers or bag-of-words.</p>
          <h3>How it works:</h3>
          <p>Tokenizes text, builds vocabulary, and converts to integers. All-in-one text preprocessing!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>NLP tasks:</strong> Text classification, sentiment analysis</li>
            <li><strong>Complete pipeline:</strong> Raw text to model-ready format</li>
            <li><strong>Inside model:</strong> Include text processing in model</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>max_tokens:</strong> Vocabulary size</li>
            <li><strong>output_mode:</strong> 'int' (sequences), 'multi_hot', 'count', or 'tf_idf'</li>
            <li><strong>output_sequence_length:</strong> Pad/truncate to this length</li>
          </ul>
          <p><em>💡 Tip: Super powerful! Call adapt(text_data) to build vocabulary. One layer does it all!</em></p>
        `,
        // More Normalization
        'UnitNormalization': `
          <h2>UnitNormalization Layer</h2>
          <p><strong>What it does:</strong> Normalizes vectors to have unit norm (length 1).</p>
          <h3>How it works:</h3>
          <p>Divides each vector by its L2 norm. Makes all vectors the same length!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Cosine similarity:</strong> Prepare for similarity comparisons</li>
            <li><strong>Embeddings:</strong> Normalize embedding vectors</li>
            <li><strong>Feature normalization:</strong> When direction matters more than magnitude</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>axis:</strong> Which axis to normalize (typically -1)</li>
          </ul>
          <p><em>💡 Tip: Great for metric learning and similarity tasks!</em></p>
        `,
        'GroupNormalization': `
          <h2>GroupNormalization Layer</h2>
          <p><strong>What it does:</strong> Normalizes groups of channels together - middle ground between LayerNorm and BatchNorm.</p>
          <h3>How it works:</h3>
          <p>Divides channels into groups and normalizes within each group. Independent of batch size!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Small batches:</strong> Works better than BatchNorm with small batches</li>
            <li><strong>Computer vision:</strong> Increasingly popular for CNNs</li>
            <li><strong>Alternative to BatchNorm:</strong> When batch size varies</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>groups:</strong> Number of groups to divide channels into</li>
            <li><strong>axis:</strong> Channel axis (typically -1)</li>
          </ul>
          <p><em>💡 Tip: Use 32 groups as default. Works great for object detection!</em></p>
        `,
        // Image Processing
        'Resizing': `
          <h2>Resizing Layer</h2>
          <p><strong>What it does:</strong> Resizes images to a target size.</p>
          <h3>How it works:</h3>
          <p>Resizes all images to specified height and width. Uses interpolation for quality!</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Variable-size inputs:</strong> Make all images same size</li>
            <li><strong>Inside model:</strong> Include resizing in model for deployment</li>
            <li><strong>Preprocessing:</strong> First layer of image models</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>height:</strong> Target height</li>
            <li><strong>width:</strong> Target width</li>
            <li><strong>interpolation:</strong> 'bilinear' (default), 'nearest', 'bicubic', etc.</li>
          </ul>
          <p><em>💡 Tip: Put this first in your model to handle any input size!</em></p>
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
