/* eslint-disable */

import * as d3 from 'd3';
import d3tip from 'd3-tip';
import D3GraphEditor from './D3GraphEditor';
import D3Background from './D3Background';
import D3LayerComponent from './D3LayerComponent';
import D3LayerComposite from './D3LayerComposite';
import D3GraphValidation from './D3GraphValidation';
import KerasLayer from '../KerasInterface/KerasLayer';
const jsonKeras = require("../KerasInterface/generatedKerasLayers.json");


/**
 * Constructor of a Layer
 * @param id the ID of the Layer
 * @param param the parent layerComposite or the graph which contains it
 * @param kerasLayer the Keras type of the Layer
 * @param x the horizental position of the Layer
 * @param y the vertical position of the Layer
 * @param name the name of the Layer
 */
export default function D3Layer(id, parent, kerasLayer, x, y, name, htmlID) {
  if (kerasLayer !== null){
    D3LayerComponent.call(this);
    this.__proto__ = Object.create(D3LayerComponent.prototype);
  }
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

  this.children = null;

  // State of the drag: start, drag, end
  this.dragState = "end";

  // Needed to find the origine when the drag occurs
  // So we can move all the selected node according to that origin
  this.originDrag = {x: x, y: y};

  if (this.kerasLayer != null){
    this.name = this.name || this.kerasLayer.name;

    if(this.kerasLayer.name == "Input"){
      this.getEditor().modelInputs.push(this);
    }
  }

  this.class = "D3Layer";
  this.d3nodeContainer = null;
  this.deleteState = false;
};


/**
 * Converts the Layer to a JSON data
 */
D3Layer.prototype.toJSON = function () {
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
    children: this.children ? this.children.map(child => child.toJSON()) : null,
    kerasLayer: this.kerasLayer,
    parentID: this.parent instanceof this.constructor ? this.parent.id : null
  };
  return res;
};


D3Layer.loadJSON = function (json, graph) {
  if (json.children === null) {
    let newLayer = new D3Layer(json.id, json.parent || graph, new KerasLayer().load(json.kerasLayer), json.x, json.y);
    // No need to call addInputLayer or addOutputLayer to set model inputs and outputs
    newLayer.inputLayers = json.inputLayers;
    newLayer.outputLayers = json.outputLayers;
    newLayer.d3nodeContainer = graph.svgD3Layers;
    return newLayer;
  }
  else {
    return D3LayerComposite.loadJSON(json, graph);
  }
};


D3Layer.prototype.getEditor = function () {
  let editor = this.parent;
  while (! editor instanceof D3GraphEditor){
    editor = editor.parent;
  }
  return editor;
};

/**
 * Adds observer to the Layer component
 * @param o which observer to add
 */
D3Layer.prototype.addObserver = function (o) {
  this.observers.push(o);
};

/**
 * Removes observer from the Layer component
 * @param o which observer to remove
 */
D3Layer.prototype.removeObserver = function (o) {
  this.observers.splice(this.observers.indexOf(o), 1);
};

/**
 * Notify all observers of the Layer component to update
 */
D3Layer.prototype.notifyAll = function () {
  this.observers.forEach(o => o.update.call(o, this));
};

/**
 * Updates the Layer when dragging it
 * @param observable the Layer which is being dragged
 */
D3Layer.prototype.update = function (observable) {
  if (observable.class !== "D3Layer") {
    return;
  }
  if (observable.stateRemove) {
    return;
  }
  switch (observable.dragState) {
    case "start":
      this.dragState = "start"
      this.setOrigin();
      this.notifyAll();
      break;
    case "drag":
      this.dragState = "drag"
      let eventX = this.originDrag.x + observable.x - observable.originDrag.x;
      let eventY = this.originDrag.y + observable.y - observable.originDrag.y;
      this.dragged(eventX, eventY);
      this.notifyAll();
      break;
    case "end":
      this.dragState = "end"
      this.setOrigin();
      this.notifyAll();
      break;
  }
};

D3Layer.prototype.setOrigin = function () {
  this.originDrag.x = this.x;
  this.originDrag.y = this.y;
};

/**
 * Removes the Layer
 */
D3Layer.prototype.remove = function () {
  if (this.tip) this.tip.hide();
  D3LayerComponent.prototype.remove.call(this);
};

/**
 * Deletes the Layer from the set
 * @param graph the graph from which to delete the Layer
 */
