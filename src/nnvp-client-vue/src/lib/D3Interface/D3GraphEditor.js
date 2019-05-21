/* eslint-disable */

import * as d3 from 'd3';
import D3Edge from './D3Edge';
import D3Layer from './D3Layer';
import D3CompositeLayer from './D3CompositeLayer';
import D3Background from './D3Background';
import D3GraphValidation from './D3GraphValidation';

var MARGIN_PAGE = 50;

var MAP_HEIGHT = 500;
var MAP_WIDTH = 960;
var MAP_X = MARGIN_PAGE;
var MAP_Y = MARGIN_PAGE;

var MAX_TRANSLATE_X = MAP_X + MAP_WIDTH - MARGIN_PAGE;
var MIN_TRANSLATE_X = MAP_X - MAP_WIDTH/2;

var MAX_TRANSLATE_Y = MAP_Y + MAP_HEIGHT - MARGIN_PAGE;
var MIN_TRANSLATE_Y = MAP_Y - MAP_HEIGHT/2 ;

/**
 * Constructor of the graph editor
 * @param svg the area where to create the graph
 * @param d3Layers the set of Layers of the graph
 * @param d3Edges the set of edges of the graph
 */
export default function D3GraphEditor(svg, d3Layers, d3Edges) {

  let thisGraph = this;

  // Whiteboard's dimension and position
  thisGraph.minHeight = MAP_HEIGHT;
  thisGraph.minWidth = MAP_WIDTH;
  thisGraph.mapHeight = MAP_HEIGHT;
  thisGraph.mapWidth = MAP_WIDTH;
  thisGraph.mapX = MAP_X;
  thisGraph.mapY = MAP_Y;

  // Set the default limits out of the whiteboard
  // It's D3Background.updateBackground that really define limits
  thisGraph.minTranslateX = MIN_TRANSLATE_X;
  thisGraph.maxTranslateX = MAX_TRANSLATE_X;
  thisGraph.minTranslateY = MIN_TRANSLATE_Y;
  thisGraph.maxTranslateY = MAX_TRANSLATE_Y;
  // Help to set the limits out of the whiteboard
  thisGraph.marginPage = MARGIN_PAGE;

  thisGraph.gTransform = d3.zoomIdentity.translate(0, 0).scale(1);

  // Graph's edges and nodes
  thisGraph.d3Layers = d3Layers || [];
  thisGraph.d3Edges = d3Edges || [];

  // ID's counter
  thisGraph.nodeId = 0;

  // The event's variables. Their state change according to certain events
  thisGraph.selectedNodes = [];
  thisGraph.selectedEdge = null;
  thisGraph.mouseover_node = null;
  thisGraph.selectedText = null;
  thisGraph.layerDrag = false;

  thisGraph.undoStack = [];
  thisGraph.redoStack = [];

  thisGraph.nodesCopy = []

  // Svg is the html tag svg selected with d3.select()
  thisGraph.svg = svg;

  // BE CARFUL: order to the next line is IMPORTANT,
  // It create html tag, and the order of the tag's define the priorities
  // When there is some overlap (crossover) between elements

  // Init The Maker needed to draw edges
  D3Edge.createMakerHtml(thisGraph.svg);

  // Create the whiteboard's background
  D3Background.createBackground(thisGraph.svg);

  // Create the first g html tag needed for drag event:
  // Only elements in g element can be drag
  thisGraph.svgG = svg.append("g");

  // Create 8 rectangle at the border to add extensible function
  let border = thisGraph.svgG.append("g").attr("class", "border");
  D3Background.createBorder(border);

  // Create the Whiteboard
  D3Background.createWhiteboard(thisGraph.svgG);

  this.svgD3CompositeLayers = thisGraph.svgG.append("g").attr("class", "d3CompositeLayers");

  // Init the egde displayed when dragging between nodes
  thisGraph.dragLine = D3Edge.createDragLine(thisGraph.svgG);

  // Create two elements to contain respectively nodes and edges
  this.svgD3Edges = thisGraph.svgG.append("g").attr("class", "d3Edges");
  this.svgD3Layers = thisGraph.svgG.append("g").attr("class", "d3Layers");
  // Create g element for layer shape when drag from letfbar
  thisGraph.svgG.append("g").attr("id", "dragFromLeftbar");

  // Add Listener on the border to extend the white page
  let borderListener = thisGraph.svgG.append("g").attr("class", "borderListener");
  D3Background.createListenerBorder(thisGraph, borderListener);

  // Draw all the Background if Whiteboard, Borders and ListenerBorders are created
  D3Background.updateBackground(thisGraph);

  // Set two operation on d3 zoom event
  // First the moves and zoom on the WhiteBoard
  // Second the multiple selection with a rectangle
  let origineSelection = null;
  let transformOrigin = null
  thisGraph.svg.call(d3.zoom()
    .scaleExtent([0.5, 2.5])
    .on("start", () => {
      //transformOrigin = {x: d3.event.transform.x, y: d3.event.transform.y};
      // If shiftKey is down, trigger multiple selection
      if (d3.event.sourceEvent.shiftKey) {
        thisGraph.svgG.append("g").attr("id", "selectionRect").selectAll("rect")
          .data([origineSelection = {x:d3.mouse(thisGraph.svgG.node())[0], y:d3.mouse(thisGraph.svgG.node())[1]}])
          .enter()
          .append('rect')
          .attr("x", d => d.x)
          .attr("y", d => d.y)
          .attr("width", 0)
          .attr("height", 0);
      }
    })
    .on("zoom", () => {
      // During the zoom (drag + wheel on mouse)
      // If shiftKey isn't down, apply the transformation on all the svgG using attribute transform
      if (!(d3.event.sourceEvent.shiftKey)) {
        thisGraph.zoomed.call(thisGraph);
      }
      // else, extend or reduce the selection's rectangle
      else {
        d3.select("#selectionRect").selectAll("rect")
          .attr("x", d =>
              d3.mouse(thisGraph.svgG.node())[0] < d.x ?
                d3.mouse(thisGraph.svgG.node())[0]: d.x
          )
          .attr("y", d =>
              d3.mouse(thisGraph.svgG.node())[1] < d.y ?
                d3.mouse(thisGraph.svgG.node())[1]: d.y
          )
          .attr("width", d => Math.abs(d3.mouse(thisGraph.svgG.node())[0] - d.x))
          .attr("height", d => Math.abs(d3.mouse(thisGraph.svgG.node())[1] - d.y));
      }
    })
    .on("end", () => {
      // If a selection's rectangle exist, select all nodes (layer) in
      if (d3.select("#selectionRect").node()) {
        d3.event.transform.x = thisGraph.gTransform.x;
        d3.event.transform.y = thisGraph.gTransform.y;
        //d3.event.transform.x = transformOrigin.x;
        //d3.event.transform.y = transformOrigin.y;
        d3.select("#selectionRect").remove();
        let d = origineSelection;
        // Define LeftTop position and RightBottom position of the selection's rectangle
        let topX = d3.mouse(thisGraph.svgG.node())[0] < d.x ? d3.mouse(thisGraph.svgG.node())[0] : d.x;
        let bottomX = d3.mouse(thisGraph.svgG.node())[0] < d.x ? d.x : d3.mouse(thisGraph.svgG.node())[0];
        let topY = d3.mouse(thisGraph.svgG.node())[1] < d.y ? d3.mouse(thisGraph.svgG.node())[1] : d.y;
        let bottomY = d3.mouse(thisGraph.svgG.node())[1] < d.y ? d.y : d3.mouse(thisGraph.svgG.node())[1];
        // Call the multipleSelection with the postion previously calculated
        thisGraph.multipleSelection(topX,topY,bottomX,bottomY);
      }
      else {
        // default function to move on the whiteboard and zoom with the wheel
        thisGraph.endZoomed.call(thisGraph);
      }
    })
  );
  // Remove zoom action on dblclick event
  thisGraph.svg.on("dblclick.zoom", null);

  // If a click occur directely on the svg and not node call undoSelection
  thisGraph.svg.on('click', (d, event) => {
    thisGraph.undoSelection();
  });
};

