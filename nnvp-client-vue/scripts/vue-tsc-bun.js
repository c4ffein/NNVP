// vue-tsc, runnable under bun (the box is node-free).
//
// vue-tsc's own bin patches typescript's tsc at require-time by monkey-patching
// fs.readFileSync and then require()ing tsc: node's CJS loader reads module
// source through fs.readFileSync, so it receives the transformed code. Bun's
// loader reads files natively (in Zig) and never calls the JS-level patch, so
// under bun vue-tsc silently runs UNPATCHED tsc — .vue files are dropped from
// the program and only .ts errors are reported (verified: a planted type error
// in a lang="ts" SFC passed `bunx --bun vue-tsc`, and --listFilesOnly listed
// zero .vue files).
//
// This wrapper performs the same transform eagerly instead: it patches the tsc
// source with volar's own transformTscContent, writes the result next to the
// original (tsc locates lib.*.d.ts relative to its own __dirname), registers
// the Vue language plugin on the module the patched code will require, and
// runs it. Args pass through to tsc as usual (e.g. --noEmit).

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const runTscExports = require('@volar/typescript/lib/quickstart/runTsc');
const core = require('@vue/language-core');

const tscShimPath = require.resolve('typescript/lib/tsc');
const runTscPath = require.resolve('@volar/typescript/lib/quickstart/runTsc');
const proxyApiPath = require.resolve('@volar/typescript/lib/node/proxyCreateProgram');

// TS >= 5.7 ships lib/tsc.js as a shim requiring the real module (./_tsc.js).
let realTscPath = tscShimPath;
let tscSource = fs.readFileSync(tscShimPath, 'utf8');
const shimMatch = /module\.exports\s*=\s*require\((?:"|')(?<p>\.\/\w+\.js)(?:"|')\)/.exec(tscSource);
if (shimMatch) {
  realTscPath = path.join(path.dirname(tscShimPath), shimMatch.groups.p);
  tscSource = fs.readFileSync(realTscPath, 'utf8');
}

// Same vueOptions resolution as vue-tsc/index.js run(); getAllExtensions
// covers projects whose vueCompilerOptions add more than '.vue'.
const configFilePath = path.join(__dirname, '..', 'tsconfig.json').replace(/\\/g, '/');
const vueOptions = core.createParsedCommandLine(ts, ts.sys, configFilePath).vueOptions;
const extensions = core.getAllExtensions(vueOptions);

// The factory the patched tsc will fetch via require(runTscPath).getLanguagePlugins.
runTscExports.getLanguagePlugins = (tsArg, options) => {
  const vueLanguagePlugin = core.createVueLanguagePlugin(tsArg, options.options, vueOptions, id => id);
  return { languagePlugins: [vueLanguagePlugin] };
};

const patched = runTscExports.transformTscContent(
  tscSource, proxyApiPath, extensions, [], runTscPath,
);
const patchedPath = path.join(path.dirname(realTscPath), '_tsc-vue-bun.generated.js');
// Skip identical rewrites: content only changes when typescript/volar change,
// and concurrent typecheck runs must not truncate the file under each other.
let existing = null;
try { existing = fs.readFileSync(patchedPath, 'utf8'); } catch { /* first run */ }
if (existing !== patched) fs.writeFileSync(patchedPath, patched);
require(patchedPath);
