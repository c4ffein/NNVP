# The CANONICAL driver (see ./README.md; it grew out of the gitignored
# experiments/pyodide-tinygrad, whose copies are historical). Runs INSIDE
# Pyodide (see ../worker.js): traces one SGD training step with tinygrad on
# the GPU-less NULL:WGSL device, exports it as a WebGPU JS runner via the
# vendored export_model.py, and builds a safetensors blob with REAL random
# weights — the NULL device fake-executes, so its weight values come out as
# zeros, and an all-zeros network cannot train (symmetric gradients).
#
# IMPORTANT: os.environ must be set BEFORE tinygrad is imported (worker.js
# does it in Pyodide; ./run_local.py shows the CPython way).

import json
import math
import os
import random
import re
import struct

assert os.environ.get("DEV") == "NULL:WGSL", "set DEV=NULL:WGSL before importing tinygrad"

import contextlib  # noqa: E402

from tinygrad import Tensor, nn  # noqa: E402
from tinygrad.nn.state import get_parameters, get_state_dict  # noqa: E402


def training_context():
    """0.13.0 uses the Tensor.train() context manager; master replaced it with
    Context(TRAINING=1). Support both so the toy survives wheel upgrades."""
    if hasattr(Tensor, "train"):
        return Tensor.train()
    from tinygrad.helpers import Context
    with contextlib.suppress(KeyError):
        return Context(TRAINING=1)
    raise RuntimeError("no known way to enable training mode in this tinygrad")

import export_model as em  # noqa: E402  (vendored from tinygrad master extra/)

if "NULL" not in em.EXPORT_SUPPORTED_DEVICE:
    em.EXPORT_SUPPORTED_DEVICE.append("NULL")

BATCH_SIZE = 32
LEARNING_RATE = 0.01


class Model:
    def __init__(self):
        self.layer_1 = nn.Linear(784, 128)
        self.layer_2 = nn.Linear(128, 10)

    def __call__(self, x):
        x = x.flatten(1)
        x = self.layer_1(x).relu()
        return self.layer_2(x)  # logits; softmax folded into the loss


class TrainStep:
    """One SGD step (forward + cross-entropy + backward + update) per call."""

    def __init__(self, model_cls=Model, lr=LEARNING_RATE, momentum=0.9, nesterov=False):
        self.model = model_cls()
        self.opt = nn.optim.SGD(
            get_parameters(self.model), lr=lr, momentum=momentum, nesterov=nesterov)

    def __call__(self, x, y):
        # BatchNorm running mean/var: their per-step update assigns are NOT
        # dependencies of the loss, so they must be realized explicitly or the
        # trace silently drops them (stats frozen at init, and the eval
        # runner's weight sync then finds no source buffer for them).
        # Collected HERE, not stored on self: an attribute would enter
        # get_state_dict(step) and its alias names would win export_model's
        # last-name-wins weight naming, hiding the canonical model.* names.
        # num_batches_tracked stays out: it is int64 (no i64 in WGSL) and the
        # stats math never reads it while momentum is a number.
        bn_stats = [
            tensor for name, tensor in get_state_dict(self.model).items()
            if name.endswith(".running_mean") or name.endswith(".running_var")
        ]
        with training_context():
            self.opt.zero_grad()
            loss = self.model(x).sparse_categorical_crossentropy(y)
            loss.backward()
            # realize the loss WITH the update, or the scheduler recomputes
            # the loss after the weights moved (see experiments/README).
            Tensor.realize(loss, *self.opt.schedule_step(), *bn_stats)
            return loss


