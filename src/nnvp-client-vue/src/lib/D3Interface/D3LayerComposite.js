/* eslint-disable */

import * as d3 from 'd3';
import D3Background from './D3Background';
import D3Layer from './D3Layer';
import D3LayerComponent from './D3LayerComponent';
import D3GraphEditor from './D3GraphEditor';
import D3Edge from './D3Edge';
import D3GraphValidation from './D3GraphValidation';

/**
 * Constructor of the Layer composite
 * @param id the ID of the Layer component
 * @param x the horizental position of the Layer component
 * @param y the vertical position of thz Layer component
 * @param children the set of observables
 */
export default function D3LayerComposite(id, parent, children, x, y) {
  let thisComposite = this;

  D3Layer.call(thisComposite, id, parent, null, x, y, "Block_" + id, "Composite_" + id);
  thisComposite.class = "D3LayerComposite";
  thisComposite.d3node = null;
  thisComposite.isOpen = false;
  thisComposite.children = [];
  children.forEach(child => {
    thisComposite.children.push(child);
    child.addObserver(thisComposite);
    child.setParent(thisComposite);
  });
  thisComposite.graph = null;
  thisComposite.deleteState = false;
};

D3LayerComposite.prototype = Object.create(D3LayerComponent.prototype);

D3LayerComposite.prototype.clone = function () {
  let res = new D3LayerComposite(this.id, this.parent, null, this.x, this.y, this.name, this.htmlID);
  this.children.forEach(child => res.children.push(child.clone()));
  return res;
};

/**
 * Converts the Layer composite to a JSON data
 * @returns a JSON data
 */
D3LayerComposite.prototype.toJSON = function () {
  let res = D3LayerComponent.prototype.toJSON.call(this);
  res.isOpen = this.isOpen;
  return res;
};

/**
 * Updates the Layer compisite
 * @param observable the object which influence on Layer composite
 */
D3LayerComposite.prototype.update = function (observable) {
  let thisComposite = this;
  if (observable.deleteState) {
    thisComposite.children = thisComposite.children.filter(child => child != observable);
  }
  if(thisComposite.children.length <= 0) {
    thisComposite.delete(thisComposite.graph);
    return;
  }
  if (!thisComposite.isOpen) {
    return;
  }

  let x = thisComposite.x;
  let y = thisComposite.y;
  thisComposite.children.forEach(child => {
    if (child.x + child.width > x) {
      x = child.x + child.width;
    }
    if (child.y + child.height > y) {
      y = child.y + child.height;
    }
  });

  thisComposite.width =  x + 20 - thisComposite.x;
  thisComposite.height = y + 10 - thisComposite.y;

  x = thisComposite.children[0].x;
  y = thisComposite.children[0].y;

  thisComposite.children.forEach(child => {
    if (child.x < x) {
      x = child.x;
    }
    if (child.y < y) {
      y = child.y;
    }
  });

  thisComposite.x = x - 20;
  thisComposite.y = y - 60;

  thisComposite.notifyAll();

  let gElement = d3.select("#" + thisComposite.htmlID);

  gElement
    .select("rect")
    .attr("x", thisComposite.x)
    .attr("y", thisComposite.y)
    .attr("width", thisComposite.width)
    .attr("height", thisComposite.height);

  gElement
    .select("text")
    .attr("x", thisComposite.x + 15)
    .attr("y", thisComposite.y + 35)

  gElement
    .select("rect.open")
    .attr("x", thisComposite.x + thisComposite.width - 50)
    .attr("y", thisComposite.y + 5);

  gElement
    .select("text.open")
    .attr("x", thisComposite.x + thisComposite.width - 45)
    .attr("y", thisComposite.y + 17)

  gElement
    .select("rect.break")
    .attr("x", thisComposite.x + thisComposite.width - 50)
    .attr("y", thisComposite.y + 28)
    .attr("width", 45)
    .attr("height", 17);

  gElement
    .select("text.break")
    .attr("x", thisComposite.x + thisComposite.width - 47)
    .attr("y", thisComposite.y + 42)
    .attr("width", 20)
    .attr("height", 10);
};

/**
 * Removes the Layer composite
 */
D3LayerComposite.prototype.remove = function () {
  D3LayerComponent.prototype.remove.call(this);
};

