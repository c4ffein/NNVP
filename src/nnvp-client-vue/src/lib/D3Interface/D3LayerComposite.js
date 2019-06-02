/* eslint-disable */

import * as d3 from 'd3';
import D3Background from './D3Background';
import D3LayerComponent from './D3LayerComponent';
import D3GraphEditor from './D3GraphEditor';
import D3Edge from './D3Edge';
import D3GraphValidation from './D3GraphValidation';

/**
 * Constructor of the Layer composite
 * @param id the ID of the Layer component
 * @param x the horizental position of the Layer component
 * @param y the vertical position of thz Layer component
 * @param childs the set of observables
 */
export default function D3LayerComposite(id, parent, children, x, y) {
  let thisComposite = this;
  let htmlID = "Composite_" + id;
  let name = "Block_" + id;
  D3LayerComponent.call(thisComposite, id, parent, null, x, y, name, htmlID);
  thisComposite.class = "D3LayerComposite";
  thisComposite.d3node = null;
  thisComposite.isOpen = false;
  childs.forEach(child => {
    thisComposite.childs.push(child);
    child.addObserver(thisComposite);
    child.setParent(thisComposite);
  });
  thisComposite.graph = null;
  thisComposite.deleteState = false;
};

D3LayerComposite.prototype = Object.create(D3LayerComponent.prototype);

