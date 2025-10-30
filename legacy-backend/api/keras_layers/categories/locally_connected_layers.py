keras_locally_connected_layers_builder = \
  lambda keras_activations, keras_initializers, keras_regularizers, keras_constraints : {

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
