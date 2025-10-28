<template>
  <div id="WhiteBoard">
    <input type="file" id="hidden-file-upload">
    <div id="svgWrapper"></div>
  </div>
</template>

<script>
/* eslint-disable */
import * as d3 from "d3";
import { saveAs } from "file-saver";
import D3GraphEditor from "../lib/D3Interface/D3GraphEditor";

export default {
  name: "WhiteBoard",
  mounted() {
    let svg = d3.select("#svgWrapper").append("svg");
    let whiteboard = this.$d3Interface;
    whiteboard.addGraphEditor(new D3GraphEditor(svg));

    // upload button
    d3.select("#hidden-file-upload").on("change", function (d) {
      let uploadFileEvent = this;
      whiteboard.activeGraph.uploadToBoard(uploadFileEvent);
      // Needed for Chrome/Safari if you re-select the same file, and input event is inconsistent.
      document.getElementById("hidden-file-upload").value = "";
    });
  }
};
</script>

<style>
#hidden-file-upload {
  display: none;
}
#WhiteBoard {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}
#svgWrapper, svg {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  position: relative; /* Needed so first layer doesn't glitch on Safari */
}
#backgroud {
  fill: #f0f0f0;
}
#whitePage {
  fill: white;
}
#selectionRect {
  fill: lightgray;
  fill-opacity: .75;
  shape-rendering: crispEdges;
}
.borderClass {
  fill: #f0f0f0;
  stroke: none;
}
.borderClass.active {
  fill: white;
  stroke: none;
}
.borderListerClass{
  fill: #f0f0f0;
  stroke: #f0f0f0;
  opacity: 0.1;
}
.d3Layer rect {
  fill: white;
  stroke: black;
}
.d3Layer rect.isolated {
  stroke: red;
}
.d3Layer text {
  text-anchor: "start";
  fill: black;
}
.d3Layer.selected rect {
  fill: rgb(250, 232, 255);
}
.d3CompositeLayer rect {
  fill: white;
  stroke: black;
}
path.link {
  fill: none;
  stroke: #333;
  stroke-width: 3px;
  cursor: default;
}
.edge.selected path{
  stroke: green;
}
path.linkError {
  stroke: red;
}
path.linkCycle {
  stroke: red;
}
path.link.hidden {
    stroke-width: 0;
}
.over-layer {
  cursor: move;
}
.active {
  stroke: #000;
  stroke-width: 2px;
}
.active-point {
  cursor: pointer;
}
.link-source-active {
  fill: #646cff !important;
  stroke: #535bf2 !important;
  stroke-width: 3px !important;
  r: 8 !important;
  cursor: crosshair;
  animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}
.d3-tip {
  line-height: 1;
  font-weight: bold;
  padding: 12px;
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  border-radius: 2px;
}
/* Creates a small triangle extender for the tooltip */
.d3-tip:after {
  box-sizing: border-box;
  display: inline;
  font-size: 10px;
  width: 100%;
  line-height: 1;
  color: rgba(0, 0, 0, 0.8);
  content: "\25BC";
  position: absolute;
  text-align: center;
}
/* Style northward tooltips differently */
.d3-tip.n:after {
  margin: -1px 0 0 0;
  top: 100%;
  left: 0;
}
</style>
