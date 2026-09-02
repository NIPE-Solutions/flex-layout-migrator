import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import { AngularTemplateParser } from '../template/angular-template.parser';
import type { TemplateElement } from '../template/template.model';
import { TemplateAnalyzer } from '../analyzer/template.analyzer';
import { ResponsiveImagePlanner } from './responsive-image.planner';

function fixture(source: string) {
  const parsed = new AngularTemplateParser().parse(source, 'fixture.html');
  if (parsed.status !== 'parsed') throw new Error('fixture did not parse');
  const element = parsed.elements.find(candidate => candidate.name === 'img');
  if (!element) throw new Error('fixture has no img');
  const byId = new Map(parsed.elements.map(candidate => [candidate.id, candidate]));
  const ancestors: TemplateElement[] = [];
  let parent = element.parentId ? byId.get(element.parentId) : undefined;
  while (parent) {
    ancestors.push(parent);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return {
    inputs: new TemplateAnalyzer().analyze('fixture.html', [element]),
    context: { element, ancestors },
  };
}

function plan(source: string, enabled = true) {
  const { inputs, context } = fixture(source);
  return new ResponsiveImagePlanner().plan(inputs, context, enabled);
}

describe('ResponsiveImagePlanner', () => {
  test.each(['xs', 'sm', 'md', 'lg', 'xl', 'lt-sm', 'lt-md', 'lt-lg', 'lt-xl', 'gt-xs', 'gt-sm', 'gt-md', 'gt-lg'])(
    'plans standard responsive source %s from the shared catalog',
    alias => {
      expect(plan(`<img src.${alias}="${alias}.png">`)).toMatchObject({
        status: 'converted',
        plan: { sources: [{ definition: { alias }, url: `${alias}.png` }] },
      });
    },
  );

  test('orders overlapping sources by descending Flex priority', () => {
    const result = plan('<img src.gt-xs="wide.png" src.md="medium.png" src.lt-lg="narrow.png">');

    expect(result.status === 'converted' ? result.plan.sources.map(source => source.definition.alias) : []).toEqual([
      'md',
      'lt-lg',
      'gt-xs',
    ]);
  });

  test.each([
    ['literal', '<img src="fallback.png" src.md="medium.png">'],
    ['bound', '<img [src]="fallback" src.md="medium.png">'],
    ['absent', '<img src.md="medium.png">'],
  ] as const)('classifies a %s fallback', (fallback, source) => {
    expect(plan(source)).toMatchObject({ status: 'converted', plan: { fallback } });
  });

  test('preserves the complete family when the feature is disabled', () => {
    expect(plan('<img src.sm="small.png" src.md="medium.png">', false)).toMatchObject({
      status: 'unresolved',
      plans: [
        { status: 'unsupported', code: 'target-unsupported' },
        { status: 'unsupported', code: 'target-unsupported' },
      ],
    });
  });

  test.each([
    ['dynamic responsive source', '<img [src.md]="mediumImage">', 'dynamic-binding'],
    ['interpolated responsive source', '<img src.md="{{ mediumImage }}">', 'dynamic-binding'],
    ['empty responsive source', '<img src.md="">', 'invalid-value'],
    ['descriptor-bearing source', '<img src.md="medium.png 2x">', 'invalid-value'],
    ['orientation alias', '<img src.handset="handset.png">', 'breakpoint-unverified'],
    ['print alias', '<img src.print="print.png">', 'breakpoint-unverified'],
    ['custom alias', '<img src.cinema="cinema.png">', 'custom-breakpoint'],
    ['empty alias', '<img src.="image.png">', 'custom-breakpoint'],
    ['structural directive', '<img *ngIf="shown" src.md="medium.png">', 'context-unverified'],
    ['picture ancestry', '<picture><span><img src.md="medium.png"></span></picture>', 'context-unverified'],
  ] as const)('preserves a family with %s', (_label, source, code) => {
    expect(plan(source)).toMatchObject({ status: 'unresolved', plans: [{ code }] });
  });

  test('rejects a responsive source on a non-image host', () => {
    const parsed = new AngularTemplateParser().parse('<div src.md="medium.png"></div>', 'fixture.html');
    if (parsed.status !== 'parsed') throw new Error('fixture did not parse');
    const element = parsed.elements[0] as TemplateElement;
    const inputs = new TemplateAnalyzer().analyze('fixture.html', [element]);

    expect(new ResponsiveImagePlanner().plan(inputs, { element, ancestors: [] }, true)).toMatchObject({
      status: 'unresolved',
      plans: [{ code: 'context-unverified' }],
    });
  });

  test('preserves every member when one member is unsafe', () => {
    const result = plan('<img src.sm="small.png" src.md="medium.png 2x">');

    expect(result).toMatchObject({
      status: 'unresolved',
      plans: [
        { input: { sourceName: 'src.sm' }, code: 'invalid-value' },
        { input: { sourceName: 'src.md' }, code: 'invalid-value' },
      ],
    });
  });

  test('preserves duplicate ownership for the same alias', () => {
    const { context } = fixture('<img src.md="one.png">');
    const first = new TemplateAnalyzer().analyze('fixture.html', [context.element])[0] as LocatedFlexLayoutInput;
    const second = { ...first, id: 'fixture.html:duplicate', sourceName: 'src.md' };

    expect(new ResponsiveImagePlanner().plan([first, second], context, true)).toMatchObject({
      status: 'unresolved',
      plans: [{ code: 'responsive-precedence-unverified' }, { code: 'responsive-precedence-unverified' }],
    });
  });
});
