/* eslint-disable */

import * as d3 from 'd3';
import D3Background from './D3Background';
import D3GraphEditor from './D3GraphEditor';
import D3Layer from './D3Layer';



export default function D3LayerComponent(id, parent, kerasLayer, x, y, name, htmlID){
  if(!(this instanceof D3Layer)){
    D3Layer.call(this, id, parent, kerasLayer, x, y, name, htmlID);
  }
};

//D3LayerComponent.prototype = Object.create(D3Layer.prototype);

/**
 * Clones a Layer
 */
D3LayerComponent.prototype.clone = function () {
  let res = new D3Layer(this.getEditor().getNodeId(), this.parent, this.kerasLayer.clone(), this.x, this.y, this.name);
  this.inputLayers.forEach(inputLayer => res.inputLayers.push(inputLayer));
  this.outputLayers.forEach(outputLayer => res.outputLayers.push(outputLayer));
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

D3LayerComponent.prototype.getChildren = function () {
  return this.children;
};

D3LayerComponent.prototype.addChild = function (child) {
  this.children.push(child);
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


D3LayerComponent.prototype.__proto__ = D3Layer.prototype;
