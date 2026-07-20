# Local (plain CPython) validation of driver.py against the SAME tinygrad
# wheel Pyodide will micropip-install. Usage:
#   PYTHONPATH=/path/to/unpacked-tinygrad-wheel python3 run_local.py [out-prefix]
# The optional prefix dumps the emitted (patched) runner and the weights blob
# as <prefix>.js / <prefix>.safetensors, so check_runner.ts can smoke-test
# them under bun against a fake WebGPU device:
#   bun check_runner.ts <prefix>
import os

os.environ["DEV"] = "NULL:WGSL"
os.environ["NULL_ALLOW_COPYOUT"] = "1"

import sys  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import json  # noqa: E402
import struct  # noqa: E402

import driver  # noqa: E402

js, js_opt, weights, meta, eval_js = driver.build_both()
print("meta:", json.dumps(meta, indent=2))
print("js bytes:", len(js))
print("eval js bytes:", len(eval_js))
print("weights bytes:", len(weights))
header_len = struct.unpack("<Q", weights[:8])[0]
header = json.loads(weights[8:8 + header_len])
nonzero = 0
for name, info in header.items():
    start, end = info["data_offsets"]
    data = weights[8 + header_len + start:8 + header_len + end]
    values = struct.unpack(f"<{len(data) // 4}f", data)
    if any(v != 0 for v in values):
        nonzero += 1
    print(f"  {name}: shape={info['shape']} nonzero={any(v != 0 for v in values)}"
          f" first={values[0]:.4f}")
assert nonzero >= 3, "expected real (nonzero) values for both weight matrices and lr"
assert "setupNet" in js and "@compute" in js, "emitted JS is not the expected runner"
assert "setupNet" in eval_js and "@compute" in eval_js, "eval JS is not the expected runner"

# The weight-readback patches (driver.patch_runner_for_weight_readback):
assert "GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, mappedAtCreation" in js, \
    "weight buffers did not get COPY_SRC + COPY_DST"
assert "_step.weightBufs = weightBufs;" in js, "step function does not expose weightBufs"
param_names = [name for name in header if name.startswith("opt.params.")]
assert param_names, "no opt.params.* entries in the state dict"
for name in param_names:
    assert f"'{name}':" in js.split("const weightBufs =")[1].split(";")[0], \
        f"weightBufs map is missing {name}"
assert set(meta["stateShapes"]) == set(header), "meta.stateShapes out of sync with the state dict"

# The optimize-io variant (patch_runner_optimize_io):
assert js_opt.count("device.queue.writeBuffer(input") == 2, "optimized runner must upload both inputs via writeBuffer"
assert "gpuWriteBuffer0.mapAsync" not in js_opt, "optimized runner still maps the input staging buffer"
assert "_readLoss=true" in js_opt and "if (!_readLoss) return null;" in js_opt, "optimized runner lacks the _readLoss flag"

if len(sys.argv) > 1:
    with open(f"{sys.argv[1]}.js", "w") as f:
        f.write(js)
    with open(f"{sys.argv[1]}.opt.js", "w") as f:
        f.write(js_opt)
    with open(f"{sys.argv[1]}.safetensors", "wb") as f:
        f.write(weights)
    print(f"patched runners (+ .opt.js) + weights written to {sys.argv[1]}.*")
print("OK — driver output is valid against this tinygrad")
