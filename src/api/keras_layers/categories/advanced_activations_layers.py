keras_advanced_activations_layers_builder = \
  lambda keras_activations, keras_initializers, keras_regularizers, keras_constraints : {

  'leaky_relu': {
    'params' : {
        'alpha': {
          'type': 'float',
          'conditions': ['>=0']
        }
    },
    'input' : {
        'shape' : 'Arbitrary'
    },
    'output' : {
        'shape' : 'Arbitrary'
    }

  },

  'prelu': {
    'params' :{
        'alpha_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'alpha_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'alpha_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'shared_axes': {
          'type' : 'int'
          #:TODO:LUC:05/04/2018:To complete (int or tuple of ints)
        }
    },
    'input' : {
        'shape' : 'Arbitrary'
    },
    'output' : {
        'shape' : 'Arbitrary'
    }
  },

  'elu': {
    'params' : {
    'alpha': {
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

  'thresholded_relu': {
    'params' :{
        'theta': {
          'type': 'float',
          'conditions': ['>=0']
    }
    },
    'input' : {
        'shape' : 'Arbitrary'
    },
    'output' : {
        'shape' : 'Arbitrary'
    }
  },

  'softmax': {
    'params' :{
         'axis': {
          'type': 'int'
        }
    },
    'input' : {
        'shape' : 'Arbitrary'
    },
    'output' : {
        'shape' : 'Arbitrary'
    }
  },
  'ReLU' : {
    'params' : {
        'max_value' : {
            'type': 'int'
        },
        'negative_slope' : {
            'type': 'float'
        },
        'threshold' : {
            'type': 'float'
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