/**
 * Call when a rectangle for multiple selction is apply
 * Top mean LeftTop and bottom mean RightBottom
 * @param topX the top border of the rectangle of selection
 * @param topY the left border of the rectangle of selection
 * @param bottomX the bottom border of the rectangle of selection
 * @param bottomY the right border of the rectangle of selection
 */
D3GraphEditor.prototype.multipleSelection = function (topX, topY, bottomX, bottomY) {
  this.undoSelection();
  this.d3Layers.forEach( node => {
    // Node selected when his LeftTop position can be catch
    // But when when node is above or to the left we need to extend the selection's rectangle with node's height and width
    // If his LeftTop position cannot be catch, the node is not in the selection's rectangle
    if (node.class !== "D3CompositeLayer") {
      let inX = ((node.x > topX-node.width && node.x < bottomX)? true : false);
      let inY = ((node.y > topY-node.height && node.y < bottomY)? true : false);
      if (inX && inY) {
        this.selectOnNode(node);
      }
    }
  });
};

/**
 * Call to select one node
 * @param node which node to select
 */
D3GraphEditor.prototype.singleSelection = function (node) {
  this.undoSelection();
  this.selectOnNode(node);
};

/**
 * Add or remove if already selected, node to selectedNodes
 * @param node which node to select or to remove selection
 */
