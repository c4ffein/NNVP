<template>
  <div class="LayerOptions">
    <div class="network-stats" v-if="selectedNode.e.length === 0">
      <h3>Network Overview</h3>
      <div class="stat-item">
        <span class="stat-label">Layers</span>
        <span class="stat-value">{{ totalLayers }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Inputs</span>
        <span class="stat-value">{{ totalInputs }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Outputs</span>
        <span class="stat-value">{{ totalOutputs }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Connections</span>
        <span class="stat-value">{{ totalEdges }}</span>
      </div>
    </div>
    <div id="layeroptions-block" class="layeroptions-block" v-if="nodeIsSelected()">
      <ParamsBlock
        v-for="(selectedLayer, index) in activeLayers"
        v-bind:key="selectedLayer.id"
        v-bind:title="selectedLayer.kerasLayer.name"
        v-bind:layerType="selectedLayer.kerasLayer.name"
      >
        <component class="LayerOptions param"
          :key="paramK"
          v-for="(paramV, paramK) in selectedLayer.kerasLayer.parameterDef"
          v-bind:is="parameterToComponentName(paramV)"
          v-bind:name="paramK"
          v-bind:valueList="paramV.list"
          v-bind:defaultValue="paramV.default"
          v-bind:activeLayer="selectedLayer.kerasLayer"
          v-bind:conditions="paramV.conditions"
        ></component>
        <OrderParameter
          v-if="isMergeLayer(selectedLayer.kerasLayer.category)"
          v-bind:title="selectedLayer.kerasLayer.parameterDef[1]"
          v-bind:itemList="selectedLayer.inputLayers"
          v-bind:idFunc="e => e"
          v-bind:nameFunc="e => $boardInterface.findLayerById(e)!.kerasLayer!.name"
        />
        <div v-if="index != selectedNode.e.length - 1">
          <br>
        </div>
      </ParamsBlock>

      <ParamsBlock title="Model Inputs" v-if="inputInLayersAndMoreThanOneInModel">
        <div class="LayerOptions param">
          <OrderParameter
            v-bind:itemList="$boardInterface.activeGraph!.model.modelInputs"
            :idFunc="e => e.id"
            :nameFunc="e => e.name"
        />
        </div>
      </ParamsBlock>

      <ParamsBlock title="Model Outputs" v-if="outputInLayers">
        <div class="LayerOptions param">
          <OrderParameter
            v-bind:itemList="$boardInterface.activeGraph!.model.modelOutputs"
            :idFunc="e => e.id"
            :nameFunc="e => e.name"
          />
        </div>
      </ParamsBlock>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import ParamsBlock from './ParamsBlock.vue';
import ListParameter from '../Parameters/ListParameter.vue';
import IntParameter from '../Parameters/IntParameter.vue';
import BooleanParameter from '../Parameters/BooleanParameter.vue';
import TupleIntParameter from '../Parameters/TupleIntParameter.vue';
import FloatParameter from '../Parameters/FloatParameter.vue';
import StringParameter from '../Parameters/StringParameter.vue';
import OrderParameter from '../Parameters/OrderParameter.vue';
import type KerasLayer from '../../lib/KerasInterface/KerasLayer';
import type { LayerWrapper } from '../../lib/FlowInterface/FlowGraphEditor';
import type { ParameterDef } from '../../types/model';

// The catalog JSON carries extra editor hints (option lists, range
// conditions) on top of what types/model.ts's ParameterDef models.
type EditorParameterDef = ParameterDef & { list?: string[]; conditions?: string[] };

/**
 * A selected LayerWrapper whose kerasLayer is known present — activeLayers
 * filters Output nodes, and every remaining selection carries a revived live
 * KerasLayer instance (see types/model.ts's revive contract).
 */
type ActiveLayer = LayerWrapper & {
  kerasLayer: KerasLayer & { parameterDef: Record<string, EditorParameterDef> };
};

// Non-reactive instance fields assigned outside data() (pure typing pass:
// keeping them out of data() preserves their non-reactive nature — same
// pattern as CornerControls.vue).
interface LayerOptionsInstanceExtra {
  selectionChangeHandler?: () => void;
  graphChangeHandler?: () => void;
}

export default defineComponent({
  name: 'LayerOptions',
  components: {
    ParamsBlock,
    ListParameter,
    IntParameter,
    FloatParameter,
    BooleanParameter,
    TupleIntParameter,
    StringParameter,
    OrderParameter,
  },
  data() {
    return {
      refreshKey: 0,
    };
  },
  mounted() {
    const self = this as unknown as LayerOptionsInstanceExtra;
    // Subscribe to selection changes from D3GraphEditor
    self.selectionChangeHandler = () => {
      this.refreshKey++;
    };
    this.$boardInterface.on('selection-changed', self.selectionChangeHandler);
    // Subscribe to graph structure changes (layers added/removed, template loaded, etc.)
    self.graphChangeHandler = () => {
      this.refreshKey++;
    };
    this.$boardInterface.on('graph-changed', self.graphChangeHandler);
  },
  beforeUnmount() {
    const self = this as unknown as LayerOptionsInstanceExtra;
    // Unsubscribe from events
    if (self.selectionChangeHandler) {
      this.$boardInterface.off('selection-changed', self.selectionChangeHandler);
    }
    if (self.graphChangeHandler) {
      this.$boardInterface.off('graph-changed', self.graphChangeHandler);
    }
  },
  computed: {
    selectedNode(): { e: LayerWrapper[] } {
      // Force reactivity by accessing refreshKey
      this.refreshKey; // eslint-disable-line
      const container = this.$boardInterface.getActiveElementsContainer();
      // Create a new object with a fresh array reference so Vue can detect changes
      return {
        e: container.e ? [...container.e] : [],
      };
    },
    activeLayers(): ActiveLayer[] {
      const activeLayers: ActiveLayer[] = [];
      for (const d3Layer of this.selectedNode.e) { // eslint-disable-line
        if (!this.isOutputLayer(d3Layer.kerasLayer)) activeLayers.push(d3Layer as ActiveLayer);
      }
      return activeLayers;
    },
    inputInLayersAndMoreThanOneInModel(): boolean {
      for (const layer of this.selectedNode.e) { // eslint-disable-line
        if (this.isInputLayer(layer)) {
          if (this.$boardInterface.activeGraph!.model.modelInputs.length > 1) {
            return true;
          }
          return false;
        }
      }
      return false;
    },
    outputInLayers(): boolean {
      for (const layer of this.selectedNode.e) { // eslint-disable-line
        if (this.isOutputLayer(layer)) {
          return true;
        }
      }
      return false;
    },
    totalLayers(): number {
      this.refreshKey; // eslint-disable-line
      if (!this.$boardInterface?.activeGraph?.model?.d3Layers) return 0;
      return this.$boardInterface.activeGraph.model.d3Layers.length;
    },
    totalInputs(): number {
      this.refreshKey; // eslint-disable-line
      if (!this.$boardInterface?.activeGraph?.model?.modelInputs) return 0;
      return this.$boardInterface.activeGraph.model.modelInputs.length;
    },
    totalOutputs(): number {
      this.refreshKey; // eslint-disable-line
      if (!this.$boardInterface?.activeGraph?.model?.modelOutputs) return 0;
      return this.$boardInterface.activeGraph.model.modelOutputs.length;
    },
    totalEdges(): number {
      this.refreshKey; // eslint-disable-line
      if (!this.$boardInterface?.activeGraph?.model?.d3Edges) return 0;
      return this.$boardInterface.activeGraph.model.d3Edges.length;
    },
  },
  methods: {
    nodeIsSelected(): boolean {
      return this.selectedNode !== null
          && this.selectedNode.e !== null
          && this.selectedNode.e.length > 0;
    },
    parameterToComponentName(parameter: EditorParameterDef): string {
      const typeToName: Record<ParameterDef['type'], string> = {
        float: 'FloatParameter',
        int: 'IntParameter',
        tuple_int: 'TupleIntParameter',
        list: 'ListParameter',
        boolean: 'BooleanParameter',
        string: 'StringParameter',
        type_selecter: 'StringParameter',
      };
      return typeToName[parameter.type];
    },
    isMergeLayer(nodeCategory: string): boolean {
      return nodeCategory === 'Merge';
    },
    // Both take anything carrying a `name` — activeLayers passes the
    // kerasLayer while outputInLayers passes the LayerWrapper itself (a
    // historical inconsistency that happens to work since both have names);
    // the `!` keeps the historical crash-on-null behavior.
    isInputLayer(kerasLayer: { name: string } | null): boolean {
      return kerasLayer!.name === 'Input';
    },
    isOutputLayer(kerasLayer: { name: string } | null): boolean {
      return kerasLayer!.name === 'Output';
    },
    toggleLayer(id: string) {
      document.getElementById(id)!.classList.toggle('closed');
    },
  },
});
</script>

<style >
.LayerOptions {
  height: 100%;
  box-sizing: border-box;
  -moz-box-sizing: border-box;
  -webkit-box-sizing: border-box;
  color: var(--text-primary);
}

/* Network stats display when no layer is selected */
.network-stats {
  padding: 20px;
}
.network-stats h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
}
.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--panel-border);
}
.stat-item:last-child {
  border-bottom: none;
}
.stat-label {
  font-size: 14px;
  color: var(--text-muted);
  font-weight: var(--font-weight-regular);
}
.stat-value {
  font-size: 18px;
  font-weight: var(--font-weight-regular);
  color: var(--text-primary);
}

.layeroptions-block {
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  font-size: 14px;
  user-select: none;
  min-height: 100%;
  padding: 12px;
}
.LayerOptions.param {
  text-align: left;
  padding: 8px 0;
}
</style>
