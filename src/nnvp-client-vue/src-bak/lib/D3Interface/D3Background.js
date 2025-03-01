/* eslint-disable */

import * as d3 from 'd3';

var borderClass = "borderClass";
var border_0 = "border_0";
var border_1 = "border_1";
var border_2 = "border_2";
var border_3 = "border_3";
var border_4 = "border_4";
var border_5 = "border_5";
var border_6 = "border_6";
var border_7 = "border_7";

var borderListerClass = "borderListerClass";
var listerBorder_0 = "listerBorder_0";
var listerBorder_1 = "listerBorder_1";
var listerBorder_2 = "listerBorder_2";
var listerBorder_3 = "listerBorder_3";
var listerBorder_4 = "listerBorder_4";
var listerBorder_5 = "listerBorder_5";
var listerBorder_6 = "listerBorder_6";
var listerBorder_7 = "listerBorder_7";

export default function D3Background() {};

/**
 * Creates the whiteboard's background
 * @param svg the area where to create background
 */
D3Background.createBackground = function (svg) {
  svg.append("rect")
    .attr('id', 'backgroud')
    .attr("width", "100%")
    .attr("height", "100%");
};

/**
 * Creates the WhiteBoard on background where to draw
 * @param svgG th area where to create the whiteboard
 */
D3Background.createWhiteboard = function (svgG) {
  svgG.append("rect")
    .attr('id', 'whitePage')
};

/**
 * Creates borders that surrounds the whiteboard
 * @param d3node the area where to add borders
 */
D3Background.createBorder = function (d3node) {

  d3node.append("rect")
    .attr("id", border_0)
    .attr("class", borderClass)

  d3node.append("rect")
    .attr("id", border_1)
    .attr("class", borderClass)

  d3node.append("rect")
    .attr("id", border_2)
    .attr("class", borderClass)

  d3node.append("rect")
    .attr("id", border_3)
    .attr("class", borderClass)

  d3node.append("rect")
    .attr("id", border_4)
    .attr("class", borderClass)

  d3node.append("rect")
    .attr("id", border_5)
    .attr("class", borderClass)

  d3node.append("rect")
    .attr("id", border_6)
    .attr("class", borderClass)

  d3node.append("rect")
    .attr("id", border_7)
    .attr("class", borderClass)

};

/**
 * Creates border listeners
 * @param graph the graph which influence on borders
 * @param d3node the area where to define border listeners
 */
