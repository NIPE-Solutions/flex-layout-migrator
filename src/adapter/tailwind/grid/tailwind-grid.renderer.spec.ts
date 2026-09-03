import { compile } from 'tailwindcss';
import type { GridSemanticPlan } from '../../../grid/grid-semantic.model';
import { TailwindGridRenderer } from './tailwind-grid.renderer';

const renderer = new TailwindGridRenderer();

function plan(property: GridSemanticPlan['declarations'][number]['property'], value: string): GridSemanticPlan {
  return { role: 'child', declarations: [{ property, value }], displayDependency: false };
}

describe('TailwindGridRenderer', () => {
  test.each([
    ['grid-template-columns', '[first] 1fr [last]', '[grid-template-columns:[first]_1fr_[last]]'],
    ['grid-auto-flow', 'column dense', '[grid-auto-flow:column_dense]'],
    ['grid-column', '1 / span 2', '[grid-column:1_/_span_2]'],
    ['grid-gap', '1rem 2rem', '[grid-gap:1rem_2rem]'],
    ['justify-self', 'stretch', '[justify-self:stretch]'],
    ['grid-template-areas', '"header header" "nav main"', "[grid-template-areas:'header_header'_'nav_main']"],
    ['grid-template-columns', 'var(--grid_columns)', '[grid-template-columns:var(--grid\\_columns)]'],
  ] as const)('encodes %s=%s deterministically', (property, value, candidate) => {
    expect(renderer.render(plan(property, value))).toEqual({ status: 'rendered', classNames: [candidate] });
  });

  test.each(['', 'bad\nvalue', 'bad{value}'])('rejects values Tailwind cannot own exactly: %j', value => {
    expect(renderer.render(plan('grid-column', value))).toMatchObject({
      status: 'review',
      code: 'tailwind-candidate-unverified',
    });
  });

  test('every admitted candidate compiles to the exact declaration', async () => {
    const cases = [
      ['grid-template-columns', '[first] 1fr [last]'],
      ['grid-auto-flow', 'column dense'],
      ['grid-column', '1 / span 2'],
      ['grid-gap', '1rem 2rem'],
      ['justify-self', 'stretch'],
      ['grid-template-columns', 'var(--grid_columns)'],
    ] as const;

    for (const [property, value] of cases) {
      const compiler = await compile('@tailwind utilities;');
      const result = renderer.render(plan(property, value));
      expect(result.status).toBe('rendered');
      if (result.status !== 'rendered') continue;
      const css = compiler.build([...result.classNames]);
      expect(css).toContain(`${property}: ${value};`);
      expect(css.match(/\{/gu) ?? []).toHaveLength(1);
    }
  });
});
