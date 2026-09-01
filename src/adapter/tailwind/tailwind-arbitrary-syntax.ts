export interface TailwindArbitrarySyntax {
  readonly important: boolean;
}

const closingByOpening = new Map([
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
]);

export function analyzeTailwindArbitrarySyntax(value: string): TailwindArbitrarySyntax | undefined {
  if (!value.startsWith('[') || !value.endsWith(']')) return undefined;
  const inner = value.slice(1, -1);
  if (inner.trim().length === 0) return undefined;

  const stack: string[] = [];
  let quote: '"' | "'" | undefined;
  let typedSeparator = -1;
  let topLevelValue = '';

  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index];
    if (character === undefined) return undefined;
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || codePoint <= 0x1f || codePoint === 0x7f) return undefined;

    if (quote !== undefined) {
      if (character === '\\') {
        if (inner[index + 1] === undefined) return undefined;
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === '/' && inner[index + 1] === '*') {
      const commentEnd = inner.indexOf('*/', index + 2);
      if (commentEnd < 0) return undefined;
      if (stack.length === 0) topLevelValue += ' ';
      index = commentEnd + 1;
      continue;
    }

    if (character === '\\') {
      const escaped = inner[index + 1];
      if (escaped === undefined || escaped === '\n' || escaped === '\r' || escaped === '\f') return undefined;
      if (stack.length === 0) topLevelValue += escaped === '_' ? '_' : 'x';
      index += 1;
      continue;
    }

    if (character === '"' || character === "'") {
      if (stack.length === 0) topLevelValue += 'x';
      quote = character;
      continue;
    }

    const closing = closingByOpening.get(character);
    if (closing !== undefined) {
      if (stack.length === 0) topLevelValue += 'x';
      stack.push(closing);
      continue;
    }
    if ([')', ']', '}'].includes(character)) {
      if (stack.pop() !== character) return undefined;
      continue;
    }
    if (stack.length !== 0) continue;

    if (character === ';') return undefined;
    if (character === ':' && typedSeparator < 0) typedSeparator = index;
    topLevelValue += character === '_' ? ' ' : character;
  }

  if (quote !== undefined || stack.length !== 0) return undefined;
  if (
    typedSeparator >= 0 &&
    (inner.slice(0, typedSeparator).trim().length === 0 || inner.slice(typedSeparator + 1).trim().length === 0)
  ) {
    return undefined;
  }

  return { important: /!\s*important\s*$/iu.test(topLevelValue) };
}

export function hasValidTailwindArbitrarySyntax(value: string): boolean {
  return analyzeTailwindArbitrarySyntax(value) !== undefined;
}