D3Background.createListenerBorder = function (graph, d3node) {

  d3node.append("rect")
    .attr("id", listerBorder_0)
    .attr("class", borderListerClass)

  d3node.append("rect")
    .attr("id", listerBorder_1)
    .attr("class", borderListerClass)

  d3node.append("rect")
    .attr("id", listerBorder_2)
    .attr("class", borderListerClass)

  d3node.append("rect")
    .attr("id", listerBorder_3)
    .attr("class", borderListerClass)

  d3node.append("rect")
    .attr("id", listerBorder_4)
    .attr("class", borderListerClass)

  d3node.append("rect")
    .attr("id", listerBorder_5)
    .attr("class", borderListerClass)

  d3node.append("rect")
    .attr("id", listerBorder_6)
    .attr("class", borderListerClass)

  d3node.append("rect")
    .attr("id", listerBorder_7)
    .attr("class", borderListerClass)

  d3.select("#"+listerBorder_0)
    .on("mouseover", () => {
      if (graph.layerDrag) {
        d3.select("#"+border_0).classed("active", true);
        d3.select("#"+border_1).classed("active", true);
        d3.select("#"+border_7).classed("active", true);
      }
    })
    .on("mouseleave", () => {
      d3.select("#"+border_0).classed("active", false);
      d3.select("#"+border_1).classed("active", false);
      d3.select("#"+border_7).classed("active", false);
    });

  d3.select("#"+listerBorder_1)
    .on("mouseover", () => {
      if (graph.layerDrag) {
        d3.select("#"+border_1).classed("active", true);
        d3.select("#"+border_2).classed("active", true);
        d3.select("#"+border_3).classed("active", true);
      }
    })
    .on("mouseleave", () => {
      d3.select("#"+border_1).classed("active", false);
      d3.select("#"+border_2).classed("active", false);
      d3.select("#"+border_3).classed("active", false);
    });

  d3.select("#"+listerBorder_2)
    .on("mouseover", () => {
      if (graph.layerDrag) {
        d3.select("#"+border_1).classed("active", true);
        d3.select("#"+border_2).classed("active", true);
        d3.select("#"+border_3).classed("active", true);
      }
    })
    .on("mouseleave", () => {
      d3.select("#"+border_1).classed("active", false);
      d3.select("#"+border_2).classed("active", false);
      d3.select("#"+border_3).classed("active", false);
    });

  d3.select("#"+listerBorder_3)
    .on("mouseover", () => {
      if (graph.layerDrag) {
        d3.select("#"+border_3).classed("active", true);
        d3.select("#"+border_4).classed("active", true);
        d3.select("#"+border_5).classed("active", true);
      }
    })
    .on("mouseleave", () => {
      d3.select("#"+border_3).classed("active", false);
      d3.select("#"+border_4).classed("active", false);
      d3.select("#"+border_5).classed("active", false);
    });

  d3.select("#"+listerBorder_4)
    .on("mouseover", () => {
      if (graph.layerDrag) {
        d3.select("#"+border_3).classed("active", true);
        d3.select("#"+border_4).classed("active", true);
        d3.select("#"+border_5).classed("active", true);
      }
    })
    .on("mouseleave", () => {
      d3.select("#"+border_3).classed("active", false);
      d3.select("#"+border_4).classed("active", false);
      d3.select("#"+border_5).classed("active", false);
    });

  d3.select("#"+listerBorder_5)
    .on("mouseover", () => {
      if (graph.layerDrag) {
        d3.select("#"+border_3).classed("active", true);
        d3.select("#"+border_4).classed("active", true);
        d3.select("#"+border_5).classed("active", true);
      }
    })
    .on("mouseleave", () => {
      d3.select("#"+border_3).classed("active", false);
      d3.select("#"+border_4).classed("active", false);
      d3.select("#"+border_5).classed("active", false);
    });

  d3.select("#"+listerBorder_6)
    .on("mouseover", () => {
      if (graph.layerDrag) {
        d3.select("#"+border_5).classed("active", true);
        d3.select("#"+border_6).classed("active", true);
        d3.select("#"+border_7).classed("active", true);
      }
    })
    .on("mouseleave", () => {
      d3.select("#"+border_5).classed("active", false);
      d3.select("#"+border_6).classed("active", false);
      d3.select("#"+border_7).classed("active", false);
    });

  d3.select("#"+listerBorder_7)
    .on("mouseover", () => {
      if (graph.layerDrag) {
        d3.select("#"+border_5).classed("active", true);
        d3.select("#"+border_6).classed("active", true);
        d3.select("#"+border_7).classed("active", true);
      }
    })
    .on("mouseleave", () => {
      d3.select("#"+border_5).classed("active", false);
      d3.select("#"+border_6).classed("active", false);
      d3.select("#"+border_7).classed("active", false);
    });
};

/**
 * Updates with transition the position and the size of the whiteboard
 * @param graph the graph which influence on whiteboard
 */
D3Background.updateWhiteboard = function (graph) {
  d3.select("#whitePage")
    .transition()
    .duration(500)
    .attr("x", graph.mapX)
    .attr("y", graph.mapY)
    .attr("width", graph.mapWidth)
    .attr("height", graph.mapHeight);
}

/**
 * Updates borders
 * @param graph the graph which influence on borders
 */
