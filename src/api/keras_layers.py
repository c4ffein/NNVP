# keras_layers.py
# This file contains a dictionnary of hardcoded layers
# that will be used to generate Javascript code

# WARNING : Use Python > 3.7, otherwise dict could be unordered

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

# Contains input and output layers.
# Input is a Core Layer moved in this category, can be used to to instantiate a Keras tensor.
# Output isn't a real Keras Layer, it enables the user to define the outputs of a network.
keras_input_output_layers = {
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

# Contains the list of keras core layers to be used by the code generating function below
# List based off https://keras.io/layers/about-keras-layers/
keras_core_layers = {
  'Dense': {
    'params': {
        'units': {
          'type': 'int',
          'conditions': ['>0']
        },
        'activation': {
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
        'bias_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
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

keras_convolutional_layers = {
  'Conv1D': {
    'params':{
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
          'list': ['valid', 'causal', 'same']
        },
        'dilation_rate': {
          'type': 'tuple_int'
        },
        'activation': {
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
        'bias_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
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
        'shape' : '3D_Tensor'
    },
    'output' : {
        'shape' : '3D_Tensor'
    }
  },

  'Conv2D': {
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
          'list': ['valid', 'same']
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
        'use_bias': {
          'type': 'boolean'
        },
        'kernel_initializer': {
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
        'shape' : '4D_Tensor'
    },
    'output' : {
        'shape' : '4D_Tensor'
    }
  },

  'SeparableConv1D': {
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
          'list': ['valid', 'same']
        },
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        },
        'depth_multiplier': {
          'type': 'int'
        },
        'activation': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_activations]
        },
        'use_bias': {
          'type': 'boolean'
        },
        'depthwise_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'pointwise_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'bias_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'depthwise_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'pointwise_regularizer': {
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
        'depthwise_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'pointwise_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'bias_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        }
    },
    'input' : {
        'shape' : '3D_Tensor'
    },
    'output' : {
        'shape' : '3D_Tensor'
    }
  },

  'SeparableConv2D': {
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
          'list': ['valid', 'same']
        },
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        },
        'depth_multiplier': {
          'type': 'int'
        },
        'activation': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_activations]
        },
        'use_bias': {
          'type': 'boolean'
        },
        'depthwise_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'pointwise_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'bias_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
        },
        'depthwise_regularizer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_regularizers]
        },
        'pointwise_regularizer': {
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
        'depthwise_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'pointwise_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        },
        'bias_constraint': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_constraints]
        }
    },
    'input' : {
        'shape' : '4D_Tensor'
    },
    'output' : {
        'shape' : '4D_Tensor'
    }
  },

  'Conv2DTranspose': {
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
          'list': ['valid', 'same']
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
        'use_bias': {
          'type': 'boolean'
        },
        'kernel_initializer': {
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
        'shape' : '4D_Tensor'
    },
    'output' : {
        'shape' : '4D_Tensor'
    }
  },

  'Conv3D': {
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
          'list': ['valid', 'same']
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
        'use_bias': {
          'type': 'boolean'
        },
        'kernel_initializer': {
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
        'shape' : '5D_Tensor'
    },
    'output' : {
        'shape' : '5D_Tensor'
    }
  },

  'Cropping1D': {
    'params' : {
        'cropping': {
          'type': 'tuple_int',
          'elements_number' : 2
        }
    },
    'input' : {
        'shape' : '3D_Tensor'
    },
    'output' : {
        'shape' : '3D_Tensor'
    }
  },

  'Cropping2D': {
    'params' : {
        'cropping': {
          'type': 'tuple_int',
          'conditions': ['<=2']
        },
       'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        }
    },
    'input' : {
        'shape' : '4D_Tensor'
    },
    'output' : {
        'shape' : '4D_Tensor'
    }
  },

  'Cropping3D': {
    'params' :{
        'cropping': {
          'type': 'type_selecter',
          'dict': {
            'same for depth, height, width': {
              'type':'int'
            },
            'different symmetrical values': {
              'type': 'tuple_int',
              'elements_number' : 3
            },
            'different for all': {
              'type':'tuple_tuple_int',
              'fields': {
                'depth': {
                  'type': 'tuple_int',
                  'elements_number' : 2
                },
                'height': {
                  'type': 'tuple_int',
                  'elements_number' : 2
                },
                'width': {
                  'type': 'tuple_int',
                  'elements_number' : 2
                }
              }
            }
          }
        },
       'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        }
    },
    'input' : {
        'shape' : '5D_Tensor'
    },
    'output' : {
        'shape' : '5D_Tensor'
    }
  },

  'UpSampling1D': {
    'params' : {
        'size': {
          'type': 'int'
        }
    },
    'input' : {
        'shape' : '3D_Tensor'
    },
    'output' : {
        'shape' : '3D_Tensor'
    }
  },

  'UpSampling2D': {
    'params' : {
        'size': {
          'type': 'tuple_int',
          'elements_number' : 2
        },
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        }
    },
    'input' : {
        'shape' : '4D_Tensor'
    },
    'output' : {
        'shape' : '4D_Tensor'
    }
  },

  'UpSampling3D': {
    'params' : {
        'size': {
          'type': 'tuple_int',
          'elements_number' : 3
        },
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        }
    },
    'input' : {
        'shape' : '5D_Tensor'
    },
    'output' : {
        'shape' : '5D_Tensor'
    }
  },

  'ZeroPadding1D': {
    'params' : {
        'padding': {
          'type': 'tuple_int',
          'elements_number' : 2
        }
    },
    'input' : {
        'shape' : '3D_Tensor'
    },
    'output' : {
        'shape' : '3D_Tensor'
    }
  },

  'ZeroPadding2D': {
    #'padding': {
      #:TODO:LUC:05/04/2018:To complete (int, or tuple of 2 ints, or tuple of 2 tuples of 2 ints)
    #},
    'params' : {
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        }
    },
    'input' : {
        'shape' : '4D_Tensor'
    },
    'output' : {
        'shape' : '4D_Tensor'
    }
  },

  'ZeroPadding3D': {
    #'padding': {
      #:TODO:LUC:05/04/2018:To complete (int, or tuple of 3 ints, or tuple of 3 tuples of 2 ints)
    #},
    'params' : {
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        }
    },
    'input' : {
        'shape' : '5D_Tensor'
    },
    'output' : {
        'shape' : '5D_Tensor'
    }
  }
}