def build_safetensors(state, seed=1337, lr=LEARNING_RATE):
    """Hand-rolled safetensors with real values: Glorot-uniform weights,
    zero biases/momentum, ONE for BatchNorm running_var (unit variance, like
    every framework's init — zero would divide the eval pass by sqrt(eps)),
    the actual learning rate for the lr tensor."""
    rng = random.Random(seed)
    header = {}
    blobs = []
    offset = 0
    # The state dict aliases each weight under TWO names (model.layer_N.weight
    # and opt.params.N — same tensor object), and the emitted runner loads
    # from the opt.params.* ones. Key generated values by tensor identity so
    # every alias carries the same bytes and it cannot matter which one wins.
    generated = {}
    for name, tensor in state.items():
        shape = list(tensor.shape)
        count = 1
        for dim in shape:
            count *= dim
        # BatchNorm's num_batches_tracked is an int64 step counter (unused by
        # the stats math unless momentum=None): zeros of the right byte width.
        if str(tensor.dtype) in ("dtypes.long", "dtypes.int64"):
            blob = struct.pack(f"<{count}q", *([0] * count))
            header[name] = {"dtype": "I64", "shape": shape,
                            "data_offsets": [offset, offset + len(blob)]}
            blobs.append(blob)
            offset += len(blob)
            continue
        assert str(tensor.dtype) in ("dtypes.float", "dtypes.float32"), (
            f"unexpected dtype for {name}: {tensor.dtype}")
        is_param = name.endswith(".weight") or name.endswith(".bias") or ".params." in name
        if id(tensor) in generated:
            values = generated[id(tensor)]
        elif is_param and len(shape) >= 2:  # weight tensor (Linear 2-D, Conv 4-D): Glorot
            fan_out = shape[0]
            fan_in = 1
            for dim in shape[1:]:
                fan_in *= dim
            limit = math.sqrt(6.0 / (fan_in + fan_out))
            values = [rng.uniform(-limit, limit) for _ in range(count)]
        elif name.endswith(".lr"):
            values = [lr] * count
        elif name.endswith(".running_var"):
            values = [1.0] * count
        elif is_param and len(shape) == 1 and name.endswith(".weight"):
            # A 1-D .weight is BatchNorm's gamma: ones (zero would null the layer).
            values = [1.0] * count
        else:  # biases, running_mean and optimizer MOMENTUM buffers (2-D too!) start at zero
            values = [0.0] * count
        generated[id(tensor)] = values
        blob = struct.pack(f"<{count}f", *values)
        header[name] = {"dtype": "F32", "shape": shape, "data_offsets": [offset, offset + len(blob)]}
        blobs.append(blob)
        offset += len(blob)
    header_json = json.dumps(header).encode("utf8")
    return struct.pack("<Q", len(header_json)) + header_json + b"".join(blobs)


class EvalWrap:
    """Forward-only wrapper for the eval export: logits out, no optimizer,
    and — crucially — traced OUTSIDE the training context, so dropout is
    inactive (a clean evaluation, like Keras' model.evaluate)."""

    def __init__(self, model):
        self.model = model

    def __call__(self, x):
        return self.model(x)


def patch_runner_for_weight_readback(js):
    """Post-process the emitted runner for weight readback, keeping the
    vendored export_model.py pristine (same philosophy as the
    EXPORT_SUPPORTED_DEVICE patch above — re-vendoring stays a plain copy).
    Every substitution asserts it matched exactly once, so an export_model
    bump that changes the emitted shape fails loudly here, not in the tab.

    1. Weight buffers get COPY_SRC + COPY_DST so weights can be copied OUT
       (readback/saving) and IN (loading, editing, resetting — training then
       continues from whatever was written).
    2. setupNet's returned step function gets `.weightBufs`, a
       {stateName: GPUBuffer} map (names are the safetensors keys, i.e. the
       opt.params.* / opt.b.* / opt.lr aliases — see build_safetensors).
    """
    def replace_once(source, old, new):
        assert source.count(old) == 1, (
            f"runner patch target not found exactly once: {old!r} — "
            "export_model output changed, re-derive the patches")
        return source.replace(old, new)

    js = replace_once(
        js,
        "usage: GPUBufferUsage.STORAGE, mappedAtCreation: true",  # createWeightBuf only
        "usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,"
        " mappedAtCreation: true",
    )
    pairs = re.findall(
        r"const (\w+) = createWeightBuf\(device, \d+, "
        r"getTensorBuffer\(safetensor, metadata\['([^']+)'\]\)\);", js)
    assert pairs, "no createWeightBuf(...) lines found in the emitted runner"
    mapping = ", ".join(f"'{state_name}': {var}" for var, state_name in pairs)
    # The training step takes (x, y); the eval export takes only (x).
    signature = ("    return async (_input0,_input1) => {"
                 if "return async (_input0,_input1) => {" in js
                 else "    return async (_input0) => {")
    args = "_input0,_input1" if "_input1" in signature else "_input0"
    js = replace_once(
        js,
        signature,
        f"    const weightBufs = {{{mapping}}};\n"
        f"    const _step = async ({args}) => {{",
    )
    js = replace_once(
        js,
        "        return [resultBuffer0];\n    }\n}",
        "        return [resultBuffer0];\n    };\n"
        "    _step.weightBufs = weightBufs;\n"
        "    return _step;\n}",
    )
    return js