/**
 * Deletes the Layer composite from set
 * @param graph the graph which from to delete the Layer composite
 */
D3LayerComposite.prototype.delete = function (graph) {
  let thisComposite = this;
  thisComposite.remove();
  thisComposite.children.forEach(child => child.delete(graph));
  thisComposite.inputLayers.forEach(inputLayerId => {
    let inputLayer = graph.getLayerById(inputLayerId);
    if (inputLayer != null) {
      inputLayer.removeOutputLayer(thisComposite);
    }
  });
  thisComposite.outputLayers.forEach(outputLayerId => {
    let outputLayer = graph.getLayerById(outputLayerId);
    if (outputLayer != null) {
      outputLayer.removeInputLayer(thisComposite);
    }
  });
};

/**
 * Removes an input Lyer from the Layer composite
 * @param layer which Layer to remove
 */
D3LayerComposite.prototype.removeInputLayer = function (layer) {
  let thisComposite = this;
  D3LayerComponent.prototype.removeInputLayer.call(thisComposite, layer);
  thisComposite.children.forEach(child => child.removeInputLayer(layer));
};

/**
 * Removes an output Layer from the Layer composite
 * @param layer which Layer to remove
 */
D3LayerComposite.prototype.removeOutputLayer = function (layer) {
  let thisComposite = this;
  D3LayerComponent.prototype.removeOutputLayer.call(thisComposite, layer);
  thisComposite.children.forEach(child => child.removeOutputLayer(layer));
};

/**
 * Draw a Layer composite
 * @param d3node the set of Layers composite existing
 * @param graph the graph to which add the Layer composite
 */
D3LayerComposite.prototype.drawLayer = function (d3node, graph) {
  this.graph = graph;

  this.width = 180;
  this.height = 60;

  this.d3node = d3node;

  this.children.forEach(child => {
    if (!d3.select("#" + child.htmlID).node()) {
      return;
    }
    if (child.class === "D3LayerComposite") {
      child.close();
    }
    child.transitionToXY(this.x, this.y);
    d3.select("#" + child.htmlID)
      .transition()
      .delay(300)
      .remove();
    child.x = child.x + 20;
    child.y = child.y + this.height;
  });

  graph.d3Edges.filter(edge => true).forEach(edge => {
    let source = this.children.find(child => child == edge.source)? true : false;
    let target = this.children.find(child => child == edge.target)? true : false;
    if (!source && !target) {
      edge.updateWithTransition();
    }
    if (source || target) {
      graph.d3Edges.splice(graph.d3Edges.indexOf(edge), 1);
      edge.remove();
      edge.source.removeObserver(edge);
      edge.target.removeObserver(edge);
    }
    if (source && !target && graph.d3Edges.find(e => e.source == this && e.target == edge.target) == null) {
      let new_edge = new D3Edge(this, edge.target);
      graph.d3Edges.push(new_edge);
      new_edge.source = edge.source;
      new_edge.drawEdge(edge.d3node, graph);
      new_edge.source = this;
      new_edge.updateWithTransition();
    }
    if (!source && target && graph.d3Edges.find(e => e.source == edge.source && e.target == this) == null) {
      let new_edge = new D3Edge(edge.source, this);
      graph.d3Edges.push(new_edge);
      new_edge.taget = edge.taget;
      new_edge.drawEdge(edge.d3node, graph);
      new_edge.taget = this;
      new_edge.updateWithTransition();
    }
  });

  let gElement = this.d3node.append("g");

  gElement
    .attr("class", "d3Layer D3LayerComposite")
    .attr("id", this.htmlID);

  gElement
    .append("rect")
    .attr("x", this.x)
    .attr("y", this.y)
    .transition()
    .delay(300)
    .attr("width", this.width)
    .attr("height", this.height);

  gElement
    .append("text")
    .attr("x", this.x + 15)
    .attr("y", this.y + 35)
    .text(this.name);

  gElement
    .append("rect")
    .attr("class", "button open")
    .attr("x", this.x + this.width - 50)
    .attr("y", this.y + 5)
    .transition()
    .delay(300)
    .attr("width", 45)
    .attr("height", 17)

  gElement
    .append("text")
    .attr("class", "button open")
    .attr("x", this.x + this.width - 45)
    .attr("y", this.y + 17)
    .transition()
    .delay(300)
    .attr("width", 20)
    .attr("height", 10)
    .text("open");

  /*
  gElement
    .on("click", () => {
      if (graph.lastKeyDown === D3GraphEditor.CTRL_KEY) {
        graph.selectOnNode.call(graph, this);
      }
      else {
        graph.singleSelection.call(graph, this);
      }
      d3.event.stopPropagation();
    })
  */

  this.setDrag(graph, gElement);

  gElement
    .select("rect.open")
    .on("click", () => {
      this.open(graph);
      d3.event.stopPropagation();
    });

  gElement
    .select("text.open")
    .on("click", () => {
      this.open(graph);
      d3.event.stopPropagation();
    });

  D3Background.updateBackground(graph);

};

