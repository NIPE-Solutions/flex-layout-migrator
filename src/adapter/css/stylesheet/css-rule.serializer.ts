import type { OwnedCssRule } from '../css-artifact.model';
import type { MediaDefinition } from '../../../breakpoint/breakpoint-catalog';
import { validateOwnedCssRule } from './css-artifact.validator';
import { CssStylesheetError } from './css-stylesheet.error';
import { serializeCssMedia } from './css-media.serializer';

export type CssNewline = '\n' | '\r\n';

interface ResponsiveGroup {
  readonly key: string;
  readonly media: MediaDefinition;
  readonly rules: readonly OwnedCssRule[];
}

type RuleGroup = OwnedCssRule | ResponsiveGroup;

function validateNewline(newline: CssNewline): void {
  if (newline !== '\n' && newline !== '\r\n') {
    throw new CssStylesheetError('invalid-artifact', 'CSS newline must be LF or CRLF');
  }
}

function mediaGroupKey(rule: OwnedCssRule): string {
  const media = rule.context.media;
  if (media === undefined) throw new CssStylesheetError('invalid-artifact', 'CSS responsive rule media is required');

  return JSON.stringify([
    media.type,
    media.clauses.map(clause => [clause.min ?? null, clause.max ?? null, clause.orientation ?? null]),
    rule.context.priority,
  ]);
}

function serializeBaseRule(rule: OwnedCssRule, newline: CssNewline): string {
  return [
    `/* flex-layout-codemod:rule id=${rule.id} */`,
    `.${rule.className} {`,
    ...rule.declarations.map(({ property, value }) => `  ${property}: ${value};`),
    '}',
  ].join(newline);
}

function serializeResponsiveGroup(group: ResponsiveGroup, newline: CssNewline): string {
  const rules = group.rules
    .map(rule =>
      serializeBaseRule(rule, newline)
        .split(newline)
        .map(line => `  ${line}`)
        .join(newline),
    )
    .join(newline);

  return [`@media ${serializeCssMedia(group.media)} {`, rules, '}'].join(newline);
}

export function serializeCssRules(rules: readonly OwnedCssRule[], newline: CssNewline): string {
  validateNewline(newline);
  rules.forEach(validateOwnedCssRule);

  const groups: RuleGroup[] = [];
  for (const rule of rules) {
    if (rule.context.media === undefined) {
      groups.push(rule);
      continue;
    }

    const key = mediaGroupKey(rule);
    const previous = groups.at(-1);
    if (previous !== undefined && 'key' in previous && previous.key === key) {
      groups[groups.length - 1] = { ...previous, rules: [...previous.rules, rule] };
      continue;
    }

    groups.push({ key, media: rule.context.media, rules: [rule] });
  }

  return groups
    .map(group => ('key' in group ? serializeResponsiveGroup(group, newline) : serializeBaseRule(group, newline)))
    .join(newline);
}