def build_eval(model_cls, input_shape):
    """Trace the forward pass only (batch baked like the training step) and
    emit its runner. Its weight buffers load from the SAME safetensors blob as
    the training runner (the blob carries the model.* alias entries), and get
    the COPY flags so current training weights can be copied in before each
    evaluation."""
    ev = EvalWrap(model_cls())
    Tensor.realize(*get_parameters(ev))
    x = Tensor.randn(BATCH_SIZE, *[int(dim) for dim in input_shape])
    js, _inp, _out, _state = em.export_model(ev, "webgpu", x, model_name="evalstep")
    return patch_runner_for_weight_readback(js)


def load_model_class(source):
    """Exec NNVP-generated tinygrad code (KerasGeneratorTinygradHelper) and
    return its Model class. The generated forward ends with `.softmax()`
    (Keras semantics), but the training loss (sparse_categorical_crossentropy)
    log-softmaxes internally — training through a double softmax cripples the
    gradients, so the final softmax call is stripped, exactly like Keras
    folding softmax into categorical crossentropy."""
    stripped = re.sub(r"\.softmax\(\)(?=\s*\n(\s*return\b|$))", "", source, count=1)
    namespace = {}
    exec(stripped, namespace)  # noqa: S102 — the user pastes their own generated code
    if "Model" not in namespace:
        raise ValueError("the pasted code does not define a `Model` class")
    return namespace["Model"]


def patch_runner_optimize_io(js):
    """Second, OPTIONAL runner variant addressing the two I/O costs measured
    on immature WebGPU stacks (Firefox 2026-07): (1) inputs upload via
    queue.writeBuffer instead of two mapAsync(WRITE) fences per step;
    (2) the step function grows a _readLoss flag (default true) so a caller
    can skip the readback fence and only sync the loss every N steps.
    Same fail-loud philosophy: every substitution must match exactly once."""
    def sub_once(pattern, repl, source):
        out, n = re.subn(pattern, repl, source, count=1)
        assert n == 1, f"optimize-io patch target not found exactly once: {pattern!r}"
        return out
    js = sub_once(
        r"await gpuWriteBuffer0\.mapAsync\(GPUMapMode\.WRITE\);\s*\n\s*"
        r"new Float32Array\(gpuWriteBuffer0\.getMappedRange\(\)\)\.set\(_input0\);\s*\n\s*"
        r"gpuWriteBuffer0\.unmap\(\);\s*\n\s*"
        r"commandEncoder\.copyBufferToBuffer\(gpuWriteBuffer0, 0, input0, 0, gpuWriteBuffer0\.size\);",
        "device.queue.writeBuffer(input0, 0, _input0);", js)
    js = sub_once(
        r"await gpuWriteBuffer1\.mapAsync\(GPUMapMode\.WRITE\);\s*\n\s*"
        r"new Int32Array\(gpuWriteBuffer1\.getMappedRange\(\)\)\.set\(_input1\);\s*\n\s*"
        r"gpuWriteBuffer1\.unmap\(\);\s*\n\s*"
        r"commandEncoder\.copyBufferToBuffer\(gpuWriteBuffer1, 0, input1, 0, gpuWriteBuffer1\.size\);",
        "device.queue.writeBuffer(input1, 0, _input1);", js)
    js = sub_once(r"const _step = async \(_input0,_input1\) => \{",
                  "const _step = async (_input0,_input1,_readLoss=true) => {", js)
    js = sub_once(r"commandEncoder\.copyBufferToBuffer\(output0, 0, gpuReadBuffer0, 0, output0\.size\);",
                  "if (_readLoss) commandEncoder.copyBufferToBuffer(output0, 0, gpuReadBuffer0, 0, output0.size);", js)
    js = sub_once(r"await gpuReadBuffer0\.mapAsync\(GPUMapMode\.READ\);",
                  "if (!_readLoss) return null;\n        await gpuReadBuffer0.mapAsync(GPUMapMode.READ);", js)
    return js