D3LayerComposite.prototype.setDrag = function (graph, gElement) {

  let thisComposite = this;

  gElement
    .call(d3.drag()
      .subject( () => {
        thisComposite.setOrigin();
        return thisComposite.originDrag;
      })
      .on("start", () => {
        graph.saveState();
        thisComposite.dragState = "start";
        thisComposite.setOrigin();
        thisComposite.children.forEach(child => child.setOrigin());
        graph.layerDrag = true;
        graph.dragged(thisComposite);
        thisComposite.notifyAll();
        gElement.classed("active", true);
      })
      .on("drag", () => {
        thisComposite.dragState = "drag";
        thisComposite.dragged(d3.event.x, d3.event.y);
        graph.dragged(thisComposite);
        thisComposite.notifyAll();
      })
      .on("end", () => {
        thisComposite.dragState = "end";
        graph.layerDrag = false;
        thisComposite.notifyAll();
        graph.dragged(thisComposite);
        gElement.classed("active", false);
        D3Background.updateBackground(graph);
      })
    );

};

/**
 * Updates the position of the Layer composite and his components when dragging
 * @param eventX the horizental position
 * @param eventY the vertical position
 */
D3LayerComposite.prototype.dragged = function (eventX, eventY) {

  D3LayerComponent.prototype.dragged.call(this, eventX, eventY);
  let thisComposite = this;

  let gElement = d3.select("#" + thisComposite.htmlID);

  gElement.select("rect")
    .attr("x", thisComposite.x)
    .attr("y", thisComposite.y);

  gElement.select("text")
    .attr("x", thisComposite.x + 15)
    .attr("y", thisComposite.y + 35);

  gElement.select("rect.button.open")
    .attr("x", thisComposite.x + thisComposite.width - 50)
    .attr("y", thisComposite.y + 5);

  gElement.select("text.button.open")
    .attr("x", thisComposite.x + thisComposite.width - 45)
    .attr("y", thisComposite.y + 17);

  gElement.select("rect.button.break")
    .attr("x", thisComposite.x + thisComposite.width - 50)
    .attr("y", thisComposite.y + 30);

  gElement.select("text.button.break")
    .attr("x", thisComposite.x + thisComposite.width - 45)
    .attr("y", thisComposite.y + 42);

  thisComposite.children.forEach(child => {
    let x = child.originDrag.x + thisComposite.x - thisComposite.originDrag.x;
    let y = child.originDrag.y + thisComposite.y - thisComposite.originDrag.y;
    child.dragged(x, y);
    child.observers.forEach(obs => {
      if (obs != thisComposite) {
        obs.update(obs);
      }
    });
  });

};

/**
 * Opens the Layer composite and shows his components
 * @param graph the graph containing the Layer composite
 */
