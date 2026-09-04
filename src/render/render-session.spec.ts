import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { SemanticConversionContext } from '../semantic/conversion-context';
import type { ResolvedSemanticPlan } from '../semantic/semantic-plan';
import type { TemplateElement } from '../template/template.model';
import { TailwindRenderSession } from './render-session';

const element: TemplateElement = {
  id: 'element',
  name: 'div',
  source: { start: 0, end: 5 },
  startTag: { start: 0, end: 5 },
  structural: false,
  attributes: [],
};

const input: LocatedFlexLayoutInput = {
  id: 'fixture:layout',
  fileName: 'fixture.html',
  elementId: element.id,
  sourceName: 'fxLayout',
  directive: 'fxLayout',
  value: 'row',
  binding: 'literal',
  breakpoint: undefined,
  source: { start: 0, end: 14 },
  nameSource: { start: 0, end: 8 },
};

const context: SemanticConversionContext = {
  element,
  inputs: [input],
  parentInputs: [],
  existingClassNames: [],
  attributeEvidence: [],
};

const plan: ResolvedSemanticPlan = {
  status: 'converted',
  input,
  family: 'layout',
  value: {
    direction: 'row',
    wrap: 'nowrap',
    explicitWrap: false,
    display: 'flex',
    boxSizing: 'border-box',
  },
  activations: [{ kind: 'base' }],
};

describe('RenderSession', () => {
  test('render sessions reject work after exactly one finalization', () => {
    const session = new TailwindRenderSession();

    expect(session.finalize()).toEqual({ target: 'tailwind' });
    expect(() => session.finalize()).toThrow('Render session already finalized');
    expect(() => session.renderer.render(plan, context)).toThrow('Render session is finalized');
  });

  test('guards every renderer operation after finalization and freezes the result', () => {
    const session = new TailwindRenderSession();
    const result = session.finalize();

    expect(Object.isFrozen(result)).toBe(true);
    expect(() => session.renderer.eligibility(input)).toThrow('Render session is finalized');
    expect(() => session.renderer.resolveConflicts([], context)).toThrow('Render session is finalized');
    expect(() => session.renderer.record([])).toThrow('Render session is finalized');
  });
});
