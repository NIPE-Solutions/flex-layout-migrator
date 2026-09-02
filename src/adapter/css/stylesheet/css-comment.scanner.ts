import { CssStylesheetError } from './css-stylesheet.error';

export interface CssSourceRange {
  readonly start: number;
  readonly end: number;
}

export interface CssCommentToken extends CssSourceRange {
  readonly content: string;
}

type ScannerState = 'normal' | 'single-quote' | 'double-quote' | 'comment';

export function scanCssComments(source: string): readonly CssCommentToken[] {
  const comments: CssCommentToken[] = [];
  let state: ScannerState = 'normal';
  let commentStart = -1;

  for (let index = 0; index < source.length; index += 1) {
    const codeUnit = source[index];

    if (state === 'normal') {
      if (codeUnit === "'") {
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
      index += 1;
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
