/**
 * Bun loader plugin: makes `.vue` single-file components importable under
 * `bun test`, so the dual-mode suite can mount REAL components (via
 * @vue/test-utils + happy-dom) without a browser or vite.
 *
 * Uses the same compiler vite uses (vue/compiler-sfc). <style> blocks are
 * dropped (no layout engine in happy-dom anyway); <script lang="jsx"> is
 * handed to bun's transpiler with Vue's jsx-runtime via a pragma comment.
 */
import { plugin } from 'bun';
import { parse, compileScript, compileTemplate } from 'vue/compiler-sfc';

plugin({
  name: 'vue-sfc',
  setup(build) {
    build.onLoad({ filter: /\.vue$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const { descriptor, errors } = parse(source, { filename: args.path });
      if (errors.length) {
        throw new Error(`vue-sfc: failed to parse ${args.path}: ${errors[0]}`);
      }
      const id = Bun.hash(args.path).toString(16).slice(0, 8);

      const scriptLang = (descriptor.script && descriptor.script.lang)
        || (descriptor.scriptSetup && descriptor.scriptSetup.lang) || 'js';
      const loader = scriptLang === 'jsx' || scriptLang === 'tsx' ? 'jsx' : 'js';

      // <script setup> compiles with the template inlined into the render fn;
      // classic <script> gets the template compiled separately and attached.
      const compiled = compileScript(descriptor, {
        id,
        inlineTemplate: !!descriptor.scriptSetup,
      });
      let code = compiled.content;

      if (!descriptor.scriptSetup && descriptor.template) {
        const template = compileTemplate({
          id,
          filename: args.path,
          source: descriptor.template.content,
          compilerOptions: { bindingMetadata: compiled.bindings },
        });
        code = `${code.replace('export default', 'const __sfc__ =')}
${template.code}
__sfc__.render = render;
export default __sfc__;`;
      }

      if (loader === 'jsx') {
        code = `/* @jsxImportSource vue */\n${code}`;
      }
      return { contents: code, loader };
    });
  },
});
