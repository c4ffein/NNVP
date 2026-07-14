import type { KerasLayerJSON, ParameterDef, ParameterValue } from '../../types/model';

// class KerasLayer {
export default class {
  name: string;
  category: string;
  searchTerms: string[];
  parameterDef: Record<string, ParameterDef>;
  parameterValues: Record<string, ParameterValue>;
  customUserLayer: boolean;

  // Also callable with no args for the revive pattern `new KerasLayer().load(json)`;
  // the `!` keeps the historical "undefined until load()" runtime behavior.
  constructor(layerName?: string, categoryName?: string) {
    this.name = layerName!;
    this.category = categoryName!;
    this.searchTerms = [layerName!, categoryName!];
    this.parameterDef = {};
    this.parameterValues = {};
    this.customUserLayer = false;
  }

  addParameterDef(parameterName: string, parameterDefContent: ParameterDef) {
    this.parameterDef[parameterName] = parameterDefContent;
  }

  setParameterValue(parameterName: string, parameterValue: ParameterValue) {
    // Validate that parameter exists in definition
    if (!this.parameterDef[parameterName]) {
      console.warn(`Parameter "${parameterName}" not found in layer definition for "${this.name}"`);
    }
    this.parameterValues[parameterName] = parameterValue;
  }

  deleteParameterValue(parameterName: string) {
    delete this.parameterValues[parameterName];
  }

  getParameter() {
    return this.parameterDef;
  }

  clone(): this {
    // deep copy, but keep references to parameters, and convert to json and back the values array
    // (`layerName`/`categoryName` have never existed on instances, so the ctor
    // args are historically undefined here; the untyped view keeps that as-is)
    const Ctor = this.constructor as new (layerName?: string, categoryName?: string) => this;
    const self = this as unknown as Record<string, unknown>;
    const clone = new Ctor(self.layerName as string | undefined, self.categoryName as string | undefined);
    const target = clone as unknown as Record<string, unknown>;
    for (const prop in this) { // eslint-disable-line
      if (this.hasOwnProperty(prop)) { // eslint-disable-line
        if (['searchTerms', 'parameterValues'].includes(prop)) target[prop] = JSON.parse(JSON.stringify(self[prop]));
        else if (prop === 'parameterDef') {
          if (this.customUserLayer) {
            // Check ParametersDef are serializable by attempting JSON round-trip
            try {
              target[prop] = JSON.parse(JSON.stringify(self[prop]));
            } catch (error) {
              console.error(`Failed to serialize parameterDef for custom layer "${this.name}":`, error);
              throw new Error(`Custom layer "${this.name}" has non-serializable parameterDef`);
            }
          } else {
            target[prop] = self[prop];
          }
        } else target[prop] = self[prop];
      }
    }
    return clone;
  }

  load(jsonObj: KerasLayerJSON): this {
    const source = jsonObj as unknown as Record<string, unknown>;
    const self = this as unknown as Record<string, unknown>;
    for (const prop in source) { // eslint-disable-line
      if (source.hasOwnProperty(prop)) { // eslint-disable-line
        if (['searchTerms', 'parameterValues'].includes(prop)) self[prop] = JSON.parse(JSON.stringify(source[prop]));
        else if (prop === 'parameterDef') {
          const loadedDef = JSON.parse(JSON.stringify(source[prop])) as Record<string, ParameterDef>;
          // If not custom, warn if loaded definition differs from existing
          if (!jsonObj.customUserLayer && Object.keys(this.parameterDef).length > 0) {
            const existingKeys = Object.keys(this.parameterDef).sort();
            const loadedKeys = Object.keys(loadedDef).sort();
            if (JSON.stringify(existingKeys) !== JSON.stringify(loadedKeys)) {
              console.warn(
                `Loaded parameterDef for "${this.name}" differs from existing definition. ` +
                `Existing: [${existingKeys.join(', ')}], Loaded: [${loadedKeys.join(', ')}]`
              );
            }
          }
          this.parameterDef = loadedDef;
        } else self[prop] = source[prop];
      }
    }
    return this;
  }
}
