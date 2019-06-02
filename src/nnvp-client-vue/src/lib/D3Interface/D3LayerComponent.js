/* eslint-disable */

import * as d3 from 'd3';
import D3Background from './D3Background';
import D3GraphEditor from './D3Background';


/**
 * Constructor of the Layer component
 * @param id the Layer ID
 * @param x the horizental position of the Layer
 * @param y the vertical position of the Layer
 * @param name the name of the Layer on the screen
 * @param htmlID the html element's ID
 */
export default function D3LayerComponent(id, parent, kerasLayer, x, y, name, htmlID) {
  this.id = id;
  this.parent = parent;
  this.kerasLayer = kerasLayer;

  this.htmlID = htmlID || 'd3-layer-' + this.id;
  this.name = name;

  //Coordinated and dimension for the rect html element
  this.x = x;
  this.y = y;
  this.width = 90;
  this.height = 40;

  // ALl Observers like edge that need to be update
  // When moving the layer
  this.observers = [];

  // Some time order in the input Layer have importance
  // Also help for some verification and graph's cover
  this.inputLayers = [];
  this.outputLayers = [];

  this.childs = [];

  // State of the drag: start, drag, end
  this.dragState = "end";

  // Needed to find the origine when the drag occurs
  // So we can move all the selected node according to that origin
  this.originDrag = {x: x, y: y};

  this.class = "D3LayerComponent";
};

/**
 * Clones a Layer
 */
D3LayerComponent.prototype.clone = function () {
  let res = new D3Layer(this.getEditor().getNodeId(), this.parent, this.kerasLayer.clone(), this.x, this.y, this.name);
  this.inputLayers.forEach(inputLayer => res.inputLayers.push(inputLayer));
  this.outputLayers.forEach(outputLayer => res.outputLayers.push(outputLayer));
};

/**
 * Converts the Layer component to a JSON data
 * @returns a JSON data
 */
D3LayerComponent.prototype.toJSON = function () {
  let res = {
    class: this.class,
    x: this.x,
    y: this.y,
    width: this.width,
    height: this.height,
    id: this.id,
    htmlID: this.htmlID,
    name: this.name,
    inputLayers: this.inputLayers,
    outputLayers: this.outputLayers,
    childs: []
  };
  this.childs.forEach(child => res.childs.push(child.toJSON()));
  return res;
};

/**
 * Set parent, which can either be a D3Composite,
 * or null for the GraphEditor itself in this version
 * @param layer which Layer to add
 */
D3LayerComponent.prototype.setParent = function (parent) {
  this.parent = parent;
};

/**
 * Adds input Layer to the set
 * @param layer which Layer to add
 */
D3LayerComponent.prototype.addInputLayer = function (layer) {
  this.inputLayers.push(layer.id);
  if(this.kerasLayer.name == "Output"){
    this.getEditor().modelOutputs.push(layer);
  }
};

/**
 * Removes input Layer
 * @param layer which Layer to remove
 */
D3LayerComponent.prototype.removeInputLayer = function (layer) {
  this.inputLayers = this.inputLayers.filter(inputLayer => inputLayer !== layer.id);

  if(this.kerasLayer.name === "Output"){
    const modelOutputs = this.getEditor().modelOutputs;
    if(modelOutputs.indexOf(layer) !== -1){
      modelOutputs.splice(modelOutputs.indexOf(layer), 1);
    }
  }
};

/**
 * Adds output Layer to the set
 * @param layer which Layer to add
 */
D3LayerComponent.prototype.addOutputLayer = function (layer) {
  this.outputLayers.push(layer.id);
};

/**
 * Removes output Layer
 * @param layer which Layer to remove
 */
D3LayerComponent.prototype.removeOutputLayer = function (layer) {
  this.outputLayers = this.outputLayers.filter(outputLayer => outputLayer !== layer.id);
};

D3LayerComponent.prototype.getChilds = function () {
  return this.childs;
};

D3LayerComponent.prototype.addChild = function (child) {
  this.childs.push(child);
};

/**
 * Adds observer to the Layer component
 * @param o which observer to add
 */
D3LayerComponent.prototype.addObserver = function (o) {
  this.observers.push(o);
};

/**
 * Removes observer from the Layer component
 * @param o which observer to remove
 */
D3LayerComponent.prototype.removeObserver = function (o) {
  this.observers.splice(this.observers.indexOf(o), 1);
};

/**
 * Notify all observers of the Layer component to update
 */
D3LayerComponent.prototype.notifyAll = function () {
  this.observers.forEach(o => o.update.call(o, this));
};

/**
 *
 */
D3LayerComponent.prototype.update = function (observable) {
  console.log("Method not implemented");
};

/**
 * Sets the origin drag to the Layer
 */
D3LayerComponent.prototype.setOrigin = function () {
  this.originDrag.x = this.x;
  this.originDrag.y = this.y;
};

/**
 * Removes the Layer component
 */
D3LayerComponent.prototype.remove = function () {
  d3.select("#" + this.htmlID).remove();
};

/**
 *
 */
D3LayerComponent.prototype.drawLayer = function (d3node, graph) {
  console.log("Method not implemented");
};

/**
 * Sets a new position to the Layer component when dragging it
 * @param eventX the horizental position
 * @param eventY the vertical position
 */
D3LayerComponent.prototype.dragged = function (eventX, eventY) {
  this.x = eventX;
  this.y = eventY;
};

D3LayerComponent.prototype.getLayerById = function (id) {
  if (this.id === id) {
    return this;
  }
  let res = null;
  this.childs.forEach(layer => {
    let tmp = layer.getLayerById(id);
    if (tmp != null) {
      res = tmp;
    }
  });
  return res;
};

D3LayerComponent.prototype.primeAncestorOfId = function (id) {
  if (this.id === id) {
    return this;
  }
  let res = null;
  this.childs.forEach(layer => {
    let tmp = layer.getLayerById(id);
    if (tmp != null) {
      res = layer;
    }
  });
  return res;
};

D3LayerComponent.prototype.getEditor = function () {
  let editor = this.parent;
  while (! editor instanceof D3GraphEditor){
    editor = editor.parent;
  }
  return editor;
};
