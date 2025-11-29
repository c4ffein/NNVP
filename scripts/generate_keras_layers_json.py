#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "keras>=3.0.0",
# ]
# ///
"""
Generate generatedKerasLayers.json by introspecting Keras 3.

This script uses Python's inspect module to extract layer information
directly from Keras, including parameters, types, and default values.

Keras 3 is a multi-backend deep learning framework that works with
TensorFlow, PyTorch, or JAX.

Usage:
    uv run scripts/generate_keras_layers_json.py > nnvp-client-vue/src/lib/KerasInterface/generatedKerasLayers.json
"""

import inspect
import json

import keras
from keras import layers


# =============================================================================
# Layer categories mapping - Based on Keras 3 official API structure
# https://keras.io/api/layers/
# =============================================================================

LAYER_CATEGORIES = {
    # -------------------------------------------------------------------------
    # Core layers - https://keras.io/api/layers/core_layers/
    # -------------------------------------------------------------------------
    'Input': 'Core',
    'InputLayer': 'Core',
    'Dense': 'Core',
    'EinsumDense': 'Core',
    'Activation': 'Core',
    'Embedding': 'Core',
    'ReversibleEmbedding': 'Core',
    'Masking': 'Core',
    'Lambda': 'Core',
    'Identity': 'Core',

    # -------------------------------------------------------------------------
    # Convolution layers - https://keras.io/api/layers/convolution_layers/
    # -------------------------------------------------------------------------
    'Conv1D': 'Convolution',
    'Conv2D': 'Convolution',
    'Conv3D': 'Convolution',
    'Conv1DTranspose': 'Convolution',
    'Conv2DTranspose': 'Convolution',
    'Conv3DTranspose': 'Convolution',
    'SeparableConv1D': 'Convolution',
    'SeparableConv2D': 'Convolution',
    'DepthwiseConv1D': 'Convolution',
    'DepthwiseConv2D': 'Convolution',

    # -------------------------------------------------------------------------
    # Pooling layers - https://keras.io/api/layers/pooling_layers/
    # -------------------------------------------------------------------------
    'MaxPooling1D': 'Pooling',
    'MaxPooling2D': 'Pooling',
    'MaxPooling3D': 'Pooling',
    'AveragePooling1D': 'Pooling',
    'AveragePooling2D': 'Pooling',
    'AveragePooling3D': 'Pooling',
    'GlobalMaxPooling1D': 'Pooling',
    'GlobalMaxPooling2D': 'Pooling',
    'GlobalMaxPooling3D': 'Pooling',
    'GlobalAveragePooling1D': 'Pooling',
    'GlobalAveragePooling2D': 'Pooling',
    'GlobalAveragePooling3D': 'Pooling',

    # -------------------------------------------------------------------------
    # Recurrent layers - https://keras.io/api/layers/recurrent_layers/
    # -------------------------------------------------------------------------
    'LSTM': 'Recurrent',
    'LSTMCell': 'Recurrent',
    'GRU': 'Recurrent',
    'GRUCell': 'Recurrent',
    'SimpleRNN': 'Recurrent',
    'SimpleRNNCell': 'Recurrent',
    'RNN': 'Recurrent',
    'StackedRNNCells': 'Recurrent',
    'TimeDistributed': 'Recurrent',
    'Bidirectional': 'Recurrent',
    'ConvLSTM1D': 'Recurrent',
    'ConvLSTM2D': 'Recurrent',
    'ConvLSTM3D': 'Recurrent',

    # -------------------------------------------------------------------------
    # Preprocessing layers - https://keras.io/api/layers/preprocessing_layers/
    # Text preprocessing
    # -------------------------------------------------------------------------
    'TextVectorization': 'Preprocessing',

    # Numerical preprocessing
    'Normalization': 'Preprocessing',
    'Discretization': 'Preprocessing',

    # Categorical preprocessing
    'CategoryEncoding': 'Preprocessing',
    'Hashing': 'Preprocessing',
    'HashedCrossing': 'Preprocessing',
    'IntegerLookup': 'Preprocessing',
    'StringLookup': 'Preprocessing',

    # Image preprocessing
    'Resizing': 'Preprocessing',
    'Rescaling': 'Preprocessing',
    'CenterCrop': 'Preprocessing',
    'Pipeline': 'Preprocessing',

    # -------------------------------------------------------------------------
    # Image augmentation layers - https://keras.io/api/layers/preprocessing_layers/image_augmentation/
    # -------------------------------------------------------------------------
    'RandomCrop': 'Image Augmentation',
    'RandomFlip': 'Image Augmentation',
    'RandomRotation': 'Image Augmentation',
    'RandomZoom': 'Image Augmentation',
    'RandomTranslation': 'Image Augmentation',
    'RandomContrast': 'Image Augmentation',
    'RandomBrightness': 'Image Augmentation',
    'RandomHeight': 'Image Augmentation',
    'RandomWidth': 'Image Augmentation',
    'RandomHue': 'Image Augmentation',
    'RandomSaturation': 'Image Augmentation',
    'RandomSharpness': 'Image Augmentation',
    'RandomShear': 'Image Augmentation',
    'RandomGrayscale': 'Image Augmentation',
    'RandomInvert': 'Image Augmentation',
    'RandomPerspective': 'Image Augmentation',
    'RandomPosterization': 'Image Augmentation',
    'RandomColorJitter': 'Image Augmentation',
    'RandomColorDegeneration': 'Image Augmentation',
    'RandomGaussianBlur': 'Image Augmentation',
    'RandomElasticTransform': 'Image Augmentation',
    'RandomErasing': 'Image Augmentation',
    'AugMix': 'Image Augmentation',
    'RandAugment': 'Image Augmentation',
    'CutMix': 'Image Augmentation',
    'MixUp': 'Image Augmentation',
    'AutoContrast': 'Image Augmentation',
    'Equalization': 'Image Augmentation',
    'Solarization': 'Image Augmentation',

    # -------------------------------------------------------------------------
    # Normalization layers - https://keras.io/api/layers/normalization_layers/
    # -------------------------------------------------------------------------
    'BatchNormalization': 'Normalization',
    'LayerNormalization': 'Normalization',
    'GroupNormalization': 'Normalization',
    'UnitNormalization': 'Normalization',
    'SpectralNormalization': 'Normalization',
    'RMSNormalization': 'Normalization',

    # -------------------------------------------------------------------------
    # Regularization layers - https://keras.io/api/layers/regularization_layers/
    # -------------------------------------------------------------------------
    'Dropout': 'Regularization',
    'SpatialDropout1D': 'Regularization',
    'SpatialDropout2D': 'Regularization',
    'SpatialDropout3D': 'Regularization',
    'GaussianDropout': 'Regularization',
    'GaussianNoise': 'Regularization',
    'AlphaDropout': 'Regularization',
    'ActivityRegularization': 'Regularization',

    # -------------------------------------------------------------------------
    # Attention layers - https://keras.io/api/layers/attention_layers/
    # -------------------------------------------------------------------------
    'Attention': 'Attention',
    'AdditiveAttention': 'Attention',
    'MultiHeadAttention': 'Attention',
    'GroupQueryAttention': 'Attention',

    # -------------------------------------------------------------------------
    # Reshaping layers - https://keras.io/api/layers/reshaping_layers/
    # -------------------------------------------------------------------------
    'Reshape': 'Reshaping',
    'Flatten': 'Reshaping',
    'Permute': 'Reshaping',
    'RepeatVector': 'Reshaping',
    'Cropping1D': 'Reshaping',
    'Cropping2D': 'Reshaping',
    'Cropping3D': 'Reshaping',
    'UpSampling1D': 'Reshaping',
    'UpSampling2D': 'Reshaping',
    'UpSampling3D': 'Reshaping',
    'ZeroPadding1D': 'Reshaping',
    'ZeroPadding2D': 'Reshaping',
    'ZeroPadding3D': 'Reshaping',

    # -------------------------------------------------------------------------
    # Merging layers - https://keras.io/api/layers/merging_layers/
    # -------------------------------------------------------------------------
    'Add': 'Merging',
    'Subtract': 'Merging',
    'Multiply': 'Merging',
    'Average': 'Merging',
    'Maximum': 'Merging',
    'Minimum': 'Merging',
    'Concatenate': 'Merging',
    'Dot': 'Merging',

    # -------------------------------------------------------------------------
    # Activation layers - https://keras.io/api/layers/activation_layers/
    # -------------------------------------------------------------------------
    'ReLU': 'Activation',
    'LeakyReLU': 'Activation',
    'PReLU': 'Activation',
    'ELU': 'Activation',
    'ThresholdedReLU': 'Activation',
    'Softmax': 'Activation',

    # -------------------------------------------------------------------------
    # Audio preprocessing layers
    # -------------------------------------------------------------------------
    'MelSpectrogram': 'Audio',
    'STFTSpectrogram': 'Audio',

    # -------------------------------------------------------------------------
    # Object detection layers
    # -------------------------------------------------------------------------
    'MaxNumBoundingBoxes': 'Object Detection',

    # -------------------------------------------------------------------------
    # Locally connected layers (deprecated in Keras 3, but may still exist)
    # -------------------------------------------------------------------------
    'LocallyConnected1D': 'Locally Connected',
    'LocallyConnected2D': 'Locally Connected',

    # -------------------------------------------------------------------------
    # Backend-specific layers (skip these in output)
    # -------------------------------------------------------------------------
    'FlaxLayer': '_Backend',
    'JaxLayer': '_Backend',
    'TorchModuleWrapper': '_Backend',
}


