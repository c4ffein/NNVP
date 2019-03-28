/* eslint-disable */

import * as d3 from 'd3';
const jsonKeras = require("../KerasInterface/generatedKerasLayers.json");

export default function D3GraphValidation () {};

/**
 * Check if a Layer is isolated in the graph
 * @param graph the graph to check in
 * @param layer the Layer to check if it is isolated
 * @returns true if the Layer is isolated, false else
 */
D3GraphValidation.isIsolated = function (graph, layer) {
  let res = true;
    graph.d3Edges.forEach(edge => {
      if(layer === edge.source || layer === edge.target){
        res = false;
      }
    })
    return res;
};

/**
 * Change properties of a Layer if it is isolated
 * @param graph the graph containing the Layer
 * @param layer the Layer to chenge properties
 */
D3GraphValidation.isolated = function (graph, layer) {

  if (layer.class !== "D3Layer") {
    return;
  }
  if (d3.select("#" + layer.htmlID).node()) {
    d3.select("#" + layer.htmlID).select('rect')
      .classed("isolated", D3GraphValidation.isIsolated(graph, layer));
  }
};

/**
 * Check if an Edge causes a Keras error
 * @param graph the graph to check in
 * @param edge the Edge to check
 * @returns true if the Edge causes a Keras error, false else
 */
D3GraphValidation.kerasError = function (graph, edge) {
  if (edge.source.class !== "D3Layer" || edge.target.class !== "D3Layer" ) {
    return;
  }
  if (!(jsonKeras[edge.source.kerasLayer.name] && jsonKeras[edge.source.kerasLayer.name].output && jsonKeras[edge.source.kerasLayer.name].output.shape))
    return;
  let from = jsonKeras[edge.source.kerasLayer.name].output.shape,
      to = jsonKeras[edge.target.kerasLayer.name].input.shape;
  if((from !== undefined) && (to !== undefined) && (from !== "Arbitrary") && (to !== "Arbitrary") ){
    if(from.length === 1 && to.length === 1){
      return from !== to;
    }else{
      if(from.length > to.length){
        for(let i = 0; i < to.length; i++){
          if(!from.includes(to[i])){
            return true;
          }
        }
        return false;
      }else{
        for(let i = 0; i < from.length; i++){
          if(!to.includes(from[i])){
            return true;
          }
        }
      }
    }
  }
  return false;

};

/**
 * Set properties to an Edge which causes a Keras error
 * @param graph the graph which contains the Edge
 * @param edge the Edge to set properties
 */
D3GraphValidation.isKerasError = function (graph, edge) {
  if (d3.select("#" + edge.htmlID).node()) {
    d3.select("#" + edge.htmlID).select('path')
      .classed('linkError', D3GraphValidation.kerasError(graph, thisEdge));
  }
};

/**
 * Check if there is a cycle in the graph
 * @param graph the graph to check in
 * @returns true if there is a cycle in the graph, false else
 */
D3GraphValidation.isCycle = function (graph) {

  let isCycle = false;
  if(graph.d3Edges.length > 2 && graph.d3Layers.length > 2){

    function isCyclicUtil(node, visited, recStack){
      let i = graph.d3Layers.indexOf(node);
      if (recStack[i])
        return true;
      if (visited[i])
        return false;
      visited[i] = true;
      recStack[i] = true;
      for(let j = 0; j < graph.d3Edges.length; j++){
        if(graph.d3Edges[j].source === node){
          if (isCyclicUtil(graph.d3Edges[j].target, visited, recStack)){
            return true;
          }
        }
      }
      recStack[i] = false;
      return false;
    }

    function isCyclic() {
      let visited = [];
      let recStack = [];
      for (let i = 0; i < graph.d3Layers.length; i++){
        if (isCyclicUtil(graph.d3Layers[i], visited, recStack)){
          return true;
        }
      }
      return false;
    }

    if(isCyclic()){
      isCycle = true;
    }
  }

  graph.d3Edges.forEach(edge => {
    if (d3.select("#" + edge.htmlID).node()) {
      d3.select("#" + edge.htmlID)
        .select("path")
        .classed("linkCycle", isCycle);
    }
  });

};