D3GraphEditor.prototype.selectOnNode = function (node) {
  if(this.selectedEdge) {
    d3.select("#" + this.selectedEdge.id).classed("selected", false);
    this.selectedEdge = null;
  }
  this.selectedNodes.forEach(selectedNode => {
    if (selectedNode == node) {
      // Remove the html class selected
      d3.select("#" + node.htmlID).classed("selected", false);
      this.selectedNodes.splice(this.selectedNodes.indexOf(selectedNode), 1);
    }
  });
  // Add the html class selected when selectedEdge
  // Like this CSS can identified selected node
  d3.select("#" + node.htmlID).classed("selected", true);
  this.selectedNodes.push(node);
};

/**
 * Call when we need to undo the selection
 */
D3GraphEditor.prototype.undoSelection = function () {
  if(this.selectedEdge != null) {
    d3.select("#" + this.selectedEdge.id).classed("selected", false);
    this.selectedEdge = null;
  }
  if (this.selectedNodes.length > 0) {
    this.selectedNodes.forEach( node => {
      // For each node remove the class selected
      d3.select("#" + node.htmlID).classed("selected", false);
    });
  }
  // Next line is implemented that way to keep Vue getters and setters
  this.selectedNodes.splice(0, this.selectedNodes.length);
};

/**
 * Call when we select an edge
 * @param edge which edge to select
 */
D3GraphEditor.prototype.selectEdge = function (edge) {
  this.undoSelection();
  d3.select("#" + edge.id).classed("selected", true);
  this.selectedEdge = edge;
};

/**
 * Call when we select a Layer composite
 */
D3GraphEditor.prototype.createComposite = function () {
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
  let newComposite = new D3CompositeLayer(this.getNodeId(), x, y, this.selectedNodes);
  newComposite.drawLayer(this.svgD3CompositeLayers, this);
  this.selectedNodes.forEach(selectedNode => {
    this.d3Layers.forEach(layer => {
      if (selectedNode == layer) {
        this.d3Layers.splice(this.d3Layers.indexOf(layer), 1);
      }
    });
  });
  this.d3Layers.push(newComposite);
  this.undoSelection();
}

/**
 * Call to move the drag line from source to the target point define by the mouse
 * @param source which Layer to drag from
 */
D3GraphEditor.prototype.moveDragLine = function (source) {
  let target = {x: d3.mouse(this.svgG.node())[0], y:d3.mouse(this.svgG.node())[1]};
  D3Edge.moveDragLine(this.dragLine, source, target);
}

/**
 * Call on d3 zoom action, allow to move on the whiteboard and zoom with the wheel
 */
