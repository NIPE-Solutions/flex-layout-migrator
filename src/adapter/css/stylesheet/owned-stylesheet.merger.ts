import type { CssRuleContext, OwnedCssRule } from '../css-artifact.model';
import { CssStylesheetError } from './css-stylesheet.error';
import { parseOwnedCssBlock } from './owned-css-block.parser';
import { serializeOwnedCssBlock, type CssNewline } from './owned-css-block.serializer';
import { serializeCssRules } from './css-rule.serializer';
import { serializeCssMedia } from './css-media.serializer';

export interface OwnedStylesheetMergeResult {
  readonly changed: boolean;
  readonly output: string;
}

/**
 * Template reference authority collected at the invocation boundary.
 * `complete: false` means a dynamic class expression prevented a complete scan.
 * The default merger retains unmatched rules regardless; completeness is not a pruning grant.
 */
export interface OwnedCssReferences {
  readonly classNames: ReadonlySet<string>;
  readonly complete: boolean;
}

/** Resolves a serialized media query from an existing owned block. */
export type RetainedMediaContextResolver = (serializedMedia: string) => CssRuleContext | undefined;

interface ParsedOwnedRule {
  readonly id: string;
  readonly source: string;
}

interface ResolvedOwnedRule extends ParsedOwnedRule {
  readonly context: CssRuleContext;
}

interface ParsedOwnedRuleGroup {
  readonly serializedMedia?: string;
  readonly rules: readonly ParsedOwnedRule[];
}

const START_MARKER = '/* flex-layout-codemod:start schema=1 */';
const END_MARKER = '/* flex-layout-codemod:end */';
const RULE_MARKER = /^\/\* flex-layout-codemod:rule id=([a-f0-9]{64}) \*\/$/u;

function malformed(message: string): never {
  throw new CssStylesheetError('malformed-ownership-block', message);
}

function parseRule(
  lines: readonly string[],
  index: number,
  indentation: string,
  newline: CssNewline,
): {
  readonly rule: ParsedOwnedRule;
  readonly nextIndex: number;
} {
  const marker = lines[index];
  const match = marker?.slice(indentation.length).match(RULE_MARKER);
  if (marker === undefined || !match || !marker.startsWith(indentation)) {
    malformed('Owned CSS rule does not use the schema-1 serialized form');
  }
  const id = match[1];
  if (id === undefined || lines[index + 1] !== `${indentation}.flm-${id} {`) {
    malformed('Owned CSS rule ID does not match its serialized selector');
  }

  let end = index + 2;
  while (lines[end] !== `${indentation}}`) {
    if (lines[end] === undefined) malformed('Owned CSS rule is missing its closing brace');
    end += 1;
  }

  return {
    rule: { id, source: lines.slice(index, end + 1).join(newline) },
    nextIndex: end + 1,
  };
}

function parseOwnedRuleGroups(source: string): readonly ParsedOwnedRuleGroup[] {
  const parsed = parseOwnedCssBlock(source);
  if (parsed.status === 'invalid') throw new CssStylesheetError(parsed.code, parsed.reason);
  if (parsed.status === 'absent') return [];

  const block = source.slice(parsed.range.start, parsed.range.end);
  const internal = block.slice(START_MARKER.length, -END_MARKER.length);
  const lines = internal.split(parsed.newline);
  if (lines[0] === '') lines.shift();
  if (lines.at(-1) === '') lines.pop();

  const groups: ParsedOwnedRuleGroup[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (line === undefined) malformed('Owned CSS block ended unexpectedly');
    if (line.startsWith('@media ') && line.endsWith(' {')) {
      const start = line;
      index += 1;
      const rules: ParsedOwnedRule[] = [];
      while (lines[index] !== '}') {
        const parsedRule = parseRule(lines, index, '  ', parsed.newline);
        rules.push(parsedRule.rule);
        index = parsedRule.nextIndex;
      }
      if (rules.length === 0) malformed('Owned CSS media group contains no rules');
      groups.push({ serializedMedia: start.slice('@media '.length, -' {'.length), rules });
      index += 1;
      continue;
    }

    const parsedRule = parseRule(lines, index, '', parsed.newline);
    groups.push({ rules: [parsedRule.rule] });
    index = parsedRule.nextIndex;
  }

  return groups;
}

function retainedRules(
  groups: readonly ParsedOwnedRuleGroup[],
  retainedIds: ReadonlySet<string>,
  resolveRetainedMediaContext: RetainedMediaContextResolver,
): readonly ResolvedOwnedRule[] {
  const retained: ResolvedOwnedRule[] = [];
  for (const group of groups) {
    const rules = group.rules.filter(rule => retainedIds.has(rule.id));
    if (rules.length === 0) continue;
    const context =
      group.serializedMedia === undefined ? { priority: 0 } : resolveRetainedMediaContext(group.serializedMedia);
    if (context === undefined)
      malformed(`Owned CSS media query is not a registered breakpoint: ${group.serializedMedia}`);
    retained.push(...rules.map(rule => ({ ...rule, context })));
  }
  return retained;
}