D3Background.updateBorder = function (graph) {

  d3.select("#" + border_0)
    .attr("x", graph.mapX - 2*graph.minWidth)
    .attr("y", graph.mapY - 2*graph.minHeight)
    .attr("width", 2*graph.minWidth)
    .attr("height", 2*graph.minHeight);

  d3.select("#" + border_1)
    .attr("x", graph.mapX)
    .attr("y", graph.mapY - 2*graph.minHeight)
    .attr("width", graph.mapWidth)
    .attr("height", 2*graph.minHeight);

  d3.select("#" + border_2)
    .attr("x", graph.mapX + graph.mapWidth)
    .attr("y", graph.mapY - 2*graph.minHeight)
    .attr("width", 2*graph.minWidth)
    .attr("height", 2*graph.minHeight);

  d3.select("#" + border_3)
    .attr("x", graph.mapX + graph.mapWidth)
    .attr("y", graph.mapY)
    .attr("width", 2*graph.minWidth)
    .attr("height", graph.mapHeight);

  d3.select("#" + border_4)
    .attr("x", graph.mapX + graph.mapWidth)
    .attr("y", graph.mapY + graph.mapHeight)
    .attr("width", 2*graph.minWidth)
    .attr("height", 2*graph.minHeight);

  d3.select("#" + border_5)
    .attr("x", graph.mapX)
    .attr("y", graph.mapY + graph.mapHeight)
    .attr("width", graph.mapWidth)
    .attr("height", 2*graph.minHeight);

  d3.select("#" + border_6)
    .attr("x", graph.mapX - 2*graph.minWidth)
    .attr("y", graph.mapY + graph.mapHeight)
    .attr("width", 2*graph.minWidth)
    .attr("height", 2*graph.minHeight);

  d3.select("#" + border_7)
    .attr("x", graph.mapX - 2*graph.minWidth)
    .attr("y", graph.mapY)
    .attr("width", 2*graph.minWidth)
    .attr("height", graph.mapHeight);
};

/**
 * Updates borders listeners
 * @param graph the graph which influence on listeners
 */
D3Background.updateListenerBorder = function (graph) {

  d3.select("#" + listerBorder_0)
    .attr("x", graph.mapX - 2*graph.minWidth)
    .attr("y", graph.mapY - 2*graph.minHeight)
    .attr("width", 2*graph.minWidth)
    .attr("height", 2*graph.minHeight);

  d3.select("#" + listerBorder_1)
    .attr("x", graph.mapX)
    .attr("y", graph.mapY - 2*graph.minHeight)
    .attr("width", graph.mapWidth)
    .attr("height", 2*graph.minHeight);

  d3.select("#" + listerBorder_2)
    .attr("x", graph.mapX + graph.mapWidth)
    .attr("y", graph.mapY - 2*graph.minHeight)
    .attr("width", 2*graph.minWidth)
    .attr("height", 2*graph.minHeight);

  d3.select("#" + listerBorder_3)
    .attr("x", graph.mapX + graph.mapWidth)
    .attr("y", graph.mapY)
    .attr("width", 2*graph.minWidth)
    .attr("height", graph.mapHeight);

  d3.select("#" + listerBorder_4)
    .attr("x", graph.mapX + graph.mapWidth)
    .attr("y", graph.mapY + graph.mapHeight)
    .attr("width", 2*graph.minWidth)
    .attr("height", 2*graph.minHeight);

  d3.select("#" + listerBorder_5)
    .attr("x", graph.mapX)
    .attr("y", graph.mapY + graph.mapHeight)
    .attr("width", graph.mapWidth)
    .attr("height", 2*graph.minHeight);

  d3.select("#" + listerBorder_6)
    .attr("x", graph.mapX - 2*graph.minWidth)
    .attr("y", graph.mapY + graph.mapHeight)
    .attr("width", 2*graph.minWidth)
    .attr("height", 2*graph.minHeight);

  d3.select("#" + listerBorder_7)
    .attr("x", graph.mapX - 2*graph.minWidth)
    .attr("y", graph.mapY)
    .attr("width", 2*graph.minWidth)
    .attr("height", graph.mapHeight);

};

