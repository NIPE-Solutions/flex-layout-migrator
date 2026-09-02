import type { OwnedCssRule } from '../css-artifact.model';
import { CssStylesheetError } from './css-stylesheet.error';
import { parseOwnedCssBlock } from './owned-css-block.parser';
import { serializeOwnedCssBlock, type CssNewline } from './owned-css-block.serializer';
import { serializeCssRules } from './css-rule.serializer';

export interface OwnedStylesheetMergeResult {
  readonly changed: boolean;
  readonly output: string;
}

interface ParsedOwnedRule {
  readonly id: string;
  readonly source: string;
}

interface ParsedOwnedRuleGroup {
  readonly prefix?: string;
  readonly suffix?: string;
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
      groups.push({ prefix: start, suffix: '}', rules });
      index += 1;
      continue;
    }

    const parsedRule = parseRule(lines, index, '', parsed.newline);
    groups.push({ rules: [parsedRule.rule] });
    index = parsedRule.nextIndex;
  }

  return groups;
}

function renderOwnedRuleGroups(
  groups: readonly ParsedOwnedRuleGroup[],
  ids: ReadonlySet<string>,
  newline: CssNewline,
): string {
  const rendered: string[] = [];
  for (const group of groups) {
    const rules = group.rules.filter(rule => ids.has(rule.id)).map(rule => rule.source);
    if (rules.length === 0) continue;
    rendered.push(
      group.prefix === undefined
        ? rules.join(newline)
        : [group.prefix, rules.join(newline), group.suffix ?? ''].join(newline),
    );
  }
  return rendered.join(newline);
}

function firstDocumentNewline(source: string): CssNewline {
  return /\r\n|\n/.exec(source)?.[0] === '\r\n' ? '\r\n' : '\n';
}

export function mergeOwnedStylesheet(
  existing: string,
  rules: readonly OwnedCssRule[],
  referencedClassNames?: ReadonlySet<string>,
): OwnedStylesheetMergeResult {
  const parsed = parseOwnedCssBlock(existing);
  if (parsed.status === 'invalid') throw new CssStylesheetError(parsed.code, parsed.reason);

  const newline = parsed.status === 'found' ? parsed.newline : firstDocumentNewline(existing);
  if (referencedClassNames === undefined) {
    const block = serializeOwnedCssBlock(rules, newline);
    const output =
      parsed.status === 'found'
        ? existing.slice(0, parsed.range.start) + block + existing.slice(parsed.range.end)
        : existing + block;
    return Object.freeze({ changed: output !== existing, output });
  }

  const groups = parseOwnedRuleGroups(existing);
  const existingIds = new Set(groups.flatMap(group => group.rules.map(rule => rule.id)));
  const incomingIds = new Set(rules.map(rule => rule.id));
  for (const className of referencedClassNames) {
    const id = className.slice('flm-'.length);
    if (!existingIds.has(id) && !incomingIds.has(id)) {
      throw new CssStylesheetError('ownership-rule-mismatch', `No owned CSS rule matches ${className}`);
    }
  }

  const retainedIds = new Set(
    [...referencedClassNames]
      .filter(className => className.startsWith('flm-'))
      .map(className => className.slice('flm-'.length))
      .filter(id => existingIds.has(id) && !incomingIds.has(id)),
  );
  const baseOnly =
    groups.every(group => group.prefix === undefined) && rules.every(rule => rule.context.media === undefined);
  const content = baseOnly
    ? [
        ...groups
          .flatMap(group => group.rules)
          .filter(rule => retainedIds.has(rule.id))
          .map(rule => ({ id: rule.id, source: rule.source })),
        ...rules.map(rule => ({ id: rule.id, source: serializeCssRules([rule], newline) })),
      ]
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
        .map(rule => rule.source)
        .join(newline)
    : [renderOwnedRuleGroups(groups, retainedIds, newline), serializeCssRules(rules, newline)]
        .filter(part => part !== '')
        .join(newline);
  const block = content === '' ? '' : [START_MARKER, content, END_MARKER].join(newline);
  const output =
    parsed.status === 'found'
      ? existing.slice(0, parsed.range.start) + block + existing.slice(parsed.range.end)
      : existing + block;

  return Object.freeze({ changed: output !== existing, output });
}
