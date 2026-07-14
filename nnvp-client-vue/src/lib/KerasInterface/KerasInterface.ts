import KerasLayer from './KerasLayer';
import KerasGenerator from './KerasGenerator';
import type {
  KerasLayerCatalog, KerasLayerCatalogEntry, NnvpModel, ParameterDef,
} from '../../types/model';

/* eslint class-methods-use-this: ["error", { "exceptMethods": ["generatePython",
                                                                "generateJavascript",
                                                                "generatePyTorch",
                                                                "generateTinygrad"] }] */
// class KerasInterface {
export default class {
  layerList: Record<string, KerasLayer>;
  categories: Record<string, Record<string, KerasLayer>>;
  aliasToCanonical?: Record<string, string>;

  constructor(json?: KerasLayerCatalog | Record<string, KerasLayerCatalogEntry>) {
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

  // (Unused: no current KerasLayer has getName/getCategory, hence the intersection.)
  addLayer(layer: KerasLayer & { getName(): string; getCategory(): string }) {
    this.layerList[layer.getName()] = layer;
    if (!(layer.getCategory() in this.categories)) this.categories[layer.getCategory()] = {};
    this.categories[layer.getCategory()]![layer.getName()] = layer;
  }

  load(json: KerasLayerCatalog | Record<string, KerasLayerCatalogEntry>) {
    // Support both old flat format and new nested format {aliasToCanonical, layers}
    const layersData = (json as KerasLayerCatalog).layers || (json as Record<string, KerasLayerCatalogEntry>);
    this.aliasToCanonical = (json as KerasLayerCatalog).aliasToCanonical || {};

    const layerNames = Object.keys(layersData);
    for (let i = 0; i < layerNames.length; i += 1) {
      const layerName = layerNames[i]!;
      const layerData = layersData[layerName]!;
      const layerParameters = layerData.parameters;
      const layer = new KerasLayer(layerName, layerData.category);
      const layerParametersIndex = Object.keys(layerParameters);
      if (layer.category === 'Merge') {
        // Historical special case: the doc-style input spec is stashed as a
        // pseudo parameter def (no current catalog has a 'Merge' category).
        layer.addParameterDef('input_order', layerData.input as unknown as ParameterDef);
      }
      for (let j = 0; j < layerParametersIndex.length; j += 1) {
        const layerParameterName = layerParametersIndex[j]!;
        const layerParameter = layerParameters[layerParameterName]!;
        layer.addParameterDef(layerParameterName, layerParameter);
      }

      this.layerList[layerName] = layer;
      if (!(layerData.category in this.categories)) {
        this.categories[layerData.category] = {};
      }
      this.categories[layerData.category]![layerName] = layer;
    }
  }

  generatePython(d3Json: NnvpModel | string): string {
    let graphJson: NnvpModel;
    if (typeof d3Json === 'string') graphJson = JSON.parse(d3Json);
    else graphJson = d3Json;
    return new KerasGenerator(graphJson).generatePythonFromGraph();
  }

  generateJavascript(d3Json: NnvpModel | string): string {
    let graphJson: NnvpModel;
    if (typeof d3Json === 'string') graphJson = JSON.parse(d3Json);
    else graphJson = d3Json;
    return new KerasGenerator(graphJson).generateJavascriptFromGraph();
  }

  generatePyTorch(d3Json: NnvpModel | string): string {
    let graphJson: NnvpModel;
    if (typeof d3Json === 'string') graphJson = JSON.parse(d3Json);
    else graphJson = d3Json;
    return new KerasGenerator(graphJson).generatePyTorchFromGraph();
  }

  generateTinygrad(d3Json: NnvpModel | string): string {
    let graphJson: NnvpModel;
    if (typeof d3Json === 'string') graphJson = JSON.parse(d3Json);
    else graphJson = d3Json;
    return new KerasGenerator(graphJson).generateTinygradFromGraph();
  }
}
