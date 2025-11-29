<!--
  TODO: Add the following layers to generatedKerasLayers.json
  These layers are already documented below but not yet available in the app:

  RECURRENT:
    - LSTM
    - GRU
    - SimpleRNN
    - Bidirectional
    - ConvLSTM2D

  NORMALIZATION:
    - BatchNormalization
    - LayerNormalization
    - GroupNormalization
    - Normalization
    - UnitNormalization

  ATTENTION:
    - Attention
    - AdditiveAttention
    - MultiHeadAttention

  ACTIVATIONS:
    - LeakyReLU
    - PReLU
    - ELU
    - ThresholdedReLU
    - Softmax

  CONVOLUTION VARIANTS:
    - DepthwiseConv2D
    - Conv1DTranspose
    - Conv3DTranspose

  DROPOUT/REGULARIZATION:
    - AlphaDropout
    - GaussianDropout
    - GaussianNoise
    - SpatialDropout1D
    - SpatialDropout2D
    - SpatialDropout3D

  PREPROCESSING:
    - Rescaling
    - Resizing
    - Discretization
    - TextVectorization
    - CategoryEncoding
    - StringLookup
    - IntegerLookup
    - Hashing

  DATA AUGMENTATION:
    - RandomFlip
    - RandomRotation
    - RandomZoom
    - RandomTranslation
    - RandomContrast
    - RandomBrightness
    - RandomHeight
    - RandomWidth
    - RandomCrop
    - CenterCrop

  OTHER:
    - Embedding
    - TimeDistributed
