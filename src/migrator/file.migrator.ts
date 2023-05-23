import { BaseMigrator } from './base.migrator';

import * as fs from 'fs-extra';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { Cheerio, CheerioAPI, Element as CheerioElement } from 'cheerio';
import { logger } from '../logger';
import { BreakPoint } from '../converter/breakpoint.type';
import { NodeWithChildren } from 'domhandler';
import { AttributeContext, IConverter } from '../converter/converter';
import { formatFile } from '../lib/prettier.formatter';
import { Stack } from '../lib/stack';

export class FileMigrator extends BaseMigrator {
  constructor(protected converter: IConverter, private input: string, private output: string) {
    super(converter);
  }

  public async migrate(): Promise<void> {
    const inputFilename = path.basename(this.input);
    this.notifyFileStarted(inputFilename);

    const html = await fs.promises.readFile(this.input, 'utf8');
    const $ = this.loadCheerio(html);

    const attributeNamesToLookFor = this.converter.getAllAttributes();
    logger.debug('Attributes: [%s]', attributeNamesToLookFor.join(', '));

    const elements = this.findElementsWithCustomAttributes($, attributeNamesToLookFor);
    logger.debug('Found %i elements', elements.length);

    if (!elements.length) {
      logger.debug('No elements found. Skipping file.');
      this.notifyFileNoElementsToConvert(inputFilename);
      return;
    }

    const totalElements = elements.length;

    // Phase 1: Prepare the conversion
    const attributeContexts = this.prepareConversion(elements, $, inputFilename, totalElements);

    // Phase 2: Convert the attributes
    this.performConversion(elements, $, inputFilename, totalElements, attributeContexts);

    await this.writeOutputFile($);
  }

  private loadCheerio(html: string): CheerioAPI {
    return cheerio.load(html, { xml: { decodeEntities: false, lowerCaseAttributeNames: false } }, false);
  }

  private prepareConversion(
    elements: Cheerio<CheerioElement>[],
    $: CheerioAPI,
    inputFilename: string,
    totalElements: number,
  ): Map<string, AttributeContext<unknown>> {
    const attributeContexts: Map<string, AttributeContext<unknown>> = new Map();

    elements.forEach((element, index) => {
      this.notifyUpdateFilePreparationProgress(inputFilename, totalElements, index);

      const el = $(element);
      const attrs = el.attr();

      if (!attrs) return;

      for (const [attribute] of Object.entries(attrs)) {
        const { attr, canConvert, normalizedAttribute } = this.extractAttributeData(attribute);
        logger.debug('Can convert: %s', canConvert);

        if (!canConvert) {
          continue;
        }

        let context = this.converter.prepare(normalizedAttribute, $, el);

        context ??= {
          usesPropertyBinding: false,
        } as AttributeContext<unknown>;

        // Check if the attribute is using property binding syntax
        // If so, we provide a context to the converter
        if (attr.startsWith('[') && attr.endsWith(']')) {
          context.usesPropertyBinding = true;
        }

        const uniqueKey = `${index}_${attribute}`;
        attributeContexts.set(uniqueKey, context);
      }
    });

    return attributeContexts;
  }

