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
    /[{}'<>]/u.test(value) ||
    value.includes('\\') ||
    value.includes('/*') ||
    value.includes('*/')
  ) {
    return undefined;
  }
  let encodedValue: string;
  if (property === 'grid-template-areas') {
    if (!/^(?:"[^"]*")(?:\s+"[^"]*")*$/u.test(value)) return undefined;
    encodedValue = value.replaceAll('"', "'").replaceAll(' ', '_');
  } else {
    if (value.includes('"')) return undefined;
    encodedValue = value.replaceAll('_', '\\_').replaceAll(' ', '_');
  }
  const candidate = `[${property}:${encodedValue}]`;
  return candidate.length > 0 && !/[\t\n\f\r "<]/u.test(candidate) && !/&(?:#|[a-z\d])/iu.test(candidate)
    ? candidate
    : undefined;
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