D3LayerComposite.prototype.clone = function () {
  let res = new D3LayerComposite(this.id, this.parent, null, this.x, this.y, this.name, this.htmlID);
  this.childs.forEach(child => res.childs.push(child.clone()));
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
    thisComposite.childs = thisComposite.childs.filter(child => child != observable);
  }
  if(thisComposite.childs.length <= 0) {
    thisComposite.delete(thisComposite.graph);
    return;
  }
  if (!thisComposite.isOpen) {
    return;
  }

  let x = thisComposite.x;
  let y = thisComposite.y;
  thisComposite.childs.forEach(child => {
    if (child.x + child.width > x) {
      x = child.x + child.width;
    }
    if (child.y + child.height > y) {
      y = child.y + child.height;
    }
  });

  thisComposite.width =  x + 20 - thisComposite.x;
  thisComposite.height = y + 10 - thisComposite.y;

  x = thisComposite.childs[0].x;
  y = thisComposite.childs[0].y;

  thisComposite.childs.forEach(child => {
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
  thisComposite.childs.forEach(child => child.delete(graph));
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
  thisComposite.childs.forEach(child => child.removeInputLayer(layer));
};

/**
 * Removes an output Layer from the Layer composite
 * @param layer which Layer to remove
 */
D3LayerComposite.prototype.removeOutputLayer = function (layer) {
  let thisComposite = this;
  D3LayerComponent.prototype.removeOutputLayer.call(thisComposite, layer);
  thisComposite.childs.forEach(child => child.removeOutputLayer(layer));
};

D3LayerComposite.prototype.drawLayer = function (d3node, graph) {
  let thisComposite = this;
  thisComposite.graph = graph;

  thisComposite.width = 180;
  thisComposite.height = 60;

  thisComposite.d3node = d3node;

  thisComposite.childs.forEach(child => {
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
    child.x = child.x + 20;
    child.y = child.y + thisComposite.height;
  });

  graph.d3Edges.filter(edge => true).forEach(edge => {
    let source = thisComposite.childs.find(child => child == edge.source)? true : false;
    let target = thisComposite.childs.find(child => child == edge.target)? true : false;
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

  let gElement = thisComposite.d3node.append("g");

  gElement
    .attr("class", "D3LayerComposite")
    .attr("id", thisComposite.htmlID);

  gElement
    .append("rect")
    .attr("x", thisComposite.x)
    .attr("y", thisComposite.y)
    .transition()
    .delay(300)
    .attr("width", thisComposite.width)
    .attr("height", thisComposite.height);

  gElement
    .append("text")
    .attr("x", thisComposite.x + 15)
    .attr("y", thisComposite.y + 35)
    .text(thisComposite.name);

  gElement
    .append("rect")
    .attr("class", "button open")
    .attr("x", thisComposite.x + thisComposite.width - 50)
    .attr("y", thisComposite.y + 5)
    .transition()
    .delay(300)
    .attr("width", 45)
    .attr("height", 17)

  gElement
    .append("text")
    .attr("class", "button open")
    .attr("x", thisComposite.x + thisComposite.width - 45)
    .attr("y", thisComposite.y + 17)
    .transition()
    .delay(300)
    .attr("width", 20)
    .attr("height", 10)
    .text("open");

  /*
  gElement
    .on("click", () => {
      if (graph.lastKeyDown === D3GraphEditor.CTRL_KEY) {
        graph.selectOnNode.call(graph, thisComposite);
      }
      else {
        graph.singleSelection.call(graph, thisComposite);
      }
      d3.event.stopPropagation();
    })
  */

  thisComposite.setDrag(graph, gElement);

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

  D3Background.updateBackground(graph);

};

/**
 * Draw a Layer composite
 * @param d3node the set of Layers composite existing
 * @param graph the graph to which add the Layer composite
 */
D3LayerComposite.prototype.drawComposite = function (d3node, graph) {

  let thisComposite = this;

  thisComposite.d3node = d3node;
  thisComposite.graph = graph;

  let gElement = thisComposite.d3node.append("g");

  gElement
    .attr("class", "D3LayerComposite")
    .attr("id", thisComposite.htmlID);

  gElement
    .append("rect")
    .attr("x", thisComposite.x)
    .attr("y", thisComposite.y)
    .attr("width", thisComposite.width)
    .attr("height", thisComposite.height);

  gElement
    .append("text")
    .attr("x", thisComposite.x + 15)
    .attr("y", thisComposite.y + 35)
    .text(thisComposite.name);

  gElement
    .append("rect")
    .attr("class", "button open")
    .attr("x", thisComposite.x + thisComposite.width - 50)
    .attr("y", thisComposite.y + 5)
    .attr("width", 45)
    .attr("height", 17)

  gElement
    .append("text")
    .attr("class", "button open")
    .attr("x", thisComposite.x + thisComposite.width - 45)
    .attr("y", thisComposite.y + 17)
    .attr("width", 20)
    .attr("height", 10)
    .text("open");

  thisComposite.setDrag(graph, gElement);

  if (!thisComposite.isOpen) {

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
  }

  if (thisComposite.isOpen) {

    gElement
      .append("rect")
      .attr("class", "button break")
      .attr("x", thisComposite.x + thisComposite.width - 50)
      .attr("y", thisComposite.y + 28)
      .attr("width", 45)
      .attr("height", 17);

    gElement
      .append("text")
      .attr("class", "button break")
      .attr("x", thisComposite.x + thisComposite.width - 47)
      .attr("y", thisComposite.y + 42)
      .attr("width", 20)
      .attr("height", 10)
      .text("break");

    gElement
      .select("rect.open")
      .text("close")
      .on("click", () => {
        thisComposite.close(graph);
        d3.event.stopPropagation();
      });

    gElement
      .select("text.open")
      .text("close")
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

    thisComposite.childs.forEach(child => {
      if (child.class === "D3Layer") {
        child.drawLayer(child.d3node, graph);
      }
      if (child.class === "D3LayerComposite") {
        child.drawComposite(child.d3node, graph);
      }
    });

    thisComposite.childs.forEach(child => {
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
  }

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
        thisComposite.childs.forEach(child => child.setOrigin());
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

  thisComposite.childs.forEach(child => {
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

  thisComposite.childs.forEach(child => {
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

  thisComposite.childs.forEach(child => {
    if (child.class === "D3Layer") {
      child.drawLayer(child.d3node, graph);
    }
    if (child.class === "D3LayerComposite") {
      child.drawComposite(child.d3node, graph);
    }
  });

  thisComposite.childs.forEach(child => {
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

  thisComposite.childs.forEach(child => {
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
    let source = thisComposite.childs.find(child => child == edge.source)? true : false;
    let target = thisComposite.childs.find(child => child == edge.target)? true : false;
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
    thisComposite.childs.forEach(child => graph.d3Layers.push(child));
  }
  else {
    container.childs = container.childs.filter(child => child != thisComposite);
    thisComposite.childs.forEach(child => container.childs.push(child));
  }
  container.childs.forEach(child => child.removeObserver(thisComposite));

  D3Background.updateBackground(graph);
};

D3LayerComposite.loadJSON = function(json, graph) {
  var newChildren = [];
  json.childs.forEach(child => newChilds.push(graph.loadComposite(child, graph)));
  let newLayer = new D3LayerComposite(json.id, json.parent || graph, newChilds, json.x, json.y);
  newChilds.forEach(child => { child.setParent(newLayer); });
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
  this.childs.forEach(child => {
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
  this.childs.forEach(child => {
    if (child.class === "D3Layer") {
      res.push(child.toJSON());
    }
    if (child.class === "D3LayerComposite") {
      child.getAllContainedJSON.forEach(json => res.push(json));
    }
  });
  return res;
};