-->
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
          <p><strong>What it does:</strong> Converts multi-dimensional input tensors into a single continuous vector by "flattening" all dimensions except the batch dimension.</p>
          <h3>How it works:</h3>
          <p>The layer reshapes the input by preserving the batch size and collapsing all other dimensions into a single dimension. For example, an input shape of (batch_size, 28, 28, 3) becomes (batch_size, 2352).</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Transitioning from convolutional to dense layers:</strong> Essential when connecting CNN feature extraction layers to fully connected classification layers</li>
            <li><strong>Preparing image data for dense networks:</strong> Converts 2D/3D image tensors into 1D vectors for traditional neural network processing</li>
            <li><strong>Feature vector creation:</strong> When you need to transform spatial feature maps into a single feature vector for downstream tasks</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>data_format:</strong> Specifies whether channels are first or last in the input ('channels_last' by default)</li>
            <li><strong>Input shape:</strong> Accepts any tensor shape; automatically calculates the flattened output dimension</li>
          </ul>
          <p><em>💡 Tip: Flatten preserves the total number of elements - use it right before Dense layers but avoid it if you need to maintain spatial relationships for later convolutional operations!</em></p>
        `,
        'Dropout': `
          <h2>Dropout Layer</h2>
          <p><strong>What it does:</strong> Randomly deactivates a percentage of neurons during training to prevent overfitting and improve model generalization.</p>
          <h3>How it works:</h3>
          <p>During each training step, Dropout randomly sets a fraction of input units to 0, forcing the network to learn redundant representations. During inference (testing), all neurons are active but their outputs are scaled by the dropout rate to maintain consistency.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Overfitting prevention:</strong> When your model performs well on training data but poorly on validation data</li>
            <li><strong>Large networks:</strong> Essential for deep neural networks with many parameters</li>
            <li><strong>Limited training data:</strong> Helps when you have a small dataset relative to model complexity</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>rate:</strong> Fraction of input units to drop (0.2-0.5 typical, where 0.2 means 20% dropout)</li>
            <li><strong>seed:</strong> Random seed for reproducible dropout patterns during training</li>
          </ul>
          <p><em>💡 Tip: Start with dropout rates of 0.2-0.3 for input layers and 0.5 for hidden layers. Remember that Dropout is automatically disabled during model evaluation!</em></p>
        `,
        'LSTM': `
          <h2>LSTM Layer</h2>
          <p><strong>What it does:</strong> Processes sequential data by learning long-term dependencies, using memory cells that can remember or forget information over extended time periods.</p>
          <h3>How it works:</h3>
          <p>LSTMs use special gates (input, forget, and output gates) to control the flow of information through memory cells. This architecture allows the network to selectively remember important patterns while forgetting irrelevant information, solving the vanishing gradient problem that affects standard RNNs.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Time series prediction:</strong> Forecasting stock prices, weather patterns, or sales data where past values influence future outcomes</li>
            <li><strong>Natural language processing:</strong> Text generation, sentiment analysis, or machine translation where word order and context matter</li>
            <li><strong>Sequence classification:</strong> Analyzing sensor data, speech recognition, or video frame analysis where temporal patterns are crucial</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>units:</strong> Number of LSTM units (memory cells) - higher values capture more complex patterns but increase computation</li>
            <li><strong>return_sequences:</strong> Whether to return the full sequence (True) or just the last output (False) - use True for sequence-to-sequence tasks</li>
            <li><strong>dropout:</strong> Fraction of units to drop during training (0-1) to prevent overfitting</li>
          </ul>
          <p><em>💡 Tip: Start with 50-100 units and increase if underfitting. Use return_sequences=True when stacking multiple LSTM layers, but set to False for the last LSTM before a Dense layer!</em></p>
        `,
        'Activation': `
          <h2>Activation Layer</h2>
          <p><strong>What it does:</strong> Applies a specified activation function (like ReLU, sigmoid, or tanh) to the input tensor element-wise.</p>
          <h3>How it works:</h3>
          <p>The layer transforms each input value through a mathematical function, introducing non-linearity to help the network learn complex patterns. Without activation functions, stacking multiple layers would be equivalent to a single linear transformation.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>After Dense layers:</strong> Add non-linearity between fully connected layers to enable learning of complex relationships</li>
            <li><strong>Custom architectures:</strong> When you need explicit control over activation placement separate from other layers</li>
            <li><strong>Legacy model conversion:</strong> When converting models that use separate activation layers rather than built-in activations</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>activation:</strong> The activation function to use (e.g., 'relu', 'sigmoid', 'tanh', 'softmax')</li>
            <li><strong>name:</strong> Optional string name for the layer to identify it in the model</li>
          </ul>
          <p><em>💡 Tip: While you can use separate Activation layers, it's often more convenient to specify activation directly in Dense or Conv2D layers using their activation parameter!</em></p>
        `,
        'BatchNormalization': `
          <h2>BatchNormalization Layer</h2>
          <p><strong>What it does:</strong> Normalizes the inputs of each batch to have a mean of 0 and standard deviation of 1, helping stabilize and accelerate neural network training.</p>
          <h3>How it works:</h3>
          <p>For each mini-batch, it subtracts the batch mean and divides by the batch standard deviation, then applies a learned scale and shift. During inference, it uses moving averages of mean and variance computed during training.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Deep networks:</strong> Essential for training very deep networks (>10 layers) where gradients can vanish or explode</li>
            <li><strong>Faster convergence:</strong> When you need to speed up training and use higher learning rates</li>
            <li><strong>Reducing sensitivity:</strong> When your model is sensitive to weight initialization or you want more stable training</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>axis:</strong> The axis to be normalized (typically the features axis, default is -1)</li>
            <li><strong>momentum:</strong> Momentum for moving average updates (default 0.99)</li>
            <li><strong>epsilon:</strong> Small constant added for numerical stability (default 0.001)</li>
          </ul>
          <p><em>💡 Tip: Place BatchNormalization after dense or convolutional layers but BEFORE activation functions for best results!</em></p>
        `,
        'Input': `
          <h2>Input Layer</h2>
          <p><strong>What it does:</strong> Creates an entry point for data to flow into your neural network model by defining the shape and type of input data.</p>
          <h3>How it works:</h3>
          <p>The Input layer acts as a placeholder that tells Keras what shape and data type to expect when you feed data into your model. It doesn't perform any computations itself but establishes the tensor specifications that subsequent layers will receive.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Starting any model:</strong> Every neural network needs at least one Input layer to define where data enters the network</li>
            <li><strong>Multi-input models:</strong> Use multiple Input layers when your model needs to process different types of data simultaneously (e.g., images and text)</li>
            <li><strong>Functional API models:</strong> Required when building complex architectures with branches, merges, or non-sequential connections</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>shape:</strong> Tuple specifying the expected shape of input samples (e.g., (28, 28) for images, (100,) for sequences)</li>
            <li><strong>dtype:</strong> Data type of the input (default is float32, can be int32, bool, etc.)</li>
            <li><strong>name:</strong> Optional string to identify this input layer, especially useful in multi-input models</li>
            <li><strong>sparse:</strong> Boolean indicating whether the input is a sparse tensor (useful for categorical data with many classes)</li>
          </ul>
          <p><em>💡 Tip: Don't include the batch size in the shape parameter - Keras handles batching automatically! For a batch of 28x28 images, use shape=(28, 28), not shape=(None, 28, 28).</em></p>
        `,
        'Output': `
          <h2>Output Layer</h2>
          <p><strong>What it does:</strong> Creates a named output tensor that defines an endpoint for your model, allowing you to specify multiple outputs in complex architectures.</p>
          <h3>How it works:</h3>
          <p>The Output layer wraps an existing tensor and assigns it a name, marking it as an output of the model. This is particularly useful in functional API models where you need to explicitly define which tensors should be returned as outputs.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Multi-output models:</strong> When your model needs to produce multiple predictions simultaneously (e.g., classification and regression together)</li>
            <li><strong>Intermediate outputs:</strong> To extract features from middle layers for visualization or transfer learning</li>
            <li><strong>Custom loss per output:</strong> When different outputs need different loss functions or metrics</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>name:</strong> String identifier for this output (required) - used to reference this output in training and prediction</li>
            <li><strong>dtype:</strong> Data type of the output tensor (optional) - defaults to the input tensor's dtype</li>
          </ul>
          <p><em>💡 Tip: Always give meaningful names to your outputs - they'll be used as keys in the model's output dictionary during training and prediction!</em></p>
        `,
        'GRU': `
          <h2>GRU Layer</h2>
          <p><strong>What it does:</strong> Processes sequential data by learning patterns and dependencies across time steps using a gating mechanism that's simpler than LSTM.</p>
          <h3>How it works:</h3>
          <p>GRU uses update and reset gates to control information flow, deciding what information to keep from previous states and what new information to add. This allows it to capture both short and long-term dependencies while using fewer parameters than LSTM.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Text processing:</strong> Sentiment analysis, text generation, or language modeling where context matters</li>
            <li><strong>Time series prediction:</strong> Stock prices, weather forecasting, or sensor data analysis</li>
            <li><strong>Speech recognition:</strong> Processing audio sequences where temporal patterns are crucial</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>units:</strong> Number of GRU cells (output dimensionality) - typically 32 to 512</li>
            <li><strong>return_sequences:</strong> Whether to return full sequence (True) or just last output (False)</li>
            <li><strong>dropout:</strong> Fraction of units to drop during training to prevent overfitting (0.0 to 0.5)</li>
            <li><strong>activation:</strong> Activation function for the recurrent step (default: 'tanh')</li>
          </ul>
          <p><em>💡 Tip: GRU trains faster than LSTM and often performs just as well - try it first for sequence tasks! Use return_sequences=True when stacking multiple GRU layers.</em></p>
        `,
        'SimpleRNN': `
          <h2>SimpleRNN Layer</h2>
          <p><strong>What it does:</strong> Processes sequences of data by maintaining a hidden state that gets updated at each time step, allowing the network to remember information from previous inputs.</p>
          <h3>How it works:</h3>
          <p>At each time step, the layer combines the current input with the previous hidden state through learned weights, then applies an activation function to produce the new hidden state. This creates a feedback loop that allows information to persist across the sequence.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Short sequences:</strong> When processing sequences with relatively short-term dependencies (typically less than 10-20 steps)</li>
            <li><strong>Simple patterns:</strong> For tasks with straightforward temporal patterns like basic time series forecasting</li>
            <li><strong>Lightweight models:</strong> When you need a fast, memory-efficient RNN and don't require complex long-term memory</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>units:</strong> Number of hidden units/neurons in the RNN (determines the dimensionality of the output)</li>
            <li><strong>activation:</strong> Activation function to use (default is 'tanh', can also use 'relu' for faster training)</li>
            <li><strong>return_sequences:</strong> Whether to return the full sequence of outputs (True) or just the last output (False)</li>
            <li><strong>dropout:</strong> Fraction of units to drop during training to prevent overfitting (0.0 to 1.0)</li>
          </ul>
          <p><em>💡 Tip: Start with 32-128 units for most tasks, and use return_sequences=True when stacking multiple RNN layers or when you need predictions at each time step!</em></p>
        `,
        'Conv1D': `
          <h2>Conv1D Layer</h2>
          <p><strong>What it does:</strong> Applies a sliding window (filter) across a 1D sequence to detect patterns and features in sequential data.</p>
          <h3>How it works:</h3>
          <p>The layer slides filters across the input sequence, computing dot products between the filter weights and local regions of the input. Each filter learns to detect specific patterns, producing a feature map that highlights where those patterns occur in the sequence.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Text Classification:</strong> Extract features from word embeddings or character sequences for sentiment analysis or document classification</li>
            <li><strong>Time Series Analysis:</strong> Detect patterns in sensor data, stock prices, or any temporal sequences</li>
            <li><strong>Audio Processing:</strong> Process raw audio waveforms or spectrograms for speech recognition or music analysis</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of output filters (feature detectors) - typically start with 32, 64, or 128</li>
            <li><strong>kernel_size:</strong> Length of the convolution window - commonly 3, 5, or 7 for local pattern detection</li>
            <li><strong>activation:</strong> Activation function to apply - 'relu' is most common for hidden layers</li>
            <li><strong>padding:</strong> 'valid' (no padding) or 'same' (preserves sequence length)</li>
          </ul>
          <p><em>💡 Tip: Stack multiple Conv1D layers with increasing filter counts (e.g., 32→64→128) to learn hierarchical features from simple to complex patterns!</em></p>
        `,
        'Conv3D': `
          <h2>Conv3D Layer</h2>
          <p><strong>What it does:</strong> Applies 3D convolution operations to extract features from volumetric data like videos or medical scans.</p>
          <h3>How it works:</h3>
          <p>Slides a 3D filter (kernel) across the height, width, and depth dimensions of the input volume, computing dot products at each position. This creates feature maps that capture spatial and temporal patterns in three-dimensional data.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Video analysis:</strong> Processing video data where temporal information across frames is important</li>
            <li><strong>Medical imaging:</strong> Analyzing 3D medical scans like CT or MRI volumes</li>
            <li><strong>3D object recognition:</strong> Working with volumetric representations of 3D objects</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of output filters (feature maps) to generate</li>
            <li><strong>kernel_size:</strong> Size of the 3D convolution window (depth, height, width)</li>
            <li><strong>strides:</strong> Step size for moving the kernel across each dimension</li>
            <li><strong>padding:</strong> 'valid' (no padding) or 'same' (preserve dimensions)</li>
          </ul>
          <p><em>💡 Tip: Start with smaller kernel sizes like (3,3,3) for most tasks - larger kernels dramatically increase computation and may not improve results!</em></p>
        `,
        'AveragePooling2D': `
          <h2>AveragePooling2D Layer</h2>
          <p><strong>What it does:</strong> Downsamples feature maps by dividing them into rectangular regions and computing the average value of each region.</p>
          <h3>How it works:</h3>
          <p>The layer slides a pooling window across the input and calculates the mean of all values within each window. This reduces the spatial dimensions while preserving important features through averaging.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Gentle downsampling:</strong> When you want to reduce dimensions more smoothly than max pooling, preserving more information from all pixels</li>
            <li><strong>Noise reduction:</strong> When your data is noisy and averaging can help smooth out irregularities</li>
            <li><strong>Global context preservation:</strong> When maintaining information from all areas of the receptive field is important</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>pool_size:</strong> Size of the pooling window (e.g., (2, 2) for 2x2 pooling)</li>
            <li><strong>strides:</strong> Step size for moving the pooling window (defaults to pool_size if not specified)</li>
            <li><strong>padding:</strong> Either 'valid' (no padding) or 'same' (pad to keep output size similar)</li>
          </ul>
          <p><em>💡 Tip: AveragePooling2D is gentler than MaxPooling2D and works better for tasks where subtle features matter - try it when max pooling loses too much detail!</em></p>
        `,
        'GlobalMaxPooling2D': `
          <h2>GlobalMaxPooling2D Layer</h2>
          <p><strong>What it does:</strong> Reduces each feature map to a single value by taking the maximum value across all spatial locations, converting 4D tensors to 2D.</p>
          <h3>How it works:</h3>
          <p>For each channel in the input feature maps, it finds the maximum value across all height and width positions. This transforms an input of shape (batch_size, height, width, channels) into (batch_size, channels).</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Before final classification layers:</strong> Replace flatten layers to reduce parameters while preserving the most important features</li>
            <li><strong>Feature extraction networks:</strong> Create fixed-size representations from variable-sized input images</li>
            <li><strong>Reducing overfitting:</strong> Dramatically reduces parameters compared to flattening, helping prevent overfitting in small datasets</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>data_format:</strong> Either 'channels_last' (default) or 'channels_first' to specify the input format</li>
            <li><strong>keepdims:</strong> Boolean, whether to keep spatial dimensions as size 1 (default: False)</li>
          </ul>
          <p><em>💡 Tip: GlobalMaxPooling2D is excellent for replacing Flatten layers before Dense layers - it reduces parameters by 99%+ while often maintaining similar accuracy!</em></p>
        `,
        'GlobalAveragePooling2D': `
          <h2>GlobalAveragePooling2D Layer</h2>
          <p><strong>What it does:</strong> Computes the average value for each feature map across its entire spatial dimensions, reducing each feature map to a single value.</p>
          <h3>How it works:</h3>
          <p>For each channel in the input, it calculates the mean of all spatial locations (height × width), transforming a 4D tensor (batch, height, width, channels) into a 2D tensor (batch, channels). This operation effectively summarizes the entire spatial information of each feature map into one representative value.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Before final classification layer:</strong> Replace Flatten() to reduce parameters and prevent overfitting while maintaining spatial invariance</li>
            <li><strong>Feature extraction:</strong> Create compact representations of images for transfer learning or similarity comparisons</li>
            <li><strong>Reducing model size:</strong> Dramatically decrease the number of parameters compared to using fully connected layers after convolutions</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>data_format:</strong> Either 'channels_last' (default) or 'channels_first' to specify the input format</li>
            <li><strong>keepdims:</strong> Boolean to keep spatial dimensions as 1 (resulting in shape batch × 1 × 1 × channels) or remove them entirely</li>
          </ul>
          <p><em>💡 Tip: GlobalAveragePooling2D is excellent for modern architectures like ResNet and MobileNet - it reduces overfitting compared to Flatten() + Dense layers and creates more interpretable feature maps where each channel corresponds to a specific class or concept!</em></p>
        `,
        'Embedding': `
          <h2>Embedding Layer</h2>
          <p><strong>What it does:</strong> Transforms integer indices (like word IDs) into dense vectors of fixed size, creating learnable representations for discrete items.</p>
          <h3>How it works:</h3>
          <p>The layer maintains a lookup table where each integer index maps to a trainable vector. During forward pass, it retrieves the corresponding vectors for input indices and can be trained via backpropagation to learn meaningful representations.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Text processing:</strong> Convert word indices into dense word embeddings for NLP tasks like sentiment analysis or text classification</li>
            <li><strong>Categorical features:</strong> Transform high-cardinality categorical variables (like user IDs or product IDs) into learned representations</li>
            <li><strong>Recommendation systems:</strong> Create embeddings for users and items to capture latent features and similarities</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>input_dim:</strong> Size of the vocabulary (maximum integer index + 1)</li>
            <li><strong>output_dim:</strong> Dimension of the dense embedding vectors</li>
            <li><strong>input_length:</strong> Length of input sequences (can be None for variable length)</li>
            <li><strong>mask_zero:</strong> Whether to mask zero values as padding (useful for variable-length sequences)</li>
          </ul>
          <p><em>💡 Tip: Start with output_dim between 50-300 for word embeddings - use higher dimensions for larger vocabularies and more complex relationships!</em></p>
        `,
        'Reshape': `
          <h2>Reshape Layer</h2>
          <p><strong>What it does:</strong> Transforms the shape of input tensors without changing the data order, allowing you to reorganize dimensions for different network architectures.</p>
          <h3>How it works:</h3>
          <p>The layer flattens the input into a 1D array and then reshapes it into the specified target shape, preserving the total number of elements. The reshaping follows row-major (C-style) ordering where the last axis index changes fastest.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>CNN to Dense transition:</strong> Flatten convolutional feature maps before connecting to fully connected layers</li>
            <li><strong>Sequence preparation:</strong> Reshape data for RNN/LSTM inputs when converting between batch and time dimensions</li>
            <li><strong>Multi-head architectures:</strong> Split or combine tensor dimensions for attention mechanisms or parallel processing paths</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>target_shape:</strong> Tuple specifying the desired output shape (excluding batch dimension); use -1 for automatic dimension inference</li>
            <li><strong>input_shape:</strong> Shape of input data (only needed for the first layer in a model)</li>
          </ul>
          <p><em>💡 Tip: Use -1 in target_shape to let Keras automatically calculate one dimension - for example, Reshape((-1, 128)) will flatten any input to have 128 features in the last dimension!</em></p>
        `,
        'Concatenate': `
          <h2>Concatenate Layer (Merge)</h2>
          <p><strong>What it does:</strong> Joins multiple input tensors together along a specified axis to create a single combined output tensor.</p>
          <h3>How it works:</h3>
          <p>The layer takes multiple inputs and concatenates them along a specified dimension, preserving all other dimensions. For example, concatenating two tensors of shape (32, 10) along axis 1 produces an output of shape (32, 20).</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Multi-branch architectures:</strong> Combine features from parallel processing paths in models like Inception or ResNet</li>
            <li><strong>Skip connections:</strong> Merge earlier layer outputs with deeper layers to preserve gradient flow and feature information</li>
            <li><strong>Multi-modal fusion:</strong> Combine different types of input data (text, image, numerical) processed by separate branches</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>axis:</strong> The dimension along which to concatenate (default: -1, the last axis)</li>
            <li><strong>inputs:</strong> List of input tensors to concatenate (must have same shape except for the concatenation axis)</li>
          </ul>
          <p><em>💡 Tip: Always verify that your input tensors have matching dimensions except for the concatenation axis - mismatched shapes are a common source of errors!</em></p>
        `,
        'Add': `
          <h2>Add Layer</h2>
          <p><strong>What it does:</strong> Performs element-wise addition of two or more input tensors with the same shape.</p>
          <h3>How it works:</h3>
          <p>The layer takes multiple input tensors and adds them together element by element, producing a single output tensor. All input tensors must have identical shapes for the operation to work.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Residual connections:</strong> Creating skip connections in ResNet-style architectures to help gradients flow and prevent vanishing gradient problems</li>
            <li><strong>Feature fusion:</strong> Combining features from different branches of a network that process the same input differently</li>
            <li><strong>Ensemble predictions:</strong> Merging outputs from multiple parallel pathways or models for improved predictions</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>inputs:</strong> A list of input tensors (minimum 2) that must all have the same shape</li>
            <li><strong>**kwargs:</strong> Standard layer keyword arguments like name and trainable (the Add layer itself has no weights)</li>
          </ul>
          <p><em>💡 Tip: Add layers are essential for residual blocks - always ensure your tensors have matching dimensions by using padding='same' in convolutions or adding projection layers when needed!</em></p>
        `,
        'Multiply': `
          <h2>Multiply Layer</h2>
          <p><strong>What it does:</strong> Performs element-wise multiplication between two or more input tensors of the same shape.</p>
          <h3>How it works:</h3>
          <p>Takes multiple input tensors and multiplies them together element by element, producing a single output tensor. All inputs must have identical shapes or be broadcastable to the same shape.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Attention mechanisms:</strong> Multiply attention weights with feature maps to focus on important regions</li>
            <li><strong>Gating mechanisms:</strong> Implement gates in custom RNN architectures or highway networks</li>
            <li><strong>Feature modulation:</strong> Scale features dynamically based on learned importance weights</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>inputs:</strong> List of input tensors to be multiplied (minimum 2 tensors required)</li>
            <li><strong>**kwargs:</strong> Standard layer keyword arguments like name and dtype</li>
          </ul>
          <p><em>💡 Tip: Multiply layers are perfect for creating attention gates - try multiplying your features with a sigmoid-activated attention map to highlight important regions!</em></p>
        `,
        // Advanced Activations
        'LeakyReLU': `
          <h2>LeakyReLU Layer</h2>
          <p><strong>What it does:</strong> Applies a leaky rectified linear unit activation function that allows small negative values to pass through instead of zeroing them out completely.</p>
          <h3>How it works:</h3>
          <p>For positive inputs, it returns the input unchanged; for negative inputs, it returns the input multiplied by a small slope coefficient (alpha). This prevents "dying neurons" by maintaining a small gradient even for negative values.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Preventing dead neurons:</strong> When standard ReLU causes too many neurons to become inactive during training</li>
            <li><strong>Deep networks:</strong> Particularly useful in very deep architectures where gradient flow is critical</li>
            <li><strong>Regression tasks:</strong> When you need to preserve negative information that might be important for predictions</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>alpha:</strong> The slope for negative inputs (default: 0.3, typically between 0.01 and 0.3)</li>
            <li><strong>negative_slope:</strong> Alternative name for alpha in some implementations</li>
          </ul>
          <p><em>💡 Tip: Start with the default alpha value of 0.3, but if you see many dead neurons, try increasing it; if your model isn't learning well, try decreasing it to 0.01!</em></p>
        `,
        'PReLU': `
          <h2>PReLU Layer</h2>
          <p><strong>What it does:</strong> Applies the Parametric Rectified Linear Unit activation function, which allows negative values to pass through with a learnable slope instead of zeroing them out.</p>
          <h3>How it works:</h3>
          <p>PReLU outputs the input directly when positive, but multiplies negative inputs by a learnable parameter α (alpha). This parameter is optimized during training, allowing the network to learn the best negative slope for each neuron or channel.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Deep networks:</strong> Helps prevent dying ReLU problems in very deep architectures by allowing gradients to flow through negative values</li>
            <li><strong>Computer vision tasks:</strong> Often improves performance in CNNs compared to standard ReLU, especially for image classification</li>
            <li><strong>When ReLU underperforms:</strong> Try PReLU when standard ReLU activation leads to many dead neurons or poor convergence</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>alpha_initializer:</strong> Initializer for the learnable alpha parameter (default: 'zeros')</li>
            <li><strong>alpha_regularizer:</strong> Optional regularizer for the alpha parameter to prevent overfitting</li>
            <li><strong>shared_axes:</strong> Axes along which to share the same alpha parameter (useful for convolutions)</li>
          </ul>
          <p><em>💡 Tip: PReLU adds a small number of parameters to your model - use shared_axes=[1,2] in convolutional layers to share parameters across spatial dimensions and reduce overfitting!</em></p>
        `,
        'ELU': `
          <h2>ELU Layer</h2>
          <p><strong>What it does:</strong> Applies the Exponential Linear Unit activation function, which helps neurons learn faster by allowing negative values while avoiding the "dying ReLU" problem.</p>
          <h3>How it works:</h3>
          <p>For positive inputs, ELU acts like the identity function (output = input). For negative inputs, it applies an exponential curve that approaches -alpha as input becomes very negative, providing smooth gradients even for negative values.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Deep networks:</strong> When building very deep networks where vanishing gradients are a concern</li>
            <li><strong>Faster convergence needed:</strong> When you want faster training compared to ReLU while maintaining good performance</li>
            <li><strong>Noise-robust models:</strong> When your data has noise and you need more robust activation than ReLU</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>alpha:</strong> Scale factor for negative inputs (default: 1.0) - controls how negative the output can be</li>
            <li><strong>input_shape:</strong> Shape of input data (only needed for first layer in a model)</li>
          </ul>
          <p><em>💡 Tip: ELU often works better than ReLU in hidden layers but is computationally more expensive due to the exponential calculation - use it when accuracy matters more than training speed!</em></p>
        `,
        'ThresholdedReLU': `
          <h2>ThresholdedReLU Layer</h2>
          <p><strong>What it does:</strong> Applies a thresholded version of ReLU activation where values below a specified threshold are set to zero, while values above it remain unchanged.</p>
          <h3>How it works:</h3>
          <p>The layer outputs the input value if it's greater than the threshold, otherwise outputs zero. This creates a "dead zone" below the threshold, helping to filter out small, potentially noisy activations.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Noise reduction:</strong> When you want to suppress small activation values that might represent noise in your data</li>
            <li><strong>Sparse representations:</strong> To encourage sparsity in neural networks by zeroing out weak activations</li>
            <li><strong>Feature selection:</strong> When you want only strong features to pass through, filtering out weak signals</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>theta:</strong> The threshold value (default: 1.0) - activations below this are set to zero</li>
            <li><strong>name:</strong> Optional name for the layer to identify it in the model</li>
          </ul>
          <p><em>💡 Tip: Start with theta=1.0 and adjust based on your activation value ranges - too high and you'll kill too many neurons, too low and it behaves like regular ReLU!</em></p>
        `,
        'ReLU': `
          <h2>ReLU Layer</h2>
          <p><strong>What it does:</strong> Applies the Rectified Linear Unit activation function that outputs the input directly if positive, otherwise outputs zero.</p>
          <h3>How it works:</h3>
          <p>ReLU computes f(x) = max(0, x) for each input element, effectively removing negative values while keeping positive values unchanged. This simple non-linear transformation helps neural networks learn complex patterns while avoiding the vanishing gradient problem.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Hidden layers in deep networks:</strong> Default choice for most feedforward and convolutional neural networks due to computational efficiency and good performance</li>
            <li><strong>Computer vision tasks:</strong> Standard activation for CNN architectures like ResNet, VGG, and most image classification models</li>
            <li><strong>When training speed matters:</strong> Faster to compute than sigmoid or tanh, making it ideal for large-scale models</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>max_value:</strong> Optional upper threshold to clip the maximum output value (default: None)</li>
            <li><strong>negative_slope:</strong> Slope for negative inputs, setting this > 0 creates a Leaky ReLU (default: 0)</li>
            <li><strong>threshold:</strong> Threshold value for thresholded activation (default: 0)</li>
          </ul>
          <p><em>💡 Tip: ReLU can cause "dying neurons" where neurons output zero for all inputs - if this happens, try using LeakyReLU or reducing your learning rate!</em></p>
        `,
        'Softmax': `
          <h2>Softmax Layer</h2>
          <p><strong>What it does:</strong> Converts a vector of raw scores (logits) into a probability distribution where all outputs sum to 1.</p>
          <h3>How it works:</h3>
          <p>The Softmax function applies the exponential function to each element and then normalizes by dividing by the sum of all exponentials. This ensures outputs are between 0 and 1 and represent probabilities for each class.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Multi-class classification:</strong> When you need to classify inputs into one of multiple exclusive categories (e.g., classifying images as cat, dog, or bird)</li>
            <li><strong>Final layer of classification networks:</strong> As the last activation function to convert raw network outputs into interpretable probabilities</li>
            <li><strong>Probability distribution generation:</strong> When you need outputs that represent confidence scores or likelihood across multiple options</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>axis:</strong> Integer or list of integers specifying which axis to compute softmax over (default is -1, the last axis)</li>
            <li><strong>dtype:</strong> Data type of the layer's computations (default is None, which uses the model's default dtype)</li>
          </ul>
          <p><em>💡 Tip: Always use Softmax with categorical crossentropy loss for multi-class problems, but avoid adding Softmax if using sparse_categorical_crossentropy as it's already included!</em></p>
        `,
        // More Pooling
        'MaxPooling1D': `
          <h2>MaxPooling1D Layer</h2>
          <p><strong>What it does:</strong> Downsamples 1D input data by taking the maximum value from each pooling window, reducing the sequence length while preserving the most prominent features.</p>
          <h3>How it works:</h3>
          <p>The layer slides a window across the input sequence and outputs only the maximum value from each window position. This reduces the temporal resolution while keeping the strongest signal in each local region.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Text classification:</strong> Reduce sequence length after convolutional layers while preserving important feature detections</li>
            <li><strong>Time series analysis:</strong> Downsample temporal data to focus on peak values and reduce computational load</li>
            <li><strong>Audio processing:</strong> Extract dominant frequencies or amplitudes from audio signal segments</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>pool_size:</strong> Integer specifying the size of the pooling window (default: 2)</li>
            <li><strong>strides:</strong> Integer or None for the stride length (default: None, which equals pool_size)</li>
            <li><strong>padding:</strong> Either 'valid' (no padding) or 'same' (pad to keep output length same as input)</li>
          </ul>
          <p><em>💡 Tip: Use pool_size=2 with strides=2 for standard 2x downsampling, or set strides=1 for overlapping windows to preserve more temporal information!</em></p>
        `,
        'MaxPooling3D': `
          <h2>MaxPooling3D Layer</h2>
          <p><strong>What it does:</strong> Performs max pooling operations on 3D data (spatial or spatiotemporal) by selecting the maximum value from each pooling window to reduce dimensionality.</p>
          <h3>How it works:</h3>
          <p>The layer slides a 3D window across the input volume and outputs the maximum value from each window region. This downsamples the input along its three spatial dimensions (depth, height, width), reducing computational complexity while retaining the most prominent features.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>3D Medical Imaging:</strong> Processing CT scans, MRI volumes, or other volumetric medical data to reduce spatial dimensions while preserving important features</li>
            <li><strong>Video Analysis:</strong> Downsampling video data where the third dimension represents temporal frames to capture dominant motion patterns</li>
            <li><strong>3D Object Recognition:</strong> Reducing the resolution of 3D voxel data or point clouds while maintaining critical spatial information</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>pool_size:</strong> Tuple of 3 integers specifying the pooling window size for each dimension (default: (2, 2, 2))</li>
            <li><strong>strides:</strong> Tuple of 3 integers for the stride length in each dimension (default: None, which uses pool_size)</li>
            <li><strong>padding:</strong> Either 'valid' (no padding) or 'same' (pad input to maintain output dimensions)</li>
            <li><strong>data_format:</strong> Either 'channels_last' or 'channels_first' to specify the input dimension ordering</li>
          </ul>
          <p><em>💡 Tip: Start with pool_size=(2,2,2) to halve each spatial dimension - if you're losing too much detail, try smaller pool sizes or use strides smaller than pool_size for overlapping windows!</em></p>
        `,
        'AveragePooling1D': `
          <h2>AveragePooling1D Layer</h2>
          <p><strong>What it does:</strong> Performs downsampling by computing the average value within sliding windows along the temporal dimension of 1D input data.</p>
          <h3>How it works:</h3>
          <p>The layer slides a window of specified size along the input sequence and replaces each window with its average value. This reduces the temporal resolution while preserving important features through averaging rather than selecting maximum values.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Noise reduction:</strong> When you want to smooth out noisy sequential data like sensor readings or audio signals</li>
            <li><strong>Computational efficiency:</strong> To reduce the sequence length and computational load in deeper layers</li>
            <li><strong>Feature extraction:</strong> When local average trends are more important than peak values in time series analysis</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>pool_size:</strong> Integer specifying the size of the pooling window (default: 2)</li>
            <li><strong>strides:</strong> Integer or None for stride length; if None, defaults to pool_size</li>
            <li><strong>padding:</strong> Either 'valid' (no padding) or 'same' (pad input to preserve length when stride=1)</li>
          </ul>
          <p><em>💡 Tip: Use AveragePooling1D instead of MaxPooling1D when dealing with smooth signals or when you want to preserve the overall magnitude of features rather than just peak values!</em></p>
        `,
        'AveragePooling3D': `
          <h2>AveragePooling3D Layer</h2>
          <p><strong>What it does:</strong> Downsamples 3D input data (like video or volumetric data) by taking the average value within each pooling window, reducing spatial dimensions while preserving important features.</p>
          <h3>How it works:</h3>
          <p>The layer slides a 3D window across the input volume and computes the average of all values within each window position. This reduces the depth, height, and width dimensions of the data while maintaining the number of channels.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>3D Medical Imaging:</strong> Processing CT scans, MRI data, or other volumetric medical images to reduce computational load while preserving spatial relationships</li>
            <li><strong>Video Processing:</strong> Downsampling video frames treated as 3D data (time × height × width) to extract temporal features</li>
            <li><strong>Noise Reduction:</strong> When you want smoother feature maps compared to MaxPooling3D, as averaging helps reduce the impact of outliers</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>pool_size:</strong> Tuple of 3 integers specifying the pooling window size (depth, height, width) - default is (2, 2, 2)</li>
            <li><strong>strides:</strong> Tuple of 3 integers for the stride of the pooling window - defaults to pool_size if not specified</li>
            <li><strong>padding:</strong> Either 'valid' (no padding) or 'same' (pad input so output has same dimensions when stride=1)</li>
          </ul>
          <p><em>💡 Tip: AveragePooling3D is gentler than MaxPooling3D and better preserves smooth gradients, making it ideal for medical imaging where subtle intensity variations matter!</em></p>
        `,
        'GlobalMaxPooling1D': `
          <h2>GlobalMaxPooling1D Layer</h2>
          <p><strong>What it does:</strong> Reduces temporal/sequence data to a single vector by taking the maximum value across the time dimension for each feature channel.</p>
          <h3>How it works:</h3>
          <p>For each feature in the input sequence, it finds the maximum value across all time steps. This transforms a 3D input tensor (batch_size, time_steps, features) into a 2D output tensor (batch_size, features).</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Text classification:</strong> Extract the most prominent features from variable-length sequences before the final classification layers</li>
            <li><strong>Time series analysis:</strong> Capture peak values or maximum activations when the exact timing isn't critical</li>
            <li><strong>Feature extraction:</strong> Create fixed-size representations from sequences of different lengths for downstream tasks</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>data_format:</strong> String, either 'channels_last' (default) or 'channels_first' to specify input dimension ordering</li>
            <li><strong>keepdims:</strong> Boolean, whether to keep the temporal dimension with size 1 or remove it entirely (default: False)</li>
          </ul>
          <p><em>💡 Tip: GlobalMaxPooling1D is particularly effective after Conv1D layers in text classification tasks, as it captures the strongest feature activation regardless of where it appears in the sequence!</em></p>
        `,
        'GlobalAveragePooling1D': `
          <h2>GlobalAveragePooling1D Layer</h2>
          <p><strong>What it does:</strong> Computes the average of all values across the entire sequence dimension, reducing each feature's sequence to a single value.</p>
          <h3>How it works:</h3>
          <p>For each feature channel, it calculates the mean value across all time steps in the sequence. This transforms an input of shape (batch_size, steps, features) into (batch_size, features), effectively summarizing the entire sequence.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Text classification:</strong> To create a fixed-size representation from variable-length sequences before the final classification layers</li>
            <li><strong>Time series analysis:</strong> When you need to aggregate temporal patterns into a single feature vector for prediction</li>
            <li><strong>Reducing model parameters:</strong> As an alternative to Flatten() that dramatically reduces dimensions while preserving feature information</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>data_format:</strong> Either 'channels_last' (default) or 'channels_first' to specify the input format</li>
            <li><strong>keepdims:</strong> Boolean, whether to keep the temporal dimension with size 1 (default: False)</li>
          </ul>
          <p><em>💡 Tip: GlobalAveragePooling1D is excellent for preventing overfitting compared to Flatten() as it reduces parameters while maintaining feature relationships - particularly useful before Dense layers in classification tasks!</em></p>
        `,
        'GlobalMaxPooling3D': `
          <h2>GlobalMaxPooling3D Layer</h2>
          <p><strong>What it does:</strong> Reduces 3D spatial data (depth, height, width) to a single vector by taking the maximum value across all spatial dimensions for each feature channel.</p>
          <h3>How it works:</h3>
          <p>For each feature map in the input volume, it finds the maximum value across all spatial locations (depth × height × width), outputting one value per channel. This transforms a 5D tensor (batch, depth, height, width, channels) into a 2D tensor (batch, channels).</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>3D medical image classification:</strong> Extract the most prominent features from CT scans or MRI volumes before the final classification layers</li>
            <li><strong>Video analysis:</strong> Summarize spatiotemporal features when frames are treated as depth dimension</li>
            <li><strong>Reducing parameters before dense layers:</strong> Convert 3D feature maps to fixed-size vectors regardless of input spatial dimensions</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>data_format:</strong> Either "channels_last" (default) or "channels_first" - determines the ordering of dimensions in the input</li>
            <li><strong>keepdims:</strong> Boolean, whether to keep spatial dimensions as size 1 or remove them entirely (default: False)</li>
          </ul>
          <p><em>💡 Tip: GlobalMaxPooling3D is excellent for creating translation-invariant features and works well as an alternative to Flatten() before dense layers, significantly reducing parameters while preserving the strongest activations!</em></p>
        `,
        'GlobalAveragePooling3D': `
          <h2>GlobalAveragePooling3D Layer</h2>
          <p><strong>What it does:</strong> Computes the average value across all spatial dimensions (depth, height, width) for each feature channel, converting 3D feature maps into a 1D vector.</p>
          <h3>How it works:</h3>
          <p>For each channel in the input volume, it calculates the mean of all values across the depth, height, and width dimensions. This reduces a 5D input tensor (batch, depth, height, width, channels) to a 2D output (batch, channels).</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>3D medical image classification:</strong> Reduces volumetric features from CT or MRI scans before the final classification layer</li>
            <li><strong>Video understanding tasks:</strong> Aggregates spatiotemporal features when frames are treated as depth dimension</li>
            <li><strong>Reducing parameters before dense layers:</strong> Alternative to flattening that preserves channel information while drastically reducing dimensionality</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>data_format:</strong> Either 'channels_last' (default) or 'channels_first' to specify input dimension ordering</li>
            <li><strong>keepdims:</strong> Boolean, whether to keep the spatial dimensions as length 1 (default: False)</li>
          </ul>
          <p><em>💡 Tip: GlobalAveragePooling3D is excellent for reducing overfitting compared to Flatten layers, as it forces the network to be more confident about spatial feature locations throughout the entire volume!</em></p>
        `,
        // More Merge
        'Subtract': `
          <h2>Subtract Layer</h2>
          <p><strong>What it does:</strong> Performs element-wise subtraction between two input tensors of the same shape, computing (input1 - input2).</p>
          <h3>How it works:</h3>
          <p>Takes exactly two input tensors with identical shapes and subtracts the second tensor from the first tensor element by element. The operation broadcasts the subtraction across all dimensions, producing an output tensor with the same shape as the inputs.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Residual connections:</strong> Computing the difference between feature maps in skip connections or attention mechanisms</li>
            <li><strong>Feature comparison:</strong> Measuring differences between embeddings or feature vectors for similarity learning</li>
            <li><strong>Noise removal:</strong> Subtracting estimated noise or background from signals in denoising networks</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>inputs:</strong> A list of exactly 2 input tensors with the same shape to be subtracted</li>
            <li><strong>**kwargs:</strong> Standard layer keyword arguments like name and dtype for layer configuration</li>
          </ul>
          <p><em>💡 Tip: Order matters in subtraction! Make sure your inputs are in the correct order (first - second), as reversing them will flip the sign of your output values.</em></p>
        `,
        'Average': `
          <h2>Average Layer</h2>
          <p><strong>What it does:</strong> Computes the element-wise average (mean) of multiple input tensors with the same shape.</p>
          <h3>How it works:</h3>
          <p>Takes a list of tensors as inputs and returns a single tensor where each element is the arithmetic mean of the corresponding elements from all input tensors. All input tensors must have identical shapes.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Ensemble models:</strong> Combine predictions from multiple models by averaging their outputs for better generalization</li>
            <li><strong>Multi-branch architectures:</strong> Merge features from parallel processing paths in networks like Inception modules</li>
            <li><strong>Skip connections:</strong> Create averaged shortcuts between layers to improve gradient flow in deep networks</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>inputs:</strong> List of input tensors to be averaged (must have the same shape)</li>
            <li><strong>**kwargs:</strong> Standard layer keyword arguments like name and dtype</li>
          </ul>
          <p><em>💡 Tip: Average is gentler than Add for combining features - it prevents values from growing too large and helps maintain stable activations throughout your network!</em></p>
        `,
        'Maximum': `
          <h2>Maximum Layer</h2>
          <p><strong>What it does:</strong> Takes multiple input tensors of the same shape and computes their element-wise maximum values.</p>
          <h3>How it works:</h3>
          <p>The layer compares corresponding elements across all input tensors and outputs a tensor containing the maximum value at each position. For example, if comparing [1, 5, 3] and [2, 4, 6], it outputs [2, 5, 6].</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Feature fusion:</strong> Combine features from multiple branches by keeping the strongest activations from each branch</li>
            <li><strong>Multi-path architectures:</strong> Merge parallel processing paths where you want to preserve the most prominent features</li>
            <li><strong>Ensemble predictions:</strong> Combine outputs from multiple models by taking the maximum confidence scores</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>inputs:</strong> List of input tensors that must have the same shape</li>
            <li><strong>**kwargs:</strong> Standard layer keyword arguments like name and dtype</li>
          </ul>
          <p><em>💡 Tip: Maximum layers work great for creating "competitive" paths in your network where only the strongest features survive - perfect for attention mechanisms or feature selection!</em></p>
        `,
        'Minimum': `
          <h2>Minimum Layer</h2>
          <p><strong>What it does:</strong> Takes multiple input tensors and returns their element-wise minimum values.</p>
          <h3>How it works:</h3>
          <p>The layer compares corresponding elements across all input tensors and outputs a tensor containing the smallest value at each position. All inputs must have the same shape or be broadcastable to a common shape.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Feature gating:</strong> Limit the maximum activation values by taking the minimum with a threshold tensor</li>
            <li><strong>Multi-path architectures:</strong> Combine predictions from different branches by selecting conservative (lowest) estimates</li>
            <li><strong>Regularization techniques:</strong> Implement custom clipping or bounding operations on intermediate features</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>inputs:</strong> List of input tensors (must have the same shape or be broadcastable)</li>
            <li><strong>**kwargs:</strong> Standard layer keyword arguments like name and dtype</li>
          </ul>
          <p><em>💡 Tip: Use Minimum with a constant tensor to implement upper bounds on activations - this can help prevent exploding gradients while maintaining differentiability!</em></p>
        `,
        'Dot': `
          <h2>Dot Layer</h2>
          <p><strong>What it does:</strong> Computes the dot product between samples in two tensors, enabling similarity calculations and feature interactions between different inputs.</p>
          <h3>How it works:</h3>
          <p>The layer takes two input tensors and computes their dot product along specified axes, effectively measuring how similar or aligned the inputs are. The operation can be performed element-wise or across entire dimensions depending on the axes parameter.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Similarity matching:</strong> Computing cosine similarity between embeddings in recommendation systems or text matching tasks</li>
            <li><strong>Attention mechanisms:</strong> Calculating attention scores between query and key vectors in transformer-like architectures</li>
            <li><strong>Feature interactions:</strong> Creating cross-features by computing interactions between different input branches in multi-input models</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>axes:</strong> Integer or tuple of integers specifying which axes to use for the dot product (default: -1 for last axis)</li>
            <li><strong>normalize:</strong> Whether to L2-normalize samples along the dot product axis before taking the dot product (useful for cosine similarity)</li>
          </ul>
          <p><em>💡 Tip: Set normalize=True when computing cosine similarity between embeddings - this converts the dot product into a similarity score between -1 and 1!</em></p>
        `,
        // Image Processing
        'UpSampling2D': `
          <h2>UpSampling2D Layer</h2>
          <p><strong>What it does:</strong> Increases the spatial dimensions (height and width) of feature maps by repeating pixels, making the output larger than the input.</p>
          <h3>How it works:</h3>
          <p>Each pixel in the input is repeated multiple times to create a larger output image. For example, with a size factor of 2, each pixel becomes a 2x2 block of identical pixels, doubling both dimensions.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Decoder networks:</strong> In autoencoders and U-Net architectures to reconstruct images back to original size</li>
            <li><strong>Image segmentation:</strong> To restore spatial resolution after downsampling operations in semantic segmentation models</li>
            <li><strong>Generative models:</strong> In GANs and VAEs to progressively increase image resolution from latent representations</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>size:</strong> Tuple of integers (height_factor, width_factor) specifying how much to repeat pixels in each dimension (default: (2, 2))</li>
            <li><strong>interpolation:</strong> Method for upsampling - 'nearest' (default), 'bilinear', or 'bicubic' for smoother results</li>
          </ul>
          <p><em>💡 Tip: UpSampling2D is computationally cheaper than transposed convolutions but doesn't learn parameters - consider Conv2DTranspose if you need learnable upsampling!</em></p>
        `,
        'UpSampling1D': `
          <h2>UpSampling1D Layer</h2>
          <p><strong>What it does:</strong> Repeats each temporal step multiple times to increase the temporal resolution of 1D input data.</p>
          <h3>How it works:</h3>
          <p>Each time step in the input sequence is duplicated a specified number of times consecutively. For example, with size=2, the sequence [1, 2, 3] becomes [1, 1, 2, 2, 3, 3].</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Temporal autoencoders:</strong> To restore the original sequence length after downsampling in the decoder part</li>
            <li><strong>Signal processing:</strong> To increase the sampling rate of time series data or audio signals</li>
            <li><strong>Sequence-to-sequence models:</strong> To match dimensions between encoder and decoder when working with different temporal resolutions</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>size:</strong> Integer specifying how many times to repeat each time step (default: 2)</li>
            <li><strong>name:</strong> Optional string to name the layer instance</li>
          </ul>
          <p><em>💡 Tip: UpSampling1D is often paired with Conv1D layers to learn better upsampling patterns - consider using Conv1DTranspose for learnable upsampling instead of simple repetition!</em></p>
        `,
        'UpSampling3D': `
          <h2>UpSampling3D Layer</h2>
          <p><strong>What it does:</strong> Increases the spatial dimensions of 3D data by repeating each voxel multiple times along the depth, height, and width axes.</p>
          <h3>How it works:</h3>
          <p>Each input voxel is replicated according to the specified size factors, creating a larger output volume. For example, with a size of (2,2,2), each voxel becomes 8 voxels in a 2×2×2 cube pattern.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>3D segmentation networks:</strong> In decoder paths to progressively restore spatial resolution after downsampling operations</li>
            <li><strong>Medical imaging:</strong> To upsample feature maps in CT/MRI scan analysis for volumetric predictions</li>
            <li><strong>3D generative models:</strong> To expand latent representations into full-resolution 3D outputs in autoencoders or GANs</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>size:</strong> Tuple of 3 integers specifying the upsampling factors for depth, height, and width (default: (2,2,2))</li>
            <li><strong>data_format:</strong> Either 'channels_first' or 'channels_last' to specify the position of the channel dimension</li>
          </ul>
          <p><em>💡 Tip: UpSampling3D is computationally cheaper than transposed convolutions but doesn't learn upsampling patterns - pair it with Conv3D layers to add learnable refinement!</em></p>
        `,
        'ZeroPadding2D': `
          <h2>ZeroPadding2D Layer</h2>
          <p><strong>What it does:</strong> Adds rows and columns of zeros around the borders of 2D input data (like images) to increase spatial dimensions.</p>
          <h3>How it works:</h3>
          <p>The layer symmetrically or asymmetrically pads the height and width dimensions of the input with zeros. This increases the spatial size without adding learnable parameters or changing the actual data values.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Preserving spatial dimensions:</strong> Use before convolution layers to maintain the same output size as input after convolution operations</li>
            <li><strong>Edge feature preservation:</strong> Helps prevent information loss at image borders during repeated convolutions</li>
            <li><strong>Architecture requirements:</strong> When implementing specific architectures (like U-Net) that require precise dimension matching between layers</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>padding:</strong> Integer or tuple of 2 integers or tuple of 2 tuples of 2 integers - specifies the number of rows/columns to add on each side</li>
            <li><strong>data_format:</strong> Either 'channels_last' (default) or 'channels_first' - defines whether channels are in the last or first dimension</li>
          </ul>
          <p><em>💡 Tip: Use padding=(1,1) with 3x3 convolutions to maintain spatial dimensions, or calculate padding as (kernel_size-1)/2 for same-size outputs!</em></p>
        `,
        'ZeroPadding1D': `
          <h2>ZeroPadding1D Layer</h2>
          <p><strong>What it does:</strong> Adds zeros to the beginning and/or end of each sequence in the temporal dimension (axis 1).</p>
          <h3>How it works:</h3>
          <p>The layer pads the input sequences by inserting zeros at the specified positions, increasing the sequence length without changing the actual data values. This maintains the temporal structure while extending the sequence boundaries.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Preserving sequence length in convolutions:</strong> Prevents sequence shortening when using Conv1D layers without 'same' padding</li>
            <li><strong>Aligning sequences of different lengths:</strong> Ensures all sequences have the same length for batch processing</li>
            <li><strong>Creating buffer zones:</strong> Adds neutral padding to prevent edge effects in temporal convolutions</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>padding:</strong> Integer or tuple of 2 integers - how many zeros to add at the beginning and end (symmetric if single integer)</li>
          </ul>
          <p><em>💡 Tip: Use symmetric padding (single integer) for most cases, but asymmetric padding (tuple) when you need to align sequences with specific requirements or preserve causal relationships!</em></p>
        `,
        'ZeroPadding3D': `
          <h2>ZeroPadding3D Layer</h2>
          <p><strong>What it does:</strong> Adds zeros to the borders of 3D data (depth, height, width) to increase the spatial dimensions without learning any parameters.</p>
          <h3>How it works:</h3>
          <p>The layer symmetrically or asymmetrically pads each dimension of the input tensor with zeros. This increases the output size while preserving the original data in the center of the padded tensor.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Maintaining spatial dimensions:</strong> Preserve input volume size after convolution operations in 3D CNNs</li>
            <li><strong>Medical imaging:</strong> Add padding to 3D scans (CT, MRI) to ensure edge features aren't lost during convolution</li>
            <li><strong>Video processing:</strong> Pad temporal and spatial dimensions in video data for consistent frame sizes</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>padding:</strong> Integer or tuple of 3 integers or tuple of 3 tuples of 2 integers specifying padding for depth, height, and width dimensions</li>
            <li><strong>data_format:</strong> Either 'channels_first' or 'channels_last' to specify the position of the channel dimension</li>
          </ul>
          <p><em>💡 Tip: Use symmetric padding (same value for all sides) to preserve spatial relationships, or asymmetric padding when you need specific output dimensions for your network architecture!</em></p>
        `,
        'Cropping2D': `
          <h2>Cropping2D Layer</h2>
          <p><strong>What it does:</strong> Removes rows and columns of pixels from the borders of 2D spatial data (images).</p>
          <h3>How it works:</h3>
          <p>The layer crops along the spatial dimensions (height and width) by removing the specified number of rows from the top/bottom and columns from the left/right. This operation reduces the spatial dimensions of the feature maps while preserving the channel dimension.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Remove padding artifacts:</strong> Eliminate unwanted border effects or padding added by previous convolution operations</li>
            <li><strong>Focus on central regions:</strong> When the important features are concentrated in the center of images and edges contain noise or irrelevant information</li>
            <li><strong>Match dimensions:</strong> Align feature map sizes in skip connections or when concatenating layers in U-Net style architectures</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>cropping:</strong> Specifies pixels to crop as ((top, bottom), (left, right)) or a single integer for symmetric cropping</li>
            <li><strong>data_format:</strong> Either "channels_last" (default) or "channels_first" to specify the position of the channel dimension</li>
          </ul>
          <p><em>💡 Tip: Use Cropping2D paired with ZeroPadding2D to precisely control spatial dimensions in your network - this is especially useful in encoder-decoder architectures where dimension matching is critical!</em></p>
        `,
        'Cropping1D': `
          <h2>Cropping1D Layer</h2>
          <p><strong>What it does:</strong> Removes elements from the beginning and/or end of the temporal dimension in 1D sequences.</p>
          <h3>How it works:</h3>
          <p>The layer trims specified numbers of timesteps from the start and end of input sequences. For example, with cropping=(2, 3), it removes 2 timesteps from the beginning and 3 from the end.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Removing padding:</strong> Strip unnecessary padding tokens added during batch processing</li>
            <li><strong>Focusing on central features:</strong> Remove noisy or less relevant data at sequence boundaries</li>
            <li><strong>Sequence length adjustment:</strong> Trim sequences to match specific downstream layer requirements</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>cropping:</strong> Integer or tuple of 2 integers specifying how many units to crop from the start and end (e.g., 2 or (1, 2))</li>
          </ul>
          <p><em>💡 Tip: Use Cropping1D after convolutional layers to remove edge artifacts, or pair it with ZeroPadding1D for precise sequence length control!</em></p>
        `,
        'Cropping3D': `
          <h2>Cropping3D Layer</h2>
          <p><strong>What it does:</strong> Removes slices from the edges of 3D data (like video frames or 3D medical scans) along the depth, height, and width dimensions.</p>
          <h3>How it works:</h3>
          <p>The layer crops the input tensor by removing a specified number of elements from the beginning and end of each spatial dimension. This reduces the output size while preserving the central region of the 3D data.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Remove padding artifacts:</strong> Eliminate unwanted border regions added by convolution operations or data preprocessing</li>
            <li><strong>Focus on regions of interest:</strong> Extract central portions of 3D medical images where the main anatomical structures are located</li>
            <li><strong>Data augmentation:</strong> Create different views of 3D data by cropping various regions for training</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>cropping:</strong> Tuple of 3 tuples of 2 integers specifying (crop_start, crop_end) for each dimension</li>
            <li><strong>data_format:</strong> Either 'channels_last' or 'channels_first' to specify the ordering of dimensions</li>
          </ul>
          <p><em>💡 Tip: Use symmetric cropping (same values for start and end) to maintain centered data, or asymmetric cropping to shift your region of interest!</em></p>
        `,
        'SeparableConv2D': `
          <h2>SeparableConv2D Layer</h2>
          <p><strong>What it does:</strong> Performs a depthwise separable convolution that factorizes a standard convolution into a depthwise convolution followed by a pointwise convolution, significantly reducing computational cost.</p>
          <h3>How it works:</h3>
          <p>First applies a separate filter to each input channel (depthwise convolution), then uses 1x1 convolutions to combine the outputs (pointwise convolution). This decomposition reduces parameters from filters×input_channels×output_channels to filters×input_channels + input_channels×output_channels.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Mobile and edge devices:</strong> When you need efficient CNNs with limited computational resources while maintaining good accuracy</li>
            <li><strong>Large-scale image classification:</strong> As a drop-in replacement for Conv2D to reduce model size and training time</li>
            <li><strong>Real-time applications:</strong> When inference speed is critical and you need faster predictions without sacrificing too much accuracy</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of output filters in the pointwise convolution (determines output channels)</li>
            <li><strong>kernel_size:</strong> Size of the convolution window (e.g., (3, 3) for a 3x3 filter)</li>
            <li><strong>depth_multiplier:</strong> Number of depthwise convolution filters per input channel (default: 1)</li>
            <li><strong>activation:</strong> Activation function to apply (e.g., 'relu', 'sigmoid', None for linear)</li>
          </ul>
          <p><em>💡 Tip: SeparableConv2D typically uses 8-10x fewer parameters than regular Conv2D with similar accuracy - perfect for replacing Conv2D layers in the middle and later stages of your network, but keep regular Conv2D for the first layer to capture low-level features!</em></p>
        `,
        'SeparableConv1D': `
          <h2>SeparableConv1D Layer</h2>
          <p><strong>What it does:</strong> Performs a depthwise separable convolution on 1D data, which applies spatial and channel-wise convolutions separately for more efficient feature extraction.</p>
          <h3>How it works:</h3>
          <p>It first performs a depthwise convolution (spatial filtering on each channel independently), then applies a pointwise convolution (1x1 convolution) to combine the outputs. This factorization significantly reduces the number of parameters compared to regular convolutions.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Time series analysis:</strong> Processing sequential data like audio signals, sensor readings, or stock prices with fewer parameters</li>
            <li><strong>Text processing:</strong> Efficient feature extraction from word embeddings or character-level representations</li>
            <li><strong>Mobile/edge deployment:</strong> When you need convolution capabilities but have limited computational resources</li>
            <li><strong>Reducing overfitting:</strong> When your model has too many parameters and you want to maintain performance with fewer weights</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of output filters (dimensionality of the output space)</li>
            <li><strong>kernel_size:</strong> Length of the 1D convolution window</li>
            <li><strong>strides:</strong> Stride length of the convolution (default: 1)</li>
            <li><strong>padding:</strong> 'valid' (no padding) or 'same' (preserve input length)</li>
          </ul>
          <p><em>💡 Tip: SeparableConv1D typically uses 2-3x fewer parameters than regular Conv1D while maintaining similar performance - try it as a drop-in replacement when your model is too large!</em></p>
        `,
        'DepthwiseConv2D': `
          <h2>DepthwiseConv2D Layer</h2>
          <p><strong>What it does:</strong> Performs a depthwise convolution that applies a single convolutional filter to each input channel separately, significantly reducing computational cost compared to standard convolutions.</p>
          <h3>How it works:</h3>
          <p>Instead of mixing information across all input channels like regular convolution, it applies a separate filter to each channel independently. This creates the same number of output channels as input channels, using far fewer parameters than standard Conv2D.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Mobile and edge devices:</strong> When you need efficient CNNs for resource-constrained environments like smartphones or IoT devices</li>
            <li><strong>MobileNet architectures:</strong> As a core building block in lightweight models that prioritize speed and small model size</li>
            <li><strong>Feature extraction with channel independence:</strong> When you want to process each channel's spatial features separately before mixing them</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>kernel_size:</strong> Size of the convolution window (e.g., (3,3) for a 3x3 filter)</li>
            <li><strong>strides:</strong> Step size for moving the filter across the input (default: (1,1))</li>
            <li><strong>padding:</strong> 'valid' for no padding or 'same' to maintain spatial dimensions</li>
            <li><strong>depth_multiplier:</strong> Number of output channels per input channel (default: 1)</li>
          </ul>
          <p><em>💡 Tip: Pair DepthwiseConv2D with a 1x1 Conv2D layer (pointwise convolution) to create a "separable convolution" - this combination gives you the power of regular convolutions with 8-9x fewer parameters!</em></p>
        `,
        'Conv2DTranspose': `
          <h2>Conv2DTranspose Layer</h2>
          <p><strong>What it does:</strong> Performs transposed convolution (also called deconvolution) to upsample feature maps, typically increasing spatial dimensions while applying learnable filters.</p>
          <h3>How it works:</h3>
          <p>It applies a convolution operation that goes in the opposite direction of a normal convolution, inserting zeros between input values and then convolving with learnable kernels. This effectively increases the spatial dimensions of the input, making it useful for generating higher-resolution outputs from lower-resolution feature maps.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Image segmentation:</strong> In the decoder part of U-Net or similar architectures to upsample feature maps back to original image size</li>
            <li><strong>Generative models:</strong> In GANs and VAEs to progressively increase resolution from latent vectors to full-size images</li>
            <li><strong>Super-resolution:</strong> To increase the resolution of low-resolution images by learning upsampling patterns</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of output channels/feature maps (integer, required)</li>
            <li><strong>kernel_size:</strong> Size of the convolutional window (integer or tuple, e.g., 3 or (3,3))</li>
            <li><strong>strides:</strong> Upsampling factor - stride of 2 doubles spatial dimensions (default: (1,1))</li>
            <li><strong>padding:</strong> 'valid' for no padding, 'same' to maintain size relationship (default: 'valid')</li>
          </ul>
          <p><em>💡 Tip: Use strides=(2,2) to double spatial dimensions - this is more efficient than upsampling followed by regular convolution, and helps avoid checkerboard artifacts common in image generation!</em></p>
        `,
        'Conv1DTranspose': `
          <h2>Conv1DTranspose Layer</h2>
          <p><strong>What it does:</strong> Performs transposed convolution (also called deconvolution) to upsample 1D sequences by learning to expand compressed representations back to higher resolutions.</p>
          <h3>How it works:</h3>
          <p>It applies learnable filters that slide across the input sequence with configurable stride and padding, effectively reversing the downsampling effect of regular convolutions. Each input value influences multiple output positions through the transposed convolution operation, increasing the sequence length.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Sequence generation:</strong> Upsampling compressed latent representations in autoencoders or VAEs for time series reconstruction</li>
            <li><strong>Audio synthesis:</strong> Converting compressed audio features back to higher sample rates in generative models</li>
            <li><strong>Temporal upsampling:</strong> Increasing the temporal resolution of sensor data or signal processing applications</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of output filters (channels) - determines the depth of the output feature maps</li>
            <li><strong>kernel_size:</strong> Length of the 1D convolution window - controls the receptive field size</li>
            <li><strong>strides:</strong> Upsampling factor - determines how much the input sequence length is increased (default: 1)</li>
            <li><strong>padding:</strong> 'valid', 'same', or 'causal' - controls output size and boundary handling</li>
          </ul>
          <p><em>💡 Tip: Use strides > 1 to increase sequence length (e.g., strides=2 roughly doubles the length), but be aware this can create checkerboard artifacts - consider using UpSampling1D followed by regular Conv1D as an alternative!</em></p>
        `,
        'Conv3DTranspose': `
          <h2>Conv3DTranspose Layer</h2>
          <p><strong>What it does:</strong> Performs transposed convolution (also known as deconvolution) on 3D volumetric data, typically used to increase spatial dimensions of the input.</p>
          <h3>How it works:</h3>
          <p>It applies learnable filters that slide through the 3D input volume in reverse, expanding the spatial dimensions by inserting zeros between input values and convolving with the kernel. This operation is the gradient of Conv3D with respect to its input, effectively learning to upsample feature maps.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>3D segmentation decoders:</strong> Upsampling feature maps in U-Net architectures for medical image segmentation (CT/MRI scans)</li>
            <li><strong>Video generation:</strong> Generating video frames in GANs or VAEs by progressively increasing spatial and temporal resolution</li>
            <li><strong>3D reconstruction:</strong> Converting low-resolution feature representations back to high-resolution 3D volumes or voxel grids</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of output filters (feature maps) - determines the depth of the output volume</li>
            <li><strong>kernel_size:</strong> Size of the 3D convolution window (depth, height, width) - typically (3,3,3) or (5,5,5)</li>
            <li><strong>strides:</strong> Factor by which to increase spatial dimensions - (2,2,2) doubles each dimension</li>
            <li><strong>padding:</strong> 'valid' (no padding) or 'same' (preserves dimensions when stride=1)</li>
          </ul>
          <p><em>💡 Tip: Use strides=(2,2,2) instead of separate upsampling layers for more learnable upsampling, but watch out for checkerboard artifacts - consider using kernel sizes divisible by your stride values!</em></p>
        `,
        // Advanced Recurrent
        'Bidirectional': `
          <h2>Bidirectional Layer</h2>
          <p><strong>What it does:</strong> Wraps a recurrent layer (like LSTM or GRU) to process sequences in both forward and backward directions simultaneously, capturing patterns from past and future context.</p>
          <h3>How it works:</h3>
          <p>The layer creates two copies of the specified RNN layer - one processes the input sequence from start to end, while the other processes it from end to start. The outputs from both directions are then combined (typically concatenated) to produce a richer representation that incorporates both past and future information.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Text classification:</strong> When the entire sentence/document is available and understanding context from both directions improves accuracy</li>
            <li><strong>Named Entity Recognition:</strong> To identify entities in text where surrounding words from both sides provide crucial context</li>
            <li><strong>Machine translation:</strong> When translating complete sentences where future words help disambiguate earlier ones</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>layer:</strong> The RNN layer instance to wrap (e.g., LSTM, GRU) that will be duplicated for bidirectional processing</li>
            <li><strong>merge_mode:</strong> How to combine forward/backward outputs ('concat', 'sum', 'mul', 'ave', or None)</li>
          </ul>
          <p><em>💡 Tip: Bidirectional layers double the number of parameters and output dimensions (when using concat mode), so adjust your next layer's input size accordingly!</em></p>
        `,
        'ConvLSTM2D': `
          <h2>ConvLSTM2D Layer</h2>
          <p><strong>What it does:</strong> Applies convolutional operations within an LSTM architecture to process sequences of images or spatial data over time.</p>
          <h3>How it works:</h3>
          <p>It combines convolutional layers with LSTM cells, replacing matrix multiplications with convolution operations to capture both spatial and temporal patterns. This allows the network to learn features from video frames or other sequential spatial data while maintaining spatial structure.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Video prediction:</strong> Forecasting future frames in a video sequence or predicting next frames based on previous ones</li>
            <li><strong>Weather forecasting:</strong> Analyzing sequences of satellite images or radar data to predict weather patterns</li>
            <li><strong>Action recognition:</strong> Understanding and classifying actions in video sequences while preserving spatial information</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of output filters in the convolution (determines feature maps)</li>
            <li><strong>kernel_size:</strong> Size of the convolutional window (e.g., (3, 3) for 3x3 kernels)</li>
            <li><strong>return_sequences:</strong> Whether to return the full sequence or just the last output</li>
            <li><strong>padding:</strong> 'same' to maintain spatial dimensions or 'valid' for no padding</li>
          </ul>
          <p><em>💡 Tip: Start with smaller kernel sizes (3x3) and fewer filters to reduce computational cost, then increase complexity if needed. Set return_sequences=True when stacking multiple ConvLSTM2D layers!</em></p>
        `,
        'TimeDistributed': `
          <h2>TimeDistributed Layer</h2>
          <p><strong>What it does:</strong> Applies the same layer independently to every time step of a temporal sequence in the input.</p>
          <h3>How it works:</h3>
          <p>The TimeDistributed wrapper takes a layer (like Dense or Conv2D) and applies it to each time slice of the input tensor separately. For example, if your input has shape (batch_size, timesteps, features), it applies the wrapped layer to each of the timesteps independently, maintaining the temporal dimension.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Video processing:</strong> Apply convolutions frame-by-frame to extract features from each frame in a video sequence</li>
            <li><strong>Many-to-many RNNs:</strong> Generate outputs at each time step when you need predictions for every position in a sequence</li>
            <li><strong>Text sequence labeling:</strong> Apply dense layers to RNN outputs for tasks like named entity recognition or part-of-speech tagging</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>layer:</strong> The layer instance to be applied to every temporal slice (e.g., Dense, Conv2D, etc.)</li>
            <li><strong>input_shape:</strong> Expected shape of input arrays including the time dimension</li>
          </ul>
          <p><em>💡 Tip: TimeDistributed is especially useful after LSTM/GRU layers with return_sequences=True, allowing you to apply Dense layers to all time steps for sequence-to-sequence models!</em></p>
        `,
        // Utility
        'Permute': `
          <h2>Permute Layer</h2>
          <p><strong>What it does:</strong> Rearranges the dimensions of input tensors by swapping their axes according to a specified pattern.</p>
          <h3>How it works:</h3>
          <p>The layer takes the input tensor and reorders its dimensions based on the provided permutation pattern. For example, if you have a tensor with shape (batch_size, height, width, channels), you can swap the height and width dimensions by specifying the new order.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Channel ordering conversion:</strong> Switch between channel-first (channels, height, width) and channel-last (height, width, channels) formats</li>
            <li><strong>Preparing data for RNNs:</strong> Transform from (batch, features, timesteps) to (batch, timesteps, features) format</li>
            <li><strong>Connecting incompatible layers:</strong> Reshape data to match the expected input format of the next layer in your network</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>dims:</strong> Tuple of integers specifying the new order of dimensions (e.g., (2, 1) swaps the last two dimensions)</li>
            <li><strong>input_shape:</strong> Shape of the input tensor (excluding batch dimension) - only needed for the first layer</li>
          </ul>
          <p><em>💡 Tip: Remember that dimension indices start at 1 (not 0) and don't include the batch dimension - so (2, 1) swaps the second and third dimensions of your actual tensor!</em></p>
        `,
        'RepeatVector': `
          <h2>RepeatVector Layer</h2>
          <p><strong>What it does:</strong> Repeats the input vector n times to create a 3D tensor output suitable for recurrent layers.</p>
          <h3>How it works:</h3>
          <p>Takes a 2D input tensor of shape (batch_size, features) and repeats it n times along a new time axis, producing a 3D output of shape (batch_size, n, features). This effectively duplicates the same vector across multiple time steps.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Encoder-Decoder architectures:</strong> Bridge between encoder output and decoder input in sequence-to-sequence models</li>
            <li><strong>Many-to-many predictions:</strong> When you need to generate multiple outputs from a single input vector</li>
            <li><strong>Connecting Dense to LSTM/GRU:</strong> Transform non-sequential data into a format suitable for recurrent layers</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>n:</strong> The number of times to repeat the input (required parameter)</li>
            <li><strong>name:</strong> Optional string name for the layer</li>
          </ul>
          <p><em>💡 Tip: RepeatVector is essential when connecting a Dense layer output to LSTM/GRU layers in autoencoders or when the encoder produces a single vector that needs to be fed to multiple decoder time steps!</em></p>
        `,
        'Lambda': `
          <h2>Lambda Layer</h2>
          <p><strong>What it does:</strong> Applies a custom function or arbitrary expression to transform input data without trainable weights.</p>
          <h3>How it works:</h3>
          <p>Lambda layers wrap any Python function or expression and apply it to the input tensor during the forward pass. The function is executed element-wise or along specified dimensions, allowing for custom operations that aren't available as standard layers.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Custom preprocessing:</strong> Apply normalization, scaling, or mathematical transformations that aren't available as built-in layers</li>
            <li><strong>Feature engineering:</strong> Create derived features like ratios, differences, or logarithms of inputs</li>
            <li><strong>Model architecture tricks:</strong> Implement custom activation functions, attention mechanisms, or tensor manipulations</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>function:</strong> The Python function or lambda expression to apply to inputs</li>
            <li><strong>output_shape:</strong> Expected output shape (optional, but helps with model building)</li>
            <li><strong>arguments:</strong> Dictionary of additional keyword arguments to pass to the function</li>
          </ul>
          <p><em>💡 Tip: While Lambda layers are flexible, they can't be saved properly in some model formats - consider creating a custom layer class for production models that need full portability!</em></p>
        `,
        'Masking': `
          <h2>Masking Layer</h2>
          <p><strong>What it does:</strong> Masks timesteps in sequential data by skipping them during processing, typically used to handle variable-length sequences with padding.</p>
          <h3>How it works:</h3>
          <p>The layer identifies timesteps that match a specified mask value (usually 0) and creates a mask tensor that propagates through the network. Subsequent layers that support masking will skip computations for these masked timesteps, improving efficiency and preventing padded values from affecting the model.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Variable-length sequences:</strong> When processing text or time series data where sequences have different lengths and require padding to form batches</li>
            <li><strong>Padded input handling:</strong> To prevent padded zeros from influencing model predictions in RNNs, LSTMs, or GRUs</li>
            <li><strong>Efficiency optimization:</strong> To skip unnecessary computations on padded portions of sequences, reducing training time</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>mask_value:</strong> The value to be masked (default: 0.0) - timesteps with all features equal to this value will be masked</li>
            <li><strong>input_shape:</strong> Shape of the input tensor, typically (batch_size, timesteps, features) for sequential data</li>
          </ul>
          <p><em>💡 Tip: Place the Masking layer immediately after your input layer and before any recurrent layers - note that not all layers support masking, so check compatibility with downstream layers!</em></p>
        `,
        'ActivityRegularization': `
          <h2>ActivityRegularization Layer</h2>
          <p><strong>What it does:</strong> Applies L1 and/or L2 penalties to the layer's output activations during training to prevent overfitting.</p>
          <h3>How it works:</h3>
          <p>This layer passes the input through unchanged but adds a regularization loss based on the magnitude of the activations. The penalties are added to the total loss function during training, encouraging the network to produce smaller activation values.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Preventing overfitting:</strong> When your model performs well on training data but poorly on validation data</li>
            <li><strong>Encouraging sparsity:</strong> Use L1 regularization to push activations toward zero, creating sparse representations</li>
            <li><strong>Controlling activation magnitudes:</strong> When you want to keep intermediate layer outputs from becoming too large</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>l1:</strong> L1 regularization factor (default: 0.0) - promotes sparsity by penalizing the absolute values</li>
            <li><strong>l2:</strong> L2 regularization factor (default: 0.0) - promotes small values by penalizing squared magnitudes</li>
          </ul>
          <p><em>💡 Tip: Start with small regularization values (0.001 to 0.01) and increase gradually if needed - too much regularization can prevent your model from learning!</em></p>
        `,
        // Regularization
        'GaussianNoise': `
          <h2>GaussianNoise Layer</h2>
          <p><strong>What it does:</strong> Adds random noise from a Gaussian (normal) distribution to the input during training only, helping prevent overfitting.</p>
          <h3>How it works:</h3>
          <p>During training, the layer adds random values sampled from a Gaussian distribution with mean 0 and specified standard deviation to each input value. During inference (testing), the layer passes the input through unchanged without adding any noise.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Regularization:</strong> When your model is overfitting and you want to make it more robust to small variations in input data</li>
            <li><strong>Data augmentation:</strong> When you have limited training data and want to artificially increase variation</li>
            <li><strong>Robustness training:</strong> When you want your model to handle noisy or imperfect real-world inputs better</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>stddev:</strong> Standard deviation of the Gaussian noise distribution (default: 1.0) - higher values add more noise</li>
            <li><strong>seed:</strong> Random seed for reproducible noise generation (optional)</li>
          </ul>
          <p><em>💡 Tip: Start with small stddev values (0.1-0.3) and gradually increase if needed - too much noise can prevent the model from learning!</em></p>
        `,
        'GaussianDropout': `
          <h2>GaussianDropout Layer</h2>
          <p><strong>What it does:</strong> Applies multiplicative noise sampled from a Gaussian distribution centered at 1.0 to help prevent overfitting during training.</p>
          <h3>How it works:</h3>
          <p>During training, the layer multiplies inputs by random values drawn from a Gaussian distribution with mean 1.0 and a specified standard deviation. This multiplicative noise acts as a regularization technique, with the layer becoming a simple pass-through during inference.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Continuous data regularization:</strong> When working with continuous-valued inputs where standard dropout's binary masking might be too harsh</li>
            <li><strong>Recurrent networks:</strong> As an alternative to standard dropout in RNNs where multiplicative noise can be more effective</li>
            <li><strong>Small datasets:</strong> When you need gentler regularization than standard dropout for models trained on limited data</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>rate:</strong> Float between 0 and 1 representing the standard deviation of the noise distribution (higher values = stronger regularization)</li>
            <li><strong>seed:</strong> Integer to use as random seed for reproducible dropout patterns</li>
          </ul>
          <p><em>💡 Tip: Start with a rate around 0.1-0.3 for gentle regularization - GaussianDropout is often more subtle than standard Dropout, so you may need slightly higher rates for comparable regularization strength!</em></p>
        `,
        'AlphaDropout': `
          <h2>AlphaDropout Layer</h2>
          <p><strong>What it does:</strong> Applies dropout regularization while maintaining the self-normalizing property of SELU activations, keeping mean and variance stable.</p>
          <h3>How it works:</h3>
          <p>During training, randomly sets input units to zero with a given probability, but scales and shifts the remaining values to preserve the mean of 0 and variance of 1. This special dropout variant is designed specifically for Self-Normalizing Neural Networks (SNNs) that use SELU activation functions.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>SELU-based networks:</strong> Essential when using SELU activation functions to maintain self-normalization properties</li>
            <li><strong>Fully connected architectures:</strong> Works best with dense/fully connected layers rather than convolutional layers</li>
            <li><strong>Preventing overfitting in SNNs:</strong> When you need regularization but want to preserve the mathematical properties of self-normalizing networks</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>rate:</strong> Float between 0 and 1 representing the fraction of input units to drop (default: 0.1)</li>
            <li><strong>seed:</strong> Integer to use as random seed for reproducible dropout patterns</li>
          </ul>
          <p><em>💡 Tip: Use AlphaDropout with a rate of 0.05-0.1 for SELU networks - regular Dropout would break the self-normalization, making training unstable!</em></p>
        `,
        // Spatial Dropout
        'SpatialDropout1D': `
          <h2>SpatialDropout1D Layer</h2>
          <p><strong>What it does:</strong> Drops entire 1D feature channels instead of individual elements during training to prevent overfitting in sequential data.</p>
          <h3>How it works:</h3>
          <p>Rather than randomly dropping individual values like regular Dropout, SpatialDropout1D drops entire feature maps (channels) consistently across all timesteps. This means if a feature channel is dropped, it's dropped for the entire sequence length, preserving the spatial structure of the data.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Text processing with embeddings:</strong> When working with word embeddings where you want to drop entire word features rather than parts of word representations</li>
            <li><strong>Time series with multiple features:</strong> When each timestep has multiple correlated features and dropping entire features makes more sense than partial dropout</li>
            <li><strong>After Conv1D layers:</strong> To regularize convolutional features while maintaining the integrity of learned patterns across the sequence</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>rate:</strong> Float between 0 and 1 representing the fraction of input channels to drop (e.g., 0.2 drops 20% of channels)</li>
            <li><strong>seed:</strong> Optional integer to make the dropout pattern reproducible for debugging</li>
          </ul>
          <p><em>💡 Tip: Start with a rate between 0.1 and 0.3 for text/NLP tasks - SpatialDropout1D is often more effective than regular Dropout for embeddings because it maintains the semantic meaning of word vectors!</em></p>
        `,
        'SpatialDropout2D': `
          <h2>SpatialDropout2D Layer</h2>
          <p><strong>What it does:</strong> Drops entire 2D feature maps (channels) during training to prevent overfitting in convolutional neural networks.</p>
          <h3>How it works:</h3>
          <p>Instead of dropping individual pixels randomly like regular Dropout, SpatialDropout2D drops entire feature maps/channels. This preserves the spatial structure within feature maps, making it more effective for convolutional layers where adjacent pixels are highly correlated.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>After convolutional layers:</strong> Place between Conv2D layers to reduce overfitting while maintaining spatial patterns</li>
            <li><strong>Early in CNN architectures:</strong> More effective in earlier layers where feature maps represent coherent spatial patterns</li>
            <li><strong>Small datasets:</strong> When training data is limited and the model tends to memorize rather than generalize</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>rate:</strong> Float between 0 and 1 representing the fraction of feature maps to drop (e.g., 0.2 drops 20% of channels)</li>
            <li><strong>data_format:</strong> Either 'channels_first' or 'channels_last' to specify the position of the channel dimension</li>
          </ul>
          <p><em>💡 Tip: Start with a rate of 0.1-0.2 for SpatialDropout2D - it's more aggressive than regular dropout since it drops entire feature maps, so lower rates often work better!</em></p>
        `,
        'SpatialDropout3D': `
          <h2>SpatialDropout3D Layer</h2>
          <p><strong>What it does:</strong> Drops entire 3D feature maps instead of individual elements to help prevent overfitting in 3D convolutional networks.</p>
          <h3>How it works:</h3>
          <p>Rather than dropping random individual neurons like standard dropout, this layer drops entire 3D feature channels. When a feature map is dropped, all voxels in that feature map are set to zero, maintaining spatial correlations within each channel.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>3D medical imaging:</strong> When working with CT scans, MRI data, or other volumetric medical images where adjacent voxels are highly correlated</li>
            <li><strong>Video processing:</strong> For temporal-spatial models where you want to maintain feature consistency across frames and spatial dimensions</li>
            <li><strong>3D object recognition:</strong> When processing 3D point clouds or voxel-based representations where spatial structure is critical</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>rate:</strong> Float between 0 and 1 representing the fraction of feature maps to drop (e.g., 0.2 drops 20% of channels)</li>
            <li><strong>data_format:</strong> Either 'channels_first' or 'channels_last' to specify the position of the channel dimension in your input</li>
          </ul>
          <p><em>💡 Tip: Start with a lower dropout rate (0.1-0.2) for 3D data since dropping entire feature maps is more aggressive than standard dropout - you can increase it if your model still overfits!</em></p>
        `,
        // Attention
        'MultiHeadAttention': `
          <h2>MultiHeadAttention Layer</h2>
          <p><strong>What it does:</strong> Applies self-attention mechanism with multiple parallel attention heads to capture different types of relationships between elements in a sequence.</p>
          <h3>How it works:</h3>
          <p>It splits the input into multiple heads, computes scaled dot-product attention for each head independently, then concatenates and projects the results. This allows the model to jointly attend to information from different representation subspaces at different positions.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Transformer models:</strong> Core building block for transformer architectures used in NLP tasks like translation and text generation</li>
            <li><strong>Sequence modeling:</strong> When you need to capture long-range dependencies between elements in sequences</li>
            <li><strong>Computer vision:</strong> For vision transformers (ViT) that process images as sequences of patches</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>num_heads:</strong> Number of parallel attention heads (typical values: 8, 12, 16)</li>
            <li><strong>key_dim:</strong> Size of each attention head for query and key (often set to model_dim/num_heads)</li>
            <li><strong>dropout:</strong> Dropout rate applied to attention scores (typical: 0.1-0.2)</li>
            <li><strong>use_bias:</strong> Whether to use bias in the dense layers (default: True)</li>
          </ul>
          <p><em>💡 Tip: Start with num_heads=8 and key_dim=64 for most tasks - ensure your model dimension is divisible by num_heads for optimal performance!</em></p>
        `,
        'Attention': `
          <h2>Attention Layer</h2>
          <p><strong>What it does:</strong> Computes attention weights between query and value sequences, allowing the model to focus on relevant parts of the input when processing each element.</p>
          <h3>How it works:</h3>
          <p>The layer calculates similarity scores between queries and keys using dot product, applies softmax to get attention weights, then uses these weights to create a weighted sum of values. This mechanism enables the model to dynamically determine which parts of the input are most relevant for each output.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Sequence-to-sequence tasks:</strong> Machine translation, text summarization, or any task where different parts of the input have varying importance</li>
            <li><strong>Document understanding:</strong> When processing long texts where the model needs to identify and focus on relevant sections</li>
            <li><strong>Multi-modal learning:</strong> Aligning information between different data types like image captions or video descriptions</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>use_scale:</strong> Whether to scale the attention scores by 1/sqrt(key_dim) for numerical stability (default: True)</li>
            <li><strong>dropout:</strong> Dropout rate applied to attention weights (0.0 to 1.0) to prevent overfitting</li>
            <li><strong>score_mode:</strong> How to compute attention scores - 'dot' for dot product or 'concat' for concatenation-based scoring</li>
          </ul>
          <p><em>💡 Tip: Start with use_scale=True for better training stability, especially with longer sequences. Add dropout (0.1-0.2) if your model shows signs of overfitting on the attention patterns!</em></p>
        `,
        'AdditiveAttention': `
          <h2>AdditiveAttention Layer</h2>
          <p><strong>What it does:</strong> Computes attention weights between query and key-value pairs using a learned additive scoring function, allowing the model to focus on relevant parts of the input.</p>
          <h3>How it works:</h3>
          <p>It calculates attention scores by passing the sum of transformed queries and keys through a neural network with a tanh activation, then applies softmax to get weights. These weights are used to compute a weighted sum of the values, producing a context-aware output.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Sequence-to-sequence models:</strong> When building encoders-decoders for tasks like machine translation or text summarization</li>
            <li><strong>Variable-length inputs:</strong> When you need to handle sequences of different lengths without padding issues</li>
            <li><strong>Interpretable attention:</strong> When you want to visualize what parts of the input the model is focusing on</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>use_scale:</strong> Whether to scale the attention scores by the square root of the key dimension (helps with training stability)</li>
            <li><strong>dropout:</strong> Dropout rate applied to attention weights (0.0 to 1.0) to prevent overfitting</li>
          </ul>
          <p><em>💡 Tip: AdditiveAttention often works better than dot-product attention when queries and keys have different dimensions, as it uses a feedforward network to compute compatibility!</em></p>
        `,
        // Normalization
        'LayerNormalization': `
          <h2>LayerNormalization Layer</h2>
          <p><strong>What it does:</strong> Normalizes the activations of each sample independently by centering and scaling them across the feature dimensions.</p>
          <h3>How it works:</h3>
          <p>For each sample in a batch, it computes the mean and variance across the specified axes (typically the feature dimensions), then normalizes the values to have zero mean and unit variance. Learnable scale and shift parameters allow the model to adapt the normalization as needed.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Transformer architectures:</strong> Essential component in attention-based models like BERT, GPT, and Vision Transformers</li>
            <li><strong>RNN/LSTM networks:</strong> Helps stabilize training in recurrent networks by normalizing hidden states</li>
            <li><strong>Deep networks with variable batch sizes:</strong> Unlike batch normalization, works consistently regardless of batch size</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>axis:</strong> Integer or list specifying which axes to normalize over (default: -1, the last dimension)</li>
            <li><strong>epsilon:</strong> Small constant added for numerical stability (default: 0.001)</li>
            <li><strong>center:</strong> Whether to learn an additive bias parameter (default: True)</li>
            <li><strong>scale:</strong> Whether to learn a multiplicative scale parameter (default: True)</li>
          </ul>
          <p><em>💡 Tip: Layer normalization is typically placed after the main computation (like attention or feed-forward) and before the residual connection in transformer blocks!</em></p>
        `,
        // Locally Connected
        'LocallyConnected1D': `
          <h2>LocallyConnected1D Layer</h2>
          <p><strong>What it does:</strong> Applies convolution-like operations where each position has its own unique set of filters, unlike standard convolutions that share weights across all positions.</p>
          <h3>How it works:</h3>
          <p>Instead of using the same filter weights across the entire input sequence, this layer learns different weights for each spatial position. This creates location-specific feature detectors that can capture position-dependent patterns in your data.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Position-specific patterns:</strong> When different positions in your sequence have fundamentally different meanings (e.g., analyzing fixed-format data where each position represents a different type of measurement)</li>
            <li><strong>Non-translation invariant tasks:</strong> When the same pattern appearing at different positions should be treated differently (e.g., time series where early vs. late events have different significance)</li>
            <li><strong>Small, fixed-size inputs:</strong> When working with short sequences where position-specific learning is computationally feasible and beneficial</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of output filters (feature maps) to produce at each position</li>
            <li><strong>kernel_size:</strong> Size of the convolution window for each filter</li>
            <li><strong>strides:</strong> Step size for moving the convolution window (default is 1)</li>
            <li><strong>activation:</strong> Activation function to apply to the output (e.g., 'relu', 'sigmoid')</li>
          </ul>
          <p><em>💡 Tip: LocallyConnected1D uses significantly more parameters than Conv1D since weights aren't shared - only use it when position-specific features are crucial and your input size is relatively small!</em></p>
        `,
        'LocallyConnected2D': `
          <h2>LocallyConnected2D Layer</h2>
          <p><strong>What it does:</strong> Applies a locally connected operation over a 2D input where each output position has its own unique set of weights (unlike Conv2D which shares weights across all positions).</p>
          <h3>How it works:</h3>
          <p>Similar to a convolution layer, but without weight sharing - each spatial location learns its own set of filters. This means the layer has significantly more parameters than a standard Conv2D layer with the same filter size.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Face recognition tasks:</strong> Different facial regions may need specialized feature detectors (eyes, nose, mouth)</li>
            <li><strong>Non-translation invariant patterns:</strong> When features at different spatial locations have fundamentally different characteristics</li>
            <li><strong>Small, fixed-size inputs:</strong> Works best when input dimensions are consistent and relatively small</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>filters:</strong> Number of output filters (feature maps) to produce</li>
            <li><strong>kernel_size:</strong> Size of the local receptive field (e.g., (3, 3) for a 3x3 window)</li>
            <li><strong>strides:</strong> Step size for moving the kernel across the input (default: (1, 1))</li>
            <li><strong>padding:</strong> Either 'valid' (no padding) or 'same' (preserve spatial dimensions)</li>
          </ul>
          <p><em>💡 Tip: LocallyConnected2D uses much more memory than Conv2D due to unique weights per position - only use it when you specifically need location-dependent features, not for general image processing!</em></p>
        `,
        // Preprocessing
        'Rescaling': `
          <h2>Rescaling Layer</h2>
          <p><strong>What it does:</strong> Linearly transforms input values by multiplying by a scale factor and optionally adding an offset to normalize or standardize data ranges.</p>
          <h3>How it works:</h3>
          <p>The layer applies the transformation: output = input * scale + offset. This operation is applied element-wise to all input values, allowing you to convert pixel values from one range to another (e.g., from [0, 255] to [0, 1] or [-1, 1]).</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Image preprocessing:</strong> Normalize pixel values from [0, 255] to [0, 1] or [-1, 1] for better model training stability</li>
            <li><strong>Data standardization:</strong> Scale input features to a consistent range when working with mixed data types</li>
            <li><strong>Transfer learning:</strong> Match the input preprocessing requirements of pretrained models that expect specific value ranges</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>scale:</strong> The scale factor to multiply inputs by (e.g., 1/255.0 to convert [0, 255] to [0, 1])</li>
            <li><strong>offset:</strong> Optional value to add after scaling (default: 0.0), useful for shifting ranges like [0, 1] to [-1, 1]</li>
          </ul>
          <p><em>💡 Tip: Place Rescaling as the first layer in your model to include preprocessing in the model itself - this ensures the same scaling is applied during both training and inference!</em></p>
        `,
        'Normalization': `
          <h2>Normalization Layer</h2>
          <p><strong>What it does:</strong> Normalizes input features by subtracting the mean and dividing by the standard deviation, scaling data to have zero mean and unit variance.</p>
          <h3>How it works:</h3>
          <p>The layer computes statistics (mean and variance) from your training data during an initial adapt() step, then applies these fixed statistics to normalize inputs during training and inference. This standardization transformation helps ensure all features are on the same scale.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Mixed-scale features:</strong> When input features have vastly different ranges (e.g., age in years vs. income in thousands)</li>
            <li><strong>Tabular data preprocessing:</strong> As the first layer when working with structured/tabular data to standardize numerical columns</li>
            <li><strong>Improving convergence:</strong> When you need faster and more stable training by preventing features with large values from dominating the gradient</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>axis:</strong> Integer or tuple specifying which axes should be normalized (default: -1 for last axis)</li>
            <li><strong>mean:</strong> Pre-computed mean values to use instead of adapting from data (optional)</li>
            <li><strong>variance:</strong> Pre-computed variance values to use instead of adapting from data (optional)</li>
          </ul>
          <p><em>💡 Tip: Always call adapt() on your training data before training, or provide pre-computed statistics - this layer needs to know your data's distribution before it can normalize properly!</em></p>
        `,
        // Data Augmentation
        'RandomFlip': `
          <h2>RandomFlip Layer</h2>
          <p><strong>What it does:</strong> Randomly flips images horizontally and/or vertically during training to augment the dataset and improve model generalization.</p>
          <h3>How it works:</h3>
          <p>The layer applies random horizontal and/or vertical flipping to input images based on specified probabilities. Each flip operation mirrors the image along the respective axis, creating new variations of the original data during training.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Data augmentation:</strong> When you have limited training images and need to artificially increase dataset variety</li>
            <li><strong>Symmetrical objects:</strong> For classifying objects that can naturally appear flipped (faces, animals, vehicles)</li>
            <li><strong>Reducing overfitting:</strong> To prevent the model from memorizing specific orientations and improve generalization</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>mode:</strong> Controls flip direction - "horizontal", "vertical", or "horizontal_and_vertical"</li>
            <li><strong>seed:</strong> Random seed for reproducible augmentations during experiments</li>
          </ul>
          <p><em>💡 Tip: Avoid RandomFlip for text recognition or medical images where orientation matters - a flipped X-ray or text would be meaningless!</em></p>
        `,
        'RandomRotation': `
          <h2>RandomRotation Layer</h2>
          <p><strong>What it does:</strong> Randomly rotates images during training by a specified angle range to augment the dataset and improve model generalization.</p>
          <h3>How it works:</h3>
          <p>The layer randomly selects a rotation angle within the specified range for each image and applies the transformation. During inference, this augmentation can be disabled to ensure consistent predictions.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Limited training data:</strong> When you have a small dataset and need to artificially increase variety to prevent overfitting</li>
            <li><strong>Rotation-invariant tasks:</strong> For problems where objects can appear at any orientation (aerial imagery, medical scans, natural scenes)</li>
            <li><strong>Improving robustness:</strong> To make your model less sensitive to the exact orientation of objects in real-world applications</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>factor:</strong> The rotation range as a fraction of 2π (e.g., 0.2 means ±36 degrees) or a tuple specifying min/max rotation</li>
            <li><strong>fill_mode:</strong> How to fill pixels outside the image boundaries after rotation ('reflect', 'constant', 'wrap', or 'nearest')</li>
            <li><strong>interpolation:</strong> Interpolation method for pixel values ('bilinear' or 'nearest')</li>
          </ul>
          <p><em>💡 Tip: Start with small rotation ranges (0.1-0.2) for most tasks - excessive rotation can confuse the model if your objects have a natural "up" direction!</em></p>
        `,
        'RandomZoom': `
          <h2>RandomZoom Layer</h2>
          <p><strong>What it does:</strong> Randomly zooms images in or out during training to create scale variations for data augmentation.</p>
          <h3>How it works:</h3>
          <p>The layer applies random zoom transformations by scaling the image along both height and width dimensions within specified ranges. Zooming in crops the image while zooming out adds padding or interpolation to maintain the original dimensions.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Object detection tasks:</strong> Helps models recognize objects at different scales and distances</li>
            <li><strong>Limited training data:</strong> Artificially expands your dataset by creating scale variations of existing images</li>
            <li><strong>Real-world robustness:</strong> Prepares models for images where subjects appear at varying distances from the camera</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>height_factor:</strong> Range for vertical zoom (e.g., 0.2 means zoom between 80% and 120%)</li>
            <li><strong>width_factor:</strong> Range for horizontal zoom (use None to match height_factor for uniform scaling)</li>
            <li><strong>fill_mode:</strong> How to fill empty pixels when zooming out ('reflect', 'constant', 'wrap', or 'nearest')</li>
            <li><strong>interpolation:</strong> Resampling method ('bilinear' or 'nearest') for pixel interpolation</li>
          </ul>
          <p><em>💡 Tip: Start with moderate zoom factors (0.1-0.2) to avoid excessive distortion, and use 'reflect' fill mode for natural-looking borders when zooming out!</em></p>
        `,
        'RandomTranslation': `
          <h2>RandomTranslation Layer</h2>
          <p><strong>What it does:</strong> Randomly shifts images vertically and/or horizontally by a specified fraction of the image dimensions during training for data augmentation.</p>
          <h3>How it works:</h3>
          <p>The layer randomly samples translation amounts within the specified range and applies them to shift the image pixels. Empty areas created by the shift are filled according to the chosen fill mode (e.g., with zeros, nearest pixels, or reflection).</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Object detection tasks:</strong> Makes models robust to objects appearing at different positions in the frame</li>
            <li><strong>Small dataset augmentation:</strong> Artificially increases training data variety when you have limited images</li>
            <li><strong>Position invariance:</strong> When your model needs to recognize objects regardless of their location in the image</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>height_factor:</strong> Float or tuple defining the vertical shift range as a fraction of image height (e.g., 0.2 = ±20%)</li>
            <li><strong>width_factor:</strong> Float or tuple defining the horizontal shift range as a fraction of image width (e.g., 0.2 = ±20%)</li>
            <li><strong>fill_mode:</strong> How to fill empty pixels after translation ('reflect', 'constant', 'wrap', or 'nearest')</li>
          </ul>
          <p><em>💡 Tip: Start with small translation factors (0.1-0.2) to avoid shifting important features out of frame, and use 'reflect' fill mode for natural images to avoid black borders!</em></p>
        `,
        'RandomContrast': `
          <h2>RandomContrast Layer</h2>
          <p><strong>What it does:</strong> Randomly adjusts the contrast of images during training to make your model more robust to varying lighting conditions.</p>
          <h3>How it works:</h3>
          <p>The layer randomly selects a contrast factor within a specified range and adjusts pixel intensities by scaling them away from or towards the mean intensity. This transformation is applied independently to each image in the batch during training.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Real-world image classification:</strong> When your model needs to handle photos taken under different lighting conditions or camera settings</li>
            <li><strong>Object detection tasks:</strong> To improve detection accuracy when objects appear in both high and low contrast scenarios</li>
            <li><strong>Limited training data:</strong> As a data augmentation technique to artificially expand your dataset and prevent overfitting</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>factor:</strong> A float or tuple of two floats representing the contrast range (e.g., 0.5 to 1.5 where 1.0 is no change)</li>
            <li><strong>seed:</strong> Random seed for reproducible augmentations during experiments</li>
          </ul>
          <p><em>💡 Tip: Start with a moderate range like (0.7, 1.3) and adjust based on your dataset - too extreme values might make features unrecognizable!</em></p>
        `,
        'RandomBrightness': `
          <h2>RandomBrightness Layer</h2>
          <p><strong>What it does:</strong> Randomly adjusts the brightness of input images during training to make models more robust to lighting variations.</p>
          <h3>How it works:</h3>
          <p>The layer randomly selects a brightness adjustment factor within a specified range and applies it uniformly to all pixel values in the image. This adjustment is applied differently to each image in a batch and changes with each training step.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Limited training data:</strong> When you have a small dataset and need to artificially increase variety through augmentation</li>
            <li><strong>Variable lighting conditions:</strong> When your model needs to work in environments with different lighting (indoor/outdoor, day/night)</li>
            <li><strong>Preventing overfitting:</strong> To reduce memorization of specific brightness patterns in training images</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>factor:</strong> A float or tuple of floats defining the brightness adjustment range (e.g., 0.2 means ±20% brightness change)</li>
            <li><strong>value_range:</strong> The range of pixel values in your images, typically [0, 255] or [0, 1]</li>
            <li><strong>seed:</strong> Random seed for reproducible augmentation patterns during testing</li>
          </ul>
          <p><em>💡 Tip: Start with a moderate factor like 0.2 - too high values (>0.5) can make images unnaturally dark or washed out, potentially hurting model performance!</em></p>
        `,
        'RandomHeight': `
          <h2>RandomHeight Layer</h2>
          <p><strong>What it does:</strong> Randomly adjusts the height of input images during training by stretching or compressing them vertically within a specified range.</p>
          <h3>How it works:</h3>
          <p>The layer randomly samples a height scaling factor from the specified range and resizes the image vertically while maintaining the original width. This transformation is applied differently to each image in a batch and changes between training epochs.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Data augmentation:</strong> Increase training data variety to improve model generalization and reduce overfitting</li>
            <li><strong>Object detection tasks:</strong> Help models become invariant to different object scales and aspect ratios</li>
            <li><strong>Limited training data:</strong> Artificially expand your dataset when you have few training images</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>factor:</strong> A float or tuple of floats representing the height scaling range (e.g., 0.2 or (-0.2, 0.2) for ±20% height change)</li>
            <li><strong>interpolation:</strong> The interpolation method for resizing ('bilinear', 'nearest', 'bicubic', etc.)</li>
          </ul>
          <p><em>💡 Tip: Use moderate factor values (0.1-0.3) to avoid extreme distortions that might confuse your model, and always apply this layer only during training, not during inference!</em></p>
        `,
        'RandomWidth': `
          <h2>RandomWidth Layer</h2>
          <p><strong>What it does:</strong> Randomly adjusts the width of input images during training by horizontally stretching or compressing them within a specified range.</p>
          <h3>How it works:</h3>
          <p>The layer randomly scales images horizontally by a factor sampled uniformly from the specified range, while keeping the height unchanged. This transformation is applied independently to each image in the batch during training, but is disabled during inference.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Data augmentation:</strong> Increase training data diversity to improve model generalization and reduce overfitting</li>
            <li><strong>Object detection tasks:</strong> Help models become robust to objects appearing at different aspect ratios</li>
            <li><strong>Limited dataset scenarios:</strong> Artificially expand your training set when you have insufficient image samples</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>factor:</strong> A float or tuple of two floats representing the width adjustment range (e.g., 0.2 means ±20% width change)</li>
            <li><strong>interpolation:</strong> Resampling method used when resizing ('bilinear', 'nearest', 'bicubic', etc.)</li>
            <li><strong>seed:</strong> Random seed for reproducible augmentations during training</li>
          </ul>
          <p><em>💡 Tip: Use moderate factor values (0.1-0.3) to avoid excessive distortion that might confuse the model - start small and increase gradually if needed!</em></p>
        `,
        'RandomCrop': `
          <h2>RandomCrop Layer</h2>
          <p><strong>What it does:</strong> Randomly crops images to a specified target size during training, extracting different regions from the input images for data augmentation.</p>
          <h3>How it works:</h3>
          <p>The layer randomly selects a starting position within the input image and extracts a crop of the specified height and width from that position. During inference, it performs a center crop by default unless specified otherwise.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Data augmentation:</strong> Increase dataset variety by showing the model different parts of the same image during training</li>
            <li><strong>Reducing overfitting:</strong> Force the model to learn features from various image regions rather than memorizing specific positions</li>
            <li><strong>Standardizing input sizes:</strong> Convert images of varying sizes to a consistent dimension required by your model</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>height:</strong> Target height for the cropped images (integer value)</li>
            <li><strong>width:</strong> Target width for the cropped images (integer value)</li>
            <li><strong>seed:</strong> Random seed for reproducible augmentation patterns (optional integer)</li>
          </ul>
          <p><em>💡 Tip: Make sure your input images are larger than the crop dimensions, or use RandomZoom first to ensure sufficient image size for cropping!</em></p>
        `,
        'CenterCrop': `
          <h2>CenterCrop Layer</h2>
          <p><strong>What it does:</strong> Crops the central region of input images to a specified target height and width.</p>
          <h3>How it works:</h3>
          <p>The layer calculates the center point of the input image and extracts a rectangular region of the specified dimensions around it. If the target size is larger than the input, the image is padded instead.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Standardizing input sizes:</strong> When you need all images to have the same dimensions for batch processing</li>
            <li><strong>Focus on central content:</strong> When the main subject is typically centered and edges contain less important information</li>
            <li><strong>Data augmentation:</strong> As part of preprocessing to create consistent input sizes while preserving the most important image regions</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>height:</strong> Target height for the cropped image (integer)</li>
            <li><strong>width:</strong> Target width for the cropped image (integer)</li>
          </ul>
          <p><em>💡 Tip: CenterCrop works best when your dataset has consistently centered subjects - for off-center subjects, consider using RandomCrop during training for better augmentation!</em></p>
        `,
        // More Preprocessing
        'CategoryEncoding': `
          <h2>CategoryEncoding Layer</h2>
          <p><strong>What it does:</strong> Converts integer categorical features into one-hot, multi-hot, or count-based dense representations.</p>
          <h3>How it works:</h3>
          <p>Takes integer inputs and creates a binary vector where each position represents a category, setting 1s for present categories and 0s elsewhere. For multi-hot encoding, multiple categories can be active simultaneously in a single sample.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Categorical data preprocessing:</strong> When you need to convert integer-encoded categories into a format neural networks can process effectively</li>
            <li><strong>Multi-label classification:</strong> When samples can belong to multiple categories simultaneously (e.g., movie genres, product tags)</li>
            <li><strong>Text processing:</strong> For converting tokenized text into bag-of-words representations</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>num_tokens:</strong> The total number of unique categories/tokens to encode (defines output vector size)</li>
            <li><strong>output_mode:</strong> Choose between "one_hot", "multi_hot", or "count" encoding strategies</li>
          </ul>
          <p><em>💡 Tip: Set num_tokens slightly higher than your maximum category value to avoid index errors, and use "multi_hot" mode when processing variable-length sequences or multiple categories per sample!</em></p>
        `,
        'StringLookup': `
          <h2>StringLookup Layer</h2>
          <p><strong>What it does:</strong> Maps strings to integer indices, creating a vocabulary-based encoding for text data.</p>
          <h3>How it works:</h3>
          <p>The layer builds a vocabulary from training data and assigns each unique string a numerical index. During inference, it converts input strings to their corresponding integer indices based on this vocabulary.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Text preprocessing:</strong> Converting words or tokens to numerical IDs before feeding them to embedding layers</li>
            <li><strong>Categorical encoding:</strong> Transforming string-based categorical features into integer indices for neural network processing</li>
            <li><strong>Vocabulary management:</strong> Creating consistent string-to-integer mappings across training and inference</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>max_tokens:</strong> Maximum size of the vocabulary (including OOV and mask tokens if used)</li>
            <li><strong>output_mode:</strong> How to output results - 'int' for integer indices, 'multi_hot', 'count', or 'tf_idf' for vectorized outputs</li>
            <li><strong>oov_token:</strong> Token to use for out-of-vocabulary strings (default: '[UNK]')</li>
            <li><strong>vocabulary:</strong> Optional pre-computed vocabulary list to use instead of adapting from data</li>
          </ul>
          <p><em>💡 Tip: Always call adapt() on your training data before using the layer, or provide a pre-computed vocabulary to ensure consistent encoding!</em></p>
        `,
        'IntegerLookup': `
          <h2>IntegerLookup Layer</h2>
          <p><strong>What it does:</strong> Maps integer values to contiguous integer indices, creating a vocabulary-to-index mapping for categorical integer features.</p>
          <h3>How it works:</h3>
          <p>The layer builds a vocabulary of unique integer values from your data and assigns each value a unique index starting from 0. Unknown integers encountered during inference are mapped to a special out-of-vocabulary (OOV) index.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Categorical feature encoding:</strong> Convert user IDs, product IDs, or zip codes into dense index representations for embedding layers</li>
            <li><strong>Vocabulary management:</strong> Limit the number of unique values to handle by setting a maximum vocabulary size</li>
            <li><strong>Preprocessing pipelines:</strong> Standardize integer inputs before feeding them to embedding or dense layers</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>max_tokens:</strong> Maximum number of unique integers to track (including OOV token if used)</li>
            <li><strong>num_oov_indices:</strong> Number of out-of-vocabulary indices to reserve (default is 1)</li>
            <li><strong>mask_token:</strong> Integer value to reserve as a mask token for padding sequences</li>
            <li><strong>output_mode:</strong> How to output results - "int" for indices, "multi_hot", "count", or "tf_idf" for vectorized outputs</li>
          </ul>
          <p><em>💡 Tip: Always call adapt() on your training data before using the layer, or provide a pre-computed vocabulary to ensure consistent indexing across training and inference!</em></p>
        `,
        'Hashing': `
          <h2>Hashing Layer</h2>
          <p><strong>What it does:</strong> Maps categorical input values (integers or strings) to a fixed range of integers using a hash function, enabling feature encoding without vocabulary management.</p>
          <h3>How it works:</h3>
          <p>The layer applies a deterministic hash function to each input value, converting it to an integer between 0 and num_bins-1. This creates a consistent mapping without storing a vocabulary, though different inputs may hash to the same value (hash collisions).</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Large categorical features:</strong> When you have millions of unique categories (like user IDs or product SKUs) that would be memory-intensive to one-hot encode</li>
            <li><strong>Unknown categories:</strong> When new categories may appear in production that weren't seen during training</li>
            <li><strong>Feature hashing:</strong> As a dimensionality reduction technique for high-cardinality text features or sparse data</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>num_bins:</strong> Number of hash bins (output dimension) - controls the trade-off between memory usage and collision rate</li>
            <li><strong>mask_value:</strong> Optional value to be masked/ignored in the input (useful for padding)</li>
            <li><strong>salt:</strong> Random seed for the hash function to create different hash spaces if needed</li>
          </ul>
          <p><em>💡 Tip: Set num_bins to be 2-10x the number of unique categories you expect to minimize collisions while keeping memory usage reasonable!</em></p>
        `,
        'Discretization': `
          <h2>Discretization Layer</h2>
          <p><strong>What it does:</strong> Converts continuous numerical features into categorical bins (buckets), transforming floating-point values into discrete integer indices.</p>
          <h3>How it works:</h3>
          <p>The layer divides the continuous input range into specified bins using predefined boundaries or quantiles. Each input value is then mapped to the index of the bin it falls into, effectively converting continuous data into categorical representations.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Feature engineering for tabular data:</strong> When you need to convert continuous features like age or income into categorical groups for better model interpretability</li>
            <li><strong>Handling non-linear relationships:</strong> When the relationship between a continuous feature and target is non-linear and can be better captured through binning</li>
            <li><strong>Reducing noise in continuous features:</strong> When precise values are less important than the range they fall into, such as grouping temperatures into "cold", "mild", "hot"</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>bin_boundaries:</strong> A list of boundary values that define the edges of each bin (e.g., [0, 10, 20, 30] creates 4 bins)</li>
            <li><strong>num_bins:</strong> Alternative to bin_boundaries - automatically creates this many equal-width bins based on the data range</li>
            <li><strong>output_mode:</strong> How to represent the output - "int" for integer indices, "one_hot" for one-hot encoded vectors, or "multi_hot" for multi-hot encoding</li>
          </ul>
          <p><em>💡 Tip: Use adapt() method on your training data to automatically compute optimal bin boundaries based on quantiles, ensuring balanced distribution across bins!</em></p>
        `,
        'TextVectorization': `
          <h2>TextVectorization Layer</h2>
          <p><strong>What it does:</strong> Converts raw text strings into integer sequences or dense token representations that neural networks can process.</p>
          <h3>How it works:</h3>
          <p>The layer tokenizes text into words or subwords, builds a vocabulary from the training data, and maps each token to a unique integer index. It can output either integer sequences or multi-hot/count/tf-idf encoded vectors.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Text classification:</strong> Convert movie reviews, emails, or documents into numerical format for sentiment analysis or categorization</li>
            <li><strong>Preprocessing for NLP models:</strong> Prepare text data as input for LSTM, GRU, or transformer-based models</li>
            <li><strong>Feature extraction:</strong> Transform text into bag-of-words or TF-IDF representations for traditional ML algorithms</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>max_tokens:</strong> Maximum vocabulary size - limits the number of unique words to track (default: None)</li>
            <li><strong>output_mode:</strong> Format of output - 'int' for integer sequences, 'multi_hot' for binary vectors, 'count' for word counts, or 'tf_idf'</li>
            <li><strong>output_sequence_length:</strong> Fixed length for output sequences - pads or truncates to this length (only for 'int' mode)</li>
            <li><strong>standardize:</strong> Text preprocessing function - lowercase and remove punctuation by default (can be customized or disabled)</li>
          </ul>
          <p><em>💡 Tip: Always adapt the layer to your training data using .adapt(text_data) before training - this builds the vocabulary and must be done only once on your training set!</em></p>
        `,
        // More Normalization
        'UnitNormalization': `
          <h2>UnitNormalization Layer</h2>
          <p><strong>What it does:</strong> Normalizes input vectors to have unit norm (length of 1) along a specified axis.</p>
          <h3>How it works:</h3>
          <p>The layer divides each input vector by its L2 norm (Euclidean length), ensuring all output vectors have a magnitude of 1. This preserves the direction of vectors while standardizing their length.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Similarity learning:</strong> Essential for models that compute cosine similarity between embeddings, like face recognition or recommendation systems</li>
            <li><strong>Feature normalization:</strong> When you want to compare features based on their direction rather than magnitude</li>
            <li><strong>Embedding models:</strong> Commonly used as the final layer in embedding networks to create normalized representations</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>axis:</strong> Integer or list of integers specifying which axis to normalize along (default: -1 for last axis)</li>
            <li><strong>epsilon:</strong> Small value added to denominator to avoid division by zero (default: 1e-7)</li>
          </ul>
          <p><em>💡 Tip: Place UnitNormalization after your final embedding layer when building similarity-based models - it makes distance metrics like cosine similarity much more effective!</em></p>
        `,
        'GroupNormalization': `
          <h2>GroupNormalization Layer</h2>
          <p><strong>What it does:</strong> Normalizes the inputs by dividing channels into groups and computing mean and variance for normalization within each group.</p>
          <h3>How it works:</h3>
          <p>The layer splits channels into a specified number of groups and normalizes the features within each group independently. This provides a balance between BatchNorm (which normalizes across the batch) and LayerNorm (which normalizes across all channels).</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Small batch sizes:</strong> When training with small batches where BatchNorm performs poorly due to inaccurate batch statistics</li>
            <li><strong>Vision transformers:</strong> Commonly used in transformer-based vision models as an alternative to LayerNorm</li>
            <li><strong>Transfer learning:</strong> When fine-tuning models with different batch sizes than originally trained</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>groups:</strong> Number of groups to divide channels into (default: 32)</li>
            <li><strong>axis:</strong> Integer, the axis along which to normalize (typically -1 for channels-last)</li>
            <li><strong>epsilon:</strong> Small float added to variance to avoid division by zero (default: 1e-3)</li>
            <li><strong>center:</strong> If True, add learnable beta offset (default: True)</li>
          </ul>
          <p><em>💡 Tip: Start with groups=32 for most CNNs, but for models with fewer channels, ensure groups divides evenly into your channel count!</em></p>
        `,
        // Image Processing
        'Resizing': `
          <h2>Resizing Layer</h2>
          <p><strong>What it does:</strong> Resizes input images to a specified target height and width using various interpolation methods.</p>
          <h3>How it works:</h3>
          <p>The layer scales images up or down to match the target dimensions using interpolation algorithms like bilinear or nearest neighbor. It preserves the number of channels while changing only the spatial dimensions.</p>
          <h3>When to use:</h3>
          <ul>
            <li><strong>Standardizing input sizes:</strong> When your dataset contains images of different sizes but your model requires fixed dimensions</li>
            <li><strong>Data augmentation:</strong> To create multi-scale training by randomly resizing images during training</li>
            <li><strong>Model optimization:</strong> To reduce computational cost by downscaling high-resolution images before processing</li>
          </ul>
          <h3>Key parameters:</h3>
          <ul>
            <li><strong>height:</strong> Target height in pixels for the output image</li>
            <li><strong>width:</strong> Target width in pixels for the output image</li>
            <li><strong>interpolation:</strong> Resizing method ('bilinear', 'nearest', 'bicubic', 'lanczos3', or 'lanczos5')</li>
            <li><strong>crop_to_aspect_ratio:</strong> If True, crops the image to match the target aspect ratio before resizing</li>
          </ul>
          <p><em>💡 Tip: Use 'bilinear' interpolation for smooth results in most cases, but switch to 'nearest' when resizing masks or categorical labels to preserve exact values!</em></p>
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
