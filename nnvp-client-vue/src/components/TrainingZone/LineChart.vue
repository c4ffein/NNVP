<template>
  <div class="line-chart-container">
    <div class="chart-title">{{ title }}</div>
    <div class="chart-wrapper" ref="chartWrapper">
      <svg
        class="line-chart-svg"
        :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
        @mousemove="handleMouseMove"
        @mouseleave="hideTooltip"
      >
        <!-- Background grid lines -->
        <g class="grid">
          <line
            v-for="tick in yTicks"
            :key="`y-${tick.value}`"
            :x1="margin.left"
            :y1="tick.y"
            :x2="svgWidth - margin.right"
            :y2="tick.y"
            class="grid-line"
          />
        </g>

        <!-- Axes -->
        <g class="axes">
          <!-- Y-axis -->
          <line
            :x1="margin.left"
            :y1="margin.top"
            :x2="margin.left"
            :y2="svgHeight - margin.bottom"
            class="axis-line"
          />
          <!-- X-axis -->
          <line
            :x1="margin.left"
            :y1="svgHeight - margin.bottom"
            :x2="svgWidth - margin.right"
            :y2="svgHeight - margin.bottom"
            class="axis-line"
          />
        </g>

        <!-- Y-axis labels -->
        <g class="y-axis-labels">
          <text
            v-for="tick in yTicks"
            :key="`y-label-${tick.value}`"
            :x="margin.left - 10"
            :y="tick.y + 4"
            class="axis-label"
          >
            {{ tick.label }}
          </text>
        </g>

        <!-- X-axis labels -->
        <g class="x-axis-labels">
          <text
            v-for="tick in xTicks"
            :key="`x-label-${tick.value}`"
            :x="tick.x"
            :y="svgHeight - margin.bottom + 20"
            class="axis-label"
          >
            {{ tick.label }}
          </text>
        </g>

        <!-- Data lines -->
        <g class="lines">
          <path
            v-for="(series, index) in validSeries"
            :key="`line-${index}`"
            :d="getLinePath(series)"
            :class="`line line-${series.name}`"
            fill="none"
          />
        </g>

        <!-- Interactive hover points (invisible but clickable) -->
        <g class="hover-points">
          <circle
            v-for="(point, i) in allPoints"
            :key="`point-${point.seriesIndex}-${i}`"
            :cx="point.x"
            :cy="point.y"
            r="5"
            class="hover-point"
            @mouseenter="showTooltip(point, $event)"
          />
        </g>

        <!-- Legend -->
        <g class="legend" :transform="`translate(${svgWidth - margin.right + 20}, ${margin.top})`">
          <g
            v-for="(series, index) in validSeries"
            :key="`legend-${index}`"
            :transform="`translate(0, ${index * 20})`"
          >
            <line
              x1="0"
              y1="0"
              x2="20"
              y2="0"
              :class="`line line-${series.name}`"
            />
            <text x="25" y="4" class="legend-label">
              {{ series.name }}: {{ getLastValue(series) }}
            </text>
          </g>
        </g>
      </svg>

      <!-- Tooltip (HTML overlay) -->
      <div
        v-if="tooltip.visible"
        class="tooltip"
        :style="{
          left: tooltip.x + 'px',
          top: tooltip.y + 'px'
        }"
      >
        <div class="tooltip-label">{{ tooltip.label }}</div>
        <div class="tooltip-series">{{ tooltip.seriesName }}</div>
        <div class="tooltip-value">{{ tooltip.value }}</div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'LineChart',
  props: {
    title: {
      type: String,
      required: true
    },
    chartData: {
      type: Object,
      required: true
    }
  },
  data() {
    return {
      svgWidth: 800,
      svgHeight: 400,
      margin: { top: 20, right: 120, bottom: 40, left: 60 },
      tooltip: {
        visible: false,
        x: 0,
        y: 0,
        label: '',
        seriesName: '',
        value: ''
      }
    };
  },
  computed: {
    validSeries() {
      if (!this.chartData || !this.chartData.series) return [];
      return this.chartData.series.filter(s => s.data && s.data.length > 0);
    },

    labels() {
      return this.chartData?.labels || [];
    },

    chartWidth() {
      return this.svgWidth - this.margin.left - this.margin.right;
    },

    chartHeight() {
      return this.svgHeight - this.margin.top - this.margin.bottom;
    },

    // Calculate Y-axis range
    yExtent() {
      if (this.validSeries.length === 0) return [0, 1];

      const allValues = this.validSeries.flatMap(s => s.data).filter(v => v != null);
      if (allValues.length === 0) return [0, 1];

      const min = Math.min(...allValues);
      const max = Math.max(...allValues);
      const range = max - min || 1;
      const padding = range * 0.1;

      return [Math.max(0, min - padding), max + padding];
    },

    // Calculate X-axis range
    xExtent() {
      if (this.labels.length === 0) return [0, 1];
      return [0, Math.max(...this.labels)];
    },

    // Scaling functions
    xScale() {
      const [min, max] = this.xExtent;
      return (value) => {
        return this.margin.left + ((value - min) / (max - min)) * this.chartWidth;
      };
    },

    yScale() {
      const [min, max] = this.yExtent;
      return (value) => {
        return this.margin.top + this.chartHeight - ((value - min) / (max - min)) * this.chartHeight;
      };
    },

    // Y-axis ticks
    yTicks() {
      const [min, max] = this.yExtent;
      const tickCount = 5;
      const ticks = [];

      for (let i = 0; i <= tickCount; i++) {
        const value = min + (max - min) * (i / tickCount);
        ticks.push({
          value,
          y: this.yScale(value),
          label: value.toFixed(2)
        });
      }

      return ticks;
    },

    // X-axis ticks
    xTicks() {
      if (this.labels.length === 0) return [];

      const [min, max] = this.xExtent;
      const tickCount = Math.min(10, this.labels.length);
      const step = Math.ceil((max - min + 1) / tickCount);
      const ticks = [];

      for (let i = min; i <= max; i += step) {
        ticks.push({
          value: i,
          x: this.xScale(i),
          label: i.toString()
        });
      }

      return ticks;
    },

    // Flatten all points for hover detection
    allPoints() {
      const points = [];

      this.validSeries.forEach((series, seriesIndex) => {
        series.data.forEach((value, i) => {
          if (value != null && this.labels[i] != null) {
            points.push({
              x: this.xScale(this.labels[i]),
              y: this.yScale(value),
              value,
              label: this.labels[i],
              seriesName: series.name,
              seriesIndex
            });
          }
        });
      });

      return points;
    }
  },
  methods: {
    getLinePath(series) {
      if (!series.data || series.data.length === 0) return '';

      let path = '';
      let firstPoint = true;

      series.data.forEach((value, i) => {
        if (value != null && this.labels[i] != null) {
          const x = this.xScale(this.labels[i]);
          const y = this.yScale(value);

          if (firstPoint) {
            path += `M ${x} ${y}`;
            firstPoint = false;
          } else {
            path += ` L ${x} ${y}`;
          }
        }
      });

      return path;
    },

    getLastValue(series) {
      const lastValue = series.data[series.data.length - 1];
      return lastValue != null ? lastValue.toFixed(3) : 'N/A';
    },

    handleMouseMove(event) {
      // Mouse move is handled by individual hover points
    },

    showTooltip(point, event) {
      const wrapper = this.$refs.chartWrapper;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();

      this.tooltip = {
        visible: true,
        x: event.clientX - rect.left + 10,
        y: event.clientY - rect.top - 10,
        label: `Epoch/Batch: ${point.label}`,
        seriesName: point.seriesName,
        value: point.value.toFixed(4)
      };
    },

    hideTooltip() {
      this.tooltip.visible = false;
    }
  }
};
</script>

