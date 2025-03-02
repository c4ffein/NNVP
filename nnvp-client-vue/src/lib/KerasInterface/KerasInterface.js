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
    const layerNames = Object.keys(json);
    for (let i = 0; i < layerNames.length; i += 1) {
      const layerName = layerNames[i];
      const layerParameters = json[layerName].parameters;
      const layer = new KerasLayer(layerName, json[layerName].category);
      const layerParametersIndex = Object.keys(layerParameters);
      if (layer.category === 'Merge') {
        layer.addParameterDef('input_order', json[layerName].input);
      }
      for (let j = 0; j < layerParametersIndex.length; j += 1) {
        const layerParameterName = layerParametersIndex[j];
        const layerParameter = layerParameters[layerParameterName];
        layer.addParameterDef(layerParameterName, layerParameter);
      }

      this.layerList[layerName] = layer;
      if (!(json[layerName].category in this.categories)) {
        this.categories[json[layerName].category] = {};
      }
      this.categories[json[layerName].category][layerName] = layer;
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