# Known parameter names that are integers (common Keras parameters without annotations)
KNOWN_INT_PARAMS = {
    'units', 'filters', 'kernel_size', 'pool_size', 'strides', 'size',
    'target_shape', 'dims', 'n', 'num_heads', 'key_dim', 'value_dim',
    'output_dim', 'input_dim', 'depth', 'num_groups', 'groups',
    'height_factor', 'width_factor', 'cropping', 'padding',
    'upsampling', 'dilation_rate', 'seed', 'output_padding',
}

# Known parameter names that are floats
KNOWN_FLOAT_PARAMS = {
    'rate', 'momentum', 'epsilon', 'alpha', 'theta', 'stddev',
    'dropout', 'recurrent_dropout', 'l1', 'l2', 'factor', 'scale',
    'negative_slope', 'max_value', 'threshold',
}

# Known parameter names that are tuples
KNOWN_TUPLE_PARAMS = {
    'kernel_size', 'pool_size', 'strides', 'dilation_rate', 'target_shape',
    'shape', 'batch_shape', 'cropping', 'padding', 'size', 'output_padding',
}


def get_param_type(param, annotation):
    """Determine the parameter type from annotation or default value."""
    param_name = param.name

    # First check annotation
    if annotation != inspect.Parameter.empty:
        type_str = str(annotation)
        if 'int' in type_str.lower():
            return 'int'
        elif 'float' in type_str.lower():
            return 'float'
        elif 'bool' in type_str.lower():
            return 'boolean'
        elif 'str' in type_str.lower():
            return 'string'
        elif 'tuple' in type_str.lower():
            return 'tuple_int'

    # Infer from default value
    if param.default != inspect.Parameter.empty:
        default = param.default
        if isinstance(default, bool):
            return 'boolean'
        elif isinstance(default, int):
            return 'int'
        elif isinstance(default, float):
            return 'float'
        elif isinstance(default, str):
            return 'string'
        elif isinstance(default, tuple):
            return 'tuple_int'

    # Fall back to known parameter name patterns
    if param_name in KNOWN_TUPLE_PARAMS:
        return 'tuple_int'
    if param_name in KNOWN_INT_PARAMS:
        return 'int'
    if param_name in KNOWN_FLOAT_PARAMS:
        return 'float'

    return 'string'  # Default fallback


