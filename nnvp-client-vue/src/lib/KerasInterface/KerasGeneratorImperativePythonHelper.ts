// Phase D2: Python (Keras) emission for graphs with feedback loops.
//
// The functional emitter cannot express a cycle; this one emits the Keras
// MODEL SUBCLASSING form instead: a keras.Model subclass whose __init__
// instantiates every layer exactly once (so all unrolled steps SHARE the same
// weights) and whose call() runs the acyclic prefix normally, then unrolls
// each feedback loop k steps. The feedback tensor of the first step is zeros
// — shaped (batch, width) with the width inferred from the loop's source
// layer by the planner (unrollPlan.ts, which owns every graph-shaped
// decision; this module only walks the plan's steps).
//
// Same safety contract as every emitter: all interpolation goes through
// codegenSafety (identifiers asserted, k and widths sanitized by the
// planner), and the caller (KerasGenerator) has already membership-checked
// every emitted layer/parameter name against the merged catalog.

import KerasGeneratorPythonHelper from './KerasGeneratorPythonHelper';
import { assertSafeIdentifier, assertSafeIdSuffix } from './codegenSafety';
import { isTextLayer, textLayerClassName } from './textLayers';
import type { GeneratorGraph } from './KerasGenerator';
import type { UnrollLoopStep, UnrollStep } from './unrollPlan';
import type { NnvpLayerId } from '../../types/model';

const HEADER = ''
  + '# NNVP: this graph contains feedback loops, so the model is emitted with the\n'
  + '# Keras subclassing API instead of the functional one: __init__ instantiates\n'
  + '# every layer exactly once (unrolled steps SHARE weights) and call() unrolls\n'
  + '# each feedback loop.\n';

const LOOP_COMMENT = (k: number) => ''
  + `        # Feedback loop unrolled ${k} steps with shared weights: each feedback\n`
  + '        # tensor starts as zeros (the first step sees a zero state), sized\n'
  + '        # from its loop source layer.\n';

export default function generateImperativePython(
  graph: GeneratorGraph,
  inputs: NnvpLayerId[],
  outputs: NnvpLayerId[],
  steps: UnrollStep[],
): string {
  const emittedIds: NnvpLayerId[] = steps.flatMap(
    step => (step.kind === 'node' ? [step.id] : step.members),
  );
  // Composition with the functional helper: nodeName / generateParams /
  // textLayerPreamble are shared, so both Python forms quote identically.
  const helper = new KerasGeneratorPythonHelper(graph, inputs, outputs, emittedIds, false);
  const nameOf = (id: NnvpLayerId): string => graph[id]!.keras_data!.name;
  const isReal = (id: NnvpLayerId): boolean => nameOf(id) !== 'Input' && nameOf(id) !== 'Output';

  const constructorOf = (id: NnvpLayerId): string => {
    const layerName = nameOf(id);
    const head = isTextLayer(layerName)
      ? textLayerClassName(layerName)
      : `keras.layers.${assertSafeIdentifier(layerName, 'layer type name')}`;
    const params = helper.generateParams(
      graph[id]!.keras_data!.parameterValues, graph[id]!.keras_data!.parameterDef,
    ).slice(0, -1);
    return `${head}(${params})`;
  };

  // The argument expression for one node's invocation. Inside a loop, a
  // source read through a cut (feedback) edge resolves to the feedback
  // variable — the PREVIOUS iteration's tensor — instead of this iteration's.
  const argsOf = (id: NnvpLayerId, loop?: UnrollLoopStep): string => {
    const isCut = (source: NnvpLayerId): boolean => (loop === undefined ? false
      : loop.cuts.some(cut => cut.source === String(source) && cut.target === String(id)));
    const ref = (source: NnvpLayerId): string => (isCut(source)
      ? `feedback_${assertSafeIdSuffix(source)}`
      : helper.nodeName(source));
    const sources = graph[id]!.sources;
    if (sources.length === 1) return ref(sources[0]!);
    return `[${sources.map(ref).join(',')}]`;
  };

  const invocation = (id: NnvpLayerId, indent: string, loop?: UnrollLoopStep): string =>
    `${indent}${helper.nodeName(id)} = self.${helper.nodeName(id)}(${argsOf(id, loop)})\n`;

  // --- __init__: one instantiation per real node = shared weights ------------------
  let init = '    def __init__(self, **kwargs):\n'
    + '        super().__init__(**kwargs)\n';
  emittedIds.filter(isReal).forEach((id) => {
    init += `        self.${helper.nodeName(id)} = ${constructorOf(id)}\n`;
  });

  // --- call(): acyclic prefix, unrolled loops, starved suffix ----------------------
  let call = '    def call(self, inputs):\n';
  const inputNames = inputs.map(id => helper.nodeName(id));
  call += `        ${inputNames.join(', ')} = inputs\n`;
  const batchRef = inputNames[0]!;
  steps.forEach((step) => {
    if (step.kind === 'node') {
      if (isReal(step.id)) call += invocation(step.id, '        ');
      return;
    }
    const uniqueCutSources = [...new Set(step.cuts.map(cut => cut.source))];
    call += LOOP_COMMENT(step.k);
    uniqueCutSources.forEach((source) => {
      const width = step.cuts.find(cut => cut.source === source)!.width;
      call += `        feedback_${assertSafeIdSuffix(source)} = `
        + `keras.ops.zeros((keras.ops.shape(${batchRef})[0], ${width}))\n`;
    });
    call += `        for _ in range(${step.k}):\n`;
    step.members.forEach((member) => {
      if (isReal(member)) call += invocation(member, '            ', step);
    });
    uniqueCutSources.forEach((source) => {
      call += `            feedback_${assertSafeIdSuffix(source)} = ${helper.nodeName(source)}\n`;
    });
  });
  const outputNames = outputs.map(id => helper.nodeName(id));
  call += outputNames.length === 1
    ? `        return ${outputNames[0]}\n`
    : `        return [${outputNames.join(', ')}]\n`;

  return 'import keras\n'
    + helper.textLayerPreamble()
    + '\n'
    + HEADER
    + 'class NnvpUnrolledModel(keras.Model):\n'
    + init
    + '\n'
    + call
    + '\n'
    + 'def build_model():\n'
    + '    return NnvpUnrolledModel()\n';
}
