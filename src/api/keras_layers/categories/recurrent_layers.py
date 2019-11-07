keras_recurrent_layers_builder = \
  lambda keras_activations, keras_initializers, keras_regularizers, keras_constraints : {

  'rnn': {
    'params' :{
        'cell': {
          'type': 'rnn' #TODO a coder, cf. la doc: https://keras.io/layers/recurrent/#rnn
        },
        'return_sequences': {
          'type': 'boolean'
        },
        'return_state': {
          'type': 'boolean'
        },
        'go_backwards': {
          'type': 'boolean'
        },
        'stateful': {
          'type': 'boolean'
        },
        'unroll': {
          'type': 'boolean'
        },
        'input_dim': {
          'type': 'int'
        },
        'input_length': {
          'type': 'int'
        }
    },
     'input' : {
         'shape' : '3D_Tensor'
     },
     'output' : {
         'shape' : ['2D_Tensor', '3D_Tensor']
     }
  },

  'simple_rnn': {
    'params' : {
        'units': {
          'type': 'int',
          'conditions': ['>=0']
        },
        'activation': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_activations],
          'default': 'tanh',
         },
        'use_bias': {
          'type': 'boolean'
        },
        'kernel_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'reccurent_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'bias_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'kernel_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'reccurent_regularizer': {
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
        'reccurent_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'bias_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'dropout': {
          'type': 'float',
          'conditions': ['>=0'] + ['<=1']
        },
        'reccurent_dropout': {
          'type': 'float',
          'conditions': ['>=0'] + ['<=1']
        },
        'return_sequences': {
          'type': 'boolean'
        },
        'return_state': {
          'type': 'boolean'
        },
        'go_backwards': {
          'type': 'boolean' #default: false
        },
        'stateful': {
          'type': 'boolean' #default: false
        },
        'unroll': {
          'type': 'boolean' #default: false
        }
    },
     'input' : {
         'shape' : 'Arbitrary'
     },
     'output' : {
         'shape' : 'Arbitrary'
     }
  },

  'gru': {
    'params' : {
        'units': {
          'type': 'int',
          'conditions': ['>=0']
        },
        'activation': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_activations],
          'default': 'tanh',
        },
        'reccurent_activation': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_activations],
          'default': 'hard_sigmoid',
        },
        'use_bias': {
          'type': 'boolean'
        },
        'kernel_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'reccurent_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'bias_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'kernel_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'reccurent_regularizer': {
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
        'reccurent_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'bias_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'dropout': {
          'type': 'float',
          'conditions': ['>=0'] + ['<=1']
        },
        'reccurent_dropout': {
          'type': 'float',
          'conditions': ['>=0'] + ['<=1']
        },
        'implementation': {
          'type': 'int',
          'conditions': ['>=1'] + ['<=2']
        },
        'return_sequences': {
          'type': 'boolean'
        },
        'return_state': {
          'type': 'boolean'
        },
        'go_backwards': {
          'type': 'boolean' #default: false
        },
        'stateful': {
          'type': 'boolean' #default: false
        },
        'unroll': {
          'type': 'boolean' #default: false
        },
        'reset_after': {
          'type': 'boolean'
        }
    },
     'input' : {
         'shape' : 'Arbitrary'
     },
     'output' : {
         'shape' : 'Arbitrary'
     }
  },

  'lstm': {
    'params' : {
        'units': {
          'type': 'int',
          'conditions': ['>=0']
        },
        'activation': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_activations],
          'default': 'tanh',
        },
        'reccurent_activation': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_activations]
        },
        'use_bias': {
          'type': 'boolean'
        },
        'kernel_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'reccurent_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'bias_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'unit_forget_bias': {
          'type': 'boolean'
        },
        'kernel_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'reccurent_regularizer': {
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
        'reccurent_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'bias_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'dropout': {
          'type': 'float',
          'conditions': ['>=0', '<=1']
        },
        'reccurent_dropout': {
          'type': 'float',
          'conditions': ['>=0', '<=1']
        },
        'implementation': {
          'type': 'int',
          'conditions': ['>=1', '<=2']
        },
        'return_sequences': {
          'type': 'boolean'
        },
        'return_state': {
          'type': 'boolean'
        },
        'go_backwards': {
          'type': 'boolean' #default: false
        },
        'stateful': {
          'type': 'boolean' #default: false
        },
        'unroll': {
          'type': 'boolean' #default: false
        }
    },
     'input' : {
         'shape' : 'Arbitrary'
     },
     'output' : {
         'shape' : 'Arbitrary'
     }
  },

  'conv_lstm_2d': {
    'params' : {
        'filters': {
          'type': 'int'
        },
        'kernel_size': {
          'type': 'tuple_int'
        },
        'strides': {
          'type': 'tuple_int'
        },
        'padding': {
          'type': 'list',
          'list': ['valid'] + ['same']
        },
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        },
        'dilation_rate': {
          'type': 'tuple_int'
        },
        'activation': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_activations]
         },
        'reccurent_activation': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_activations]
         },
        'use_bias': {
          'type': 'boolean'
        },
        'kernel_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'reccurent_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'bias_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'unit_forget_bias': {
          'type': 'boolean'
        },
        'kernel_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'reccurent_regularizer': {
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
        'reccurent_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'bias_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'return_sequences': {
          'type': 'boolean'
        },
        'go_backwards': {
          'type': 'boolean' #default: false
        },
        'stateful': {
          'type': 'boolean' #default: false
        },
        'dropout': {
          'type': 'float',
          'conditions': ['>=0'] + ['<=1']
        },
        'reccurent_dropout': {
          'type': 'float',
          'conditions': ['>=0'] + ['<=1']
        }
    },
     'input' : {
         'shape' : '5D_Tensor'
     },
     'output' : {
         'shape' : ['5D_Tensor', '4D_Tensor']
     }
  },

  'simple_rnn_cell': {
    'params' : {
        'units': {
          'type': 'int',
          'conditions': ['>0']
        },
        'activation': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_activations],
          'default': 'tanh',
         },
        'use_bias': {
          'type': 'boolean'
        },
        'kernel_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'reccurent_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'bias_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'kernel_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'reccurent_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'bias_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'kernel_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'reccurent_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'bias_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'dropout': {
          'type': 'float',
          'conditions': ['>=0'] + ['<=1']
        },
        'reccurent_dropout': {
          'type': 'float',
          'conditions': ['>=0'] + ['<=1']
        }
    },
     'input' : {
         'shape' : 'Arbitrary'
     },
     'output' : {
         'shape' : 'Arbitrary'
     }
  },

  'gru_cell': {
    'params' : {
        'units': {
          'type': 'int',
          'conditions': ['>0']
        },
        'activation': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_activations],
          'default': 'tanh',
         },
        'reccurent_activation': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_activations]
          #Default: hard sigmoid (hard_sigmoid). If you pass None, no activation is applied
         },
        'use_bias': {
          'type': 'boolean'
        },
        'kernel_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'reccurent_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'bias_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'kernel_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'reccurent_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'bias_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'kernel_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'reccurent_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'bias_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'dropout': {
          'type': 'float',
          'conditions': ['>=0', '<=1']
        },
        'reccurent_dropout': {
          'type': 'float',
          'conditions': ['>=0', '<=1']
        },
        'implementation': {
          'type': 'int',
          'conditions': ['>=1', '<=2']
        },
        'reset_after': {
          'type': 'boolean'
        }
    },
     'input' : {
         'shape' : 'Arbitrary'
     },
     'output' : {
         'shape' : 'Arbitrary'
     }
  },

  'lstm_cell': {
  'params' : {
    'units': {
      'type': 'int',
      'conditions': ['>0']
    },
    'activation': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_activations]
          #Default: hyperbolic tangent (tanh). If you pass None, no activation is applied
         },
        'reccurent_activation': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_activations]
          #Default: hard sigmoid (hard_sigmoid). If you pass None, no activation is applied
         },
        'use_bias': {
          'type': 'boolean'
        },
        'kernel_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'reccurent_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'bias_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'unit_forget_bias': {
          'type': 'boolean'
        },
        'kernel_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'reccurent_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'bias_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'kernel_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'reccurent_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'bias_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'dropout': {
          'type': 'float',
          'conditions': ['>=0'] + ['<=1']
        },
        'reccurent_dropout': {
          'type': 'float',
          'conditions': ['>=0'] + ['<=1']
        },
        'implementation': {
          'type': 'int',
          'conditions': ['>=1'] + ['<=2']
        }
    },
     'input' : {
         'shape' : 'Arbitrary'
     },
     'output' : {
         'shape' : 'Arbitrary'
     }
  },

  'cudnn_gru': {
    'params' : {
        'units': {
          'type': 'int',
          'conditions': ['>0']
        },
        'kernel_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'reccurent_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'bias_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'kernel_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'reccurent_regularizer': {
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
        'reccurent_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'bias_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'return_sequences': {
          'type': 'boolean'
        },
        'return_state': {
          'type': 'boolean'
        },
        'stateful': {
          'type': 'boolean'
          #Default: false
        }
    },
    'input' : {
        'shape' : 'Arbitrary'
    },
    'output' : {
        'shape' : 'Arbitrary'
    }
  },

  'cudnn_lstm': {
    'params' : {
        'units': {
          'type': 'int',
          'conditions': ['>0']
        },
        'kernel_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'unit_forget_bias': {
          'type': 'boolean'
        },
        'reccurent_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'bias_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'kernel_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'reccurent_regularizer': {
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
        'reccurent_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'bias_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'return_sequences': {
          'type': 'boolean'
        },
        'return_state': {
          'type': 'boolean'
        },
        'stateful': {
          'type': 'boolean'
          #Default: false
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
