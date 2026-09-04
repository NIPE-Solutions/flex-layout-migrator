import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import { MigrationApplicationError } from '../../migrator/migration-application.error';
import type { SemanticConversionContext } from '../../semantic/conversion-context';
import type { ResolvedSemanticPlan } from '../../semantic/semantic-plan';
import type { TemplateElement } from '../../template/template.model';
import { TailwindRenderer } from './tailwind.renderer';

const element: TemplateElement = {
  id: 'element',
  name: 'div',
  source: { start: 0, end: 0 },
  startTag: { start: 0, end: 0 },
  structural: false,
  attributes: [],
};

describe('TailwindRenderer semantic dispatch', () => {
  test('fails closed when directive, family, and semantic value do not correspond', () => {
    const input = locatedInput({ directive: 'fxLayout', sourceName: 'fxLayout' });
    const plan: ResolvedSemanticPlan = {
      status: 'converted',
      input,
      family: 'grid-columns',
      value: {
        role: 'container',
        declarations: [{ property: 'grid-template-columns', value: '1fr' }],
        displayDependency: true,
      },
      activations: [{ kind: 'base' }],
    };

    const error = captureInternalInvariant(() => new TailwindRenderer().render(plan, context([input])));

    expect(error.message).toBe(
      'Tailwind renderer received semantic family "grid-columns" for directive "fxLayout", which belongs to "layout".',
    );
    expect(error.paths).toEqual(['fixture.html']);
  });

  test('fails closed on an unknown runtime semantic family instead of dispatching it to Grid', () => {
    const input = locatedInput({
      directive: 'unknownDirective' as LocatedFlexLayoutInput['directive'],
      sourceName: 'unknownDirective',
    });
    const plan = {
      status: 'converted',
      input,
      family: undefined,
      value: { role: 'container', declarations: [], displayDependency: true },
      activations: [{ kind: 'base' }],
    } as unknown as ResolvedSemanticPlan;

    const error = captureInternalInvariant(() => new TailwindRenderer().render(plan, context([input])));

    expect(error.message).toBe('Tailwind renderer does not handle semantic family "undefined".');
    expect(error.paths).toEqual(['fixture.html']);
  });
});

function context(inputs: readonly LocatedFlexLayoutInput[]): SemanticConversionContext {
  return { element, inputs, parentInputs: [], existingClassNames: [], attributeEvidence: [] };
}

function locatedInput(overrides: Partial<LocatedFlexLayoutInput> = {}): LocatedFlexLayoutInput {
  return {
    id: overrides.id ?? 'fixture:input',
    fileName: overrides.fileName ?? 'fixture.html',
    elementId: overrides.elementId ?? element.id,
    directive: overrides.directive ?? 'fxLayout',
    sourceName: overrides.sourceName ?? 'fxLayout',
    binding: overrides.binding ?? 'literal',
    breakpoint: overrides.breakpoint,
    value: overrides.value ?? 'row',
    source: overrides.source ?? { start: 0, end: 1 },
    nameSource: overrides.nameSource ?? { start: 0, end: 1 },
  };
}

function captureInternalInvariant(action: () => unknown): MigrationApplicationError {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(MigrationApplicationError);
    expect(error).toMatchObject({ code: 'internal-invariant' });
    return error as MigrationApplicationError;
  }
  throw new Error('Expected an internal invariant error.');
}
