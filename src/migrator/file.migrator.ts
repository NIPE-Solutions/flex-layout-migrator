import { BaseMigrator } from './base.migrator';

import * as fs from 'fs-extra';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { Cheerio, CheerioAPI, Element as CheerioElement } from 'cheerio';
import { logger } from '../logger';
import { BreakPoint } from '../converter/converter.type';
import { NodeWithChildren } from 'domhandler';
import { IConverter } from '../converter/converter';

export class FileMigrator extends BaseMigrator {
  constructor(
    protected converter: IConverter,
    private input: string,
    private output: string,
  ) {
    super(converter);
  }

  public async migrate(): Promise<void> {
    const inputFilename = path.basename(this.input);

    this.notifyObservers('fileStarted', {
      id: this.input,
      fileName: inputFilename,
    });

    const html = await fs.promises.readFile(this.input, 'utf8');

    // Load the HTML into Cheerio and disable XML encoding
    // otherwise attributenames will be lowercased
    const $ = cheerio.load(
      html,
      { xml: { decodeEntities: false, lowerCaseAttributeNames: false } },
      false,
    );

    // Find all elements that have Flex-Layout attributes
    const attributeNamesToLookFor = this.converter.getAllAttributes();
    logger.debug('Attributes: [%s]', attributeNamesToLookFor.join(', '));

    // Find all elements that have Flex-Layout attributes and store them in an array
    // We need to use a custom attribute selector because [fxFlex.sm] is not a valid CSS selector
    const elements = this.findElementsWithCustomAttributes(
      $,
      attributeNamesToLookFor,
    );

    logger.debug('Found %i elements', elements.length);

    // Add a spinner for the elements progress
    const totalElements = elements.length;

    // Iterate through the elements and perform the conversion
    elements.forEach((element, index) => {
      // Update the elements spinner

      const percentage = Math.round(((index + 1) / totalElements) * 100);
      this.notifyObservers('fileProgress', {
        id: this.input,
        fileName: inputFilename,
        percentage,
        processedElements: index + 1,
      });

      const el = $(element);
      const attrs = el.attr();

      // If the element has no attributes, skip it
      if (!attrs) return;

      for (const [attribute, value] of Object.entries(attrs)) {
        logger.debug('Attribute: %s, value: %s', attribute, value);

        const isBreakpointAttribute = !!attribute && attribute.includes('.');
        logger.debug(
          'Can convert: %s',
          this.converter.canConvert(attribute, isBreakpointAttribute),
        );

        if (!this.converter.canConvert(attribute, isBreakpointAttribute)) {
          logger.debug('Cannot convert attribute: %s', attribute);

          continue;
        }

        const { attr, breakPoint } = this.extractAttributeAndBreakpoint(
          attribute,
          isBreakpointAttribute,
        );

        // Remove the square brackets from the attribute name
        // [fxFlex] => fxFlex
        // Currently needed because we currently dont support property binding syntax
        // TODO: Support property binding syntax
        const normalizeAttribute = attr.replace('[', '').replace(']', '');

        // Convert and split the attribute value into an array of values
        const values =
          value && value.includes(' ') ? value.split(' ') : [value];

        this.converter.convert(normalizeAttribute, values, el, breakPoint);

        element.removeAttr(attribute);
      }
    });

    // Serialize the Cheerio document back to HTML
    const migratedHtml = $.html({ xmlMode: false });

    // Ensure the output directory exists
    const outputDir = path.dirname(this.output);
    await fs.promises.mkdir(outputDir, { recursive: true });

    await fs.promises.writeFile(this.output, migratedHtml);

    this.notifyObservers('fileCompleted', {
      id: this.input,
      fileName: inputFilename,
    });
  }

  /**
   * Finds all elements that have Flex-Layout attributes and returns them in an array.
   *
   * We need to use a custom attribute selector because [fxFlex.sm] is not a valid CSS selector
   *
   * Big O Notation: O(n * m) where n is the number of elements in the document and m is the number of attributes to look for
   *
   * @param cheerioRoot The Cheerio root element
   * @param attributeNames The attribute names to look for
   * @returns an array of elements that have Flex-Layout attributes
   */
  private findElementsWithCustomAttributes(
    cheerioRoot: CheerioAPI,
    attributes: string[],
  ): Cheerio<CheerioElement>[] {
    const elementsWithAttributes: Cheerio<CheerioElement>[] = [];

    function traverse(node: NodeWithChildren): void {
      if (!node || !node.children) return;

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

        traverse(childElement as NodeWithChildren);
      });
    }

    traverse(cheerioRoot.root()[0]);
    return elementsWithAttributes;
  }

  private extractAttributeAndBreakpoint(
    attribute: string,
    isBreakpointAttribute: boolean,
  ): {
    attr: string;
    breakPoint: BreakPoint | undefined;
  } {
    // Check if the attribute is a breakpoint attribute
    if (isBreakpointAttribute) {
      const [attr, breakPoint] = attribute.split('.');
      return { attr, breakPoint: breakPoint as BreakPoint };
    }
    return { attr: attribute, breakPoint: undefined };
  }
}
