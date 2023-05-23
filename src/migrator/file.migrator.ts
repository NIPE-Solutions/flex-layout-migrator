import { BaseMigrator } from './base.migrator';

import * as fs from 'fs-extra';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { Cheerio, CheerioAPI, Element as CheerioElement } from 'cheerio';
import { logger } from '../logger';
import { BreakPoint } from '../converter/converter.type';
import { NodeWithChildren } from 'domhandler';
import { IAttributeContext, IConverter } from '../converter/converter';

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
    this.notifyFileStarted(inputFilename);

    const html = await fs.promises.readFile(this.input, 'utf8');
    const $ = this.loadCheerio(html);

    const attributeNamesToLookFor = this.converter.getAllAttributes();
    logger.debug('Attributes: [%s]', attributeNamesToLookFor.join(', '));

    const elements = this.findElementsWithCustomAttributes(
      $,
      attributeNamesToLookFor,
    );
    logger.debug('Found %i elements', elements.length);

    if (!elements.length) {
      logger.debug('No elements found. Skipping file.');
      this.notifyFileNoElementsToConvert(inputFilename);
      return;
    }

    const totalElements = elements.length;

    // Phase 1: Prepare the conversion
    const attributeContexts = this.prepareConversion(
      elements,
      $,
      inputFilename,
      totalElements,
    );

    // Phase 2: Convert the attributes
    this.performConversion(
      elements,
      $,
      inputFilename,
      totalElements,
      attributeContexts,
    );

    await this.writeOutputFile($);
  }

  private loadCheerio(html: string): CheerioAPI {
    return cheerio.load(
      html,
      { xml: { decodeEntities: false, lowerCaseAttributeNames: false } },
      false,
    );
  }

  private prepareConversion(
    elements: Cheerio<CheerioElement>[],
    $: CheerioAPI,
    inputFilename: string,
    totalElements: number,
  ): Map<string, IAttributeContext<unknown>> {
    const attributeContexts: Map<
      string,
      IAttributeContext<unknown>
    > = new Map();

    elements.forEach((element, index) => {
      this.notifyUpdateFilePreparationProgress(
        inputFilename,
        totalElements,
        index,
      );

      const el = $(element);
      const attrs = el.attr();

      if (!attrs) return;

      for (const [attribute] of Object.entries(attrs)) {
        const isBreakpointAttribute = !!attribute && attribute.includes('.');
        logger.debug(
          'Can convert [%s]: %s',
          attribute,
          this.converter.canConvert(attribute, isBreakpointAttribute),
        );

        if (!this.converter.canConvert(attribute, isBreakpointAttribute)) {
          logger.debug('Cannot convert attribute: %s', attribute);

          continue;
        }

        const { attr } = this.extractAttributeAndBreakpoint(
          attribute,
          isBreakpointAttribute,
        );

        // Remove the square brackets from the attribute name
        // [fxFlex] => fxFlex
        // Currently needed because we currently dont support property binding syntax
        // TODO: Support property binding syntax
        const normalizeAttribute = attr.replace('[', '').replace(']', '');

        const context = this.converter.prepare(normalizeAttribute, $, el);
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
    attributeContexts: Map<string, IAttributeContext<unknown>>,
  ): void {
    elements.forEach((element, index) => {
      this.notifyUpdateFileMigrationProgress(
        inputFilename,
        totalElements,
        index,
      );

      const el = $(element);
      const attrs = el.attr();

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

        // Get the context for the attribute, if any or undefined
        const context = attributeContexts.get(`${index}_${attribute}`);

        // If context is defined, pass the context data, otherwise pass undefined
        const contextData = context
          ? (context.data as IAttributeContext<unknown>)
          : undefined;

        this.converter.convert(
          normalizeAttribute,
          values,
          el,
          breakPoint,
          contextData,
        );

        element.removeAttr(attribute);
      }
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

  private async writeOutputFile($: CheerioAPI): Promise<void> {
    const migratedHtml = $.html({ xmlMode: false });

    const outputDir = path.dirname(this.output);
    await fs.promises.mkdir(outputDir, { recursive: true });

    await fs.promises.writeFile(this.output, migratedHtml);

    const inputFilename = path.basename(this.input);
    this.notifyFileCompleted(inputFilename);
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

  private notifyUpdateFilePreparationProgress(
    inputFilename: string,
    totalElements: number,
    index: number,
  ): void {
    const percentage = Math.round(((index + 1) / totalElements) * 100);
    this.notifyObservers('filePreparationProgress', {
      id: this.input,
      fileName: inputFilename,
      percentage,
      processedElements: index + 1,
    });
  }

  private notifyUpdateFileMigrationProgress(
    inputFilename: string,
    totalElements: number,
    index: number,
  ): void {
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