function firstDocumentNewline(source: string): CssNewline {
  return /\r\n|\n/.exec(source)?.[0] === '\r\n' ? '\r\n' : '\n';
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareRuleFragments(left: ResolvedOwnedRule, right: ResolvedOwnedRule): number {
  const mediaOrder = Number(left.context.media !== undefined) - Number(right.context.media !== undefined);
  if (mediaOrder !== 0) return mediaOrder;
  const priorityOrder = right.context.priority - left.context.priority;
  return priorityOrder === 0 ? compareCodeUnits(left.id, right.id) : priorityOrder;
}

function mediaKey(context: CssRuleContext): string | undefined {
  return context.media === undefined
    ? undefined
    : JSON.stringify([context.media.type, context.media.clauses, context.priority]);
}

function parsedIncomingRules(rules: readonly OwnedCssRule[], newline: CssNewline): readonly ResolvedOwnedRule[] {
  return rules.map(rule => {
    const serialized = serializeCssRules([rule], newline);
    if (rule.context.media === undefined) return { id: rule.id, source: serialized, context: rule.context };

    const lines = serialized.split(newline);
    const source = lines
      .slice(1, -1)
      .map(line => {
        if (!line.startsWith('  ')) malformed('Incoming CSS rule does not use the serialized form');
        return line;
      })
      .join(newline);
    return { id: rule.id, source, context: rule.context };
  });
}

function renderCanonicalRules(rules: readonly ResolvedOwnedRule[], newline: CssNewline): string {
  const groups: string[] = [];
  for (let index = 0; index < rules.length;) {
    const rule = rules[index];
    if (rule === undefined) break;
    if (rule.context.media === undefined) {
      groups.push(rule.source);
      index += 1;
      continue;
    }
    const key = mediaKey(rule.context);
    const grouped: ResolvedOwnedRule[] = [];
    let candidate = rules[index];
    while (candidate !== undefined && mediaKey(candidate.context) === key) {
      grouped.push(candidate);
      index += 1;
      candidate = rules[index];
    }
    groups.push(
      [`@media ${serializeCssMedia(rule.context.media)} {`, grouped.map(item => item.source).join(newline), '}'].join(
        newline,
      ),
    );
  }
  return groups.join(newline);
}

function normalizeReferences(references?: ReadonlySet<string> | OwnedCssReferences): OwnedCssReferences {
  if (references === undefined) return { classNames: new Set(), complete: false };
  return 'classNames' in references ? references : { classNames: references, complete: true };
}

export function mergeOwnedStylesheet(
  existing: string,
  rules: readonly OwnedCssRule[],
  references?: ReadonlySet<string> | OwnedCssReferences,
  resolveRetainedMediaContext: RetainedMediaContextResolver = () => undefined,
): OwnedStylesheetMergeResult {
  const parsed = parseOwnedCssBlock(existing);
  if (parsed.status === 'invalid') throw new CssStylesheetError(parsed.code, parsed.reason);

  const newline = parsed.status === 'found' ? parsed.newline : firstDocumentNewline(existing);
  const referenceState = normalizeReferences(references);
  const groups = parseOwnedRuleGroups(existing);
  const existingIds = new Set(groups.flatMap(group => group.rules.map(rule => rule.id)));
  const incomingIds = new Set(rules.map(rule => rule.id));
  for (const className of referenceState.classNames) {
    const id = className.slice('flm-'.length);
    if (!existingIds.has(id) && !incomingIds.has(id)) {
      throw new CssStylesheetError('ownership-rule-mismatch', `No owned CSS rule matches ${className}`);
    }
  }
  const retainedIds = new Set([...existingIds].filter(id => !incomingIds.has(id)));
  const retained = retainedRules(groups, retainedIds, resolveRetainedMediaContext);
  const incoming = parsedIncomingRules(rules, newline);
  const content = [...retained, ...incoming].sort(compareRuleFragments);
  if (rules.length === 0 && retained.length === groups.flatMap(group => group.rules).length) {
    return Object.freeze({ changed: false, output: existing });
  }
  const serialized = renderCanonicalRules(content, newline);
  const block =
    serialized === ''
      ? ''
      : retained.length === 0
        ? serializeOwnedCssBlock(rules, newline)
        : [START_MARKER, serialized, END_MARKER].join(newline);
  const output =
    parsed.status === 'found'
      ? existing.slice(0, parsed.range.start) + block + existing.slice(parsed.range.end)
      : existing + block;

  return Object.freeze({ changed: output !== existing, output });
}
