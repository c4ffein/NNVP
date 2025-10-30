/* eslint-disable */

import * as d3 from 'd3';
import D3Edge from './D3Edge';
import D3Layer from './D3Layer';
import D3LayerComposite from './D3LayerComposite';
import D3Background from './D3Background';
import D3GraphValidation from './D3GraphValidation';


/**
 * Constructor of the graph editor
 * @param svg the area where to create the graph
 * @param d3Layers the set of Layers of the graph
 * @param d3Edges the set of edges of the graph
 */
export default function D3Model(d3Layers, d3Edges, editor) {
  // Graph's edges and nodes
  this.d3Layers = d3Layers || [];
  this.d3Edges = d3Edges || [];

  // List of layers considered as inputs and outputs for the Keras model
  this.modelInputs = [];
  this.modelOutputs = [];

  this.editor = editor;
};

/**
 * Call when we select a Layer composite
 */
D3Model.prototype.createComposite = function () {
  if (this.selectedNodes.length <= 0){
    return;
  }
  let bad_condition = false;
  this.selectedNodes.forEach(selectedNode => {
    if (!this.d3Layers.find(layer => layer == selectedNode)) {
      bad_condition = true;
    }
  });
  if (bad_condition) {
    alert("Cannot group layer from an other group");
    return;
  }
  let x = this.selectedNodes[0].x;
  let y = this.selectedNodes[0].y;
  this.selectedNodes.forEach(selectedNode => {
    if (selectedNode.x < x) {
      x = selectedNode.x;
    }
    if (selectedNode.y < y) {
      y = selectedNode.y;
    }
  });
  let newComposite = new D3LayerComposite(this.getNodeId(), this, this.selectedNodes, x, y);
  newComposite.drawLayer(this);
  this.selectedNodes.forEach(selectedNode => {
    this.d3Layers.forEach(layer => {
      if (selectedNode == layer) {
        this.d3Layers.splice(this.d3Layers.indexOf(layer), 1);
      }
    });
  });
  this.d3Layers.push(newComposite);
  this.undoSelection();
};

/**
 * Call when adding a layer, when no position is given, set it to (this.mapX + 10), (this.mapY + 10)
 * @param kerasLayer the Keras type of the Layer to add
 * @param posX the horizental position of the Layer to add
 * @param posY the vertical position of the Layer to add
 */
D3Model.prototype.addLayer = function (nodeId, kerasLayer, posX, posY) {
  let newLayer = new D3Layer(nodeId, this, kerasLayer, posX , posY)
  this.d3Layers.push(newLayer);
  return newLayer;
};

/**
 * Loads a state of a graph
 * @param txtRes the state of a graph in JSON data
 */
D3Model.prototype.loadState = function (txtRes) {
  var jsonObj = JSON.parse(txtRes);
  var jsonLayers = jsonObj.layers;
  var newLayers = [];
  jsonLayers.forEach(jsonLayer => newLayers.push(D3Layer.loadJSON(jsonLayer, this)));
  this.d3Layers = newLayers;
  var newEdges = jsonObj.edges;
  newEdges.forEach((e, i) => {
    let source = this.findLayerById(e.source);
    let target = this.findLayerById(e.target);
    newEdges[i] = new D3Edge (source , target);
  });
  this.d3Edges = newEdges;
  this.modelInputs.length = 0;
  jsonObj.inputs.forEach(jsonInputId => this.modelInputs.push(this.findLayerById(jsonInputId)));
  this.modelOutputs.length = 0;
  jsonObj.outputs.forEach(jsonOutputId => this.modelOutputs.push(this.findLayerById(jsonOutputId)));
};


/**
 * Deletes all the graph
 * @param skipPrompt if clicked on skip
 */
D3Model.prototype.clear = function () {
  this.d3Layers = [];
  this.d3Edges = [];
  this.modelInputs = [];
  this.modelOutputs = [];
};


/**
 * Converts the current state to JSON data
 * @returns a JSON data
 */
D3Model.prototype.toJSON = function () {
  let savedEdges = [];
  let savedLayers = [];
  let savedInputs = [];
  let savedOutputs = [];

  this.d3Layers.forEach(layer => savedLayers.push(layer.toJSON()));
  this.d3Edges.forEach(edge => savedEdges.push(edge.toJSON()));
  this.modelInputs.forEach(output => savedInputs.push(output.id));
  this.modelOutputs.forEach(output => savedOutputs.push(output.id));
  return window.JSON.stringify({ "layers": savedLayers, "edges": savedEdges, "inputs": savedInputs, "outputs": savedOutputs }, { type: "text/plain;charset=utf-8" });
};

/**
 * Get a Layer by hid ID
 * @param id the ID of the Layer to get
 * @returns true if the Layer exists else null
 */
D3Model.prototype.findLayerById = function (id) {
  let res = null;
  this.d3Layers.forEach(layer => {
    let tmp = layer.findLayerById(id);
    if (tmp) {
      res = tmp;
    }
  });
  return res;
};

/**
 * Check if the component contains a Layer
 * @param id the ID of the Layer to check
 * @returns true if the Layer exists else null
 */
D3Model.prototype.primeAncestorOfId = function (id) {
  let res = null;
  this.d3Layers.forEach(layer => {
    let tmp = layer.findLayerById(id);
    if (tmp !== null) {
      res = layer;
    }
  });
  return res;
};

D3Model.prototype.loadJSON = function (txtRes) {
  var jsonObj = JSON.parse(txtRes);

  var jsonLayers = jsonObj.layers;
  var newLayers = [];
  jsonLayers.forEach(jsonLayer => newLayers.push(D3Layer.loadJSON(jsonLayer, this)));
  this.d3Layers = newLayers;

  var newEdges = jsonObj.edges;
  newEdges.forEach((e, i) => {
    let source = this.findLayerById(e.source);
    let target = this.findLayerById(e.target);
    newEdges[i] = new D3Edge (source , target);
  });
  this.d3Edges = newEdges;

  this.modelInputs.length = 0;
  jsonObj.inputs.forEach(id => {
    this.modelInputs.push(this.findLayerById(id));
  });

  this.modelOutputs.length = 0;
  jsonObj.outputs.forEach(id => {
    this.modelOutputs.push(this.findLayerById(id));
  });
};
