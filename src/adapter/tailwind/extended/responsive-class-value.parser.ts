import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog } from '../../../breakpoint/breakpoint-catalog';
import type { ResponsiveClassValueResult } from './responsive-class.model';
import type { TailwindCandidateClassifier } from './tailwind-candidate-classifier';

const htmlWhitespace = /[\t\n\f\r ]+/u;
const interpolation = /\{\{[\s\S]*\}\}/u;

export function parseLiteralResponsiveClassValue(
  value: string,
  classifier: TailwindCandidateClassifier,
): ResponsiveClassValueResult {
  if (interpolation.test(value)) {
    return { status: 'unverified', reason: 'Responsive class interpolation may depend on runtime state.' };
  }

  const tokens = [...new Set(value.split(htmlWhitespace).filter(token => token.length > 0))];
  for (const token of tokens) {
    const classification = classifier.classify(token);
    if (classification.status === 'unverified') {
      return {
        status: 'unverified',
        token,
        reason: `The class token ${JSON.stringify(token)} is not a compiler-proven built-in Tailwind utility and may be an application or plugin class. ${classification.reason}`,
      };
    }
  }

  return { status: 'parsed', value: { tokens } };
}

export function parseResponsiveClassValue(
  input: LocatedFlexLayoutInput,
  classifier: TailwindCandidateClassifier,
): ResponsiveClassValueResult {
  if (input.binding !== 'literal') {
    return { status: 'unverified', reason: 'Responsive class property bindings may depend on runtime state.' };
  }
  if (input.directive !== 'ngClass') {
    return { status: 'unverified', reason: 'Deprecated responsive class aliases are not converted.' };
  }
  if (input.breakpoint === undefined || new BreakpointCatalog().classify(input.breakpoint).kind !== 'verified') {
    return { status: 'unverified', reason: 'The responsive class breakpoint is not a verified viewport alias.' };
  }
  return parseLiteralResponsiveClassValue(input.value, classifier);
}
