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
