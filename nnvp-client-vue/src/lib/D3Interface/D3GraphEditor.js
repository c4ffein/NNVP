/* eslint-disable */

import * as d3 from 'd3';
import D3Model from './D3Model';
import D3Edge from './D3Edge';
import D3Layer from './D3Layer';
import D3LayerComposite from './D3LayerComposite';
import D3Background from './D3Background';
import D3GraphValidation from './D3GraphValidation';
import D3Templates from './D3Templates';

var MARGIN_PAGE = 50;

var MAP_HEIGHT = 500;
var MAP_WIDTH = 960;
var MAP_X = MARGIN_PAGE;
var MAP_Y = MARGIN_PAGE;

var MAX_TRANSLATE_X = MAP_X + MAP_WIDTH - MARGIN_PAGE;
var MIN_TRANSLATE_X = MAP_X - MAP_WIDTH/2;

var MAX_TRANSLATE_Y = MAP_Y + MAP_HEIGHT - MARGIN_PAGE;
var MIN_TRANSLATE_Y = MAP_Y - MAP_HEIGHT/2 ;

export default function D3GraphEditor(svg, model) {
  let thisGraph = this;

  // Whiteboard's dimension and position
  this.minHeight = MAP_HEIGHT;
  this.minWidth = MAP_WIDTH;
  this.mapHeight = MAP_HEIGHT;
  this.mapWidth = MAP_WIDTH;
  this.mapX = MAP_X;
  this.mapY = MAP_Y;

  // Set the default limits out of the whiteboard
  // It's D3Background.updateBackground that really define limits
  this.minTranslateX = MIN_TRANSLATE_X;
  this.maxTranslateX = MAX_TRANSLATE_X;
  this.minTranslateY = MIN_TRANSLATE_Y;
  this.maxTranslateY = MAX_TRANSLATE_Y;
  // Help to set the limits out of the whiteboard
  this.marginPage = MARGIN_PAGE;

  this.gTransform = d3.zoomIdentity.translate(0, 0).scale(1);

  this.model = model || new D3Model(undefined, undefined, this);
  this.templates = new D3Templates();

  // Debug flag for event logging (set to true to see click/drag events in console)
  this.debugEvents = false;

  // ID's counter
  this.nodeId = 0;

  // The event's variables. Their state change according to certain events
  this.selectedNodes = [];
  this.selectedEdge = null;
  this.mouseover_node = null;
  this.selectedText = null;
  this.layerDrag = false;

  // Click-to-link mode state
  this.linkMode = false;
  this.linkSourceLayer = null;
  this.linkSourceHandle = null;

  // Callback for selection changes (registered by D3Interface)
  this.selectionChangedCallback = null;

  this.undoStack = [];
  this.redoStack = [];

  this.nodesCopy = []

  // Svg is the html tag svg selected with d3.select()
  this.svg = svg;

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

  // Init the egde displayed when dragging between nodes
  thisGraph.dragLine = D3Edge.createDragLine(thisGraph.svgG);

  // Container specially for composites, define it before layers to temporarily fix legacy bug
  this.svgD3LayerComposites = thisGraph.svgG.append("g").attr("class", "d3LayerComposites");
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
    .on("start", event => {
      //transformOrigin = {x: event.transform.x, y: event.transform.y};
      // If shiftKey is down, trigger multiple selection
      if (event.sourceEvent.shiftKey) {
        thisGraph.svgG.append("g").attr("id", "selectionRect").selectAll("rect")
          .data([origineSelection = {
            x:d3.pointer(event, thisGraph.svgG.node())[0], y:d3.pointer(event, thisGraph.svgG.node())[1]
          }])
          .enter()
          .append('rect')
          .attr("x", d => d.x)
          .attr("y", d => d.y)
          .attr("width", 0)
          .attr("height", 0);
      }
    })
    .on("zoom", event => {
      // During the zoom (drag + wheel on mouse)
      // If shiftKey isn't down, apply the transformation on all the svgG using attribute transform
      if (!(event.sourceEvent.shiftKey)) {
        thisGraph.zoomed.call(thisGraph, event);
      }
      // else, extend or reduce the selection's rectangle
      else {
        d3.select("#selectionRect").selectAll("rect")
          .attr("x", d =>
              d3.pointer(event, thisGraph.svgG.node())[0] < d.x ?
                d3.pointer(event, thisGraph.svgG.node())[0]: d.x
          )
          .attr("y", d =>
              d3.pointer(event, thisGraph.svgG.node())[1] < d.y ?
                d3.pointer(event, thisGraph.svgG.node())[1]: d.y
          )
          .attr("width", d => Math.abs(d3.pointer(event, thisGraph.svgG.node())[0] - d.x))
          .attr("height", d => Math.abs(d3.pointer(event, thisGraph.svgG.node())[1] - d.y));
      }
    })
    .on("end", event => {
      // If a selection's rectangle exist, select all nodes (layer) in
      if (d3.select("#selectionRect").node()) {
        event.transform.x = thisGraph.gTransform.x;
        event.transform.y = thisGraph.gTransform.y;
        //event.transform.x = transformOrigin.x;
        //event.transform.y = transformOrigin.y;
        d3.select("#selectionRect").remove();
        let d = origineSelection;
        // Define LeftTop position and RightBottom position of the selection's rectangle
        let topX = d3.pointer(event, thisGraph.svgG.node())[0] < d.x ? d3.pointer(event, thisGraph.svgG.node())[0] : d.x;
        let bottomX = d3.pointer(event, thisGraph.svgG.node())[0] < d.x ? d.x : d3.pointer(event, thisGraph.svgG.node())[0];
        let topY = d3.pointer(event, thisGraph.svgG.node())[1] < d.y ? d3.pointer(event, thisGraph.svgG.node())[1] : d.y;
        let bottomY = d3.pointer(event, thisGraph.svgG.node())[1] < d.y ? d.y : d3.pointer(event, thisGraph.svgG.node())[1];
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
    // Exit link mode if active
    if (thisGraph.linkMode) {
      thisGraph.exitLinkMode();
    }
  });

  // Add ESC key handler to cancel link mode
  d3.select(document).on('keydown', (event) => {
    if (event.key === 'Escape' && thisGraph.linkMode) {
      thisGraph.exitLinkMode();
    }
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
  this.model.d3Layers.forEach( node => {
    // Node selected when his LeftTop position can be catch
    // But when when node is above or to the left we need to extend the selection's rectangle with node's height and width
    // If his LeftTop position cannot be catch, the node is not in the selection's rectangle
    if (node.class !== "D3LayerComposite") {
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
  // Notify selection change via callback
  if (this.selectionChangedCallback) {
    this.selectionChangedCallback();
  }
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
  // Notify selection change via callback
  if (this.selectionChangedCallback) {
    this.selectionChangedCallback();
  }
};

/**
 * Call when we select an edge
 * @param edge which edge to select
 */
D3GraphEditor.prototype.selectEdge = function (edge) {
  this.undoSelection();
  d3.select("#" + edge.id).classed("selected", true);
  this.selectedEdge = edge;
  // Notify selection change via callback
  if (this.selectionChangedCallback) {
    this.selectionChangedCallback();
  }
};

/**
 * Call to move the drag line from source to the target point define by the mouse
 * @param source which Layer to drag from
 */
D3GraphEditor.prototype.moveDragLine = function (event, source) {
  let target = {x: d3.pointer(event, this.svgG.node())[0], y:d3.pointer(event, this.svgG.node())[1]};
  D3Edge.moveDragLine(this.dragLine, source, target);
}

/**
 * Exit click-to-link mode and clean up visual feedback
 */
D3GraphEditor.prototype.exitLinkMode = function () {
  if (this.linkSourceHandle) {
    this.linkSourceHandle.classed("link-source-active", false);
  }
  d3.select("body").style("cursor", null);
  this.linkMode = false;
  this.linkSourceLayer = null;
  this.linkSourceHandle = null;
};

/**
 * Register a callback to be called when selection changes
 * @param callback Function to call when selection changes
 */
D3GraphEditor.prototype.onSelectionChanged = function (callback) {
  this.selectionChangedCallback = callback;
};

/**
 * Call on d3 zoom action, allow to move on the whiteboard and zoom with the wheel
 */
D3GraphEditor.prototype.zoomed = function (event) {
  this.gTransform = event.transform;
  this.svgG.attr("transform", event.transform);
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
  const newLayer = this.model.addLayer(this.getNodeId(), kerasLayer,  posX || (this.mapX + 10) , posY || (this.mapY + 10));
  newLayer.drawLayer(this);
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
  this.model.d3Edges.forEach(edge => edge.remove());
  this.model.d3Edges.forEach(edge => edge.drawEdge(this.svgD3Edges, this));
  //D3Edge.drawEdges(thisGraph.svgG.select("g.d3Edges"), thisGraph);

  this.model.d3Layers.forEach(layer => layer.remove());
  this.model.d3Layers.forEach(layer => layer.drawLayer(this));

  D3GraphValidation.isCycle(this);
  //D3Layer.drawLayers(thisGraph.svgG.select("g.d3Layers"), thisGraph);
  // Update whiteboard dimension
  D3Background.updateBackground(this);
};

D3GraphEditor.prototype.deleteSelectedElements = function () {
  var thisGraph = this;
  if (thisGraph.selectedNodes.length > 0) {
    // Before change occur save the cuurent State - needed to allow undo;
    this.saveState();
    this.selectedNodes.forEach( selectedNode => {
      let old_edges = this.model.d3Edges.filter(edge => edge.source == selectedNode || edge.target == selectedNode);
      this.model.d3Edges = this.model.d3Edges.filter(edge => edge.source != selectedNode && edge.target != selectedNode);
      this.model.d3Layers = this.model.d3Layers.filter(layer => layer != selectedNode);
      // delete operation need to be call after the change occur on d3Edges and d3Layers
      selectedNode.delete(this);
      old_edges.forEach(edge => edge.delete(this));
    })
    // Next line is implemented that way to keep Vue getters and setters
    this.selectedNodes.splice(0, this.selectedNodes.length);
    D3Background.updateBackground(this);
  }
  if (this.selectedEdge !== null) {
    this.saveState();
    this.model.d3Edges.splice(this.model.d3Edges.indexOf(this.selectedEdge), 1);
    this.selectedEdge.delete(this);
    this.selectedEdge = null;
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
    let filtRes1 = thisGraph.model.d3Edges.filter( edge =>
      (edge.source == thisGraph.mouseDownNode && edge.target == layer)
    );
    if (filtRes1.length > 0) {
      return;
    };
    thisGraph.saveState();
    // Remove edge between the two node that already exist
    let newEdge = new D3Edge(thisGraph.mouseDownNode, layer);
    let filtRes2 = thisGraph.model.d3Edges.filter( edge =>
      (edge.source == newEdge.target && edge.target == newEdge.source)
    );
    filtRes2.forEach( edge => {
      thisGraph.model.d3Edges.splice(thisGraph.model.d3Edges.indexOf(edge), 1);
      edge.delete(thisGraph);
    });
    newEdge.source.addOutputLayer(newEdge.target);
    newEdge.target.addInputLayer(newEdge.source);
    // We're in a different node: create new edge for mousedown edge and add to graph
    thisGraph.model.d3Edges.push(newEdge);
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
  // Next line is implemented that way to keep Vue getters and setters
  this.redoStack.splice(0, this.redoStack.length);
  this.undoStack.push(this.toJSON());
};


D3GraphEditor.prototype.loadState = function (txtRes) {
  this.clearBoard(true);
  this.model.loadState(txtRes);
  this.updateGraph();
};


D3GraphEditor.prototype.undo = function () {
  if (this.undoStack.length <= 0) {
    return;
  }
  this.redoStack.push(this.toJSON());
  let txtRes = this.undoStack.pop();
  this.loadState(txtRes);
};


D3GraphEditor.prototype.redo = function () {
  if (this.redoStack.length <= 0) {
      return;
  };
  this.undoStack.push(this.toJSON());
  let txtRes = this.redoStack.pop();
  this.loadState(txtRes);
};


D3GraphEditor.prototype.toJSON = function () {
  return this.model.toJSON();
};


D3GraphEditor.prototype.saveBoard = function () {
  saveAs(new Blob(["NNVP\n" + this.toJSON()]), "myModel.nnvp");
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
  this.model.d3Layers.forEach(layer => {
    if (layer.class === "D3Layer") {
      toJSON.push(layer.toJSON());
    }
    if (layer.class === "D3LayerComposite") {
      layer.getAllContainedJSON().forEach(json => toJSON.push(json));
    }
  });
  let jsonFile = window.JSON.stringify({ "layers": toJSON }, { type: "text/plain;charset=utf-8" });
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

D3GraphEditor.prototype.generateJavascriptInBrowser = function (kerasInterface) {
  const generatedJavascript = kerasInterface.generateJavascript(this.toJSON());
  saveAs(new Blob([generatedJavascript]), "myModel.js");
}

D3GraphEditor.prototype.generateJavascriptNoSave = function (kerasInterface) {
  return kerasInterface.generateJavascript(this.toJSON());
}

/**
 * Get a Layer by hid ID
 * @param id the ID of the Layer to get
 * @returns true if the Layer exists else null
 */
D3GraphEditor.prototype.getLayerById = function (id) {
  return this.model.getLayerById(id);
};

/**
 * Check if the component contains a Layer
 * @param id the ID of the Layer to check
 * @returns true if the Layer exists else null
 */
D3GraphEditor.prototype.primeAncestorOfId = function (id) {
  let res = null;
  this.model.d3Layers.forEach(layer => {
    let tmp = layer.getLayerById(id);
    if (tmp !== null) {
      res = layer;
    }
  });
  return res;
};


/**
 * load graph
 * @param uploadFileEvent the file that contains the JSON of the graph to upload
 */
D3GraphEditor.prototype.uploadToBoard = function (uploadFileEvent) {
  if (window.File && window.FileReader && window.FileList && window.Blob) {
    var uploadFile = uploadFileEvent.files[0];
    var filereader = new window.FileReader();

    filereader.onload = () => {
      try {
        this.saveState();
        this.clearBoard(true);
        const txtRes = filereader.result;
        const splited = txtRes.split(/\n(.+)/);
        if(splited[0] !== "NNVP"){
          alert("This file doesn't seem to be an NNVP file.");
          return;
        }
        this.model.loadJSON(splited[1]);
        this.updateGraph();
      }
      catch (error) {
        console.error(error);
      }
    };

    filereader.readAsText(uploadFile);
  }
  else {
    alert("Your browser won't let you open this graph -- try upgrading your browser to the latest version of Chrome or Firefox.");
  }
};


D3GraphEditor.prototype.loadTemplate = function (name) {
  this.saveState();
  this.loadState(this.templates.get(name));
};


/**
 * Deletes all the graph
 * @param skipPrompt if clicked on skip
 */
D3GraphEditor.prototype.clearBoard = function (skipPrompt) {
  let doDelete = true;
  if (!skipPrompt) {
    doDelete = window.confirm("Press OK to delete this graph");
  }
  if (doDelete) {
    this.model.clear();
    this.svgD3Edges.selectAll("g").remove();
    this.svgD3Layers.selectAll("g").remove();
    this.svgD3LayerComposites.selectAll("g").remove();
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
      .subject( event => {
        origine.x = d3.pointer(event, thisGraph.svgG.node())[0];
        origine.y =  d3.pointer(event, thisGraph.svgG.node())[1];
        return origine;
      })
      .on("start", event => {
        thisGraph.layerDrag = true;
        d3.select("#dragFromLeftbar").append("rect")
          .attr("x", d3.pointer(event, thisGraph.svgG.node())[0])
          .attr("y", d3.pointer(event, thisGraph.svgG.node())[1])
          .attr("height", 40)
          .attr("width", 90)
          .style("fill", "none")
          .style("stroke", "black");
      })
      .on("drag", event =>
        d3.select("#dragFromLeftbar").selectAll("rect")
          .attr("x", d3.pointer(event, thisGraph.svgG.node())[0])
          .attr("y", d3.pointer(event, thisGraph.svgG.node())[1])
      )
      .on("end", event => {
        thisGraph.layerDrag = false;
        const targetElement = event.sourceEvent.target;
        for(let el = targetElement; el != null; el = el.parentElement){
          if(el.id == "svgWrapper")
            thisGraph.addLayer(
              layer.clone(), d3.pointer(event, thisGraph.svgG.node())[0], d3.pointer(event, thisGraph.svgG.node())[1]
            );
        }
        d3.select("#dragFromLeftbar").selectAll("rect").remove();
      })
    );
};
