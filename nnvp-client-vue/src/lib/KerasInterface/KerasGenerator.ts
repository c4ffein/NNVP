// class KerasPythonGenerator {
// This class was adapted from backend Python code.
// It will probably be refactored soon.

/* eslint-disable no-param-reassign */
/* eslint-disable no-continue */
/* eslint class-methods-use-this: ["error", { "exceptMethods": ["generateTuple",
                                                                "jsonToGraph"] }] */

import KerasGeneratorPythonHelper from './KerasGeneratorPythonHelper';
import type { GeneratorParamDef } from './KerasGeneratorPythonHelper';
import KerasGeneratorJavascriptHelper from './KerasGeneratorJavascriptHelper';
import KerasGeneratorPyTorchHelper from './KerasGeneratorPyTorchHelper';
import KerasGeneratorTinygradHelper from './KerasGeneratorTinygradHelper';
import generateImperativePython from './KerasGeneratorImperativePythonHelper';
import { planUnroll } from './unrollPlan';
import { orderGraph, CyclicGraphError } from './orderGraph';
import { assertKnownIdentifier } from './codegenSafety';
import { isKnownLayerName, knownParameterNames } from './catalogMembership';
import type { KerasLayerJSON, NnvpLayer, NnvpLayerId, NnvpModel } from '../../types/model';

export { CyclicGraphError };

/**
 * The generator moves each layer's `kerasLayer` to the node's `keras_data`
 * and deletes it from the stashed `boardData`, hence the optional override.
 */
export type BoardLayerData = Omit<NnvpLayer, 'kerasLayer'> & { kerasLayer?: KerasLayerJSON | null };

/** One node of the generator's working graph (also what the helpers consume). */
export interface GeneratorGraphNode {
  sources: NnvpLayerId[];
  targets: NnvpLayerId[];
  keras_data: KerasLayerJSON | null;
  /** The board-side layer entry (position, wiring, ...) as stored in the file. */
  boardData: BoardLayerData | null;
  treated: boolean;
}

export type GeneratorGraph = Record<NnvpLayerId, GeneratorGraphNode>;

export default class KerasGenerator {
  json: NnvpModel;
  graph: GeneratorGraph;
  inputs: NnvpLayerId[];
  outputs: NnvpLayerId[];
  list: NnvpLayerId[];
  /** Cycle members + nodes starved by a cycle — see orderGraph. Non-empty
   *  makes every generate* entry point throw CyclicGraphError. */
  excluded: NnvpLayerId[];
  /** The actual cycle node groups (orderGraph's Tarjan SCCs). */
  cycles: NnvpLayerId[][];
  sequential: boolean;
  helper: KerasGeneratorJavascriptHelper | KerasGeneratorPythonHelper;

  constructor(json: NnvpModel, isJavascript?: boolean) {
    this.json = json;
    this.graph = this.jsonToGraph(json);
    this.inputs = this.findInputs();
    this.outputs = this.findOutputs();
    // The shared topological ordering (orderGraph, also used by the .keras
    // import): same treatment-list semantics the generator always had for
    // acyclic graphs. Cyclic graphs no longer truncate silently — the
    // excluded set is kept and every generate* refuses on it (decision 9:
    // cyclic models route to imperative emission, not yet implemented).
    const ordered = orderGraph(this.graph, this.inputs);
    this.list = ordered.order;
    this.excluded = ordered.excluded;
    this.cycles = ordered.cycles;
    for (const id of this.list) { // eslint-disable-line
      this.graph[id]!.treated = true;
    }
    this.sequential = this.isSequential();
    // Too bad we can't easily and cleanly heritate those classes from this one while doing mutual
    // inclusion, we'll have to use composition instead
    this.helper = isJavascript
      ? new KerasGeneratorJavascriptHelper(
        this.graph, this.inputs, this.outputs, this.list, this.sequential,
      )
      : new KerasGeneratorPythonHelper(
        this.graph, this.inputs, this.outputs, this.list, this.sequential,
      );
  }

  // Convert a json from the graph editor to a more adapted object
  jsonToGraph(json: NnvpModel): GeneratorGraph {
    const result: GeneratorGraph = {};
    for (const layer of json.layers) { // eslint-disable-line
      this.addLayerToResult(layer, result);
    }
    return result;
  }

  addLayerToResult(layer: NnvpLayer, result: GeneratorGraph) {
    if (layer.children === null) {
      const nodeId = layer.id;
      if (!Object.prototype.hasOwnProperty.call(result, nodeId)) {
        result[nodeId] = {
          sources: [], targets: [], keras_data: null, boardData: null, treated: false,
        };
      }
      result[nodeId]!.boardData = layer;
      result[nodeId]!.keras_data = layer.kerasLayer;
      delete result[nodeId]!.boardData!.kerasLayer;
      result[nodeId]!.sources = layer.inputLayers;
      result[nodeId]!.targets = layer.outputLayers;
    } else {
      for (const child of layer.children!) { // eslint-disable-line
        this.addLayerToResult(child, result);
      }
    }
  }

