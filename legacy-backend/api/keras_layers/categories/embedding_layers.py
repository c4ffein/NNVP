keras_embedding_layers_builder = \
  lambda keras_activations, keras_initializers, keras_regularizers, keras_constraints : {

  'embedding': {
    'params' : {
        'input_dim': {
          'type': 'int',
          'conditions': ['>0']
        },
        'output_dim': {
          'type': 'int',
          'conditions': ['>=0']
        },
        'embeddings_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'embeddings_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'embeddings_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'mask_zero': {
          'type': 'boolean'
        },
        'input_length': {
          'type': 'int'
        }
    },
    'input' : {
        'shape' : '2D_Tensor'
    },
    'output' : {
        'shape' : '3D_Tensor'
    }
  }
}
