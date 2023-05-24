import { BaseMigrator } from './base.migrator';

import * as fs from 'fs-extra';
import * as path from 'path';
import { Cheerio, CheerioAPI, Element as CheerioElement } from 'cheerio';
import { logger } from '../logger';
import { BreakPoint } from '../converter/breakpoint.type';
import { AttributeContext, IConverter } from '../converter/converter';
import { formatFile } from '../lib/prettier.formatter';
import { findElementsWithCustomAttributes, loadHtml } from '../util/cheerio.util';
import Queue from '@esm2cjs/p-queue';

export class FileMigrator extends BaseMigrator {
  constructor(protected converter: IConverter, private input: string, private output: string) {
    super(converter);
  }

  public async migrate(): Promise<void> {
    const inputFilename = path.basename(this.input);
    this.notifyFileStarted(inputFilename);

    const html = await fs.promises.readFile(this.input, 'utf8');
    const $ = loadHtml(html);

    const attributeNamesToLookFor = this.converter.getAllAttributes();
    logger.debug('Attributes: [%s]', attributeNamesToLookFor.join(', '));

    const elements = findElementsWithCustomAttributes($, attributeNamesToLookFor);
    logger.debug('Found %i elements', elements.length);

    if (!elements.length) {
      logger.debug('No elements found. Skipping file.');
      this.notifyFileNoElementsToConvert(inputFilename);
      return;
    }

    const totalElements = elements.length;

    // Phase 1: Prepare the conversion
    const attributeContexts = await this.prepareConversion(elements, $, inputFilename, totalElements);

    // Phase 2: Convert the attributes
    await this.performConversion(elements, $, inputFilename, totalElements, attributeContexts);

    await this.writeOutputFile($);
  }

  /**
   * Prepare the conversion by collecting all attribute contexts. This is done in parallel.
   * The result is a map of attribute contexts, where the key consists of the attribute and the index of it.
   * This context is used later on to perform the actual conversion to provide the converter with all the information it needs.
   */
  private async prepareConversion(
    elements: Cheerio<CheerioElement>[],
    $: CheerioAPI,
    inputFilename: string,
    totalElements: number,
  ): Promise<Map<string, AttributeContext<unknown>>> {
    const queue = new Queue({ concurrency: 5 });

    const results = (await Promise.all(
      elements.map((element, index) =>
        queue.add(() => this.processPreparationElement(element, index, $, inputFilename, totalElements)),
      ),
    )) as Map<string, AttributeContext<unknown>>[];

    const attributeContexts: Map<string, AttributeContext<unknown>> = results.reduce((map, result) => {
      for (const [key, value] of result.entries()) {
        map.set(key, value);
      }
      return map;
    }, new Map<string, AttributeContext<unknown>>());

    return attributeContexts;
  }

  /**
   * Process the preparation of a single element and returns the attribute contexts for the element.
   */
  private async processPreparationElement(
    element: Cheerio<CheerioElement>,
    index: number,
    $: CheerioAPI,
    inputFilename: string,
    totalElements: number,
  ): Promise<Map<string, AttributeContext<unknown>>> {
    const attributeContexts: Map<string, AttributeContext<unknown>> = new Map();
    this.notifyUpdateFilePreparationProgress(inputFilename, totalElements, index);

    const el = $(element);
    const attrs = el.attr();

    if (!attrs) return attributeContexts;

    for (const [attribute] of Object.entries(attrs)) {
      const { attr, canConvert, normalizedAttribute } = this.extractAttributeData(attribute);

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
    return attributeContexts;
  }

  /**
   * Performs the actual conversion of the attributes and their values in the HTML file.
   * It uses a queue to limit the number of concurrent operations.
   */
  private async performConversion(
    elements: Cheerio<CheerioElement>[],
    $: CheerioAPI,
    inputFilename: string,
    totalElements: number,
    attributeContexts: Map<string, AttributeContext<unknown>>,
  ): Promise<void> {
    const queue = new Queue({ concurrency: 5 });
    elements.map(async (element, index) => {
      queue.add(async () => {
        await this.processConversionElement(element, index, $, inputFilename, totalElements, attributeContexts);
      });
    });

    await queue.onIdle();
  }

  /**
   * Processes a single element and converts the attributes and their values.
   */
  private async processConversionElement(
    element: Cheerio<CheerioElement>,
    index: number, // hinzugefügt
    $: CheerioAPI,
    inputFilename: string,
    totalElements: number,
    attributeContexts: Map<string, AttributeContext<unknown>>,
  ): Promise<void> {
    this.notifyUpdateFileMigrationProgress(inputFilename, totalElements, index);

    const el = $(element);
    const attrs = el.attr();

    if (!attrs) return;

    for (const [attribute, value] of Object.entries(attrs)) {
      const { canConvert, normalizedAttribute, breakPoint } = this.extractAttributeData(attribute);
      logger.debug('Attribute: %s, value: %s. Can be converted: %s', attribute, value, canConvert);

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

    const formatedHtml = formatFile(migratedHtml, this.converter.getPrettierConfig());

    const outputDir = path.dirname(this.output);
    await fs.promises.mkdir(outputDir, { recursive: true });

    await fs.promises.writeFile(this.output, formatedHtml);

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
