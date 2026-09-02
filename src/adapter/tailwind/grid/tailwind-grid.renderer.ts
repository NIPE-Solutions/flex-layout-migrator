import { isByteExactHtmlClassToken } from '../../../edit/html-attribute-value';
import type { GridSemanticPlan } from '../../../grid/grid-semantic.model';

export type TailwindGridRenderResult =
  | { readonly status: 'rendered'; readonly classNames: readonly string[] }
  | {
      readonly status: 'review';
      readonly code: 'tailwind-candidate-unverified';
      readonly reason: string;
    };

function encode(property: string, value: string): string | undefined {
  const containsControl = [...value].some(character => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f);
  });
  if (
    value.length === 0 ||
    containsControl ||
    /[_{}"'<>]/u.test(value) ||
    value.includes('\\') ||
    value.includes('/*') ||
    value.includes('*/')
  ) {
    return undefined;
  }
  const candidate = `[${property}:${value.replaceAll(' ', '_')}]`;
  return isByteExactHtmlClassToken(candidate) ? candidate : undefined;
}

export class TailwindGridRenderer {
  render(plan: GridSemanticPlan): TailwindGridRenderResult {
    const classNames: string[] = [];
    for (const declaration of plan.declarations) {
      const candidate = encode(declaration.property, declaration.value);
      if (candidate === undefined) {
        return {
          status: 'review',
          code: 'tailwind-candidate-unverified',
          reason: `${declaration.property}: ${declaration.value} cannot be represented as an exact Tailwind class token.`,
        };
      }
      classNames.push(candidate);
    }
    return { status: 'rendered', classNames };
  }
}
