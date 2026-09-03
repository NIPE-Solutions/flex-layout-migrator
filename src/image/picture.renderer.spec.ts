import { TemplateAnalyzer } from '../analyzer/template.analyzer';
import type { SourceEdit } from '../edit/source-edit';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { PictureRenderer } from './picture.renderer';
import type { ResponsiveImagePlan } from './responsive-image.model';
import { ResponsiveImagePlanner } from './responsive-image.planner';

function fixture(source: string): ResponsiveImagePlan {
  const parsed = new AngularTemplateParser().parse(source, 'fixture.html');
  if (parsed.status !== 'parsed') throw new Error('fixture did not parse');
  const element = parsed.elements.find(candidate => candidate.name === 'img');
  if (!element) throw new Error('fixture has no img');
  const inputs = new TemplateAnalyzer().analyze('fixture.html', [element]);
  const planned = new ResponsiveImagePlanner().plan(inputs, { element, ancestors: [] }, true);
  if (planned.status !== 'converted') throw new Error('fixture did not plan');
  return planned.plan;
}

describe('PictureRenderer', () => {
  test('renders compact native markup in descending priority while retaining unrelated image bytes', () => {
    const source =
      '<img alt="Hero" src.gt-xs="wide.png" src="default.png" src.md="medium&amp;crop.png" loading="lazy">';

    expect(new PictureRenderer().render(source, fixture(source))).toBe(
      '<picture><source media="screen and (min-width: 960px) and (max-width: 1279.98px)" srcset="medium&amp;crop.png"><source media="screen and (min-width: 600px)" srcset="wide.png"><img alt="Hero" src="default.png" loading="lazy"></picture>',
    );
  });

  test.each([
    ['<img src.lt-sm="mobile.png" />', '<img />'],
    ['<img [src]="fallback" src.lt-sm="mobile.png">', '<img [src]="fallback">'],
    ['<img src.lt-sm="mobile.png">', '<img>'],
  ])('retains fallback spelling for %s', (source, retainedImage) => {
    expect(new PictureRenderer().render(source, fixture(source))).toContain(retainedImage);
  });

  test('uses source-derived multiline and CRLF formatting', () => {
    const source = '<img\r\n  alt="Hero"\r\n  src.lt-sm="mobile.png"\r\n>';

    expect(new PictureRenderer().render(source, fixture(source))).toBe(
      '<picture>\r\n  <source media="screen and (max-width: 599.98px)" srcset="mobile.png">\r\n  <img\r\n  alt="Hero"\r\n>\r\n</picture>',
    );
  });

  test.each([
    ['spaces', '  ', '    '],
    ['tabs', '\t', '\t\t'],
  ])('aligns nested multiline output using %s', (_label, baseIndent, attributeIndent) => {
    const image = `<img\n${attributeIndent}alt="Hero"\n${attributeIndent}src.lt-sm="mobile.png"\n${baseIndent}>`;
    const source = `<section>\n${baseIndent}${image}\n</section>`;
    const rendered = new PictureRenderer().render(source, fixture(source));

    expect(rendered).toContain(`\n${attributeIndent}<source `);
    expect(rendered).toContain(`\n${attributeIndent}<img\n${attributeIndent}alt="Hero"`);
    expect(rendered).toMatch(new RegExp(`\\n${baseIndent.replaceAll('\t', '\\t')}</picture>$`, 'u'));
  });

  test('composes image-contained edits into the retained image slice', () => {
    const source = '<img class="old" src.md="medium.png">';
    const start = source.indexOf('old');
    const innerEdit: SourceEdit = { range: { start, end: start + 3 }, text: 'new', inputId: 'class-edit' };

    expect(new PictureRenderer().render(source, fixture(source), [innerEdit])).toContain('<img class="new">');
  });
});