<style scoped>
.line-chart-container {
  display: grid;
  grid-template-rows: 20px 1fr;
  height: 100%;
  width: 100%;
}

.chart-title {
  grid-row: 1/2;
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  font-size: 15px;
}

.chart-wrapper {
  grid-row: 2/2;
  width: 100%;
  height: 100%;
  position: relative;
}

.line-chart-svg {
  width: 100%;
  height: 100%;
}

/* Grid */
.grid-line {
  stroke: #222;
  stroke-width: 1;
}

/* Axes */
.axis-line {
  stroke: #444;
  stroke-width: 1;
}

.axis-label {
  fill: #888;
  font-size: 11px;
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  text-anchor: end;
}

.x-axis-labels .axis-label {
  text-anchor: middle;
}

/* Lines */
.line {
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.line-acc {
  stroke: rgba(255, 0, 0, 0.8);
}

.line-val-acc {
  stroke: rgba(255, 64, 0, 0.8);
}

.line-loss {
  stroke: rgba(0, 0, 255, 0.8);
}

.line-val-loss {
  stroke: rgba(0, 64, 255, 0.8);
}

/* Hover points */
.hover-point {
  fill: transparent;
  cursor: pointer;
}

.hover-point:hover {
  fill: rgba(255, 255, 255, 0.3);
}

/* Legend */
.legend-label {
  fill: #888;
  font-size: 12px;
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
}

/* Tooltip */
.tooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.9);
  color: #fff;
  padding: 8px 12px;
  border-radius: 4px;
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  font-size: 12px;
  pointer-events: none;
  z-index: 1000;
  white-space: nowrap;
}

.tooltip-label {
  font-weight: bold;
  margin-bottom: 4px;
}

.tooltip-series {
  color: #aaa;
  font-size: 11px;
}

.tooltip-value {
  font-size: 14px;
  margin-top: 2px;
}
</style>