keras_pooling_layers = {
  'MaxPooling1D': {
    'params' : {
        'pool_size': {
          'type': 'int'
        },
        'strides': {
          'type': 'int' #int or none
        },
        'padding': {
          'type': 'list',
          'list': ['valid', 'same']
        }
    },
    'input' : {
        'shape' : '3D_Tensor'
    },
    'output' : {
        'shape' : '3D_Tensor'
    }
  },

  'MaxPooling2D': {
    'params' : {
        'pool_size': {
          'type': 'tuple_int', #int or tuple of 2 ints
          'elements_max_number' : 2
        },
        'strides': {
          'type': 'tuple_int', #int, tuple of int or none
          'elements_max_number' : 2
        },
        'padding': {
          'type': 'list',
          'list': ['valid', 'same']
        },
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        }
    },
    'input' : {
        'shape' : '4D_Tensor'
    },
    'output' : {
        'shape' : '4D_Tensor'
    }
  },

  'MaxPooling3D': {
      'params' :{
        'pool_size': {
          'type': 'tuple_int',
          'conditions': ['<=3']
        },
        'strides': {
          'type': 'tuple_int', #tuple of 3 ints or none
          'conditions': ['<=3']
        },
        'padding': {
          'type': 'list',
          'list': ['valid', 'same']
        },
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        }
    },
    'input' : {
        'shape' : '5D_Tensor'
    },
    'output' : {
        'shape' : '5D_Tensor'
    }
  },

  'AveragePooling1D': {
    'params' : {
         'pool_size': {
          'type': 'int'
        },
        'strides': {
          'type': 'int' #int or none
        },
        'padding': {
          'type': 'list',
          'list': ['valid', 'same']
        }
    },
    'input' : {
        'shape' : '3D_Tensor'
    },
    'output' : {
        'shape' : '3D_Tensor'
    }
  },

  'AveragePooling2D': {
    'params': {
        'pool_size': {
          'type': 'tuple_int', #int or tuple of 2 ints
          'conditions': ['<=2']
        },
        'strides': {
          'type': 'tuple_int', #int, tuple of int or none
          'conditions': ['<=2']
        },
        'padding': {
          'type': 'list',
          'list': ['valid', 'same']
        },
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        }
    },
    'input' : {
        'shape' : '4D_Tensor'
    },
    'output' : {
        'shape' : '4D_Tensor'
    }
  },

  'AveragePooling3D': {
    'params' : {
        'pool_size': {
          'type': 'tuple_int',
          'conditions': ['<=3']
        },
        'strides': {
          'type': 'tuple_int', #tuple of 3 ints or none
          'conditions': ['<=3']
        },
        'padding': {
          'type': 'list',
          'list': ['valid', 'same']
        },
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        }
    },
    'input' : {
        'shape' : '5D_Tensor'
    },
    'output' : {
        'shape' : '5D_Tensor'
    }
  },

  'GlobalMaxPooling1D': {
    'params' :{
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        }
    },
    'input' : {
        'shape' : '3D_Tensor'
    },
    'output' : {
        'shape' : '2D_Tensor'
    }
  },

  'GlobalAveragePooling1D': {
    'params' :{
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        }
    },
    'input' : {
        'shape' : '3D_Tensor'
    },
    'output' : {
        'shape' : '2D_Tensor'
    }
  },

  'GlobalMaxPooling2D': {
  'params' : {
    'data_format': {
     'type': 'list',
     'list': ['channels_last', 'channels_first']
    }
    },
    'input' : {
        'shape' : '4D_Tensor'
    },
    'output' : {
        'shape' : '2D_Tensor'
    }
  },

  'GlobalAveragePooling2D': {
    'params' : {
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        }
    },
    'input' : {
        'shape' : '4D_Tensor'
    },
    'output' : {
        'shape' : '2D_Tensor'
    }
  },

  'GlobalMaxPooling3D': {
    'params' : {
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        }
    },
    'input' : {
        'shape' : '5D_Tensor'
    },
    'output' : {
        'shape' : '2D_Tensor'
    }
  },

  'GlobalAveragePooling3D': {
    'params' : {
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        }
    },
    'input' : {
        'shape' : '5D_Tensor'
    },
    'output' : {
        'shape' : '2D_Tensor'
    }
  }

}

