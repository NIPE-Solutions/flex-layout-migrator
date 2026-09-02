import { TemplateAnalyzer } from '../../src/analyzer/template.analyzer';
import { PictureRenderer } from '../../src/image/picture.renderer';
import { ResponsiveImagePlanner } from '../../src/image/responsive-image.planner';
import { AngularTemplateParser } from '../../src/template/angular-template.parser';

interface RenderedSource {
  readonly media: string;
  readonly url: string;
}

function renderedSources(source: string): readonly RenderedSource[] {
  const parser = new AngularTemplateParser();
  const parsed = parser.parse(source, 'selection.html');
  if (parsed.status !== 'parsed') throw new Error('selection input did not parse');
  const image = parsed.elements.find(element => element.name === 'img');
  if (!image) throw new Error('selection input has no image');
  const inputs = new TemplateAnalyzer().analyze('selection.html', [image]);
  const planned = new ResponsiveImagePlanner().plan(inputs, { element: image, ancestors: [] }, true);
  if (planned.status !== 'converted') throw new Error('selection input did not plan');

  const output = new PictureRenderer().render(source, planned.plan);
  const rendered = parser.parse(output, 'rendered-selection.html');
  if (rendered.status !== 'parsed') throw new Error('rendered selection did not parse');
  return rendered.elements
    .filter(element => element.name === 'source')
    .map(element => ({
      media: element.attributes.find(attribute => attribute.name === 'media')?.value ?? '',
      url: element.attributes.find(attribute => attribute.name === 'srcset')?.value ?? '',
    }));
}

function matches(media: string, width: number): boolean {
  if (!media.startsWith('screen')) return false;
  const minimum = media.match(/\(min-width: ([\d.]+)px\)/u)?.[1];
  const maximum = media.match(/\(max-width: ([\d.]+)px\)/u)?.[1];
  return (minimum === undefined || width >= Number(minimum)) && (maximum === undefined || width <= Number(maximum));
}

function selected(sources: readonly RenderedSource[], width: number): string | undefined {
  return sources.find(source => matches(source.media, width))?.url;
}

describe('native responsive image selection order', () => {
  test.each([
    [320, 'xs.png'],
    [600, undefined],
    [1000, 'md.png'],
    [1280, undefined],
  ] as const)('selects rendered bounded xs/md sources equivalently at %dpx', (width, expected) => {
    expect(selected(renderedSources('<img src.md="md.png" src.xs="xs.png">'), width)).toBe(expected);
  });

  test.each([
    [320, 'xs.png'],
    [700, 'lt-md.png'],
    [1000, 'gt-xs.png'],
  ] as const)('reproduces rendered overlap priority at %dpx', (width, expected) => {
    expect(selected(renderedSources('<img src.gt-xs="gt-xs.png" src.lt-md="lt-md.png" src.xs="xs.png">'), width)).toBe(
      expected,
    );
  });
});
