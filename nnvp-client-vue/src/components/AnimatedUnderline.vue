<template>
  <div class="animated-underline-container">
    <div
      v-for="line in lines"
      :key="line.id"
      class="underline"
      :style="{
        left: `${line.x1}%`,
        right: `${100 - line.x2}%`,
        opacity: line.opacity,
        transition: line.transition
      }"
    ></div>
  </div>
</template>

<script>
export default {
  name: 'AnimatedUnderline',
  props: {
    isHovered: {
      type: Boolean,
      required: true
    },
    transitionDuration: {
      type: Number,
      default: 400 // ms
    },
    cleanupDelay: {
      type: Number,
      default: 300 // ms after animation completes
    }
  },
  data() {
    return {
      lines: [],
      nextId: 0,
      currentLineId: null
    };
  },
  watch: {
    isHovered(newVal) {
      if (newVal) {
        this.onHover();
      } else {
        this.onUnhover();
      }
    }
  },
  mounted() {
    // Create the first ready div
    this.createReadyLine();
  },
  methods: {
    createReadyLine() {
      const line = {
        id: this.nextId++,
        x1: 0,
        x2: 0,
        opacity: 1,
        transition: 'none'
      };
      this.lines.push(line);
      this.currentLineId = line.id;
    },

    onHover() {
      const currentLine = this.lines.find(l => l.id === this.currentLineId);
      if (!currentLine) return;

      // Animate current line from (0,0) to (0,100) with full opacity
      // Use nextTick to ensure the initial state is rendered before transition
      this.$nextTick(() => {
        currentLine.transition = `left ${this.transitionDuration}ms ease-out, right ${this.transitionDuration}ms ease-out, opacity ${this.transitionDuration}ms ease-out`;
        currentLine.x1 = 0;
        currentLine.x2 = 100;
        currentLine.opacity = 1;
      });

      // Create a new ready line for the next animation
      this.createReadyLine();
    },

    onUnhover() {
      // Find the line that's currently at (0,100)
      const activeLines = this.lines.filter(l => l.x1 === 0 && l.x2 === 100);
      if (activeLines.length === 0) return;

      // Animate the most recent one from (0,100) to (100,100) while fading out
      const lineToComplete = activeLines[activeLines.length - 1];
      lineToComplete.transition = `left ${this.transitionDuration}ms ease-out, right ${this.transitionDuration}ms ease-out, opacity ${this.transitionDuration}ms ease-out`;
      lineToComplete.x1 = 100;
      lineToComplete.x2 = 100;
      lineToComplete.opacity = 0;

      // Schedule cleanup after animation completes
      setTimeout(() => {
        this.cleanupLine(lineToComplete.id);
      }, this.transitionDuration + this.cleanupDelay);
    },

    cleanupLine(id) {
      const index = this.lines.findIndex(l => l.id === id);
      if (index !== -1) {
        this.lines.splice(index, 1);
      }
    }
  }
};
</script>

<style scoped>
.animated-underline-container {
  position: absolute;
  bottom: 4px;
  left: 10px;
  right: 10px;
  height: 1px;
  pointer-events: none;
}

.underline {
  position: absolute;
  top: 0;
  height: 100%;
  background-color: #000000;
}
</style>
