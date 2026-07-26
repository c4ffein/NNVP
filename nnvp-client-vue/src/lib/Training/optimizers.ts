/**
 * Optimizer construction shared by the tfjs training engines (tfjsEngine on
 * the main thread, trainingWorkerHost in the worker) — extracted verbatim
 * from tfjsEngine.ts so both build the exact same optimizer from the same UI
 * params. tfjsEngine re-exports `buildOptimizer`, so its historical import
 * surface is unchanged.
 */

// The tfjs runtime surface is deliberately loose here, same rationale as
// tfjsEngine.ts: engine.ts keeps @tensorflow/tfjs types off the seam.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tf = any;

// tf.train factories take POSITIONAL arguments — handing them the params
// OBJECT (the historical code) silently made the object the learning rate,
// i.e. NaN: sgd/adam "trained" without moving a single weight. The tables
// map the UI's named params onto each factory's signature; a param the UI
// leaves empty stays undefined so the tfjs default applies.
const OPTIMIZER_SIGNATURES: Record<string, string[]> = {
  sgd: ['learningRate'],
  momentum: ['learningRate', 'momentum', 'useNesterov'],
  rmsprop: ['learningRate', 'decay', 'momentum', 'epsilon', 'centered'],
  adam: ['learningRate', 'beta1', 'beta2', 'epsilon'],
  adamax: ['learningRate', 'beta1', 'beta2', 'epsilon', 'decay'],
  adagrad: ['learningRate', 'initialAccumulatorValue'],
  adadelta: ['learningRate', 'rho', 'epsilon'],
};

/** Positional tf.train construction; sgd with momentum routes to tf.train.momentum. */
export function buildOptimizer(tf: Tf, optimizer: string, params: Record<string, unknown>): unknown {
  let name = optimizer;
  if (name === 'sgd' && Number(params.momentum) > 0) name = 'momentum';
  const signature = OPTIMIZER_SIGNATURES[name];
  if (!signature) return tf.train[optimizer](params.learningRate);
  const args: unknown[] = signature.map(key => (params[key] !== undefined ? params[key] : undefined));
  if (name === 'momentum') {
    // tf.train.momentum REQUIRES lr and momentum (no defaults).
    args[0] = args[0] !== undefined ? args[0] : 0.01;
    args[1] = args[1] !== undefined ? args[1] : Number(params.momentum) || 0;
    args[2] = !!params.nesterov || !!params.useNesterov;
  }
  return tf.train[name](...args);
}

/** The engines' shared empty-param filter (also fed to the debug exposure). */
export function filterOptimizerParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
}

/**
 * What model.compile receives: the optimizer NAME when no usable param was
 * set (tfjs defaults apply), else a positionally-built optimizer instance —
 * the exact historical tfjsEngine.prepare logic.
 */
export function buildOptimizerConfig(
  tf: Tf, optimizer: string, params: Record<string, unknown>,
): unknown {
  const filtered = filterOptimizerParams(params);
  if (Object.keys(filtered).length === 0) return optimizer;
  return buildOptimizer(tf, optimizer, filtered);
}
