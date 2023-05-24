import { Cheerio, CheerioAPI, Element as CheerioElement } from 'cheerio';
import * as cheerio from 'cheerio';
import { Stack } from '../lib/stack';
import { NodeWithChildren } from 'domhandler';

/**
 * Loads the given html into cheerio and returns the result
 * @param html html to load
 * @returns the cheerio instance
 */
export function loadHtml(html: string): CheerioAPI {
  return cheerio.load(html, { xml: { decodeEntities: false, lowerCaseAttributeNames: false } }, false);
}

/**
 * Finds all elements that have Flex-Layout attributes and returns them in an array.
 *
 * We need to use a custom attribute selector because [fxFlex.sm] is not a valid CSS selector
 *
 * Big O notation:
 * - O(n) where n is the number of elements in the DOM tree (worst case). This is because we need to traverse the entire DOM tree to find the elements.
 * - By using a stack, we can reduce the space complexity to O(h) where h is the height of the DOM tree.
 *
 * @param cheerioRoot The Cheerio root element
 * @param attributeNames The attribute names to look for
 * @returns an array of elements that have Flex-Layout attributes
 */
export function findElementsWithCustomAttributes(
  cheerioRoot: CheerioAPI,
  attributes: string[],
): Cheerio<CheerioElement>[] {
  const elementsWithAttributes: Cheerio<CheerioElement>[] = [];
  const stack = new Stack<NodeWithChildren>();
  stack.push(cheerioRoot.root()[0]);

  while (!stack.isEmpty()) {
    const node = stack.pop();

    if (!node || !node.children) continue;

    node.children.forEach(childElement => {
      if (childElement.type === 'tag') {
        const child = cheerioRoot(childElement as CheerioElement);
        const attrs = Object.keys(childElement.attribs || {});

        for (const attribute of attributes) {
          if (attrs.includes(attribute)) {
            elementsWithAttributes.push(child);
            break;
          }
        }
      }

      stack.push(childElement as NodeWithChildren);
    });
  }

  return elementsWithAttributes;
}

/**
 * Adds the given styles to the element inline styles
 * @param element element to add styles to
 * @param styles key value pairs of styles to add
 */
export function addInlineStyles(element: Cheerio<cheerio.AnyNode>, styles: { [key: string]: string }): void {
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