keras_locally_connected_layers = {
  'LocallyConnected1D': {
    'params' :{
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
          'list': ['valid']
        },
        'activation': {
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
        'bias_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
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
          'shape' : '3D_Tensor'
      },
      'output' : {
          'shape' : '3D_Tensor'
      }
  },

  'LocallyConnected2D': {
    'params' :{
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
          'list': ['valid']
        },
        'data_format': {
         'type': 'list',
         'list': ['channels_last', 'channels_first']
        },
        'activation': {
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
        'bias_initializer': {
          'type': 'list',
          'list': ['None'] + [s for s in keras_initializers]
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
         'shape' : '4D_Tensor'
     },
     'output' : {
         'shape' : '4D_Tensor'
     }
  }
}

keras_recurrent_layers = {
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
          'list': ['None'] + [s for s in keras_activations]
          #Default: hyperbolic tangent (tanh). If you pass None, no activation is applied
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
keras_embedding_layers = {
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

keras_merge_layers = {
  'Add': {
    'input' : {
        'shape' : 'Tab',
        'size' : ['>=2']
    },
    'output' : {
        'shape' : ['2D_Tensor','3D_Tensor','4D_Tensor', '5D_Tensor']
    }
  },
  'Substract': {
    'input' : {
        'shape' : 'Tab',
        'size' : ['2']
    },
    'output' : {
        'shape' : ['2D_Tensor','3D_Tensor','4D_Tensor', '5D_Tensor']
    }
  },
  'Multiply': {
    'input' : {
        'shape' : 'Tab',
        'size' : ['>=2']
    },
    'output' : {
        'shape' : ['2D_Tensor','3D_Tensor','4D_Tensor', '5D_Tensor']
    }
  },
  'Average': {
    'input' : {
        'shape' : 'Tab',
        'size' : ['>=2']
    },
    'output' : {
        'shape' : ['2D_Tensor','3D_Tensor','4D_Tensor', '5D_Tensor']
    }
  },
  'Maximum': {
    'input' : {
        'shape' : 'Tab',
        'size' : ['>=2']
    },
    'output' : {
        'shape' : ['2D_Tensor','3D_Tensor','4D_Tensor', '5D_Tensor']
    }
  },
  'Minimum': {
    'input' : {
        'shape' : 'Tab',
        'size' : ['>=2']
    },
    'output' : {
        'shape' : ['2D_Tensor','3D_Tensor','4D_Tensor', '5D_Tensor']
    }
  },
  'Concatenate': {
    'params' :{
        'axis': {
          'type': 'int'
        }
    },
    'input' : {
        'shape' : 'Tab',
        'size' : ['>=2']
    },
    'output' : {
         'shape' : ['2D_Tensor','3D_Tensor','4D_Tensor', '5D_Tensor']
    }

  },
  'Dot': {
    'params' : {
        'axes': {
          'type': 'int'
          #:TODO:LUC:05/04/2018:To complete (int or tuple of ints)
        },
        'normalize': {
          'type': 'boolean'
        }
    },
    'input' : {
        'shape' : 'Tab',
        'size' : ['>=2']
    },
    'output' : {
        'shape' : ['2D_Tensor','3D_Tensor','4D_Tensor', '5D_Tensor']
    }
  }
}
'''
  #:CHANGED:PELLEGRINI:31/03/2018: Commented these layers
  These layers are the functional interfaces, maybe it's useless to have the 2 versions for code generation?
  ,
  'add': {
    'inputs': {
      'type': 'list',
      #:TODO:LUC:05/04/2018:To complete (list of tensors)
    }
  },
  'substract': {
    'inputs': {
      'type': 'list',
      #:TODO:LUC:05/04/2018:To complete (list of tensors)
    }
  },
  'multiply': {
    'inputs': {
      'type': 'list',
      #:TODO:LUC:05/04/2018:To complete (list of tensors)
    }
  },
  'average': {
    'inputs': {
      'type': 'list',
      #:TODO:LUC:05/04/2018:To complete (list of tensors)
    }
  },
  'maximum': {
    'inputs': {
      'type': 'list',
      #:TODO:LUC:05/04/2018:To complete (list of tensors)
    }
  },
  'concatenate': {
    'inputs': {
      'type': 'list',
      #:TODO:LUC:05/04/2018:To complete (list of tensors)
    },
    'axis': {
      'type': 'int'
    }
  },
  'dot': {
    'inputs': {
      'type': 'list',
      #:TODO:LUC:05/04/2018:To complete (list of tensors)
    },
    'axes': {
      #:TODO:LUC:05/04/2018:To complete (int or tuple of ints)
    },
    'normalize': {
      'type': 'boolean'
    }
  }
'''

keras_advanced_activations_layers = {
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

keras_normalization_layers = {
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

keras_noise_layers = {
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

# List of the layer categories
keras_layers_categories = {
  "Input / Output" : keras_input_output_layers,
  "Core" : keras_core_layers,
  "Convolutional" : keras_convolutional_layers,
  "Pooling" : keras_pooling_layers,
  "Locally Connected" : keras_locally_connected_layers,
  "Recurrent" : keras_recurrent_layers,
  "Embedding" : keras_embedding_layers,
  "Merge" : keras_merge_layers,
  "Advanced Activation" : keras_advanced_activations_layers,
  "Normalization" : keras_normalization_layers,
  "Noise" : keras_noise_layers
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
