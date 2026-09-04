const cssWhitespace = /[\t\n\f\r ]/u;
const hexDigit = /[\da-f]/iu;

export interface LiteralStyleDeclaration {
  readonly property: string;
  readonly value: string;
}

export type LiteralStyleParseResult =
  | { readonly status: 'parsed'; readonly declarations: readonly LiteralStyleDeclaration[] }
  | { readonly status: 'unverified'; readonly reason: string };

function splitDeclarations(value: string): readonly string[] | undefined {
  const declarations: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let parentheses = 0;
  let brackets = 0;
  let braces = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (character === undefined) continue;

    if (quote) {
      current += character;
      if (character === '\\') {
        if (next === undefined) return undefined;
        current += next;
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === '/' && next === '*') {
      const commentEnd = value.indexOf('*/', index + 2);
      if (commentEnd < 0) return undefined;
      current += ' ';
      index = commentEnd + 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === '\\') {
      if (next === undefined || next === '\n' || next === '\r' || next === '\f') return undefined;
      current += character + next;
      index += 1;
      continue;
    }

    if (character === '(') parentheses += 1;
    else if (character === ')') {
      if (parentheses === 0) return undefined;
      parentheses -= 1;
    } else if (character === '[') brackets += 1;
    else if (character === ']') {
      if (brackets === 0) return undefined;
      brackets -= 1;
    } else if (character === '{') braces += 1;
    else if (character === '}') {
      if (braces === 0) return undefined;
      braces -= 1;
    }

    if (character === ';' && parentheses === 0 && brackets === 0 && braces === 0) {
      declarations.push(current);
      current = '';
    } else {
      current += character;
    }
  }

  if (quote || parentheses !== 0 || brackets !== 0 || braces !== 0) return undefined;
  declarations.push(current);
  return declarations;
}

function declarationColon(declaration: string): number | undefined {
  let quote: '"' | "'" | undefined;
  let parentheses = 0;
  let brackets = 0;
  let braces = 0;

  for (let index = 0; index < declaration.length; index += 1) {
    const character = declaration[index];
    if (character === undefined) continue;
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (character === '(') parentheses += 1;
    else if (character === ')') parentheses -= 1;
    else if (character === '[') brackets += 1;
    else if (character === ']') brackets -= 1;
    else if (character === '{') braces += 1;
    else if (character === '}') braces -= 1;
    else if (character === ':' && parentheses === 0 && brackets === 0 && braces === 0) return index;
  }
  return undefined;
}

function decodeIdentifier(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  let decoded = '';
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (character === undefined) continue;
    if (cssWhitespace.test(character)) return undefined;
    if (character !== '\\') {
      decoded += character;
      continue;
    }

    const next = trimmed[index + 1];
    if (next === undefined || next === '\n' || next === '\r' || next === '\f') return undefined;
    let hex = '';
    let cursor = index + 1;
    while (hex.length < 6 && cursor < trimmed.length && hexDigit.test(trimmed[cursor] ?? '')) {
      hex += trimmed[cursor];
      cursor += 1;
    }
    if (hex) {
      const codePoint = Number.parseInt(hex, 16);
      decoded +=
        codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)
          ? '\uFFFD'
          : String.fromCodePoint(codePoint);
      if (cssWhitespace.test(trimmed[cursor] ?? '')) {
        if (trimmed[cursor] === '\r' && trimmed[cursor + 1] === '\n') cursor += 1;
        cursor += 1;
      }
      index = cursor - 1;
      continue;
    }

    decoded += next;
    index += 1;
  }
  return decoded;
}

export function literalStyleMayControlDisplay(value: string): boolean {
  const result = parseLiteralStyleDeclarations(value);
  if (result.status === 'unverified') return true;

  return result.declarations.some(declaration => declaration.property.toLowerCase() === 'display');
}

export function parseLiteralStyleDeclarations(value: string): LiteralStyleParseResult {
  const segments = splitDeclarations(value);
  if (!segments) {
    return { status: 'unverified', reason: 'The literal style has malformed or unbalanced delimiters.' };
  }

  const declarations: LiteralStyleDeclaration[] = [];

  for (const segment of segments) {
    if (!segment.trim()) continue;
    const colon = declarationColon(segment);
    if (colon === undefined) {
      return { status: 'unverified', reason: 'A literal style declaration is missing its property separator.' };
    }
    const property = decodeIdentifier(segment.slice(0, colon));
    if (!property) {
      return { status: 'unverified', reason: 'A literal style declaration has an ambiguous property name.' };
    }
    declarations.push({ property, value: segment.slice(colon + 1).trim() });
  }

  return { status: 'parsed', declarations };
}
