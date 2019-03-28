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
    // TODO implement check
    // console.log(parameterName + '- , -' + parameterValue);
    this.parameterValues[parameterName] = parameterValue;
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
            // TODO : check ParametersDef are serializable
            clone[prop] = JSON.parse(JSON.stringify(this[prop]));
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
          this[prop] = JSON.parse(JSON.stringify(jsonObj[prop]));
          // TODO : if not custom, check for existing parameterDef?
        } else this[prop] = jsonObj[prop];
      }
    }
    return this;
  }
}
