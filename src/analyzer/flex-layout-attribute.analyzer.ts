import { FLEX_LAYOUT_DIRECTIVES, FlexLayoutDirective, isFlexLayoutDirective } from './flex-layout.catalog';
import type { SourceRange } from '../template/template.model';

export type BindingKind = 'literal' | 'property';

export interface FlexLayoutInput {
  sourceName: string;
  directive: FlexLayoutDirective;
  value: string;
  binding: BindingKind;
  breakpoint: string | undefined;
}

export interface LocatedFlexLayoutInput extends FlexLayoutInput {
  readonly id: string;
  readonly fileName: string;
  readonly elementId: string;
  readonly source: SourceRange;
  readonly nameSource: SourceRange;
  readonly valueSource?: SourceRange;
}

const responsiveOnlyDirectives = new Set<FlexLayoutDirective>(['class', 'ngClass', 'style', 'ngStyle']);
const directivesByLength = [...FLEX_LAYOUT_DIRECTIVES].sort((left, right) => right.length - left.length);

export function analyzeFlexLayoutAttribute(sourceName: string, value: string): FlexLayoutInput | undefined {
  const startsWithBracket = sourceName.startsWith('[');
  const endsWithBracket = sourceName.endsWith(']');

  if (startsWithBracket !== endsWithBracket) return undefined;

  const binding: BindingKind = startsWithBracket ? 'property' : 'literal';
  const normalizedName = startsWithBracket ? sourceName.slice(1, -1) : sourceName;

  if (normalizedName.startsWith('src.')) {
    return {
      sourceName,
      value,
      directive: 'imgSrc',
      breakpoint: normalizedName.slice('src.'.length),
      binding,
    };
  }

  const directive = directivesByLength.find(
    candidate => normalizedName === candidate || normalizedName.startsWith(`${candidate}.`),
  );

  if (!directive || !isFlexLayoutDirective(directive)) return undefined;

  const breakpoint = normalizedName === directive ? undefined : normalizedName.slice(directive.length + 1);
  if (responsiveOnlyDirectives.has(directive) && !breakpoint) return undefined;

  return {
    sourceName,
    value,
    directive,
    breakpoint,
    binding,
  };
}
