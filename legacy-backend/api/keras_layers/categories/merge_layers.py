keras_merge_layers_builder = \
  lambda keras_activations, keras_initializers, keras_regularizers, keras_constraints : {

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
