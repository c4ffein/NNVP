keras_convolutional_layers_builder = \
  lambda keras_activations, keras_initializers, keras_regularizers, keras_constraints : {

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
