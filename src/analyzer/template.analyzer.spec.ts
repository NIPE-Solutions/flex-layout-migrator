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

  test('does not reinterpret class, style, or attribute binding targets as directive inputs', () => {
    const source =
      '<div [class.fxShow]="classFlag" [style.fxShow]="styleValue" [attr.fxShow]="attributeValue" [fxShow]="shown"></div>';
    const parsed = new AngularTemplateParser().parse(source, 'targets.component.html');
    expect(parsed.status).toBe('parsed');
    if (parsed.status !== 'parsed') throw new Error('Expected the fixture to parse');

    const inputs = new TemplateAnalyzer().analyze('targets.component.html', parsed.elements);

    expect(inputs).toEqual([
      expect.objectContaining({
        directive: 'fxShow',
        sourceName: '[fxShow]',
        binding: 'property',
        value: 'shown',
      }),
    ]);
  });

  test('recognizes responsive class and style binding targets without admitting similarly named targets', () => {
    const source =
      '<div [class.sm]="classFlag" bind-class.md="otherClass" [style.lg]="styleValue" bind-style.xl="otherStyle" [class.fxShow]="wrong" [style.fxHide]="wrong" [attr.fxShow]="wrong"></div>';
    const parsed = new AngularTemplateParser().parse(source, 'responsive-authorities.component.html');
    expect(parsed.status).toBe('parsed');
    if (parsed.status !== 'parsed') throw new Error('Expected the fixture to parse');

    const inputs = new TemplateAnalyzer().analyze('responsive-authorities.component.html', parsed.elements);

    expect(inputs).toEqual([
      expect.objectContaining({ directive: 'class', breakpoint: 'sm', binding: 'property' }),
      expect.objectContaining({ directive: 'class', breakpoint: 'md', binding: 'property' }),
      expect.objectContaining({ directive: 'style', breakpoint: 'lg', binding: 'property' }),
      expect.objectContaining({ directive: 'style', breakpoint: 'xl', binding: 'property' }),
    ]);
  });

  test('continues to classify a two-way directive input as dynamic', () => {
    const parsed = new AngularTemplateParser().parse('<div [(fxShow)]="shown"></div>', 'two-way.component.html');
    expect(parsed.status).toBe('parsed');
    if (parsed.status !== 'parsed') throw new Error('Expected the fixture to parse');

    expect(new TemplateAnalyzer().analyze('two-way.component.html', parsed.elements)).toEqual([
      expect.objectContaining({ directive: 'fxShow', sourceName: '[fxShow]', binding: 'property', value: 'shown' }),
    ]);
  });
});
