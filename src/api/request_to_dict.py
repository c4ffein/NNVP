#!/usr/bin/env python3

def request_to_dict(request_dict):
    """Convert a request dict to an improved dictionary

    The request string corresponds to the quoted body of a POST request.
    The dict returned contains the different nodes, including their sources,
    targets, and data.
    """
    result = {}
    def add_node(node_id):
        result[node_id] = {'sources' : [], 'targets' : [], 'keras_data' : None, 'd3_data' : None, 'treated' : False}
    for layer in request_dict['layers']:
        node_id = layer['id']
        if node_id not in result:
            add_node(node_id)
        result[node_id]['d3_data'] = layer
        result[node_id]['keras_data'] = layer['kerasLayer']
        del result[node_id]['d3_data']['kerasLayer']
        result[node_id]['sources'] = layer['inputLayers']
        result[node_id]['targets'] = layer['outputLayers']
    return result