D3GraphEditor.prototype.zoomed = function () {
  this.gTransform = d3.event.transform;
  this.svgG.attr("transform", d3.event.transform);
};

/**
 * Limitation of the zoom
 */
D3GraphEditor.prototype.endZoomed = function () {
  // Limit the move with minTranslate and maxTranslate to prevent to be out of the map
  if(this.gTransform.x > -this.minTranslateX * this.gTransform.k)
    this.gTransform.x = -this.minTranslateX * this.gTransform.k;
  else if (this.gTransform.x < -this.maxTranslateX * this.gTransform.k)
    this.gTransform.x = -this.maxTranslateX * this.gTransform.k;
  if(this.gTransform.y > -this.minTranslateY * this.gTransform.k)
    this.gTransform.y = -this.minTranslateY * this.gTransform.k;
  else if (this.gTransform.y < -this.maxTranslateY * this.gTransform.k)
    this.gTransform.y = -this.maxTranslateY * this.gTransform.k;
  // Replace the background if out of the map and add transition to avoid teleport on the new position
  this.svgG
    .transition()
    .duration(200)
    .attr("transform", this.gTransform);
};

/**
 * Call when adding a layer, when no position is given, set it to (this.mapX + 10), (this.mapY + 10)
 * @param kerasLayer the Keras type of the Layer to add
 * @param posX the horizental position of the Layer to add
 * @param posY the vertical position of the Layer to add
 */
D3GraphEditor.prototype.addLayer = function (kerasLayer, posX, posY) {
  // Before change occur save the cuurent State - needed to allow undo;
  this.saveState();
  let newLayer = new D3Layer(kerasLayer, this.getNodeId(), posX || (this.mapX + 10) , posY || (this.mapY + 10))
  this.d3Layers.push(newLayer);
  newLayer.drawLayer(this.svgG.select("g.d3Layers"), this);
  //this.updateGraph();
  D3Background.updateBackground(this);
};

/**
 * Get an ID not used between 0 and Number.MAX_SAFE_INTEGER
 * @returns an ID of a node
 */
D3GraphEditor.prototype.getNodeId = function () {
  while(this.getLayerById(this.nodeId)) {
    if (++this.nodeId >= Number.MAX_SAFE_INTEGER) {
      this.nodeId = 0;
    }
  }
  return this.nodeId;
};

/**
 * Updates the graph (Layers and Edges)
 */
D3GraphEditor.prototype.updateGraph = function () {
  let thisGraph = this;


  thisGraph.d3Edges.forEach(edge => edge.remove());
  // Update D3Edges
  thisGraph.d3Edges.forEach(edge => edge.drawEdge(thisGraph.svgD3Edges, thisGraph));
  //D3Edge.drawEdges(thisGraph.svgG.select("g.d3Edges"), thisGraph);

  thisGraph.d3Layers.forEach(layer => layer.remove());
  // Update D3Layers
  thisGraph.d3Layers.forEach(layer => {
    if (layer.class === "D3Layer") {
      layer.drawLayer(thisGraph.svgD3Layers, thisGraph);
    }
    if (layer.class === "D3CompositeLayer") {
      layer.drawComposite(thisGraph.svgD3CompositeLayers, thisGraph);
    }
  });
  D3GraphValidation.isCycle(thisGraph);
  //D3Layer.drawLayers(thisGraph.svgG.select("g.d3Layers"), thisGraph);
  // Update whiteboard dimension
  D3Background.updateBackground(thisGraph);
};

