import type { CssStylesheetErrorCode } from './css-stylesheet.error';
import { scanCssComments, type CssCommentToken, type CssSourceRange } from './css-comment.scanner';
import type { CssNewline } from './owned-css-block.serializer';

const MARKER_PREFIX = 'flex-layout-codemod:';
const START_MARKER_PATTERN = /^flex-layout-codemod:start schema=([0-9]+)$/;
const RULE_MARKER_PATTERN = /^flex-layout-codemod:rule id=([a-f0-9]{64})$/;
const END_MARKER_PATTERN = /^flex-layout-codemod:end$/;

interface OwnedRuleMarker {
  readonly token: CssCommentToken;
  readonly id: string;
}

export type OwnedCssBlockParseResult =
  | { readonly status: 'absent' }
  | { readonly status: 'found'; readonly range: CssSourceRange; readonly newline: CssNewline }
  | { readonly status: 'invalid'; readonly code: CssStylesheetErrorCode; readonly reason: string };

function invalid(code: CssStylesheetErrorCode, reason: string): OwnedCssBlockParseResult {
  return { status: 'invalid', code, reason };
}

function firstNewline(source: string): CssNewline {
  const match = /\r\n|\n/.exec(source);
  return match?.[0] === '\r\n' ? '\r\n' : '\n';
}

function isCssWhitespace(codeUnit: string | undefined): boolean {
  return codeUnit === ' ' || codeUnit === '\t' || codeUnit === '\n' || codeUnit === '\r' || codeUnit === '\f';
}

function ruleSelectorMatches(source: string, marker: OwnedRuleMarker): boolean {
  let selectorStart = marker.token.end;
  while (isCssWhitespace(source[selectorStart])) selectorStart += 1;

  const selector = `.flm-${marker.id}`;
  if (!source.startsWith(selector, selectorStart)) return false;

  const boundary = source[selectorStart + selector.length];
  return boundary === '{' || isCssWhitespace(boundary);
}

export function parseOwnedCssBlock(source: string): OwnedCssBlockParseResult {
  let start: CssCommentToken | undefined;
  let end: CssCommentToken | undefined;
  let regionOpen = false;
  const rules: OwnedRuleMarker[] = [];

  for (const token of scanCssComments(source)) {
    const marker = token.content.trim();
    if (!marker.startsWith(MARKER_PREFIX)) continue;

    const startMatch = START_MARKER_PATTERN.exec(marker);
    if (startMatch !== null) {
      const schema = startMatch[1];
      if (schema !== '1') {
        return invalid('unsupported-ownership-schema', `Unsupported flex-layout-codemod ownership schema: ${schema}`);
      }
      if (regionOpen) {
        return invalid('malformed-ownership-block', 'Nested flex-layout-codemod start marker');
      }
      if (start !== undefined) {
        return invalid('malformed-ownership-block', 'Duplicate flex-layout-codemod start marker');
      }
      if (end !== undefined) {
        return invalid('malformed-ownership-block', 'Flex-layout-codemod end marker appears before start marker');
      }

      start = token;
      regionOpen = true;
      continue;
    }

    const ruleMatch = RULE_MARKER_PATTERN.exec(marker);
    if (ruleMatch !== null) {
      if (!regionOpen) {
        return invalid('malformed-ownership-block', 'Flex-layout-codemod rule marker appears outside owned block');
      }

      rules.push({ token, id: ruleMatch[1] ?? '' });
      continue;
    }

    if (END_MARKER_PATTERN.test(marker)) {
      if (end !== undefined) {
        return invalid('malformed-ownership-block', 'Duplicate flex-layout-codemod end marker');
      }

      end = token;
      regionOpen = false;
      continue;
    }

    if (marker === `${MARKER_PREFIX}rule` || marker.startsWith(`${MARKER_PREFIX}rule `)) {
      return invalid('malformed-ownership-block', 'Malformed flex-layout-codemod rule marker');
    }

    return invalid('unknown-ownership-marker', 'Unknown flex-layout-codemod ownership marker');
  }

  if (start === undefined && end === undefined) return { status: 'absent' };
  if (start === undefined) {
    return invalid('malformed-ownership-block', 'Flex-layout-codemod end marker has no matching start marker');
  }
  if (end === undefined) {
    return invalid('malformed-ownership-block', 'Flex-layout-codemod start marker has no matching end marker');
  }

  for (const rule of rules) {
    if (!ruleSelectorMatches(source, rule)) {
      return invalid('ownership-rule-mismatch', 'Flex-layout-codemod rule ID does not match following selector');
    }
  }

  const internalSource = source.slice(start.end, end.start);
  return {
    status: 'found',
    range: { start: start.start, end: end.end },
    newline: /\r\n|\n/.test(internalSource) ? firstNewline(internalSource) : firstNewline(source),
  };
}