D3Layer.prototype.delete = function (graph) {
  let thisLayer = this;
  thisLayer.deleteState = true;
  thisLayer.remove();
  thisLayer.inputLayers.forEach(inputLayerId => {
    let inputLayer = graph.getLayerById(inputLayerId);
    if (inputLayer != null) {
      inputLayer.removeOutputLayer(thisLayer);
    }
  });
  thisLayer.outputLayers.forEach(outputLayerId => {
    let outputLayer = graph.getLayerById(outputLayerId);
    if (outputLayer != null) {
      outputLayer.removeInputLayer(thisLayer);
    }
  });
  if(this.kerasLayer.name === "Input"){
    const modelInputs = this.getEditor().modelInputs;
    if(modelInputs.indexOf(this) !== -1){
      modelInputs.splice(modelInputs.indexOf(this), 1);
    }
  }
  thisLayer.notifyAll();
};


// Drawer helpers
D3Layer.prototype.addTransition = function(gElement){
  return gElement.transition().duration(300);
};

D3Layer.prototype.setElement = function(element, x, y){
  return element.attr("x", x).attr("y", y);
};

D3Layer.prototype.setCircle = function(circle, x, y){
  return circle.attr("cx", x).attr("cy", y);
};

D3Layer.prototype.setRect = function(rect){
  return rect.attr("x", this.x).attr("y", this.y);
};

D3Layer.prototype.setText = function(text, relativeX = 15, relativeY = 25){
  return text.attr("x", this.x + relativeX).attr("y", this.y + relativeY);
};

D3Layer.prototype.setTopPoint = function(topPoint){
  return topPoint.attr("cx", this.x + this.width / 2).attr("cy", this.y);
};

D3Layer.prototype.setLeftPoint = function(leftPoint){
  return leftPoint.attr("cx", this.x).attr("cy", this.y + this.height / 2);
};

D3Layer.prototype.setRightPoint = function(rightPoint){
  return rightPoint.attr("cx", this.x + this.width).attr("cy", this.y + this.height / 2);
};

D3Layer.prototype.setBottomPoint = function(bottomPoint){
  return bottomPoint.attr("cx", this.x + this.width / 2).attr("cy", this.y + this.height);
};

D3Layer.prototype.addCircle = function(gElement, classAttr){
  return gElement.append("circle").attr("class", classAttr).attr("r", 2);
};

/**
 * Draw a new Layer to the set
 * @param graph the graph which to add the Layer
 */
D3Layer.prototype.drawLayer = function (graph) {
  let thisLayer = this;
  thisLayer.d3nodeContainer = graph.svgD3Layers;

  let gElement = this.d3nodeContainer.append("g")
    .attr("class", "d3Layer " + thisLayer.kerasLayer.name)
    .attr("id", thisLayer.htmlID);

  this.setRect(gElement
    .append('rect')
    .attr("width", thisLayer.width)
    .attr("height", thisLayer.height)
    .classed("isolated", D3GraphValidation.isIsolated(graph, thisLayer))
  );

  this.setTopPoint(this.addCircle(gElement, "top-point"));
  this.setRightPoint(this.addCircle(gElement, "right-point"));
  this.setBottomPoint(this.addCircle(gElement, "bottom-point"));
  this.setLeftPoint(this.addCircle(gElement, "left-point"));

  gElement
    .on("click", () => {
      if (d3.event.shiftKey) {
        graph.selectOnNode.call(graph, thisLayer);
      }
      else {
        graph.singleSelection.call(graph, thisLayer);
      }
      d3.event.stopPropagation();
    })
    .call(d3.drag()
      .subject( () => {
        thisLayer.setOrigin();
        return thisLayer.originDrag;
      })
      .on("start", () => {
        graph.saveState();
        thisLayer.dragState = "start";
        thisLayer.setOrigin();
        graph.layerDrag = true;
        graph.dragged(thisLayer);
        thisLayer.notifyAll();
        gElement.classed("active", true);
      })
      .on("drag", () => {
        thisLayer.dragState = "drag";
        if(this.tip) this.tip.hide();
        thisLayer.dragged(d3.event.x, d3.event.y);
        graph.dragged(thisLayer);
        thisLayer.notifyAll();
      })
      .on("end",  () => {
        thisLayer.dragState = "end";
        graph.dragged(thisLayer);
        thisLayer.notifyAll();
        graph.layerDrag = false;
        gElement.classed("active", false);
        D3Background.updateBackground(graph);
      })
    );

  gElement.select("rect")
    .on("mouseover", function () {
      d3.select(this).classed("over-layer", true);
      graph.mouseover_node = thisLayer;
      thisLayer.mouseOver(graph);
      d3.select(this.parentNode).selectAll("circle")
        .attr("r", 4);
    })
    .on("mouseleave", () => {
      gElement.select("rect").classed("over-layer", false);
      graph.mouseover_node = null;
      if(this.tip) this.tip.hide();
      gElement.selectAll("circle")
        .attr("r", 2);
    });

  gElement.selectAll("circle")
    .on("mouseover", function () {
      d3.select(this).classed("active-point", true);
      graph.mouseover_node = thisLayer;
      d3.select(this).attr("r", 10);
    })
    .on("mouseleave", function () {
      d3.select(this).classed("active-point", false);
      graph.mouseover_node = null;
      d3.select(this).attr("r", 2);
    })
    .on("click", function(){
      if(graph.d3Layers.length > 1){
        let dist = null,
            finalLayer,
            sourceCenter = {x: thisLayer.x + (thisLayer.width/2), y: thisLayer.y + (thisLayer.height/2)};
        graph.d3Layers.forEach(layer => {
          let targetCenter = {x: layer.x + (layer.width/2), y: layer.y + (layer.height/2)};
          let newDist = Math.sqrt(Math.abs(sourceCenter.x - targetCenter.x)*Math.abs(sourceCenter.x - targetCenter.x) + Math.abs(sourceCenter.y - targetCenter.y)*Math.abs(sourceCenter.y - targetCenter.y));
          if((!dist || dist > newDist) && layer !== thisLayer){
            dist = newDist;
            finalLayer = layer;
          }
        });
        graph.mouseDownNode = thisLayer;
        graph.layerMouseUp.call(graph, finalLayer);
        gElement.classed("isolated", D3GraphValidation.isIsolated(graph, thisLayer));
      }
    })
    .call(d3.drag()
      .subject( () => { return { x: thisLayer.x, y: thisLayer.y }; })
      .on("start", function () {
        graph.layerMouseDown.call(graph, thisLayer);
      })
      .on("drag", function () {
        graph.moveDragLine.call(graph, this);
      })
      .on("end", function () {
        graph.layerMouseUp.call(graph, graph.mouseover_node);
        gElement.classed("isolated", D3GraphValidation.isIsolated(graph, thisLayer));
      })
    );

  thisLayer.appendText(gElement, graph);
};