D3GraphEditor.prototype.deleteSelectedElements = function () {
  var thisGraph = this;
  if (thisGraph.selectedNodes.length > 0) {
    // Before change occur save the cuurent State - needed to allow undo;
    thisGraph.saveState();
    thisGraph.selectedNodes.forEach( selectedNode => {
      let old_edges = thisGraph.d3Edges.filter(edge => edge.source == selectedNode || edge.target == selectedNode);
      thisGraph.d3Edges = thisGraph.d3Edges.filter(edge => edge.source != selectedNode && edge.target != selectedNode);
      thisGraph.d3Layers = thisGraph.d3Layers.filter(layer => layer != selectedNode);
      // delete operation need to be call after the change occur on d3Edges and d3Layers
      selectedNode.delete(thisGraph);
      old_edges.forEach(edge => edge.delete(thisGraph));
    })
    // Next line is implemented that way to keep Vue getters and setters
    thisGraph.selectedNodes.splice(0, thisGraph.selectedNodes.length);
    D3Background.updateBackground(thisGraph);
  }
  if (thisGraph.selectedEdge !== null) {
    this.saveState();
    thisGraph.d3Edges.splice(thisGraph.d3Edges.indexOf(thisGraph.selectedEdge), 1);
    thisGraph.selectedEdge.delete(thisGraph);
    thisGraph.selectedEdge = null;
  }
};

D3GraphEditor.prototype.dragged = function (layer) {
  if (this.selectedNodes.find(node => node == layer) == null) {
    return;
  }
  this.selectedNodes.forEach(node => {
    if(layer != node) {
      node.update(layer);
    }
  });
};

/**
 * Call to handle when the button mouse is push on a node to create an edge
 * @param node mouse down on node
 */
D3GraphEditor.prototype.layerMouseDown = function (node) {
  this.mouseDownNode = node;
  // Display the dragLine
  this.dragLine.classed('hidden', false);
};

/**
 * Call to handle when the button mouse is unlock on a node to create an edge
 * @param layer mouse up on layer
 */
D3GraphEditor.prototype.layerMouseUp = function (layer) {
  let thisGraph = this;
  // Hide the dragLine
  thisGraph.dragLine.classed("hidden", true).attr('d', 'M0,0L0,0');
  if (thisGraph.mouseDownNode == null || layer == null) {
    return;
  }
  if (thisGraph.mouseDownNode != layer) {
    let filtRes1 = thisGraph.d3Edges.filter( edge =>
      (edge.source == thisGraph.mouseDownNode && edge.target == layer)
    );
    if (filtRes1.length > 0) {
      return;
    };
    thisGraph.saveState();
    // Remove edge between the two node that already exist
    let newEdge = new D3Edge(thisGraph.mouseDownNode, layer);
    let filtRes2 = thisGraph.d3Edges.filter( edge =>
      (edge.source == newEdge.target && edge.target == newEdge.source)
    );
    filtRes2.forEach( edge => {
      thisGraph.d3Edges.splice(thisGraph.d3Edges.indexOf(edge), 1);
      edge.delete(thisGraph);
    });
    newEdge.source.addOutputLayer(newEdge.target);
    newEdge.target.addInputLayer(newEdge.source);
    // We're in a different node: create new edge for mousedown edge and add to graph
    thisGraph.d3Edges.push(newEdge);
    // drawEdge need to be call after the change occur on d3Edges and d3Layers
    newEdge.drawEdge(thisGraph.svgD3Edges, thisGraph);
    //thisGraph.updateGraph();
    D3Background.updateBackground(thisGraph);
  }
  thisGraph.mouseDownNode = null;
};

/**
 * Save the current State to allow undo
 */
D3GraphEditor.prototype.saveState = function () {
  let thisGraph = this;
  // Next line is implemented that way to keep Vue getters and setters
  thisGraph.redoStack.splice(0, thisGraph.redoStack.length);
  thisGraph.undoStack.push(thisGraph.toJSON());
};

/**
 * Loads a state of a graph
 * @param txtRes the state of a graph in JSON data
 */
D3GraphEditor.prototype.loadState = function (txtRes) {
  let thisGraph = this;
  var jsonObj = JSON.parse(txtRes);
  thisGraph.clearBoard(true);
  var jsonLayers = jsonObj.layers;
  var newLayers = [];
  jsonLayers.forEach(jsonLayer =>
    newLayers.push(thisGraph.loadComposite(jsonLayer))
  );
  thisGraph.d3Layers = newLayers;
  var newEdges = jsonObj.edges;
  newEdges.forEach(function (e, i) {
    let source = thisGraph.getLayerById(e.source);
    let target = thisGraph.getLayerById(e.target);
    newEdges[i] = new D3Edge (source , target);
  });
  thisGraph.d3Edges = newEdges;
  thisGraph.updateGraph();
};

