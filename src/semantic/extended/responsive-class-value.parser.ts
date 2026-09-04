import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { SourceClassTokenEvidence, SourcePropertyEvidence } from '../source-property-evidence';

export interface SemanticResponsiveClassValue {
  readonly tokens: readonly SourceClassTokenEvidence[];
}

export type SemanticResponsiveClassValueResult =
  | { readonly status: 'parsed'; readonly value: SemanticResponsiveClassValue }
  | { readonly status: 'unverified'; readonly token?: string; readonly reason: string };

const interpolation = /\{\{[\s\S]*\}\}/u;

export function parseLiteralResponsiveClassValue(
  value: string,
  evidence: SourcePropertyEvidence,
): SemanticResponsiveClassValueResult {
  if (interpolation.test(value)) {
    return { status: 'unverified', reason: 'Responsive class interpolation may depend on runtime state.' };
  }
  const sources = [...new Set(value.split(/\s+/u).filter(Boolean))];
  const tokens: SourceClassTokenEvidence[] = [];
  for (const source of sources) {
    const classification = evidence.classifyClassToken(source);
    if (classification.status === 'unverified') {
      return {
        status: 'unverified',
        token: source,
        reason: `The class token ${JSON.stringify(source)} is not a compiler-proven built-in Tailwind utility and may be an application or plugin class. ${classification.reason}`,
      };
    }
    tokens.push(classification.evidence);
  }
  return { status: 'parsed', value: { tokens } };
}

export function parseResponsiveClassValue(
  input: LocatedFlexLayoutInput,
  evidence: SourcePropertyEvidence,
): SemanticResponsiveClassValueResult {
  if (input.binding !== 'literal') {
    return { status: 'unverified', reason: 'Responsive class property bindings may depend on runtime state.' };
  }
  if (input.directive !== 'ngClass') {
    return { status: 'unverified', reason: 'Deprecated responsive class aliases are not converted.' };
  }
  if (!input.breakpoint) return { status: 'unverified', reason: 'A responsive class alias is required.' };
  return parseLiteralResponsiveClassValue(input.value, evidence);
}