  // Return a list of the different inputs
  findInputs(): NnvpLayerId[] {
    const inputs = [];
    for (const id of this.json.inputs) { // eslint-disable-line
      inputs.push(id);
    }
    return inputs;
  }

  // Return a list of the different outputs
  findOutputs(): NnvpLayerId[] {
    const outputs = [];
    for (const id of this.json.outputs) { // eslint-disable-line
      outputs.push(id);
    }
    return outputs;
  }

  /** Renders one node id as a user-legible label ("Dense (id 4)"). */
  labelFor = (id: NnvpLayerId): string => {
    const node = this.graph[id];
    const name = node?.keras_data?.name ?? node?.boardData?.name;
    return name ? `${name} (id ${id})` : `id ${id}`;
  };

  /**
   * Refuse cyclic graphs loudly (never silently truncated): for targets
   * without imperative emission (JavaScript/PyTorch/tinygrad — Python has it
   * since Phase D2), a feedback loop throws a typed, user-legible
   * CyclicGraphError naming the target that DOES support cycles.
   * @param activity user-facing activity label ("PyTorch code generation", ...)
   */
  assertAcyclic(activity: string): void {
    if (this.excluded.length === 0) return;
    throw new CyclicGraphError(activity, this.excluded, this.cycles, this.labelFor);
  }

  /**
   * Membership hardening (Phase D2): pattern-valid names are not enough —
   * every layer name must exist in the merged catalog (generated + NNVP text
   * layers, aliases included) and every parameter name in that layer's
   * catalog parameters. Params flagged skipInGeneration (a code-defined
   * GeneratorParamDef escape hatch) never reach the output, so their names
   * are exempt.
   */
  assertCatalogMembership(ids: NnvpLayerId[]): void {
    ids.forEach((id) => {
      const data = this.graph[id]?.keras_data;
      if (!data) return;
      assertKnownIdentifier(data.name, 'layer type name', isKnownLayerName);
      const known = knownParameterNames(data.name);
      Object.keys(data.parameterValues ?? {}).forEach((param) => {
        const def = (data.parameterDef ? data.parameterDef[param] : undefined) as
          GeneratorParamDef | undefined;
        if (def && def.skipInGeneration === true) return;
        assertKnownIdentifier(param, 'parameter name', name => known.has(name));
      });
    });
  }

  // Return true if we can generate a sequential layer, false otherwise
  isSequential(): boolean {
    if (this.inputs.length !== 1) return false;
    if (this.outputs.length !== 1) return false;
    // Check that all layers form a linear chain
    for (const layer of Object.values(this.graph)) { // eslint-disable-line
      if (layer.sources.length !== 1) {
        if (!(layer.keras_data!.name === 'Input' && layer.sources.length === 0)) return false;
      }
      if (layer.targets.length !== 1) {
        if (!(layer.keras_data!.name === 'Output' && layer.targets.length === 0)) return false;
      }
    }
    return true;
  }

  generateFromGraph() {
    // (No helper actually defines generateFromGraph; dead code kept as-is.)
    return (this.helper as unknown as { generateFromGraph(): string }).generateFromGraph();
  }

  generatePythonFromGraph() {
    // Phase D2: a cyclic graph routes to imperative (subclassing) emission
    // instead of throwing — acyclic graphs keep the functional/sequential
    // emission byte-identical (pinned by tests).
    if (this.excluded.length > 0) return this.generateImperativePython();
    this.assertCatalogMembership(this.list);
    return new KerasGeneratorPythonHelper(
      this.graph, this.inputs, this.outputs, this.list, this.sequential,
    ).generate();
  }

  /** The Keras subclassing form for graphs with feedback loops (decision 9). */
  private generateImperativePython(): string {
    // Membership first, over everything the plan may emit (order + excluded =
    // all nodes reachable from the inputs), so a hostile rename inside a loop
    // surfaces as the membership error, not a confusing plan failure.
    this.assertCatalogMembership([...this.list, ...this.excluded]);
    const steps = planUnroll({
      graph: this.graph,
      inputs: this.inputs,
      cycles: this.cycles,
      excluded: this.excluded,
      edges: this.json.edges,
      activity: 'Python code generation',
      label: this.labelFor,
    });
    return generateImperativePython(this.graph, this.inputs, this.outputs, steps);
  }

  generateJavascriptFromGraph() {
    this.assertAcyclic('JavaScript code generation');
    this.assertCatalogMembership(this.list);
    return new KerasGeneratorJavascriptHelper(
      this.graph, this.inputs, this.outputs, this.list, this.sequential,
    ).generate();
  }

  generatePyTorchFromGraph() {
    this.assertAcyclic('PyTorch code generation');
    this.assertCatalogMembership(this.list);
    return new KerasGeneratorPyTorchHelper(
      this.graph, this.inputs, this.outputs, this.list, this.sequential,
    ).generate();
  }

  generateTinygradFromGraph() {
    this.assertAcyclic('tinygrad code generation');
    this.assertCatalogMembership(this.list);
    return new KerasGeneratorTinygradHelper(
      this.graph, this.inputs, this.outputs, this.list, this.sequential,
    ).generate();
  }
}
