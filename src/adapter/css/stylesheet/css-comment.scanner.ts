import { CssStylesheetError } from './css-stylesheet.error';

export interface CssSourceRange {
  readonly start: number;
  readonly end: number;
}

export interface CssCommentToken extends CssSourceRange {
  readonly content: string;
}

type ScannerState = 'normal' | 'single-quote' | 'double-quote' | 'comment';

function cssNewlineEnd(source: string, start: number): number | undefined {
  const codeUnit = source[start];
  if (codeUnit === '\r') return source[start + 1] === '\n' ? start + 1 : start;
  return codeUnit === '\n' || codeUnit === '\f' ? start : undefined;
}

function isHexDigit(codeUnit: string | undefined): boolean {
  return codeUnit !== undefined && /^[0-9a-f]$/iu.test(codeUnit);
}

function consumeCssEscape(source: string, backslash: number): number | undefined {
  let index = backslash + 1;
  if (cssNewlineEnd(source, index) !== undefined) return undefined;
  if (!isHexDigit(source[index])) return index < source.length ? index : backslash;

  let hexDigits = 0;
  while (hexDigits < 6 && isHexDigit(source[index])) {
    index += 1;
    hexDigits += 1;
  }

  const newlineEnd = cssNewlineEnd(source, index);
  if (newlineEnd !== undefined) return newlineEnd;
  if (source[index] === ' ' || source[index] === '\t') return index;
  return index - 1;
}

export function scanCssComments(source: string): readonly CssCommentToken[] {
  const comments: CssCommentToken[] = [];
  let state: ScannerState = 'normal';
  let commentStart = -1;

  for (let index = 0; index < source.length; index += 1) {
    const codeUnit = source[index];

    if (state === 'normal') {
      if (codeUnit === '\\') {
        index = consumeCssEscape(source, index) ?? index;
      } else if (codeUnit === "'") {
        state = 'single-quote';
      } else if (codeUnit === '"') {
        state = 'double-quote';
      } else if (codeUnit === '/' && source[index + 1] === '*') {
        state = 'comment';
        commentStart = index;
        index += 1;
      }
      continue;
    }

    if (state === 'comment') {
      if (codeUnit === '*' && source[index + 1] === '/') {
        comments.push({
          start: commentStart,
          end: index + 2,
          content: source.slice(commentStart + 2, index),
        });
        state = 'normal';
        index += 1;
      }
      continue;
    }

    if (codeUnit === '\\') {
      const newlineEnd = cssNewlineEnd(source, index + 1);
      index = newlineEnd ?? consumeCssEscape(source, index) ?? index;
      continue;
    }

    if ((state === 'single-quote' && codeUnit === "'") || (state === 'double-quote' && codeUnit === '"')) {
      state = 'normal';
    }
  }

  if (state === 'comment') {
    throw new CssStylesheetError('unterminated-css-token', 'Unterminated CSS comment');
  }
  if (state === 'single-quote') {
    throw new CssStylesheetError('unterminated-css-token', 'Unterminated CSS single-quoted string');
  }
  if (state === 'double-quote') {
    throw new CssStylesheetError('unterminated-css-token', 'Unterminated CSS double-quoted string');
  }

  return comments;
}
