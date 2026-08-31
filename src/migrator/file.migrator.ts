import { BaseMigrator } from './base.migrator';

import * as fs from 'fs-extra';
import * as path from 'path';
import { Cheerio, CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import { ConversionResult } from '../analyzer/conversion-result';
import { analyzeFlexLayoutAttribute, FlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import { isKnownBreakpoint } from '../analyzer/flex-layout.catalog';
import { logger } from '../logger';
import { AttributeContext, IConverter } from '../converter/converter';
import { formatFile } from '../lib/prettier.formatter';
import { findElementsWithFlexLayoutAttributes, loadHtml } from '../util/cheerio.util';
import PQueue from 'p-queue';

export class FileMigrator extends BaseMigrator {
  private results: ConversionResult[] = [];

  constructor(
    protected override converter: IConverter,
    private input: string,
    private output: string,
  ) {
    super(converter);
  }

  public async migrate(): Promise<void> {
    this.results = [];
    const inputFilename = path.basename(this.input);
    this.notifyFileStarted(inputFilename);

    const html = await fs.promises.readFile(this.input, 'utf8');
    const $ = loadHtml(html);

    const elements = findElementsWithFlexLayoutAttributes($);
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

  public getResults(): readonly ConversionResult[] {
    return [...this.results];
  }

  /**
   * Prepare the conversion by collecting all attribute contexts. This is done in parallel.
   * The result is a map of attribute contexts, where the key consists of the attribute and the index of it.
   * This context is used later on to perform the actual conversion to provide the converter with all the information it needs.
   */
  private async prepareConversion(
    elements: Cheerio<Element>[],
    $: CheerioAPI,
    inputFilename: string,
    totalElements: number,
  ): Promise<Map<string, AttributeContext<unknown>>> {
    const queue = new PQueue({ concurrency: 5 });

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
    element: Cheerio<Element>,
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

    for (const [attribute, value] of Object.entries(attrs)) {
      const input = analyzeFlexLayoutAttribute(attribute, value);
      if (!input || this.getUnresolvedResult(input) || !this.converter.canConvert(input.directive, false)) continue;

      let context = this.converter.prepare(input.directive, $, el);

      context ??= {
        usesPropertyBinding: false,
      } as AttributeContext<unknown>;

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
    elements: Cheerio<Element>[],
    $: CheerioAPI,
    inputFilename: string,
    totalElements: number,
    attributeContexts: Map<string, AttributeContext<unknown>>,
  ): Promise<void> {
    const queue = new PQueue({ concurrency: 5 });
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
    element: Cheerio<Element>,
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
      const input = analyzeFlexLayoutAttribute(attribute, value);
      if (!input) continue;

      const unresolvedResult = this.getUnresolvedResult(input);
      if (unresolvedResult) {
        this.results.push(unresolvedResult);
        continue;
      }

      const canConvert = this.converter.canConvert(input.directive, false);
      logger.debug('Attribute: %s, value: %s. Can be converted: %s', attribute, value, canConvert);
      if (!canConvert) {
        this.results.push({
          status: 'unsupported',
          input,
          code: 'target-unsupported',
          reason: `The selected target does not support ${input.directive}.`,
          suggestion: 'Keep the directive and migrate it manually.',
        });
        continue;
      }

      // Get the context for the attribute, if any or undefined
      const context = attributeContexts.get(`${index}_${attribute}`);

      // If context is defined, pass the context data, otherwise pass undefined
      const contextData = context ? (context as AttributeContext<unknown>) : undefined;

      let values: string[] = [];
      if (context?.usesPropertyBinding) {
        // If the attribute uses property binding syntax, we don't want to split the values
        // Instead, we pass the whole value to the converter value array at index 0
        values = value ? [value] : [];
      } else {
        // Convert and split the attribute value into an array of values
        values = value && value.includes(' ') ? value.split(' ') : [value];
      }

      this.converter.convert(input.directive, values, el, undefined, contextData);

      element.removeAttr(attribute);
      this.results.push({ status: 'converted', input });
    }
  }

  private getUnresolvedResult(input: FlexLayoutInput): ConversionResult | undefined {
    if (input.breakpoint && !isKnownBreakpoint(input.breakpoint)) {
      return {
        status: 'review',
        input,
        code: 'custom-breakpoint',
        reason: `The breakpoint alias ${input.breakpoint} may be registered by the project.`,
        suggestion: 'Provide its media query or migrate this responsive input manually.',
      };
    }

    if (input.binding === 'property') {
      return {
        status: 'review',
        input,
        code: 'dynamic-binding',
        reason: 'Angular property bindings may depend on runtime state.',
        suggestion: 'Replace the binding manually or make it a literal before migration.',
      };
    }

    if (input.breakpoint) {
      return {
        status: 'review',
        input,
        code: 'breakpoint-unverified',
        reason: `Exact media-query output for ${input.breakpoint} is not implemented.`,
        suggestion: 'Keep the responsive directive until exact breakpoint support is available.',
      };
    }

    return undefined;
  }

  private async writeOutputFile($: CheerioAPI): Promise<void> {
    const migratedHtml = $.html({ xmlMode: false });

    const formatedHtml = await formatFile(migratedHtml, this.converter.getPrettierConfig());

    const outputDir = path.dirname(this.output);
    await fs.promises.mkdir(outputDir, { recursive: true });

    await fs.promises.writeFile(this.output, formatedHtml);

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
