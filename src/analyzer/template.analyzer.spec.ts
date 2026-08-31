import { AngularTemplateParser } from '../template/angular-template.parser';
import { TemplateAnalyzer } from './template.analyzer';

describe('TemplateAnalyzer', () => {
  test('returns located Flex-Layout inputs in source order', () => {
    const source = '<section fxLayout="row"><div class="card" class.sm="compact" [fxFlex]="basis"></div></section>';
    const parsed = new AngularTemplateParser().parse(source, 'card.component.html');
    expect(parsed.status).toBe('parsed');
    if (parsed.status !== 'parsed') throw new Error('Expected the fixture to parse');

    const inputs = new TemplateAnalyzer().analyze('card.component.html', parsed.elements);

    expect(inputs).toEqual([
      expect.objectContaining({
        id: 'card.component.html:9',
        fileName: 'card.component.html',
        elementId: '0',
        directive: 'fxLayout',
        sourceName: 'fxLayout',
        value: 'row',
        binding: 'literal',
        source: { start: 9, end: 23 },
      }),
      expect.objectContaining({
        id: 'card.component.html:42',
        elementId: '24',
        directive: 'class',
        sourceName: 'class.sm',
        breakpoint: 'sm',
        value: 'compact',
        binding: 'literal',
      }),
      expect.objectContaining({
        id: 'card.component.html:61',
        elementId: '24',
        directive: 'fxFlex',
        sourceName: '[fxFlex]',
        value: 'basis',
        binding: 'property',
      }),
    ]);
  });
});