def build_both(model_source=None, input_shape=(28, 28), num_classes=10,
               lr=LEARNING_RATE, momentum=0.9, nesterov=False):
    """(legacy_js, optimized_js, weights, meta, eval_js) from the traces —
    the training trace is the expensive part; both training-runner variants
    are post-processing, and the eval trace (forward only) is cheap."""
    js, weights, meta = build(model_source, input_shape, num_classes,
                              lr=lr, momentum=momentum, nesterov=nesterov)
    model_cls = load_model_class(model_source) if model_source else Model
    eval_js = build_eval(model_cls, input_shape)
    return js, patch_runner_optimize_io(js), weights, meta, eval_js


def build(model_source=None, input_shape=(28, 28), num_classes=10,
          lr=LEARNING_RATE, momentum=0.9, nesterov=False):
    model_cls = load_model_class(model_source) if model_source else Model
    step = TrainStep(model_cls, lr=lr, momentum=momentum, nesterov=nesterov)
    Tensor.realize(*get_parameters(step))  # materialize BEFORE capture, or init fuses into kernels
    x = Tensor.randn(BATCH_SIZE, *[int(dim) for dim in input_shape])
    y = Tensor.randint(BATCH_SIZE, low=0, high=int(num_classes))
    js, inp_sizes, out_sizes, state = em.export_model(step, "webgpu", x, y, model_name="trainstep")
    js = patch_runner_for_weight_readback(js)
    weights = build_safetensors(state, lr=lr)
    canonical, aliases = {}, {}
    for name, tensor in state.items():  # model.* names come first, so they win
        if id(tensor) in canonical:
            aliases[name] = canonical[id(tensor)]
        else:
            canonical[id(tensor)] = name
    meta = {
        "batchSize": BATCH_SIZE,
        "inputShape": [int(dim) for dim in input_shape],
        "numClasses": int(num_classes),
        "learningRate": lr,
        "inputSizes": {k: list(v) if isinstance(v, (list, tuple)) else v for k, v in inp_sizes.items()},
        "outputSizes": {k: list(v) if isinstance(v, (list, tuple)) else v for k, v in out_sizes.items()},
        "stateEntries": list(state.keys()),
        "stateShapes": {k: list(v.shape) for k, v in state.items()},
        # alias name -> first (model.*) name for the same tensor, so the page
        # can label opt.params.N readbacks as the layer weight/bias they are
        "aliases": aliases,
        "kernels": sum(1 for line in js.splitlines() if "@compute" in line),
        # BatchNorm running mean/var entries (0 = no BN in the model); the
        # runner exposes them as weight buffers under these model.* names.
        "bnStats": [name for name in state
                    if name.endswith(".running_mean") or name.endswith(".running_var")],
    }
    return js, weights, meta
