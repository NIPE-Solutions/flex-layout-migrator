import { addInlineStyles } from './cheerio.util';
import * as cheerio from 'cheerio';

describe('addInlineStyles', () => {
  const html = `<div id="test"></div>`;
  const $ = cheerio.load(html);
  const testElement = $('#test');

  test('should add inline styles to an element without existing styles', () => {
    const stylesToAdd = {
      'background-color': 'red',
      'font-size': '16px',
    };

    addInlineStyles(testElement, stylesToAdd);

    const expectedStyle = 'background-color: red; font-size: 16px;';
    expect(testElement.attr('style')).toBe(expectedStyle);
  });

  test('should add inline styles to an element with existing styles', () => {
    const existingStyle = 'margin: 10px; padding: 5px;';
    testElement.attr('style', existingStyle);

    const stylesToAdd = {
      'background-color': 'blue',
      'font-weight': 'bold',
    };

    addInlineStyles(testElement, stylesToAdd);

    const expectedStyle = `${existingStyle} background-color: blue; font-weight: bold;`;
    expect(testElement.attr('style')).toBe(expectedStyle);
  });
});
