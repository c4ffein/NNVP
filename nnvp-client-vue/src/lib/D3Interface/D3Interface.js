export default class {
  constructor() {
    this.graphEditors = [];
    this.activeGraph = null;
    this.activeElementsContainer = { e: [] };
    this.undoStackContainer = { e: [] };
    this.redoStackContainer = { e: [] };
    this.templateIdsContainer = { e: [] };
    this.leftBarRemountCallback = () => false;
    // Event listeners for reactive updates
    this.listeners = {};
    // TODO : next line, boolean to know if there is data?
    window.onbeforeunload = () => 'Warning : all unsaved data will be lost';
  }

  // Event system for framework-agnostic reactivity
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => callback(data));
  }

  // Get the layer corresponding to the id on the active graph
  getLayerById(id) {
    return this.activeGraph.getLayerById(id); // TODO : Alienor : rename this function
  }

  setActiveGraphEditor(graphEditor) {
    this.activeGraph = graphEditor;
    this.activeElementsContainer.e = this.activeGraph.selectedNodes;
    this.undoStackContainer.e = this.activeGraph.undoStack;
    this.redoStackContainer.e = this.activeGraph.redoStack;
    this.templateIdsContainer.e = this.activeGraph.templates.list();
    this.leftBarRemountCallback();
    // Emit events for reactive updates
    this.emit('templates-changed');
    this.emit('selection-changed');
    this.emit('undo-stack-changed');
    this.emit('redo-stack-changed');
  }

  getActiveElementsContainer() {
    return this.activeElementsContainer;
  }

  getUndoStackContainer() {
    return this.undoStackContainer;
  }

  getRedoStackContainer() {
    return this.redoStackContainer;
  }

  getActiveElements() {
    if (this.activeGraph !== null) {
      return this.activeGraph.selectedNodes;
    }
    return null;
  }

  deleteSelectedElements() {
    if (this.activeGraph !== null) {
      this.activeGraph.deleteSelectedElements();
    }
  }

  addGraphEditor(graphEditor) {
    this.graphEditors.push(graphEditor);
    if (this.graphEditors.length === 1) this.setActiveGraphEditor(graphEditor);
  }

  addLayer(kerasLayer) {
    if (this.activeGraph !== null) {
      this.activeGraph.addLayer(kerasLayer);
    }
  }

  setLeftBarRemountCallback(func) {
    this.leftBarRemountCallback = func;
  }

  addEventHandlerDragOnHtmlClass(layer, element) {
    if (this.activeGraph !== null) {
      this.activeGraph.addEventHandlerDragOnHtmlClass(layer, element);
    }
  }

  // Undo and Redo
  undo() {
    if (this.activeGraph !== null) {
      this.activeGraph.undo();
    }
  }

  redo() {
    if (this.activeGraph !== null) {
      this.activeGraph.redo();
    }
  }

  // Group layers
  createGroup() {
    if (this.activeGraph !== null) {
      this.activeGraph.createComposite();
    }
  }

  // Menu functions
  saveBoard() {
    if (this.activeGraph !== null) {
      this.activeGraph.saveBoard();
    }
  }

  generatePython(kerasInterface) { // Will act accordingly to setup on later versions
    if (this.activeGraph !== null) {
      this.activeGraph.generatePythonInBrowser(kerasInterface);
    }
  }

  generatePythonInBrowser(kerasInterface) {
    if (this.activeGraph !== null) {
      this.activeGraph.generatePythonInBrowser(kerasInterface);
    }
  }

  generatePythonOnBackend(backendUrl) {
    if (this.activeGraph !== null) {
      this.activeGraph.generatePythonOnBackend(backendUrl);
    }
  }

  generateJavascriptInBrowser(kerasInterface) {
    if (this.activeGraph !== null) {
      this.activeGraph.generateJavascriptInBrowser(kerasInterface);
    }
  }

  generateJavascriptNoSave(kerasInterface) {
    if (this.activeGraph !== null) {
      return this.activeGraph.generateJavascriptNoSave(kerasInterface);
    }
    return null;
  }

  loadBoard() {
    if (this.activeGraph !== null) {
      document.getElementById('hidden-file-upload').click();
    }
  }

  // d3.select("#hidden-file-upload").on("change", function (d) {
  //  let uploadFileEvent = this;
  //  whiteboard.activeGraph.uploadToBoard(uploadFileEvent);
  // });
  clearBoard() {
    if (this.activeGraph !== null) {
      this.activeGraph.clearBoard(false);
    }
  }

  // Templates functions
  loadTemplate(name) {
    if (this.activeGraph !== null) {
      this.activeGraph.loadTemplate(name);
    }
  }

  getTemplatesContainer() {
    return this.templateIdsContainer;
  }
}