def extract_layer_info(layer_class):
    """Extract parameter information from a Keras layer class."""
    try:
        sig = inspect.signature(layer_class.__init__)
    except (ValueError, TypeError):
        return {}

    params = {}
    for name, param in sig.parameters.items():
        if name in ('self', 'kwargs', 'args'):
            continue

        param_info = {
            'type': get_param_type(param, param.annotation)
        }

        if param.default != inspect.Parameter.empty:
            default = param.default
            # Convert non-JSON-serializable defaults
            if default is None:
                param_info['default'] = 'None'
            elif isinstance(default, (bool, int, float, str)):
                param_info['default'] = default
            elif isinstance(default, tuple):
                param_info['default'] = list(default)
            else:
                param_info['default'] = str(default)

        params[name] = param_info

    return params


# Preferred canonical names (when multiple names point to same class, use these)
PREFERRED_NAMES = [
    # Convolution: prefer Conv* over Convolution*
    'Conv1D', 'Conv2D', 'Conv3D',
    'Conv1DTranspose', 'Conv2DTranspose', 'Conv3DTranspose',
    'SeparableConv1D', 'SeparableConv2D',
    # Pooling: prefer *Pooling* over *Pool*
    'MaxPooling1D', 'MaxPooling2D', 'MaxPooling3D',
    'AveragePooling1D', 'AveragePooling2D', 'AveragePooling3D',
    'GlobalMaxPooling1D', 'GlobalMaxPooling2D', 'GlobalMaxPooling3D',
    'GlobalAveragePooling1D', 'GlobalAveragePooling2D', 'GlobalAveragePooling3D',
]


