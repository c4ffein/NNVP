# Contains the list of keras core layers to be used by the code generating function below
# List based off https://keras.io/layers/about-keras-layers/


keras_core_layers_builder = \
  lambda keras_activations, keras_initializers, keras_regularizers, keras_constraints : {

  'Dense': {
    'params': {
        'units': {
          'type': 'int',
          'conditions': ['>0']
        },
        'activation': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_activations],
        },
        'use_bias': {
          'type': 'boolean',
          'default': True,
        },
        'kernel_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'bias_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers],
          'default': 'Zeros',
        },
        'kernel_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'bias_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'activity_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'kernel_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'bias_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        }
    },
    'input' : {
        'shape' : '2D_Tensor'
    },
    'output' : {
        'shape' : '2D_Tensor'
    }
  },

  'Activation': {
    'params' :{
        'activation': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_activations]
         }
    },
    'input' : {
        'shape' : 'Arbitrary'
    },
    'output' : {
        'shape' : 'Arbitrary'
    }
  },

  'Dropout': {
    'params' : {
        'rate': {
          'type': 'float',
          'conditions': ['>=0'] + ['<=1']
        },
        'noise_shape': {
          'type': 'list',
          'list': ['None']
          #:TODO:LUC:05/04/2018:To complete (1D int tensor)
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
  },

  'Flatten': {
    'params' : {
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        }
    },
    'input' : {
        'shape' : 'Arbitrary'
    },
    'output' : {
        'shape' : 'Arbitrary'
    }

  },

  'Reshape': {
    'params' : {
        'target_shape': {
          'type': 'tuple_int'
        }
    },
    'input' : {
        'shape' : 'Arbitrary'
    },
    'output' : {
        'shape' : 'Arbitrary'
    }
  },

  'Permute': {
    'params' :{
        'dims': {
          'type': 'tuple_int',
          'conditions': ['>=1']
        }
    },
    'input' : {
        'shape' : 'Arbitrary'
    },
    'output' : {
        'shape' : 'Arbitrary'
    }
  },

  'RepeatVector': {
    'params' :{
        'n': {
          'type': 'int'
        }
    },
    'input' : {
        'shape' : '2D_Tensor'
    },
    'output' : {
        'shape' : '3D_Tensor'
    }
  },

  'Lambda': {
    'params' : {
        'function': {
          'type': 'function'
        }
        #'output_shape': {}, #only relevant when using Theano
        #'arguments': {}, #optional, not yet implemented
    },
    'input' : {
        'shape' : 'Arbitrary'
    },
    'output' : {
        'shape' : 'Arbitrary'
    }
  },

  'ActivityRegularization': {
    'params':{
        'l1': {
          'type': 'float',
          'conditions': ['>=0']
        },
        'l2': {
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

  'Masking': {
    'params':{
        'mask_value': {
          'type': 'float',
          'conditions': ['>=0']
        }
    }
  }
}