/**
 * Appends text to the Layer
 * @param gElement the Layer which to add the text
 * @param graph the graph containing the Layer
 * @returns the Layer name
 */
D3Layer.prototype.appendText = function (gElement, graph) {
  let thisLayer = this;

  gElement
    .append("text")
    .attr("x", 15 + thisLayer.x)
    .attr("y", 25 + thisLayer.y)
    .on("mouseover", () => {
      gElement.classed("over-layer", true);
      graph.mouseover_node = thisLayer;
      thisLayer.mouseOver(graph);
    })
    .on("mouseleave", function () {
      d3.select(this).classed("over-layer", false);
      graph.mouseover_node = null;
      if(this.tip) this.tip.hide();
      gElement.selectAll("circle")
        .attr("r", 2);
    })
    .on("dblclick", function () {
      thisLayer.changeTextOfNode(gElement, graph);
    })
    .text(function () {
      thisLayer.width = 9 * thisLayer.name.length + (thisLayer.height - thisLayer.name.length);
      gElement.select("rect").attr("width", thisLayer.width);
      thisLayer.dragged(thisLayer.x, thisLayer.y);
      return thisLayer.name;
    });
};

/**
 * Changes text of the Layer when renaming it
 * @param gElement the Layer to rename
 * @param graph the graph containig the Layer
 */
D3Layer.prototype.changeTextOfNode = function (gElement, graph) {
  let thisLayer = this;

  gElement.selectAll("text").remove();
  // replace with editableconent text
  let d3txt = gElement
      .append("foreignObject")
      .attr("x", thisLayer.x)
      .attr("y", thisLayer.y-5)
      .attr("height", thisLayer.height)
      .attr("width", thisLayer.width)
      .append("xhtml:p")
      .attr("id", "textEdited")
      .attr("contentEditable", "true")
      .text(thisLayer.name)
      .on("keydown", function () {
        d3.event.stopPropagation();
        if (d3.event.keyCode == D3GraphEditor.ENTER_KEY) {
          this.blur();
        }
      })
      .on("blur", function () {
        thisLayer.name = this.textContent;
        thisLayer.appendText(gElement, graph);
        d3.select(this.parentElement).remove();
        graph.saveState();
      });

      let range = document.createRange();
      range.selectNodeContents(d3txt.node());
      let sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
};


