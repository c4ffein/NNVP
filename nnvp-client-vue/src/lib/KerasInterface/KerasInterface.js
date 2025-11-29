import KerasLayer from './KerasLayer';
import KerasGenerator from './KerasGenerator';

/* eslint class-methods-use-this: ["error", { "exceptMethods": ["generatePython",
                                                                "generateJavascript"] }] */
// class KerasInterface {
export default class {
  constructor(json) {
    this.layerList = {};
    this.categories = {};
    if (json === undefined) return;
    this.load(json);
  }

  getLayerList() {
    return this.layerList;
  }

  getCategories() {
    return this.categories;
  }

  addLayer(layer) {
    this.layerList[layer.getName()] = layer;
    if (!(layer.getCategory() in this.categories)) this.categories[layer.getCategory()] = {};
    this.categories[layer.getCategory()][layer.getName()] = layer;
  }

  load(json) {
    // Support both old flat format and new nested format {aliasToCanonical, layers}
    const layersData = json.layers || json;
    this.aliasToCanonical = json.aliasToCanonical || {};

    const layerNames = Object.keys(layersData);
    for (let i = 0; i < layerNames.length; i += 1) {
      const layerName = layerNames[i];
      const layerData = layersData[layerName];
      const layerParameters = layerData.parameters;
      const layer = new KerasLayer(layerName, layerData.category);
      const layerParametersIndex = Object.keys(layerParameters);
      if (layer.category === 'Merge') {
        layer.addParameterDef('input_order', layerData.input);
      }
      for (let j = 0; j < layerParametersIndex.length; j += 1) {
        const layerParameterName = layerParametersIndex[j];
        const layerParameter = layerParameters[layerParameterName];
        layer.addParameterDef(layerParameterName, layerParameter);
      }

      this.layerList[layerName] = layer;
      if (!(layerData.category in this.categories)) {
        this.categories[layerData.category] = {};
      }
      this.categories[layerData.category][layerName] = layer;
    }
  }

  generatePython(d3Json) {
    let graphJson;
    if (typeof d3Json === 'string') graphJson = JSON.parse(d3Json);
    else graphJson = d3Json;
    return new KerasGenerator(graphJson).generatePythonFromGraph();
  }

  generateJavascript(d3Json) {
    let graphJson;
    if (typeof d3Json === 'string') graphJson = JSON.parse(d3Json);
    else graphJson = d3Json;
    return new KerasGenerator(graphJson).generateJavascriptFromGraph();
  }
}
