keras_normalization_layers_builder = \
  lambda keras_activations, keras_initializers, keras_regularizers, keras_constraints : {

  'batch_normalization': {
    'params' : {
        'axis': {
          'type': 'int'
        },
        'momentum': {
          'type': 'float'
        },
        'epsilon': {
          'type': 'float'
        },
        'center': {
          'type': 'boolean'
        },
        'scale': {
          'type': 'boolean'
        },
        'beta_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'gamma_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'moving_mean_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'moving_variance_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'beta_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'gamma_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'beta_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'gamma_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        }
    },
    'input' : {
        'shape' : 'Arbitrary'
    },
    'output' : {
        'shape' : 'Arbitrary'
    }
  }
}
