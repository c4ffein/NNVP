/* eslint-disable */

import * as d3 from 'd3';
import d3tip from 'd3-tip';
import D3GraphEditor from './D3GraphEditor';
import D3Background from './D3Background';
import D3ComponentLayer from './D3ComponentLayer';
import D3GraphValidation from './D3GraphValidation';
import KerasLayer from '../KerasInterface/KerasLayer';
const jsonKeras = require("../KerasInterface/generatedKerasLayers.json");

/**
 * Constructor of a Layer
 * @param kerasLayer the Keras type of the Layer
 * @param id the ID of the Layer
 * @param x the horizental position of the Layer
 * @param y the vertical position of the Layer
 * @param name the name of the Layer
 */
export default function D3Layer(kerasLayer, id, x, y, name) {

  let htmlID = "Layer_" + id;
  D3ComponentLayer.call(this, id, x, y, name || (name = kerasLayer.name), htmlID);

  // True KerasLayer that contain the Keras paramaters
  this.kerasLayer = kerasLayer;

  this.class = "D3Layer";

  this.d3node = null;

  this.deleteState = false;
};

D3Layer.prototype = Object.create(D3ComponentLayer.prototype);

/**
 * Clones a Layer
 */
D3Layer.prototype.clone = function () {
  let res = new D3Layer(this.kerasLayer.clone(), this.id, this.x, this.y, this.name);
  this.inputLayers.forEach(inputLayer => res.inputLayers.push(inputLayer));
  this.outputLayers.forEach(outputLayer => res.outputLayers.push(outputLayer));
};

/**
 * Converts the Layer to a JSON data
 */
