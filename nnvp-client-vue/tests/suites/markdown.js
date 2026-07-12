/**
 * The assistant chat's markdown renderer (src/lib/Assistant/markdown.js).
 * Safety first: input is fully HTML-escaped BEFORE any markdown transform,
 * so these tests pin both the rendering subset and the injection resistance.
 */
import { logicTest } from '../harness/define';
import renderMarkdown from '../../src/lib/Assistant/markdown';

logicTest('markdown: escapes HTML before anything else (no injection)', ({ expect }) => {
  const out = renderMarkdown('<script>alert(1)</script> & <img src=x onerror=y>');
  expect(out).not.toContain('<script');
  expect(out).not.toContain('<img');
  expect(out).toContain('&lt;script&gt;');
  expect(out).toContain('&amp;');
});

logicTest('markdown: renders bold, italic and inline code', ({ expect }) => {
  const out = renderMarkdown('use **Dense** with *relu* and `units=64`');
  expect(out).toContain('<strong>Dense</strong>');
  expect(out).toContain('<em>relu</em>');
  expect(out).toContain('<code>units=64</code>');
});

logicTest('markdown: inline code contents are not further transformed', ({ expect }) => {
  const out = renderMarkdown('run `a ** b * c` now');
  expect(out).toContain('<code>a ** b * c</code>');
  expect(out).not.toContain('<strong>');
});

logicTest('markdown: renders bullet and numbered lists', ({ expect }) => {
  const out = renderMarkdown('- one\n- two\n\n1. first\n2. second');
  expect(out).toContain('<ul><li>one</li><li>two</li></ul>');
  expect(out).toContain('<ol><li>first</li><li>second</li></ol>');
});

logicTest('markdown: renders fenced code blocks verbatim (escaped)', ({ expect }) => {
  const out = renderMarkdown('```\nmodel.add(Dense(64))\nif a < b: pass\n```');
  expect(out).toContain('<pre><code>');
  expect(out).toContain('model.add(Dense(64))');
  expect(out).toContain('if a &lt; b: pass');
  expect(out).toContain('</code></pre>');
});

logicTest('markdown: closes an unbalanced code fence instead of eating the rest', ({ expect }) => {
  const out = renderMarkdown('```\ncode without closing fence');
  expect(out).toContain('<pre><code>');
  expect(out).toContain('</code></pre>');
});

logicTest('markdown: links only for http(s), with safe rel/target', ({ expect }) => {
  const ok = renderMarkdown('see [keras docs](https://keras.io/api/)');
  expect(ok).toContain('<a href="https://keras.io/api/" target="_blank" rel="noopener noreferrer">keras docs</a>');
  const bad = renderMarkdown('click [here](javascript:alert(1))');
  expect(bad).not.toContain('<a ');
  expect(bad).toContain('javascript:alert(1)'); // left as visible text
});

logicTest('markdown: plain paragraphs and blank lines survive', ({ expect }) => {
  const out = renderMarkdown('hello\n\nworld');
  expect(out).toContain('<p>hello</p>');
  expect(out).toContain('<br>');
  expect(out).toContain('<p>world</p>');
});
