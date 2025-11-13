// class KerasLayer {
export default class {
  constructor(layerName, categoryName) {
    this.name = layerName;
    this.category = categoryName;
    this.searchTerms = [layerName, categoryName];
    this.parameterDef = {};
    this.parameterValues = {};
    this.customUserLayer = false;
  }

  addParameterDef(parameterName, parameterDefContent) {
    this.parameterDef[parameterName] = parameterDefContent;
  }

  setParameterValue(parameterName, parameterValue) {
    // Validate that parameter exists in definition
    if (!this.parameterDef[parameterName]) {
      console.warn(`Parameter "${parameterName}" not found in layer definition for "${this.name}"`);
    }
    this.parameterValues[parameterName] = parameterValue;
  }

  deleteParameterValue(parameterName) {
    delete this.parameterValues[parameterName];
  }

  getParameter() {
    return this.parameterDef;
  }

  clone() {
    // deep copy, but keep references to parameters, and convert to json and back the values array
    const clone = new this.constructor(this.layerName, this.categoryName);
    for (const prop in this) { // eslint-disable-line
      if (this.hasOwnProperty(prop)) { // eslint-disable-line
        if (['searchTerms', 'parameterValues'].includes(prop)) clone[prop] = JSON.parse(JSON.stringify(this[prop]));
        else if (prop === 'parameterDef') {
          if (this.customUserLayer) {
            // Check ParametersDef are serializable by attempting JSON round-trip
            try {
              clone[prop] = JSON.parse(JSON.stringify(this[prop]));
            } catch (error) {
              console.error(`Failed to serialize parameterDef for custom layer "${this.name}":`, error);
              throw new Error(`Custom layer "${this.name}" has non-serializable parameterDef`);
            }
          } else {
            clone[prop] = this[prop];
          }
        } else clone[prop] = this[prop];
      }
    }
    return clone;
  }

  load(jsonObj) {
    for (const prop in jsonObj) { // eslint-disable-line
      if (jsonObj.hasOwnProperty(prop)) { // eslint-disable-line
        if (['searchTerms', 'parameterValues'].includes(prop)) this[prop] = JSON.parse(JSON.stringify(jsonObj[prop]));
        else if (prop === 'parameterDef') {
          const loadedDef = JSON.parse(JSON.stringify(jsonObj[prop]));
          // If not custom, warn if loaded definition differs from existing
          if (!jsonObj.customUserLayer && Object.keys(this[prop]).length > 0) {
            const existingKeys = Object.keys(this[prop]).sort();
            const loadedKeys = Object.keys(loadedDef).sort();
            if (JSON.stringify(existingKeys) !== JSON.stringify(loadedKeys)) {
              console.warn(
                `Loaded parameterDef for "${this.name}" differs from existing definition. ` +
                `Existing: [${existingKeys.join(', ')}], Loaded: [${loadedKeys.join(', ')}]`
              );
            }
          }
          this[prop] = loadedDef;
        } else this[prop] = jsonObj[prop];
      }
    }
    return this;
  }
}
