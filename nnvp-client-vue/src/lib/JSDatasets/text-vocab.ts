/**
 * The canonical character vocabulary every text dataset shares: index 0 is
 * '\n', indices 1..95 are printable ASCII ' ' (32) through '~' (126).
 *
 * Fixed and corpus-independent ON PURPOSE: board templates hard-code
 * Embedding input_dim and the softmax Dense units as VOCAB_SIZE, so any text
 * corpus trains against any text template without shape surgery. The corpus
 * prep script (scripts/prepare_poetry_datasets.py) normalizes source texts
 * down to exactly this set; anything that still slips through maps to the
 * space fallback at encode time rather than crashing.
 */
export const VOCAB_SIZE = 96;

export const NEWLINE_INDEX = 0;
/** Out-of-vocabulary characters encode as a space. */
export const SPACE_INDEX = 1;

export function charToIndex(char: string): number {
  const code = char.charCodeAt(0);
  if (code === 10) return NEWLINE_INDEX;
  if (code >= 32 && code <= 126) return code - 31;
  return SPACE_INDEX;
}

export function indexToChar(index: number): string {
  if (index === NEWLINE_INDEX) return '\n';
  if (index >= 1 && index < VOCAB_SIZE) return String.fromCharCode(index + 31);
  return ' ';
}

export function encodeText(text: string): Uint8Array {
  const encoded = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) encoded[i] = charToIndex(text[i]!);
  return encoded;
}

export function decodeIndices(indices: ArrayLike<number>): string {
  let text = '';
  for (let i = 0; i < indices.length; i += 1) text += indexToChar(indices[i]!);
  return text;
}
