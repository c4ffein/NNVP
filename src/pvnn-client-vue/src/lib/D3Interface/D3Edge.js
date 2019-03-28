/* eslint-disable */

import * as d3 from 'd3';
import D3GraphValidation from './D3GraphValidation';
const jsonKeras = require("../KerasInterface/generatedKerasLayers.json");

/**
 * Constructor of an edge
 * @param source the Layer which is the origin of the edge
 * @param target the Layer which is the target of the edge
 */
export default function D3Edge (source, target) {
  let thisEdge = this;
  thisEdge.source = source;
  thisEdge.target = target;
  thisEdge.id = "s" + thisEdge.source.id + "_t" + thisEdge.target.id;
  thisEdge.htmlID = thisEdge.id;
  thisEdge.d3node = null;
  thisEdge.source.addObserver(thisEdge);
  thisEdge.target.addObserver(thisEdge);
  thisEdge.class = "D3Edge";
};

/**
 * Converts the edge to a JSON data
 * @returns a JSON data
 */
D3Edge.prototype.toJSON = function () {
  let res = {
    source: this.source.id,
    target: this.target.id,
    id: this.id,
    htmlID: this.htmlID
  };
  return res;
};

/**
 * Defines the D3 object to draw a path and an arrow marker
 * @param svg the area where to define the object
 */
D3Edge.createMakerHtml = function (svg) {
  let defs = svg.append('svg:defs');
  defs.append('svg:marker')
    .attr('id', 'end-arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', "32")
    .attr('markerWidth', 5)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('svg:path')
    .attr('d', 'M0,-5L10,0L0,5');

  // define arrow markers for leading arrow
  defs.append('svg:marker')
    .attr('id', 'mark-end-arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 7)
    .attr('markerWidth', 5)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('svg:path')
    .attr('d', 'M0,-5L10,0L0,5');
};

/**
 * Creates the D3 object to draw an edge
 * @param svgG the area where to create the object
 * @returns the D3 object created
 */
D3Edge.createDragLine = function (svgG) {
  let dragLine = svgG.append('svg:path')
    .attr('class', 'link dragline hidden')
    .attr('d', 'M0,0L0,0')
    .style('marker-end', 'url(#mark-end-arrow)');
  return dragLine;
};

/**
 * Deletes the edge from the set
 * @param graph the graph from which to delete the edge
 */
D3Edge.prototype.delete = function (graph) {
  this.remove();
  this.source.removeObserver(this);
  this.target.removeObserver(this);
  this.source.removeOutputLayer(this.target);
  this.target.removeInputLayer(this.source);
  D3GraphValidation.isolated(graph, this.source);
  D3GraphValidation.isolated(graph, this.target);
  D3GraphValidation.isCycle(graph);
};

/**
 * Remove the edge
 */
D3Edge.prototype.remove = function () {
  d3.select("#" + this.htmlID).remove();
};

/**
 * Adds new edge to the set
 * @param d3node the set of edges
 * @param graph the graph to which we add an edge
 */
D3Edge.prototype.drawEdge = function (d3node, graph) {
  let thisEdge = this;

  thisEdge.d3node = d3node;

  let gElement = d3node.append("g")
    .attr("class", "edge")
    .attr("id", thisEdge.htmlID);

  gElement
    .append("path")
    .style('marker-end', 'url(#mark-end-arrow)')
    .classed("link", true)
    .classed('linkError', D3GraphValidation.kerasError(graph, thisEdge))
    .attr("d", thisEdge.pathAttrD());

  D3GraphValidation.isCycle(graph);

  D3GraphValidation.isolated(graph, this.source);
  D3GraphValidation.isolated(graph, this.target);

  gElement
    .on("click", () => {
      graph.selectEdge(thisEdge);
      d3.event.stopPropagation();
    });

};

/**
 * Updates a path
 */
D3Edge.prototype.update = function(observable) {
  d3.select("#" + this.id).select("path")
    .attr("d", this.pathAttrD());
};

/**
 * Updates a path with transition
 */
D3Edge.prototype.updateWithTransition = function() {
  d3.select("#" + this.id).select("path")
    .transition()
    .duration(300)
    .attr("d", this.pathAttrD());
};

/**
 * Drawing the path added
 * @returns Collection of points (M) the beginning of the path and (L) other points
 */
D3Edge.prototype.pathAttrD = function () {
  let edge = this,
      sourcePoint,
      targetPoint;
  if(Math.abs(edge.source.x - edge.target.x) - (edge.source.x < edge.target.x ? edge.source.width : edge.target.width) < Math.abs(edge.source.y - edge.target.y) - edge.source.height) {
    targetPoint = edge.source.y < edge.target.y ?
    { x: edge.target.x + (edge.target.width/2), y: edge.target.y} :
    { x: edge.target.x + (edge.target.width/2), y: edge.target.y + edge.target.height };
    sourcePoint = edge.source.y < edge.target.y ?
    { x: edge.source.x + (edge.source.width/2), y: edge.source.y + edge.source.height } :
    { x: edge.source.x + (edge.source.width/2), y: edge.source.y};
    let yMiddle = sourcePoint.y + ((targetPoint.y - sourcePoint.y)/2);
    return "M" + sourcePoint.x + "," + sourcePoint.y +
      "L" + sourcePoint.x + "," + yMiddle +
      "L" + targetPoint.x + "," + yMiddle +
      "L" + targetPoint.x + "," + targetPoint.y;
  }
  else {
    targetPoint = edge.source.x < edge.target.x ?
      { x: edge.target.x, y: edge.target.y + (edge.target.height / 2) } :
      { x: edge.target.x + edge.target.width, y: edge.target.y + (edge.target.height / 2) };
    sourcePoint = edge.source.x < edge.target.x ?
      { x: edge.source.x + edge.source.width, y: edge.source.y + (edge.source.height / 2) } :
      { x: edge.source.x, y: edge.source.y + (edge.source.height / 2) };
    if(Math.abs(edge.target.x - edge.source.x) > (Math.abs(edge.target.y - edge.source.y) + (edge.source.width > edge.target.width ? edge.source.width/2 : edge.target.width/2))) {
      let xMiddle = sourcePoint.x + ((targetPoint.x - sourcePoint.x)/2);
      return "M" + sourcePoint.x + "," + sourcePoint.y +
      "L" + xMiddle + "," + sourcePoint.y +
      "L" + xMiddle + "," + targetPoint.y +
      "L" + targetPoint.x + "," + targetPoint.y;
    } else {
      sourcePoint = edge.source.y < edge.target.y ?
      { x: edge.source.x + (edge.source.width / 2), y: edge.source.y + edge.source.height } :
      { x: edge.source.x + (edge.source.width / 2), y: edge.source.y };
      return "M" + sourcePoint.x + "," + sourcePoint.y +
      "L" + sourcePoint.x + "," + targetPoint.y +
      "L" + targetPoint.x + "," + targetPoint.y;
    }
  }
};

/**
 * Draw a path when dragging
 * @param dragLine the D3 object to draw a path
 * @param from the origin point to drag from
 * @param target according to the location of the mouse
 */
D3Edge.moveDragLine = function (dragline, from, target) {
  let point = {x: d3.select(from).attr("cx"), y: d3.select(from).attr("cy")};
    dragline.attr('d', "M" + point.x + "," + point.y +
      "L" + target.x + "," + target.y);
};