/**
 * Undo to a state
 */
D3GraphEditor.prototype.undo = function () {
  let thisGraph = this;
  if (thisGraph.undoStack.length <= 0) {
    return;
  }
  thisGraph.redoStack.push(thisGraph.toJSON());
  let txtRes = thisGraph.undoStack.pop();
  thisGraph.loadState(txtRes);
};

/**
 * Redo to a state
 */
D3GraphEditor.prototype.redo = function () {
  let thisGraph = this;
  if (thisGraph.redoStack.length <= 0) {
      return;
  };
  thisGraph.undoStack.push(thisGraph.toJSON());
  let txtRes = thisGraph.redoStack.pop();
  thisGraph.loadState(txtRes);
};

/**
 * Converts the current state to JSON data
 * @returns a JSON data
 */
D3GraphEditor.prototype.toJSON = function () {
  let thisGraph = this;
  let savedEdges = [];
  let savedLayers = [];
  thisGraph.d3Layers.forEach(layer => savedLayers.push(layer.toJSON()));
  thisGraph.d3Edges.forEach(edge => savedEdges.push(edge.toJSON()));
  return window.JSON.stringify({ "layers": savedLayers, "edges": savedEdges }, { type: "text/plain;charset=utf-8" });
};

/**
 * Save graph to json
 */
D3GraphEditor.prototype.saveBoard = function () {
  saveAs(new Blob([this.toJSON()]), "myModel.json");
};

/**
 * Generates Python code directly on the client.
 * Cannot profit from Keras validation for now.
 */
D3GraphEditor.prototype.generatePythonInBrowser = function (kerasInterface) {
  const generatedPython = kerasInterface.generatePython(this.toJSON());
  saveAs(new Blob([generatedPython]), "myModel.py");
}

/**
 * Generates Python code from current state of the graph
 * @param backendUrl address to the backend
 * @returns a Python file
 */
D3GraphEditor.prototype.generatePythonOnBackend = function (backendUrl) {
  let toJSON = [];
  this.d3Layers.forEach(layer => {
    if (layer.class === "D3Layer") {
      toJSON.push(layer.toJSON());
    }
    if (layer.class === "D3CompositeLayer") {
      layer.getAllContainedJSON().forEach(json => toJSON.push(json));
    }
  });
  let jsonFile = window.JSON.stringify({ "layers": toJSON }, { type: "text/plain;charset=utf-8" });
  console.log(jsonFile);
  console.log(backendUrl);
  let paramPost = {
    method: "POST",
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: jsonFile,
    //body: this.toJSON(),
  }

  fetch(backendUrl, paramPost)
    .then((response) => {
      if (!response.ok) {
        throw Error(response.statusText);
      }
      return response;
    })
    .then((response) => response.json())
    .then((response) => {
      if(response.file === undefined) {
        throw Error('nofile');
      }
      return saveAs(new Blob([response.file]), "myModel.py");
    });
};

/**
 * Get a Layer by hid ID
 * @param id the ID of the Layer to get
 * @returns true if the Layer exists else null
 */