/**
 * Updates the position of the Layer and its components when dragging it
 * @param eventX the horizental position of the Layer
 * @param eventY the vertical position of the Layer
 */
D3Layer.prototype.dragged = function (eventX, eventY) {
  this.x = eventX;
  this.y = eventY;

  let gElement = d3.select("#" + this.htmlID);

  this.setRect(gElement.select("rect"));
  this.setText(gElement.select("text"));
  this.setTopPoint(gElement.select(".top-point"));
  this.setLeftPoint(gElement.select(".left-point"));
  this.setRightPoint(gElement.select(".right-point"));
  this.setBottomPoint(gElement.select(".bottom-point"));
};

/**
 * Adds transition when changing the Layer position
 */
D3Layer.prototype.transitionToXY = function (x, y) {
  this.x = x;
  this.y = y;

  let gElement = d3.select("#" + this.htmlID);

  this.setRect(this.addTransition(gElement.select("rect")));
  this.setText(this.addTransition(gElement.select("text")));
  this.setTopPoint(this.addTransition(gElement.select(".top-point")));
  this.setLeftPoint(this.addTransition(gElement.select(".left-point")));
  this.setRightPoint(this.addTransition(gElement.select(".right-point")));
  this.setBottomPoint(this.addTransition(gElement.select(".bottom-point")));
};

/**
 * Make a graphical transition without setting x and y of layer, useful for composite transitions.
 */
D3Layer.prototype.tempTransitionToXY = function (x, y) {
  const foreverX = this.x;
  const foreverY = this.y;
  this.transitionToXY(x, y);
  this.x = foreverX;
  this.y = foreverY;
};

D3Layer.prototype.getLayerById = function (id) {
  if (this.id === id) {
    return this;
  }
  if (this.children === null){
    return null;
  }
  for (const child of this.children){
    const tmp = child.getLayerById(id);
    if (tmp !== null){
      return tmp;
    }
  }
  return null;
};


/**
 * Shows the graph incoherences on Layer MouseOver if there exists
 * @param graph the graph to check incoherences
 */
D3Layer.prototype.mouseOver = function (graph) {
  let thisLayer = this,
      edges = graph.d3Edges;
  let gElement = d3.select("#" + this.htmlID);
  d3.tip = d3tip;
  if(this.tip === undefined) {
    this.tip = d3.tip().attr('class', 'd3-tip').offset([-10, 0]);
    gElement.call(this.tip);
  }
  if(edges.filter(edge => d3.select("g#"+edge.htmlID).select("path").attr("class").indexOf("linkCycle") >= 0).length > 0){
    this.tip
      .html(function() {
      return "<strong>Incoherence:</strong> <span style='color:red'> Cycle </span>";
    });
    this.tip.show(gElement.select("rect").node());
  }
  else {
    if(D3GraphValidation.isIsolated(graph, thisLayer)) {
      this.tip
        .html(function() {
        return "<strong>Incoherence:</strong> <span style='color:red'> is isolated </span>";
      });
      this.tip.show(gElement.select("rect").node());
    }
    else {
      if ( thisLayer.observers.length && thisLayer.observers[0].class === "D3Edge" &&
        thisLayer.observers[0].source.class === "D3Layer" && jsonKeras[thisLayer.observers[0].source.kerasLayer.name]) {
        edges.filter(d => thisLayer === d.target).forEach(edge => {
          let badOutput = jsonKeras[thisLayer.observers[0].source.kerasLayer.name].output.shape;
          let className = d3.select("g#"+edge.id).select("path").attr("class");
          if(className.indexOf("linkError") >= 0){
            if (jsonKeras[thisLayer.kerasLayer.name].input.shape !== undefined && jsonKeras[thisLayer.kerasLayer.name].output.shape !== undefined) {
              this.tip
                .html(function () {
                return "<strong> Bad Input, should be :</strong> <span style='color:red'>" + jsonKeras[thisLayer.kerasLayer.name].input.shape + "</span>"+"<br>"+
                "<strong> but is :</strong> <span style='color:red'>" + badOutput + "</span>";
              });
              this.tip.show(gElement.select("rect").node());
            }
          }
        });
      }
    }
  }
  gElement.selectAll("circle")
    .attr("r", 4);
};

D3Layer.prototype.primeAncestorOfId = function (id) {
  if (this.id === id) {
    return this;
  }
  let res = null;
  this.children.forEach(layer => {
    let tmp = layer.getLayerById(id);
    if (tmp != null) {
      res = layer;
    }
  });
  return res;
};