D3Layer.prototype.toJSON = function () {
  let res = D3ComponentLayer.prototype.toJSON.call(this);
  res.kerasLayer = this.kerasLayer;
  return res;
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

/**
 * Removes the Layer
 */
D3Layer.prototype.remove = function () {
  if (D3Layer.tip) D3Layer.tip.hide();
  D3ComponentLayer.prototype.remove.call(this);
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
  thisLayer.notifyAll();
};

/**
 * Draw a new Layer to the set
 * @param d3node the set of Layers existing
 * @param graph the graph which to add the Layer
 */
D3Layer.prototype.drawLayer = function (d3node, graph) {
  let thisLayer = this;

  thisLayer.d3node = d3node;

  let gElement = d3node.append("g")
    .attr("class", "d3Layer " + thisLayer.kerasLayer.name)
    .attr("id", thisLayer.htmlID);

  gElement
    .append('rect')
    .attr("x", thisLayer.x)
    .attr("y", thisLayer.y)
    .attr("width", thisLayer.width)
    .attr("height", thisLayer.height)
    .classed("isolated", D3GraphValidation.isIsolated(graph, thisLayer));

  gElement
    .append("circle")
    .attr("class", "top-point")
    .attr("cx", thisLayer.width/2 + thisLayer.x)
    .attr("cy", thisLayer.y)
    .attr("r", 2);

  gElement
    .append("circle")
    .attr("class", "right-point")
    .attr("cx", thisLayer.width + thisLayer.x)
    .attr("cy", thisLayer.height/2 + thisLayer.y)
    .attr("r", 2);

  gElement
    .append("circle")
    .attr("class", "bottom-point")
    .attr("cx", thisLayer.width/2 + thisLayer.x)
    .attr("cy", thisLayer.height + thisLayer.y)
    .attr("r", 2);

  gElement
    .append("circle")
    .attr("class", "left-point")
    .attr("cx", thisLayer.x)
    .attr("cy", thisLayer.height/2 + thisLayer.y)
    .attr("r", 2);

  gElement
    .on("click", () => {
      if (graph.lastKeyDown === D3GraphEditor.CTRL_KEY) {
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
        D3Layer.tip.hide();
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
      D3Layer.tip.hide();
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
      D3Layer.tip.hide();
      gElement.selectAll("circle")
        .attr("r", 2);
    })
    .on("dblclick", function () {
      thisLayer.changeTextOfNode(gElement, graph);
    })
    .text(function () {
      thisLayer.width = 9 * thisLayer.name.length + (thisLayer.height - thisLayer.name.length);
      gElement.select("rect")
        .attr("width", thisLayer.width);
      gElement.select(".top-point")
        .attr("cx", thisLayer.x + (thisLayer.width / 2))
        .attr("cy", thisLayer.y);
      gElement.select(".right-point")
        .attr("cx", thisLayer.x + (thisLayer.width))
        .attr("cy", thisLayer.y + (thisLayer.height / 2));
      gElement.select(".bottom-point")
        .attr("cx", thisLayer.x + (thisLayer.width / 2))
        .attr("cy", thisLayer.y + (thisLayer.height));
      return thisLayer.name;
    });
};

/**
 * Changes text of the Layer when renaming it
 * @param gElement the Layer to rename
 * @param graph the graph containig the Layer
 */
D3Layer.prototype.changeTextOfNode = function(gElement, graph) {
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
D3Layer.prototype.dragged = function(eventX, eventY) {

  D3ComponentLayer.prototype.dragged.call(this, eventX, eventY);
  let thisLayer = this;

  let gElement = d3.select("#" + thisLayer.htmlID);

  gElement.select("rect")
    .attr("x", thisLayer.x)
    .attr("y", thisLayer.y);

  gElement.select("text")
    .attr("x", thisLayer.x + 15)
    .attr("y", thisLayer.y + 25);

  gElement.select(".top-point")
    .attr("cx", thisLayer.x + thisLayer.width / 2)
    .attr("cy", thisLayer.y);

  gElement.select(".left-point")
    .attr("cx", thisLayer.x)
    .attr("cy", thisLayer.y + thisLayer.height / 2);

  gElement.select(".right-point")
    .attr("cx", thisLayer.x + thisLayer.width)
    .attr("cy", thisLayer.y + thisLayer.height / 2);

  gElement.select(".bottom-point")
    .attr("cx", thisLayer.x + thisLayer.width / 2)
    .attr("cy", thisLayer.y + thisLayer.height);

};

/**
 * Adds transition when changing the Layer position
 * @param x the horizental position
 * @param y the vertical position
 */
D3Layer.prototype.transitionToXY = function (x, y) {
  let thisLayer = this;

  let gElement = d3.select("#" + thisLayer.htmlID);

  gElement.select("rect")
    .transition()
    .duration(300)
    .attr("x", x)
    .attr("y", y);

  gElement.select("text")
    .transition()
    .duration(300)
    .attr("x", x + 15)
    .attr("y", y + 25);

  gElement.select(".top-point")
    .transition()
    .duration(300)
    .attr("cx", x + thisLayer.width / 2)
    .attr("cy", y);

  gElement.select(".left-point")
    .transition()
    .duration(300)
    .attr("cx", x)
    .attr("cy", y + thisLayer.height / 2);

  gElement.select(".right-point")
    .transition()
    .duration(300)
    .attr("cx", x + thisLayer.width)
    .attr("cy", y + thisLayer.height / 2);

  gElement.select(".bottom-point")
    .transition()
    .duration(300)
    .attr("cx", x + thisLayer.width / 2)
    .attr("cy", y + thisLayer.height);
};

D3Layer.loadJSON = function (json, graph) {
  let newLayer = new D3Layer(new KerasLayer().load(json.kerasLayer), json.id, json.x, json.y);
  newLayer.inputLayers = json.inputLayers;
  newLayer.outputLayers = json.outputLayers;
  newLayer.d3node = graph.svgD3Layers;
  return newLayer;
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
  if(D3Layer.tip === undefined) {
    D3Layer.tip = d3.tip().attr('class', 'd3-tip').offset([-10, 0]);
    gElement.call(D3Layer.tip);
  }
  if(edges.filter(edge => d3.select("g#"+edge.htmlID).select("path").attr("class").indexOf("linkCycle") >= 0).length > 0){
    D3Layer.tip
      .html(function() {
      return "<strong>Incoherence:</strong> <span style='color:red'> Cycle </span>";
    });
    D3Layer.tip.show(gElement.select("rect").node());
  }
  else {
    if(D3GraphValidation.isIsolated(graph, thisLayer)) {
      D3Layer.tip
        .html(function() {
        return "<strong>Incoherence:</strong> <span style='color:red'> is isolated </span>";
      });
      D3Layer.tip.show(gElement.select("rect").node());
    }
    else {
      if ( thisLayer.observers.length && thisLayer.observers[0].class === "D3Edge" &&
        thisLayer.observers[0].source.class === "D3Layer" && jsonKeras[thisLayer.observers[0].source.kerasLayer.name]) {
        edges.filter(d => thisLayer === d.target).forEach(edge => {
          let badOutput = jsonKeras[thisLayer.observers[0].source.kerasLayer.name].output.shape;
          let className = d3.select("g#"+edge.id).select("path").attr("class");
          if(className.indexOf("linkError") >= 0){
            if (jsonKeras[thisLayer.kerasLayer.name].input.shape !== undefined && jsonKeras[thisLayer.kerasLayer.name].output.shape !== undefined) {
              D3Layer.tip
                .html(function () {
                return "<strong> Bad Input, should be :</strong> <span style='color:red'>" + jsonKeras[thisLayer.kerasLayer.name].input.shape + "</span>"+"<br>"+
                "<strong> but is :</strong> <span style='color:red'>" + badOutput + "</span>";
              });
              D3Layer.tip.show(gElement.select("rect").node());
            }
          }
        });
      }
    }
  }
  gElement.selectAll("circle")
    .attr("r", 4);
};
