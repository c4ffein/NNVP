#!/usr/bin/env python3

# This file contains the function generate_python_from_graph, which can be used
# to generate Python code describing a Keras model. The graph is composed of
# imbricated Python dict and describes how the different layers of the Keras
# model are linked.
# A Graph class will be defined for the next version of this project, these
# functions will be part of it. Most of the algorithmic work is already done.

def node_name(graph, node):
    """Returns the name given to the node in the generated Python code"""
    if graph[node]['keras_data']['name'] == 'Input':
        return 'input_' + str(node)
    elif graph[node]['keras_data']['name'] == 'Output':
        return 'output_' + str(node)
    else:
        return 'layer_' + str(node)

def generate_tuple(param):
    tuple_string = '('
    for value in param:
        if(type(value) == str):
            tuple_string += '\'' + value + '\','
        elif(type(value) == list):
            tuple_string += generate_tuple(value) + ','
        else:
            tuple_string += str(value) + ','
    tuple_string += ')'
    return tuple_string

def generate_python_from_node(graph, node):
    """Return a string containing Python instructions to add the node.

    Options are set to defaults for now, only 3 layer types are used.
    """
    rs = node_name(graph, node) + ' = '
    if graph[node]['keras_data']['name'] == 'Output':
        return ''
    else:
        rs += 'keras.layers.'
        rs += graph[node]['keras_data']['name']
        rs += '('
        param_string = ''
        # TODO : use parametersDef?
        for param, value in graph[node]['keras_data']['parameterValues'].items():#insecure?
            if(type(value) == str):
                param_string += param + '=\'' + value + '\','
            elif(type(value) == list):
                param_string += param + '=' + generate_tuple(value) + ','
            else:
                param_string += param + '=' + str(value) + ','
        rs += param_string[:-1]
        rs += ')'
    if len(graph[node]['sources']) > 0:
        rs += '('
        if len(graph[node]['sources']) == 1:
            rs += node_name(graph, graph[node]['sources'][0])
        elif len(graph[node]['sources']) > 1:
            rs += '['
            for s in graph[node]['sources'][:-1]:
                rs += node_name(graph, s) + ','
            rs += node_name(graph, graph[node]['sources'][-1])
            rs += ']'
        rs += ')'
    rs += '\n'
    print(rs)
    return rs

def find_inputs(graph):
    """Return a list of the different inputs"""
    inputs = []
    for node, value in graph.items():
        if value['keras_data']['name'] == 'Input':
            inputs += [node]
    return inputs

def find_outputs(graph):
    """Return a list of the different outputs"""
    outputs = []
    for node, value in graph.items():
        if value['keras_data']['name'] == 'Output':
            outputs += [node]
    return outputs

def create_treatment_list(graph):
    """Build a treatment list from a graph

    The list contains the nodes that will be used to generate Python code in the
    right order so that every input of a Keras layer is already defined.
    """
    list = []
    def add_node_to_list(node, list):
        """Adds the node and his targets to the list.

        Adds the node only if all his sources are already added. Otherwise,
        it waits for another call of this function to add the node. That way,
        each node is added only once, and the Keras layers will be generated in
        the correct order.
        """
        for s in graph[node]['sources']:
            if not graph[s]['treated']:
                return False
        list += [node]
        graph[node]['treated'] = True
        for t in graph[node]['targets']:
            add_node_to_list(t, list)
    for i in find_inputs(graph):
        add_node_to_list(i, list)
    return list

def generate_model_function(graph):
    """Generate the line responsible for the Keras Model instanciation"""
    rs  = 'model = keras.models.Model(inputs='
    inputs = find_inputs(graph)
    if len(inputs) == 1:
        rs += node_name(graph, inputs[0])
    elif len(inputs) > 1:
        rs += '['
        for input in inputs[:-1]:
            rs += node_name(graph, input)+', '
        rs += node_name(graph, inputs[-1])+']'
    rs += ', outputs='
    output_layers = find_outputs(graph)
    outputs = []
    for output_layer in output_layers:
        outputs += graph[output_layer]['sources']
    if len(outputs) == 1:
        rs += node_name(graph, outputs[0])
    elif len(outputs) > 1:
        rs += '['
        for output in outputs[:-1]:
            rs += node_name(graph, output)+', '
        rs += node_name(graph, outputs[-1])+']'
    rs += ')\n'
    return rs

def generate_python_from_graph(graph):
    """Generate a Python function which makes a Keras model

    The dict contains all the nodes for a graph, their sources, targets, and
    data. This function returns a string containing a Python function which
    generates a functional Keras model. The layer options are not yet
    implemented.
    """
    rs  = 'import keras\n'
    rs += '\n'
    rs += 'def build_model():\n'
    list = create_treatment_list(graph)
    for node in list:
        python_line = generate_python_from_node(graph, node)
        if python_line != '':
            rs += '    ' + python_line
    rs += '    ' + generate_model_function(graph)
    rs += '    ' + 'return model' + '\n'
    return rs