def get_all_layers():
    """Get all available Keras layer classes, detecting and tracking aliases."""
    all_layers = {}
    seen_classes = {}  # Maps class id -> canonical name
    aliases = {}  # Maps canonical name -> list of aliases

    # First pass: register preferred names
    for name in PREFERRED_NAMES:
        if hasattr(layers, name):
            obj = getattr(layers, name)
            if inspect.isclass(obj) and issubclass(obj, keras.layers.Layer):
                seen_classes[id(obj)] = name
                all_layers[name] = obj
                aliases[name] = []

    # Second pass: add remaining layers (track aliases for already-seen classes)
    for name in sorted(dir(layers)):
        obj = getattr(layers, name)
        if (inspect.isclass(obj) and
            issubclass(obj, keras.layers.Layer) and
            not name.startswith('_')):

            class_id = id(obj)
            if class_id in seen_classes:
                # This is an alias for an existing layer
                canonical = seen_classes[class_id]
                if name != canonical:
                    aliases[canonical].append(name)
            else:
                # New layer
                seen_classes[class_id] = name
                all_layers[name] = obj
                aliases[name] = []

    return all_layers, aliases


def generate_layers_json():
    """Generate the complete layers JSON structure."""
    all_layers, aliases = get_all_layers()

    # Build reverse lookup: alias -> canonical name
    alias_to_canonical = {}
    for canonical, alias_list in aliases.items():
        for alias in alias_list:
            alias_to_canonical[alias] = canonical

    layers_dict = {}

    for layer_name, layer_class in sorted(all_layers.items()):
        # Skip internal/base classes
        if layer_name in ('Layer', 'InputLayer', 'TFSMLayer', 'Wrapper'):
            continue

        category = LAYER_CATEGORIES.get(layer_name, 'Other')

        # Skip backend-specific layers (category starts with '_')
        if category.startswith('_'):
            continue
        params = extract_layer_info(layer_class)

        layer_info = {
            'category': category,
            'preferredName': layer_name,  # Per-layer preferred name (editable)
            'parameters': params,
            'input': {
                'shape': 'Arbitrary'  # Could be enhanced with docstring parsing
            },
            'output': {
                'shape': ['Arbitrary']
            }
        }

        # Add aliases if any exist
        if aliases.get(layer_name):
            layer_info['aliases'] = aliases[layer_name]

        layers_dict[layer_name] = layer_info

    # Add special NNVP-specific Input/Output layers
    # These are not standard Keras layers but are used by the visual editor
    layers_dict['Input'] = {
        'category': 'Input / Output',
        'preferredName': 'Input',
        'parameters': {
            'shape': {'type': 'tuple_int'},
            'batch_shape': {'type': 'tuple_int'},
            'name': {'type': 'string'},
            'dtype': {'type': 'string'},
            'sparse': {'type': 'boolean'}
        },
        'input': {'shape': 'Arbitrary'},
        'output': {'shape': ['Arbitrary']}
    }
    layers_dict['Output'] = {
        'category': 'Input / Output',
        'preferredName': 'Output',
        'parameters': {},
        'input': {'shape': 'Arbitrary'},
        'output': {'shape': ['Arbitrary']}
    }

    # Final structure with both layers and the alias lookup
    result = {
        'aliasToCanonical': alias_to_canonical,
        'layers': layers_dict
    }

    return result, aliases


def main():
    import sys

    data, aliases = generate_layers_json()
    print(json.dumps(data, indent=4, sort_keys=False))

    # Print summary to stderr
    layers_dict = data['layers']
    alias_map = data['aliasToCanonical']

    print(f"\n# Generated {len(layers_dict)} layers", file=sys.stderr)
    print(f"# Generated {len(alias_map)} alias mappings", file=sys.stderr)

    # Count by category
    categories = {}
    for layer in layers_dict.values():
        cat = layer['category']
        categories[cat] = categories.get(cat, 0) + 1

    print("# By category:", file=sys.stderr)
    for cat, count in sorted(categories.items()):
        print(f"#   {cat}: {count}", file=sys.stderr)

    # Print aliases
    aliases_with_values = {k: v for k, v in aliases.items() if v}
    if aliases_with_values:
        print(f"\n# Detected {len(aliases_with_values)} layers with aliases:", file=sys.stderr)
        for canonical, alias_list in sorted(aliases_with_values.items()):
            print(f"#   {canonical} <- {', '.join(alias_list)}", file=sys.stderr)


if __name__ == '__main__':
    main()
