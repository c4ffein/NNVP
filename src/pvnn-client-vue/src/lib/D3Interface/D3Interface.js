export default class {
  constructor() {
    this.graphEditors = [];
    this.activeGraph = null;
    this.activeElements = { e: [] };
    // TODO : next line, boolean to know if there is data?
    window.onbeforeunload = () => 'Warning : all unsaved data will be lost';
  }

  // Get the layer corresponding to the id on the active graph
  getLayerById(id) {
    return this.activeGraph.getLayerById(id); // TODO : Alienor : rename this function
  }

  setActiveGraphEditor(graphEditor) {
    this.activeGraph = graphEditor;
    this.activeElements.e = this.activeGraph.selectedNodes;
  }

  getActiveElementsContainer() {
    return this.activeElements;
  }

  getActiveElements() {
    if (this.activeGraph !== undefined) {
      return this.activeGraph.selectedNodes;
    }
    return null;
  }

  addGraphEditor(graphEditor) {
    this.graphEditors.push(graphEditor);
    if (this.graphEditors.length === 1) this.setActiveGraphEditor(graphEditor);
  }

  addLayer(kerasLayer) {
    if (this.activeGraph !== undefined) {
      this.activeGraph.addLayer(kerasLayer);
    }
  }

  addEventHandlerDragOnHtmlClass(layer, element) {
    if (this.activeGraph !== undefined) {
      this.activeGraph.addEventHandlerDragOnHtmlClass(layer, element);
    }
  }

  // Undo and Redo
  undo() {
    if (this.activeGraph !== undefined) {
      this.activeGraph.undo();
    }
  }

  redo() {
    if (this.activeGraph !== undefined) {
      this.activeGraph.redo();
    }
  }

  // Group layers
  createGroup() {
    if (this.activeGraph !== undefined) {
      this.activeGraph.createComposite();
    }
  }

  // Menu functions
  saveBoard() {
    if (this.activeGraph !== undefined) {
      this.activeGraph.saveBoard();
    }
  }

  generatePython(backendUrl) {
    if (this.activeGraph !== undefined) {
      this.activeGraph.generatePython(backendUrl);
    }
  }

  loadBoard() {
    if (this.activeGraph !== undefined) {
      document.getElementById('hidden-file-upload').click();
    }
  }

  // d3.select("#hidden-file-upload").on("change", function (d) {
  //  let uploadFileEvent = this;
  //  whiteboard.activeGraph.uploadToBoard(uploadFileEvent);
  // });
  clearBoard() {
    if (this.activeGraph !== undefined) {
      this.activeGraph.clearBoard(false);
    }
  }
}
