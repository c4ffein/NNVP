/**
 * Help texts for the layer-catalog CATEGORIES (the layer-level texts live in
 * layerHelp.ts). Shape: { [exactCategoryName]: htmlString }, rendered via
 * v-html in the same modal as layer helps. Keys must match byte-for-byte the
 * `category` values used in generatedKerasLayers.json.
 */
const categoryHelp: Record<string, string> = {
  'Activation': `
          <h2>Activation Layers</h2>
          <p><strong>What this category groups:</strong> Standalone non-linearity layers - ReLU, LeakyReLU, ELU, PReLU, and Softmax - that transform values element-wise without any spatial or temporal structure.</p>
          <p><strong>When to reach for it:</strong> Most layers accept an <em>activation</em> parameter, so you only need these when you want the activation as its own node - for example to place BatchNormalization between a convolution and its ReLU, to use a configurable variant like PReLU, or to finish a classifier with an explicit Softmax.</p>
          <p><strong>Flagship layers:</strong> <strong>ReLU</strong> is the default workhorse for hidden layers, <strong>LeakyReLU</strong> keeps a small gradient for negative values to avoid dead neurons, and <strong>Softmax</strong> turns final scores into class probabilities.</p>
        `,
  'Attention': `
          <h2>Attention Layers</h2>
          <p><strong>What this category groups:</strong> Layers that let each position of a sequence look at, score, and pull information from other positions - the mechanism at the heart of Transformers.</p>
          <p><strong>When to reach for it:</strong> Use attention when relationships span long distances in the input - words far apart in a sentence, patches across an image, or alignments between two different sequences (encoder-decoder). It replaces or complements recurrence for most modern sequence models.</p>
          <p><strong>Flagship layers:</strong> <strong>MultiHeadAttention</strong> is the standard Transformer building block, <strong>GroupQueryAttention</strong> is its memory-efficient variant used by modern LLMs, and <strong>Attention</strong> provides simple dot-product attention for lighter models.</p>
        `,
  'Audio': `
          <h2>Audio Layers</h2>
          <p><strong>What this category groups:</strong> Feature-extraction layers that turn raw 1D audio waveforms into time-frequency representations (spectrograms) directly inside the model.</p>
          <p><strong>When to reach for it:</strong> Place one of these right after your audio input so the network consumes spectrogram "images" instead of raw samples - then process them with convolutional or recurrent layers. Keeping the transform in the model guarantees training and inference use identical audio preprocessing.</p>
          <p><strong>Flagship layers:</strong> <strong>MelSpectrogram</strong> produces the perceptually-scaled features standard in speech and sound classification, while <strong>STFTSpectrogram</strong> gives raw linear-frequency spectrograms with fine control over framing and windowing.</p>
        `,
  'Convolution': `
          <h2>Convolution Layers</h2>
          <p><strong>What this category groups:</strong> Layers that slide learnable filters across data to detect local patterns - in 1D sequences, 2D images, or 3D volumes - plus their transposed (upsampling), depthwise, and separable variants.</p>
          <p><strong>When to reach for it:</strong> Whenever nearby values are related: pixels in images, timesteps in signals, voxels in scans. Stacked convolutions build features hierarchically, from edges to textures to objects, and transposed convolutions go the other way to grow resolution in decoders and generators.</p>
          <p><strong>Flagship layers:</strong> <strong>Conv2D</strong> is the backbone of image models, <strong>Conv1D</strong> handles sequences and audio, and <strong>SeparableConv2D</strong> delivers similar power with far fewer parameters for efficient architectures.</p>
        `,
  'Core': `
          <h2>Core Layers</h2>
          <p><strong>What this category groups:</strong> The fundamental building blocks that appear in nearly every network - fully connected layers, embeddings, and utility layers like Lambda, Masking, and Identity.</p>
          <p><strong>When to reach for it:</strong> Constantly. Dense layers do the final reasoning in most architectures, embeddings turn discrete IDs into learnable vectors, and the utilities cover custom transformations and sequence masking when the specialized categories don't fit.</p>
          <p><strong>Flagship layers:</strong> <strong>Dense</strong> is the classic fully connected layer, <strong>Embedding</strong> maps tokens or categories to dense vectors for NLP and recommenders, and <strong>Lambda</strong> wraps arbitrary functions when no built-in layer does the job.</p>
        `,
  'Image Augmentation': `
          <h2>Image Augmentation Layers</h2>
          <p><strong>What this category groups:</strong> Random image transformations - flips, rotations, zooms, color jitter, blurs, erasing, and whole-policy recipes - that create new training variations on the fly and switch off automatically at inference.</p>
          <p><strong>When to reach for it:</strong> Whenever an image model overfits or the training set is small. Placing augmentation layers at the front of the model artificially multiplies your data and teaches invariance to viewpoint, lighting, and occlusion, usually at negligible cost.</p>
          <p><strong>Flagship layers:</strong> <strong>RandomFlip</strong> and <strong>RandomRotation</strong> are the classic geometric baseline, <strong>RandAugment</strong> applies a proven automated policy with just two knobs, and <strong>MixUp</strong>/<strong>CutMix</strong> blend whole samples and labels for strong regularization.</p>
        `,
  'Input / Output': `
          <h2>Input / Output Layers</h2>
          <p><strong>What this category groups:</strong> The entry and exit points of the graph - Input declares the shape and dtype of data entering the network, and Output marks which tensors the model returns.</p>
          <p><strong>When to reach for it:</strong> Every model starts with at least one Input and ends with at least one Output. Add several of each for multi-input architectures (e.g., image plus metadata) or multi-output ones (e.g., a classification head and a regression head trained together).</p>
          <p><strong>Flagship layers:</strong> <strong>Input</strong> defines each sample's shape (without the batch dimension), and <strong>Output</strong> tags the tensors that become the model's predictions.</p>
        `,
  'Merging': `
          <h2>Merging Layers</h2>
          <p><strong>What this category groups:</strong> Layers that combine several tensors into one - by concatenating them, or by element-wise addition, subtraction, multiplication, averaging, min/max, or dot products.</p>
          <p><strong>When to reach for it:</strong> Any time the graph branches and must come back together: residual (skip) connections, multi-input models fusing different data types, or parallel feature extractors whose outputs need joining before the next stage.</p>
          <p><strong>Flagship layers:</strong> <strong>Add</strong> powers ResNet-style skip connections, <strong>Concatenate</strong> stacks features from multiple branches side by side, and <strong>Multiply</strong> implements gating and attention-style modulation.</p>
        `,
  'Normalization': `
          <h2>Normalization Layers</h2>
          <p><strong>What this category groups:</strong> Layers that rescale activations to keep their statistics stable - across the batch, across features, across channel groups, or by vector norm - so deep networks train faster and more reliably.</p>
          <p><strong>When to reach for it:</strong> When training is slow, unstable, or sensitive to learning rate and initialization - which is nearly always once a network gets deep. The right variant depends on the architecture: batch statistics for CNNs, per-sample statistics for Transformers and RNNs, group statistics for small batches.</p>
          <p><strong>Flagship layers:</strong> <strong>BatchNormalization</strong> is the CNN staple, <strong>LayerNormalization</strong> is essential in Transformers, and <strong>RMSNormalization</strong> is its lighter descendant used by modern LLMs.</p>
        `,
  'Object Detection': `
          <h2>Object Detection Layers</h2>
          <p><strong>What this category groups:</strong> Utilities for handling bounding-box annotations in detection pipelines, where each image carries a variable number of labeled boxes.</p>
          <p><strong>When to reach for it:</strong> When preparing detection data for batched training - variable-length box lists must be brought to a fixed shape before images and annotations can be stacked into tensors.</p>
          <p><strong>Flagship layers:</strong> <strong>MaxNumBoundingBoxes</strong> pads or truncates every sample's box list to a fixed maximum so batches have static shapes.</p>
        `,
  'Pooling': `
          <h2>Pooling Layers</h2>
          <p><strong>What this category groups:</strong> Layers that downsample feature maps by summarizing local windows - taking the maximum or average - in 1D, 2D, or 3D, plus global variants that collapse all spatial positions into one value per channel.</p>
          <p><strong>When to reach for it:</strong> Between convolution blocks to shrink spatial dimensions, cut computation, and build translation tolerance; and at the end of a convolutional backbone, where global pooling turns feature maps into a compact vector ready for Dense classification heads.</p>
          <p><strong>Flagship layers:</strong> <strong>MaxPooling2D</strong> keeps the strongest activation per window, <strong>AveragePooling2D</strong> summarizes more smoothly, and <strong>GlobalAveragePooling2D</strong> replaces Flatten+Dense with a lighter, less overfit-prone head.</p>
        `,
  'Preprocessing': `
          <h2>Preprocessing Layers</h2>
          <p><strong>What this category groups:</strong> Layers that turn raw data - text, categories, numbers, images - into model-ready tensors: rescaling, resizing, vocabulary lookups, hashing, discretization, and text vectorization.</p>
          <p><strong>When to reach for it:</strong> To bake preprocessing into the model itself, so the exact same transformations run during training and in production with no skew. Layers with learned state (vocabularies, statistics) are fitted once with adapt() before training.</p>
          <p><strong>Flagship layers:</strong> <strong>Rescaling</strong> normalizes pixel ranges like [0, 255] to [0, 1], <strong>Normalization</strong> standardizes numeric features to zero mean and unit variance, and <strong>TextVectorization</strong> converts raw strings into token sequences.</p>
        `,
  'Recurrent': `
          <h2>Recurrent Layers</h2>
          <p><strong>What this category groups:</strong> Layers that process sequences step by step while carrying a hidden state - LSTM, GRU, SimpleRNN, their convolutional (ConvLSTM) and cell-level variants, plus wrappers like Bidirectional and TimeDistributed.</p>
          <p><strong>When to reach for it:</strong> When order matters and the past should inform the present: time series forecasting, speech, text, and sensor streams. Recurrent layers remain a strong choice for modest-length sequences and streaming settings where attention models are overkill.</p>
          <p><strong>Flagship layers:</strong> <strong>LSTM</strong> handles long-range dependencies with gated memory, <strong>GRU</strong> offers similar power with fewer parameters, and <strong>Bidirectional</strong> reads sequences both ways when the full input is available up front.</p>
        `,
  'Regularization': `
          <h2>Regularization Layers</h2>
          <p><strong>What this category groups:</strong> Layers that fight overfitting by injecting noise or penalties during training - Dropout and its spatial/Gaussian/alpha variants, plus activity penalties - all becoming pass-throughs at inference.</p>
          <p><strong>When to reach for it:</strong> When validation metrics lag far behind training metrics. Sprinkling dropout between dense layers (or spatial dropout after convolutions) is the quickest structural remedy, complementing data augmentation and weight decay.</p>
          <p><strong>Flagship layers:</strong> <strong>Dropout</strong> randomly silences units so the network learns redundant features, <strong>SpatialDropout2D</strong> drops whole feature maps for convolutional models, and <strong>GaussianNoise</strong> hardens models against noisy inputs.</p>
        `,
  'Reshaping': `
          <h2>Reshaping Layers</h2>
          <p><strong>What this category groups:</strong> Structural layers that change tensor shape without learning anything - flattening, reshaping, permuting, repeating, cropping, zero-padding, and upsampling in 1D/2D/3D.</p>
          <p><strong>When to reach for it:</strong> Whenever two parts of the network disagree about shape: flatten feature maps before a Dense head, pad or crop to align skip connections, upsample in decoder paths, or permute axes to match a layer's expected layout.</p>
          <p><strong>Flagship layers:</strong> <strong>Flatten</strong> is the classic CNN-to-Dense bridge, <strong>Reshape</strong> rearranges dimensions freely (with -1 auto-inference), and <strong>UpSampling2D</strong> grows resolution in autoencoders and segmentation decoders.</p>
        `,
};

export default categoryHelp;