D3LayerComposite.prototype.open = function (graph) {
  let thisComposite = this;
  let x = thisComposite.x;
  let y = thisComposite.y;

  thisComposite.isOpen = true;

  thisComposite.children.forEach(child => {
    if (child.x + child.width > x) {
      x = child.x + child.width;
    }
    if (child.y + child.height > y) {
      y = child.y + child.height;
    }
  });

  thisComposite.width =  x + 20 - thisComposite.x;
  thisComposite.height = y + 10 - thisComposite.y;

  thisComposite.notifyAll();

  let gElement = d3.select("#" + thisComposite.htmlID);

  gElement
    .select("rect")
    .transition()
    .duration(300)
    .attr("width", thisComposite.width)
    .attr("height", thisComposite.height);

  gElement
    .select("rect.open")
    .transition()
    .duration(300)
    .attr("x", thisComposite.x + thisComposite.width - 50)
    .attr("y", thisComposite.y + 5);

  gElement
    .select("text.open")
    .transition()
    .duration(300)
    .attr("x", thisComposite.x + thisComposite.width - 45)
    .attr("y", thisComposite.y + 17)
    .text("close");

  gElement
    .append("rect")
    .attr("class", "button break")
    .attr("x", thisComposite.x + thisComposite.width - 50)
    .attr("y", thisComposite.y + 28)
    .transition()
    .delay(300)
    .attr("width", 45)
    .attr("height", 17);

  gElement
    .append("text")
    .attr("class", "button break")
    .attr("x", thisComposite.x + thisComposite.width - 47)
    .attr("y", thisComposite.y + 42)
    .transition()
    .delay(300)
    .attr("width", 20)
    .attr("height", 10)
    .text("break");

  gElement
    .select("rect.open")
    .on("click", () => {
      thisComposite.close(graph);
      d3.event.stopPropagation();
    });

  gElement
    .select("text.open")
    .on("click", () => {
      thisComposite.close(graph);
      d3.event.stopPropagation();
    });

  gElement
    .select("rect.break")
    .on("click", () => {
      thisComposite.break(graph);
      d3.event.stopPropagation();
    });

  gElement
    .select("text.break")
    .on("click", () => {
      thisComposite.break(graph);
      d3.event.stopPropagation();
    });

  thisComposite.children.forEach(child =>
    child.drawLayer(child.d3node, graph)
  );

  thisComposite.children.forEach(child => {
    child.inputLayers.forEach(inputLayer => {
      let source = graph.primeAncestorOfId(inputLayer);
      while(source != null && source.id != inputLayer && source.isOpen){
        source = source.primeAncestorOfId(inputLayer);
      }
      if (graph.d3Edges.find(edge => edge.source == source && edge.target == child) == null) {
        let newEdge = new D3Edge(source, child);
        graph.d3Edges.push(newEdge);
        newEdge.drawEdge(graph.svgG.select("g.d3Edges"), graph);
      }
    });
    child.outputLayers.forEach(outputLayer => {
      let target = graph.primeAncestorOfId(outputLayer);
      while(target != null && target.id != outputLayer && target.isOpen){
        target = target.primeAncestorOfId(outputLayer);
      }
      if (graph.d3Edges.find(edge => edge.source == child && edge.target == target) == null) {
        let newEdge = new D3Edge(child, target);
        graph.d3Edges.push(newEdge);
        newEdge.drawEdge(graph.svgG.select("g.d3Edges"), graph);
      }
    });
  });

  graph.d3Edges = graph.d3Edges.filter(edge => {
    if (edge.source == thisComposite || edge.target == thisComposite) {
      edge.remove(graph);
      return false;
    }
    return true;
  });

  D3GraphValidation.isCycle(graph);

  D3Background.updateBackground(graph);

};

/**
 * Closes the Layer composite
 * @param graph the graph from which to close the Layer composite
 */
