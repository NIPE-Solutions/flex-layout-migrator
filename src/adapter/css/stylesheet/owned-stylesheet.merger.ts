import type { OwnedCssRule } from '../css-artifact.model';
import { CssStylesheetError } from './css-stylesheet.error';
import { parseOwnedCssBlock } from './owned-css-block.parser';
import { serializeOwnedCssBlock, type CssNewline } from './owned-css-block.serializer';

export interface OwnedStylesheetMergeResult {
  readonly changed: boolean;
  readonly output: string;
}

function firstDocumentNewline(source: string): CssNewline {
  return /\r\n|\n/.exec(source)?.[0] === '\r\n' ? '\r\n' : '\n';
}

export function mergeOwnedStylesheet(existing: string, rules: readonly OwnedCssRule[]): OwnedStylesheetMergeResult {
  const parsed = parseOwnedCssBlock(existing);
  if (parsed.status === 'invalid') throw new CssStylesheetError(parsed.code, parsed.reason);

  const newline = parsed.status === 'found' ? parsed.newline : firstDocumentNewline(existing);
  const block = serializeOwnedCssBlock(rules, newline);
  const output =
    parsed.status === 'found'
      ? existing.slice(0, parsed.range.start) + block + existing.slice(parsed.range.end)
      : existing + block;

  return Object.freeze({ changed: output !== existing, output });
}
