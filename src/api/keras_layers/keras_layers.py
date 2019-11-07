# keras_layers.py
# This file contains a dictionnary of hardcoded layers
# that will be used to generate Javascript code

# WARNING : Use Python > 3.7, otherwise dict could be unordered


from categories.input_output import keras_input_output_layers_builder
from categories.core_layers import keras_core_layers_builder
from categories.convolutional_layers import keras_convolutional_layers_builder
from categories.pooling_layers import keras_pooling_layers_builder
from categories.locally_connected_layers import keras_locally_connected_layers_builder
from categories.recurrent_layers import keras_recurrent_layers_builder
from categories.embedding_layers import keras_embedding_layers_builder
from categories.merge_layers import keras_merge_layers_builder
from categories.advanced_activations_layers import keras_advanced_activations_layers_builder
from categories.normalization_layers import keras_normalization_layers_builder
from categories.noise_layers import keras_noise_layers_builder


# Built-in activation functions - see keras/activations.py
# some of them can take additional options
keras_activations = {
  'softmax': {},
  'elu': {},
  'selu': {},
  'softplus': {},
  'softsign': {},
  'relu': {},
  'tanh': {},
  'sigmoid': {},
  'hard_sigmoid': {},
  'linear': {}
}

# Built-in initializers - see keras/initializers.py
# some of them can take additional options
keras_initializers = {
  'Initializer': {},
  'Zeros': {},
  'Ones': {},
  'Constant': {},
  'RandomNormal': {},
  'RandomUniform': {},
  'TruncatedNormal': {},
  'VarianceScaling': {},
  'Orthogonal': {},
  'Identity': {},
  'lecun_uniform': {},
  'glorot_normal': {},
  'glorot_uniform': {},
  'he_normal': {},
  'lecun_normal': {},
  'he_uniform': {}
}

# Available penalties - see keras/regularizers.py
# some of them can take additional options
keras_regularizers = {
  'l1': {},
  'l2': {},
  'l1_l2': {}
}

# Built-in constraints - see keras/constraints.py
# some of them can take additional options
keras_constraints = {
  'max_norm': {},
  'non_neg': {},
  'unit_norm': {},
  'min_max_norm': {}
}


def builder_caller(builder):
    return builder(keras_activations, keras_initializers, keras_regularizers, keras_constraints)


# List of the layer categories
keras_layers_categories = {
  "Input / Output" : builder_caller(keras_input_output_layers_builder),
  "Core" : builder_caller(keras_core_layers_builder),
  "Convolutional" : builder_caller(keras_convolutional_layers_builder),
  "Pooling" : builder_caller(keras_pooling_layers_builder),
  "Locally Connected" : builder_caller(keras_locally_connected_layers_builder),
  "Recurrent" : builder_caller(keras_recurrent_layers_builder),
  "Embedding" : builder_caller(keras_embedding_layers_builder),
  "Merge" : builder_caller(keras_merge_layers_builder),
  "Advanced Activation" : builder_caller(keras_advanced_activations_layers_builder),
  "Normalization" : builder_caller(keras_normalization_layers_builder),
  "Noise" : builder_caller(keras_noise_layers_builder),
}

all_keras_layers = {}
for category_name in keras_layers_categories:
  for layer in keras_layers_categories[category_name]:
    all_keras_layers[layer] = {}
    all_keras_layers[layer]['category'] = category_name
    content = keras_layers_categories[category_name][layer]
    if 'params' in content:
        all_keras_layers[layer]['parameters'] = content['params']
    else:
        all_keras_layers[layer]['parameters'] = {}
    if 'input' in content :
        all_keras_layers[layer]['input'] = content['input']
    else:
        all_keras_layers[layer]['input'] = {}
    if 'output' in content :
        all_keras_layers[layer]['output'] = content['output']
    else:
        all_keras_layers[layer]['parameters'] = {}

if __name__ == '__main__':
  import json
  print(json.dumps(all_keras_layers, indent=4))