D3LayerComposite.prototype.close = function (graph) {
  let thisComposite = this;
  thisComposite.width = 180;
  thisComposite.height = 60;

  thisComposite.isOpen = false;

  thisComposite.children.forEach(child => {
    if (!d3.select("#" + child.htmlID).node()) {
      return;
    }
    if (child.class === "D3LayerComposite") {
      child.close();
    }
    child.transitionToXY(thisComposite.x, thisComposite.y);
    d3.select("#" + child.htmlID)
      .transition()
      .delay(300)
      .remove();
  });

  graph.d3Edges.filter(edge => true).forEach(edge => {
    let source = thisComposite.children.find(child => child == edge.source)? true : false;
    let target = thisComposite.children.find(child => child == edge.target)? true : false;
    if (!source && !target) {
      edge.updateWithTransition();
    }
    if (source || target) {
      graph.d3Edges.splice(graph.d3Edges.indexOf(edge), 1);
      edge.remove();
      edge.source.removeObserver(edge);
      edge.target.removeObserver(edge);
    }
    if (source && !target && graph.d3Edges.find(e => e.source == thisComposite && e.target == edge.target) == null) {
      let new_edge = new D3Edge(thisComposite, edge.target);
      graph.d3Edges.push(new_edge);
      new_edge.source = edge.source;
      new_edge.drawEdge(edge.d3node, graph);
      new_edge.source = thisComposite;
      new_edge.updateWithTransition();
    }
    if (!source && target && graph.d3Edges.find(e => e.source == edge.source && e.target == thisComposite) == null) {
      let new_edge = new D3Edge(edge.source, thisComposite);
      graph.d3Edges.push(new_edge);
      new_edge.taget = edge.taget;
      new_edge.drawEdge(edge.d3node, graph);
      new_edge.taget = thisComposite;
      new_edge.updateWithTransition();
    }
  });

  let gElement = d3.select("#" + thisComposite.htmlID);

  gElement
    .select("rect")
    .transition()
    .duration(300)
    .attr("width", thisComposite.width)
    .attr("height", thisComposite.height);

  gElement
    .select("rect.open")
    .transition()
    .duration(300)
    .attr("x", thisComposite.x + thisComposite.width - 50)
    .attr("y", thisComposite.y + 5)
    .attr("width", 45)
    .attr("height", 17)

  gElement
    .select("text.open")
    .transition()
    .duration(300)
    .attr("x", thisComposite.x + thisComposite.width - 45)
    .attr("y", thisComposite.y + 17)
    .attr("width", 20)
    .attr("height", 10)
    .text("open");

  gElement
    .select("rect.break")
    .remove();

  gElement
    .select("text.break")
    .remove();

  gElement
    .select("rect.open")
    .on("click", () => {
      thisComposite.open(graph);
      d3.event.stopPropagation();
    });

  gElement
    .select("text.open")
    .on("click", () => {
      thisComposite.open(graph);
      d3.event.stopPropagation();
    });

  D3GraphValidation.isCycle(graph);

  D3Background.updateBackground(graph);

};

/**
 * Breaks the Layer composite and return Layers to the first state
 * @param graph the graph from which to break the Layer composite
 */
D3LayerComposite.prototype.break = function (graph) {
  let thisComposite = this;
  d3.select("#" + thisComposite.htmlID).remove();
  let container = graph.primeAncestorOfId(thisComposite.id);
  if (container == thisComposite) {
    graph.d3Layers = graph.d3Layers.filter(layer => layer != thisComposite);
    thisComposite.children.forEach(child => graph.d3Layers.push(child));
  }
  else {
    container.children = container.children.filter(child => child != thisComposite);
    thisComposite.children.forEach(child => container.children.push(child));
  }
  container.children.forEach(child => child.removeObserver(thisComposite));

  D3Background.updateBackground(graph);
};

D3LayerComposite.loadJSON = function(json, graph) {
  var newChildren = [];
  json.children.forEach(child => newChildren.push(graph.loadComposite(child, graph)));
  let newLayer = new D3LayerComposite(json.id, json.parent || graph, newChildren, json.x, json.y);
  newChildren.forEach(child => { child.setParent(newLayer); });
  newLayer.inputLayers = json.inputLayers;
  newLayer.outputLayers = json.outputLayers;
  newLayer.width = json.width;
  newLayer.height = json.height;
  newLayer.name = json.name;
  newLayer.isOpen = json.isOpen;
  newLayer.d3node = graph.svgD3LayerComposites;
  return newLayer;
};

D3LayerComposite.prototype.getAllContainedLayers = function () {
  let res = [];
  this.children.forEach(child => {
    if (child.class === "D3Layer") {
      res.push(child);
    }
    if (child.class === "D3LayerComposite") {
      child.getAllContainedLayers.forEach(layer => res.push(layer));
    }
  });
  return res;
};

/**
 * Get all Layers in Layer composite in JSON data
 * @returns JSON data containing all the Layers in Layer composite
 */
D3LayerComposite.prototype.getAllContainedJSON = function () {
  let res = [];
  this.children.forEach(child => {
    if (child.class === "D3Layer") {
      res.push(child.toJSON());
    }
    if (child.class === "D3LayerComposite") {
      child.getAllContainedJSON.forEach(json => res.push(json));
    }
  });
  return res;
};
