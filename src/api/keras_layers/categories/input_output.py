# Contains input and output layers.
# Input is a Core Layer moved in this category, can be used to to instantiate a Keras tensor.
# Output isn't a real Keras Layer, it enables the user to define the outputs of a network.


keras_input_output_layers_builder = \
  lambda keras_activations, keras_initializers, keras_regularizers, keras_constraints : {

    'Input': {
        "params" : {
            'shape': {
              'type': 'tuple_int'
            },
            'batch_shape': {
              'type': 'tuple_int'
            },
            'name': {
              'type': 'string'
            },
            'dtype': {
              'type': 'string'
            },
            'sparse': {
              'type': 'boolean'
            }
        },
        'input' : {},
        'output' : {}
      },
    'Output': {'params' : {}, 'input' : {}, 'output' : {}}
}
