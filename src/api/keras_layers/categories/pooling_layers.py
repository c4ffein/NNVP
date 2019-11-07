keras_pooling_layers_builder = \
  lambda keras_activations, keras_initializers, keras_regularizers, keras_constraints : {

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
