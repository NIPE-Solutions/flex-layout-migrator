import { Cheerio } from 'cheerio';
import * as cheerio from 'cheerio';

/**
 * Adds the given styles to the element inline styles
 * @param element element to add styles to
 * @param styles key value pairs of styles to add
 */
export function addInlineStyles(
  element: Cheerio<cheerio.AnyNode>,
  styles: { [key: string]: string },
): void {
  let currentStyle = element.attr('style') || '';

  if (currentStyle && !currentStyle.endsWith(';')) {
    currentStyle += ';';
  }

  const stylesToAdd = Object.entries(styles)
    .map(([key, value]) => `${key}: ${value};`)
    .join(' ');
  const newStyle = `${currentStyle} ${stylesToAdd}`.trim();

  element.attr('style', newStyle);
}
