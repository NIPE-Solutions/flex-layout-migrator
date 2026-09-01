import { AngularTemplateParser } from './angular-template.parser';

describe('AngularTemplateParser', () => {
  test('returns project-owned elements and source ranges for Angular inputs', () => {
    const source = '<div fxLayout="row" [fxFlex]="basis"></div>';

    const result = new AngularTemplateParser().parse(source, 'card.component.html');

    expect(result).toEqual({
      status: 'parsed',
      elements: [
        {
          id: '0',
          name: 'div',
          startTag: { start: 0, end: 37 },
          attributes: [
            {
              name: 'fxLayout',
              rawName: 'fxLayout',
              value: 'row',
              binding: 'literal',
              source: { start: 5, end: 19 },
              nameSource: { start: 5, end: 13 },
              valueSource: { start: 15, end: 18 },
            },
            {
              name: 'fxFlex',
              rawName: '[fxFlex]',
              value: 'basis',
              binding: 'property',
              source: { start: 20, end: 36 },
              nameSource: { start: 20, end: 28 },
              valueSource: { start: 30, end: 35 },
            },
          ],
        },
      ],
    });
  });

  test('walks nested elements inside Angular control flow with stable parents', () => {
    const source = '<section>@if (shown) {<article><app-item fxFlex /></article>}</section>';

    const result = new AngularTemplateParser().parse(source, 'nested.component.html');

    expect(result).toMatchObject({
      status: 'parsed',
      elements: [
        { id: '0', name: 'section' },
        { id: '22', name: 'article', parentId: '0' },
        { id: '31', name: 'app-item', parentId: '22' },
      ],
    });
  });

  test('preserves raw attribute keys when Angular normalizes style and class binding names', () => {
    const result = new AngularTemplateParser().parse(
      '<div STYLE="display:block" [style.display]="display" [style.display.important]="display" [class.hidden]="hidden"></div>',
      'bindings.component.html',
    );

    expect(result).toMatchObject({
      status: 'parsed',
      elements: [
        {
          attributes: [
            { name: 'STYLE', rawName: 'STYLE', binding: 'literal' },
            { name: 'display', rawName: '[style.display]', binding: 'property' },
            { name: 'display', rawName: '[style.display.important]', binding: 'property' },
            { name: 'hidden', rawName: '[class.hidden]', binding: 'property' },
          ],
        },
      ],
    });
  });

  test('keeps offsets aligned with CRLF source text', () => {
    const source = '<div\r\n  fxLayout="row"\r\n></div>';

    const result = new AngularTemplateParser().parse(source, 'windows.component.html');

    expect(result).toMatchObject({
      status: 'parsed',
      elements: [
        {
          startTag: { start: 0, end: 25 },
          attributes: [
            {
              source: { start: 8, end: 22 },
              valueSource: { start: 18, end: 21 },
            },
          ],
        },
      ],
    });
  });

  test('returns diagnostics instead of an empty parsed template', () => {
    const result = new AngularTemplateParser().parse('<span />', 'invalid.component.html');

    expect(result).toMatchObject({
      status: 'parse-error',
      diagnostics: [
        {
          message: expect.stringContaining('Only void, custom and foreign elements can be self closed'),
          source: { start: 0, end: 5 },
        },
      ],
    });
  });
});
