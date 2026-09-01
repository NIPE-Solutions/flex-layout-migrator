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
              rawValue: 'row',
              value: 'row',
              binding: 'literal',
              source: { start: 5, end: 19 },
              nameSource: { start: 5, end: 13 },
              valueSource: { start: 15, end: 18 },
            },
            {
              name: 'fxFlex',
              rawName: '[fxFlex]',
              rawValue: 'basis',
              value: 'basis',
              binding: 'property',
              bindingTarget: 'property',
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

  test('keeps raw literal edit evidence separate from Angular-decoded semantic values', () => {
    const source = '<div fxShow="fals&#101;" class="bl&#111;ck" style="displa&#121;: block"></div>';

    const result = new AngularTemplateParser().parse(source, 'entities.component.html');

    expect(result).toMatchObject({
      status: 'parsed',
      elements: [
        {
          attributes: [
            { name: 'fxShow', value: 'false', rawValue: 'fals&#101;' },
            { name: 'class', value: 'block', rawValue: 'bl&#111;ck' },
            { name: 'style', value: 'display: block', rawValue: 'displa&#121;: block' },
          ],
        },
      ],
    });
  });

  test('retains Angular bound target types after normalized class, style, and attribute names', () => {
    const result = new AngularTemplateParser().parse(
      '<div [fxShow]="shown" [class.fxShow]="flag" [style.fxShow]="value" [attr.fxShow]="value"></div>',
      'targets.component.html',
    );

    expect(result).toMatchObject({
      status: 'parsed',
      elements: [
        {
          attributes: [
            { name: 'fxShow', rawName: '[fxShow]', bindingTarget: 'property' },
            { name: 'fxShow', rawName: '[class.fxShow]', bindingTarget: 'class' },
            { name: 'fxShow', rawName: '[style.fxShow]', bindingTarget: 'style' },
            { name: 'fxShow', rawName: '[attr.fxShow]', bindingTarget: 'attribute' },
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
