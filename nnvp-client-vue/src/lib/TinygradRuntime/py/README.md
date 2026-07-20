# TinygradRuntime/py — the traced-training pipeline's Python half

Runs INSIDE Pyodide (see `../worker.ts`): `driver.py` builds the generated
model + SGD TrainStep, traces one training step with tinygrad on the GPU-less
`NULL:WGSL` device, and exports it as a self-contained WebGPU JS runner via
the vendored `export_model.py`. Python never touches the GPU; the browser
blob-imports the emitted runner and loops on it (`../runtime.ts`).

This directory is the CANONICAL copy. It grew out of
`experiments/pyodide-tinygrad/` (local-only, gitignored); the experiment
copies are historical and are NOT kept in sync.

## The version-locked pair (re-vendoring drill)

- `export_model.py` is vendored from **tinygrad tag `v0.13.0`**
  (`extra/export_model.py` — `extra/` is not in the PyPI wheel), because
  `../worker.ts` pins `micropip.install("tinygrad==0.13.0")`. The pair is
  version-locked: tinygrad master's export_model does NOT run against the
  0.13.0 wheel (UOp internals change shape between releases).
- **To bump tinygrad**: change the version in `../worker.ts`, re-vendor
  `export_model.py` from the MATCHING GitHub tag (keep it pristine — all our
  patching happens as post-processing in `driver.py`, and every substitution
  asserts it matched exactly once, so an export_model change fails loudly at
  trace time, not in the tab), then re-run the validation below.

## Validating without a browser

```bash
# unpack the matching wheel somewhere (no pip needed):
#   curl -sLo tg.whl <pypi wheel url> && mkdir wheel && (cd wheel && unzip -q ../tg.whl)
PYTHONPATH=/path/to/wheel python3 run_local.py [out-prefix]
# with a prefix, the emitted runners + weights land in <prefix>.*, then:
bun check_runner.ts <prefix>
```

- `run_local.py` — plain-CPython run of the full build (trace, both runner
  variants, eval runner, safetensors) against the SAME wheel Pyodide
  installs; asserts the weight-readback and optimize-io patches applied and
  the safetensors carries real (nonzero) values. Also the fast debug loop:
  seconds per iteration vs ~40s per in-browser trace.
- `check_runner.ts` — bun smoke of an emitted runner against a fake WebGPU
  device with real backing memory that ENFORCES usage flags (readback,
  write-in, one `step()` call). Plumbing only — kernels are no-ops there.

The full-fidelity check (real Pyodide, real device, real math) is
`make test-webgpu` at the repo root — see
`tests/harness/tinygradRuntime.spec.ts`.

## driver.py gotchas (each encodes a real bug)

- The NULL device fake-executes: weight VALUES must come from
  `build_safetensors` (Glorot by tensor identity — the state dict aliases
  every weight under two names), never from device copyout (all zeros, and a
  zero-initialized network cannot train).
- BatchNorm: `num_batches_tracked` is int64 (exported as I64 zeros; WGSL has
  no i64, and the stats math never reads it while momentum is a number);
  `running_var` and the 1-D gamma `.weight` must initialize to ONE; the
  running mean/var update assigns are not loss dependencies and must be
  realized explicitly in `TrainStep.__call__` or the trace silently drops
  them. They surface in the runner under optimizer alias names
  (`opt.buffers.N`) — `meta.aliases` maps them back.
- The final `.softmax()` of generated models is stripped before tracing
  (sparse_categorical_crossentropy log-softmaxes internally; training through
  a double softmax cripples the gradients).
