/**
 * Minimal, safe markdown renderer for assistant chat bubbles.
 *
 * Safety model: the INPUT IS FULLY HTML-ESCAPED FIRST, then a small markdown
 * subset is applied on the escaped text — so no input can ever smuggle markup
 * through, and no sanitizer dependency is needed. Supported subset (what the
 * assistant actually emits): paragraphs/line breaks, **bold**, *italic*,
 * `inline code`, ``` fenced code blocks ```, - bullet and 1. numbered lists,
 * and bare/markdown http(s) links (rendered with rel=noopener, target=_blank).
 */

function escapeHtml(text: string): string {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Inline transforms, applied to a single already-escaped line.
function renderInline(escaped: string): string {
  let out = escaped;
  // `code` first, so its content is not further transformed below.
  const codeSpans: string[] = [];
  out = out.replace(/`([^`]+)`/g, (_, code: string) => {
    codeSpans.push(code);
    return ` ${codeSpans.length - 1} `;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  // [label](https://…) — only http(s), everything already escaped.
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  out = out.replace(/ (\d+) /g, (_, i: string) => `<code>${codeSpans[Number(i)]}</code>`);
  return out;
}

export default function renderMarkdown(text: string): string {
  const escaped = escapeHtml(text);
  const lines = escaped.split('\n');
  const html: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let inCode = false;
  const closeList = () => {
    if (list) {
      html.push(`</${list}>`);
      list = null;
    }
  };
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      closeList();
      html.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      html.push(`${line}\n`);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        html.push(`<${kind}>`);
        list = kind;
      }
      html.push(`<li>${renderInline((bullet || numbered)![1]!)}</li>`);
      continue;
    }
    closeList();
    if (line.trim() === '') {
      html.push('<br>');
    } else {
      html.push(`<p>${renderInline(line)}</p>`);
    }
  }
  closeList();
  if (inCode) html.push('</code></pre>'); // unbalanced fence: close it
  return html.join('');
}
