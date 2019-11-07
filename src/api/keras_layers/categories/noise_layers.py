keras_noise_layers_builder = \
  lambda keras_activations, keras_initializers, keras_regularizers, keras_constraints : {

  'gaussian_noise': {
    'params' : {
        'stddev': {
          'type': 'float'
        }
    },
    'input' : {
        'shape' : 'Arbitrary'
    },
    'output' : {
        'shape' : 'Arbitrary'
    }
  },
  'gaussian_dropout': {
    'params' : {
        'stddev': {
          'type': 'float'
        }
    },
    'input' : {
        'shape' : 'Arbitrary'
    },
    'output' : {
        'shape' : 'Arbitrary'
    }
  },
  'alpha_dropout': {
    'params' : {
        'stddev': {
          'type': 'float'
        },
        'shape': {
          'type': 'int'
        },
        'seed': {
          'type': 'int'
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