  private performConversion(
    elements: Cheerio<CheerioElement>[],
    $: CheerioAPI,
    inputFilename: string,
    totalElements: number,
    attributeContexts: Map<string, AttributeContext<unknown>>,
  ): void {
    elements.forEach((element, index) => {
      this.notifyUpdateFileMigrationProgress(inputFilename, totalElements, index);

      const el = $(element);
      const attrs = el.attr();

      if (!attrs) return;

      for (const [attribute, value] of Object.entries(attrs)) {
        logger.debug('Attribute: %s, value: %s', attribute, value);

        const { canConvert, normalizedAttribute, breakPoint } = this.extractAttributeData(attribute);
        logger.debug('Can convert: %s', canConvert);

        if (!canConvert) {
          continue;
        }

        // Convert and split the attribute value into an array of values
        const values = value && value.includes(' ') ? value.split(' ') : [value];

        // Get the context for the attribute, if any or undefined
        const context = attributeContexts.get(`${index}_${attribute}`);

        // If context is defined, pass the context data, otherwise pass undefined
        const contextData = context ? (context as AttributeContext<unknown>) : undefined;

        this.converter.convert(normalizedAttribute, values, el, breakPoint, contextData);

        element.removeAttr(attribute);
      }
    });
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
  private findElementsWithCustomAttributes(cheerioRoot: CheerioAPI, attributes: string[]): Cheerio<CheerioElement>[] {
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
   * Extracts the attribute name and breakpoint from the attribute string.
   * @param attribute The attribute string
   * @param isBreakpointAttribute Whether the attribute is a breakpoint attribute
   * @returns an object with the following properties: attr, breakPoint
   */
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

  /**
   * Extracts essential data from the attribute string. This includes the attribute name, breakpoint, whether the attribute is a breakpoint attribute, and whether the attribute can be converted. The attribute name is normalized to remove any breakpoint suffixes.
   * @param attribute The attribute string
   * @returns an object with the following properties: attr, normalizedAttribute, breakPoint, canConvert, isBreakpointAttribute
   */
  private extractAttributeData(attribute: string): {
    attr: string;
    normalizedAttribute: string;
    breakPoint: BreakPoint | undefined;
    canConvert: boolean;
    isBreakpointAttribute: boolean;
  } {
    const isBreakpointAttribute = !!attribute && attribute.includes('.');
    const canConvert = this.converter.canConvert(attribute, isBreakpointAttribute);
    const { attr, breakPoint } = this.extractAttributeAndBreakpoint(attribute, isBreakpointAttribute);
    const normalizedAttribute = this.normalizeAttribute(attr);
    return { attr, normalizedAttribute, breakPoint, canConvert, isBreakpointAttribute };
  }

  private async writeOutputFile($: CheerioAPI): Promise<void> {
    const migratedHtml = $.html({ xmlMode: false });

    formatFile(migratedHtml);

    const outputDir = path.dirname(this.output);
    await fs.promises.mkdir(outputDir, { recursive: true });

    await fs.promises.writeFile(this.output, migratedHtml);

    const inputFilename = path.basename(this.input);
    this.notifyFileCompleted(inputFilename);
  }

  /**
   * Removes the square brackets from the attribute name. For example, [fxFlex] => fxFlex
   * @param attribute The attribute name
   * @returns the normalized attribute name
   */
  private normalizeAttribute(attribute: string): string {
    return attribute.replace('[', '').replace(']', '');
  }

  private notifyFileStarted(inputFilename: string): void {
    this.notifyObservers('fileStarted', {
      id: this.input,
      fileName: inputFilename,
    });
  }

  private notifyFileNoElementsToConvert(inputFilename: string): void {
    this.notifyObservers('fileNoElements', {
      id: this.input,
      fileName: inputFilename,
    });
  }

  private notifyUpdateFilePreparationProgress(inputFilename: string, totalElements: number, index: number): void {
    const percentage = Math.round(((index + 1) / totalElements) * 100);
    this.notifyObservers('filePreparationProgress', {
      id: this.input,
      fileName: inputFilename,
      percentage,
      processedElements: index + 1,
    });
  }

  private notifyUpdateFileMigrationProgress(inputFilename: string, totalElements: number, index: number): void {
    const percentage = Math.round(((index + 1) / totalElements) * 100);
    this.notifyObservers('fileMigrationProgress', {
      id: this.input,
      fileName: inputFilename,
      percentage,
      processedElements: index + 1,
    });
  }

  private notifyFileCompleted(inputFilename: string): void {
    this.notifyObservers('fileCompleted', {
      id: this.input,
      fileName: inputFilename,
    });
  }
}