/**
 * Find the rectangle that can contain all the nodes
 * To resize the whiteboard so it can contain that rectangle
 * Init with the value of the first node (layer)
 * @param graph the graph which influence on background
 */
D3Background.updateBackground = function (graph) {
  if (!graph.model.d3Layers.length <= 0) {
    let leftTopX = graph.model.d3Layers[0].x;
    let leftTopY = graph.model.d3Layers[0].y;
    let rigthBottomX = graph.model.d3Layers[0].x + graph.model.d3Layers[0].width;
    let rigthBottomY = graph.model.d3Layers[0].y + graph.model.d3Layers[0].height;
    graph.model.d3Layers.forEach( node => {
      leftTopX = node.x < leftTopX ? node.x : leftTopX;
      leftTopY = node.y < leftTopY ? node.y : leftTopY;
      rigthBottomX = node.x + node.width > rigthBottomX ?  node.x + node.width : rigthBottomX;
      rigthBottomY = node.y + node.height > rigthBottomY ?  node.y + node.height : rigthBottomY;
    });

    // Extend the whiteboard if needed
    while (leftTopX < graph.mapX) {
      graph.mapX = graph.mapX - graph.mapWidth;
      graph.mapWidth = graph.mapWidth + graph.minWidth;
    }
    while (leftTopY < graph.mapY) {
      graph.mapY = graph.mapY - graph.mapHeight;
      graph.mapHeight = graph.mapHeight + graph.minHeight;
    }
    while (rigthBottomX > graph.mapX + graph.mapWidth) {
      graph.mapWidth = graph.mapWidth + graph.minWidth;
    }
    while (rigthBottomY > graph.mapY + graph.mapHeight) {
      graph.mapHeight = graph.mapHeight + graph.minHeight;
    }

    // Reduce the whiteboard if needed
    while (leftTopX > graph.mapX + graph.minWidth && graph.mapWidth > graph.minWidth) {
      graph.mapX = graph.mapX + graph.minWidth;
      graph.mapWidth = graph.mapWidth - graph.minWidth;
    }
    while (leftTopY > graph.mapY + graph.minHeight && graph.mapHeight > graph.minHeight) {
      graph.mapY = graph.mapY + graph.minHeight;
      graph.mapHeight = graph.mapHeight - graph.minHeight;
    }
    while (rigthBottomX < graph.mapX + graph.mapWidth - graph.minWidth && graph.mapWidth > graph.minWidth) {
      graph.mapWidth = graph.mapWidth - graph.minWidth;
    }
    while (rigthBottomY < graph.mapY + graph.mapHeight - graph.minHeight && graph.mapHeight > graph.minHeight) {
      graph.mapHeight = graph.mapHeight - graph.minHeight;
    }

    // Adapt the height and the width to keep the same dimension: width/height
    while (graph.mapWidth/graph.minWidth - graph.mapHeight/graph.minHeight < 0) {
      graph.mapWidth = graph.mapWidth + graph.minWidth;
    }
    while (graph.mapHeight/graph.minHeight - graph.mapWidth/graph.minWidth < 0) {
      graph.mapHeight = graph.mapHeight + graph.minHeight;
    }

    // Change the limits out of the whiteboard
    graph.minTranslateX = graph.mapX - graph.mapWidth/2;
    graph.minTranslateY = graph.mapY - graph.mapHeight/2;
    graph.maxTranslateX = graph.mapX - graph.marginPage + graph.mapWidth;
    graph.maxTranslateY = graph.mapY - graph.marginPage + graph.mapHeight;
  }

  D3Background.updateWhiteboard(graph);
  D3Background.updateBorder(graph);
  D3Background.updateListenerBorder(graph);

};