D3GraphEditor.prototype.getLayerById = function (id) {
  let res = null;
  this.d3Layers.forEach(layer => {
    let tmp = layer.getLayerById(id);
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
D3GraphEditor.prototype.primeAncestorOfId = function (id) {
  let res = null;
  this.d3Layers.forEach(layer => {
    let tmp = layer.getLayerById(id);
    if (tmp !== null) {
      res = layer;
    }
  });
  return res;
};

/**
 * Load a composite to the graph
 * @param jsonLayer JSON that contains the set of Layers of the composite
 * @returns a Layer
 */
D3GraphEditor.prototype.loadComposite = function (jsonLayer) {
  var thisGraph = this;
  let res = null;
  if (jsonLayer.class === "D3Layer") {
    res = D3Layer.loadJSON(jsonLayer, this);
  }
  if (jsonLayer.class === "D3CompositeLayer") {
    res = D3CompositeLayer.loadJSON(jsonLayer, this);
  }
  return res;
};

/**
 * load graph
 * @param uploadFileEvent the file that contains the JSON of the graph to upload
 */
D3GraphEditor.prototype.uploadToBoard = function (uploadFileEvent) {
  if (window.File && window.FileReader && window.FileList && window.Blob) {
    var uploadFile = uploadFileEvent.files[0];
    var thisGraph = this;
    var filereader = new window.FileReader();

    filereader.onload = function () {
      try {
        thisGraph.saveState();
        var txtRes = filereader.result;
        var jsonObj = JSON.parse(txtRes);
        thisGraph.clearBoard(true);
        var jsonLayers = jsonObj.layers;
        var newLayers = [];
        jsonLayers.forEach(jsonLayer =>
          newLayers.push(thisGraph.loadComposite(jsonLayer))
        );
        thisGraph.d3Layers = newLayers;
        var newEdges = jsonObj.edges;
        newEdges.forEach(function (e, i) {
          let source = thisGraph.getLayerById(e.source);
          let target = thisGraph.getLayerById(e.target);
          newEdges[i] = new D3Edge (source , target);
        });
        thisGraph.d3Edges = newEdges;
        thisGraph.updateGraph();
      }
      catch (error) {
        console.error(error);
      }
    };

    filereader.readAsText(uploadFile);
  }
  else {
    alert("Your browser won't let you save this graph -- try upgrading your browser to IE 10+ or Chrome or Firefox.");
  }
};

/**
 * Deletes all the graph
 * @param skipPrompt if clicked on skip
 */
D3GraphEditor.prototype.clearBoard = function (skipPrompt) {
  let thisGraph = this,
    doDelete = true;
  if (!skipPrompt) {
    doDelete = window.confirm("Press OK to delete this graph");
  }
  if (doDelete) {
    thisGraph.d3Layers = [];
    thisGraph.d3Edges = [];
    thisGraph.svgD3Edges.selectAll("g").remove();
    thisGraph.svgD3Layers.selectAll("g").remove();
    thisGraph.svgD3CompositeLayers.selectAll("g").remove();
  }
};

/**
 * Function create to assign a drag and drop event from the leftbar
 * Allow to assign this event on a htmlElement
 * @param layer the Layer to create after the drag
 * @param htmlElement the element to drag from the LeftBar
 */
D3GraphEditor.prototype.addEventHandlerDragOnHtmlClass = function (layer, htmlElement) {
  let thisGraph = this;
  let origine = { x: 0, y: 0 };
  d3.select(htmlElement)
    .attr("draggable", "true")
    .call(d3.drag()
      .subject( () => {
        origine.x = d3.mouse(thisGraph.svgG.node())[0];
        origine.y =  d3.mouse(thisGraph.svgG.node())[1];
        return origine;
      })
      .on("start", () => {
        thisGraph.layerDrag = true;
        d3.select("#dragFromLeftbar").append("rect")
          .attr("x", d3.mouse(thisGraph.svgG.node())[0])
          .attr("y", d3.mouse(thisGraph.svgG.node())[1])
          .attr("height", 40)
          .attr("width", 90)
          .style("fill", "none")
          .style("stroke", "black");
      })
      .on("drag", () =>
        d3.select("#dragFromLeftbar").selectAll("rect")
          .attr("x", d3.mouse(thisGraph.svgG.node())[0])
          .attr("y", d3.mouse(thisGraph.svgG.node())[1])
      )
      .on("end", () => {
        thisGraph.layerDrag = false;
        const targetElement = d3.event.sourceEvent.target;
        for(let el = targetElement; el != null; el = el.parentElement){
          if(el.id == "svgWrapper")
            thisGraph.addLayer(layer.clone(), d3.mouse(thisGraph.svgG.node())[0], d3.mouse(thisGraph.svgG.node())[1]);
        }
        d3.select("#dragFromLeftbar").selectAll("rect").remove();
      })
    );
};
