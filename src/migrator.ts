import * as fs from "fs-extra";
import * as path from "path";
import chalk from "chalk";
import * as cheerio from "cheerio";
import { Cheerio, CheerioAPI, Element as CheerioElement } from "cheerio";
import { Converter } from "./converter";
import { handleError, logger } from "./logger";
import { BreakPoint } from "./converter/converter.type";
import { NodeWithChildren } from "domhandler";
import Spinnies from "spinnies";

class Migrator {
  private converter: Converter;
  private spinnies: Spinnies;

  constructor(converter: Converter) {
    this.converter = converter;
    this.spinnies = new Spinnies();
  }

  public async migrateFile(input: string, output: string): Promise<void> {
    const inputFilename = path.basename(input);

    this.spinnies.add(inputFilename, {
      text: `Migrating file: ${chalk.blue(inputFilename)}`,
    });

    const html = await fs.promises.readFile(input, "utf8");

    // Load the HTML into Cheerio and disable XML encoding
    // otherwise attributenames will be lowercased
    const $ = cheerio.load(
      html,
      { xml: { decodeEntities: false, lowerCaseAttributeNames: false } },
      false
    );

    // Find all elements that have Flex-Layout attributes
    const attributeNamesToLookFor = this.converter.getAllAttributes();
    logger.debug("Attributes: [%s]", attributeNamesToLookFor.join(", "));

    // Find all elements that have Flex-Layout attributes and store them in an array
    // We need to use a custom attribute selector because [fxFlex.sm] is not a valid CSS selector
    const elements = this.findElementsWithCustomAttributes(
      $,
      attributeNamesToLookFor
    );

    logger.debug("Found %i elements", elements.length);

    // Add a spinner for the elements progress
    const totalElements = elements.length;
    this.spinnies.add("elements", {
      text: `Migrating ${chalk.blue(inputFilename)}: ${chalk.cyan(
        "0%"
      )}, ${chalk.green("0")} / ${chalk.green(totalElements)} Elements`,
    });

    // Iterate through the elements and perform the conversion
    elements.forEach((element, index) => {
      // Update the elements spinner

      const percentage = Math.round(((index + 1) / totalElements) * 100);
      this.spinnies.update("elements", {
        text: `Migrating ${chalk.blue(inputFilename)}: ${chalk.cyan(
          `${percentage}%`
        )}, ${chalk.green(index + 1)} / ${chalk.green(totalElements)} Elements`,
      });

      const el = $(element);
      const attrs = el.attr();

      // If the element has no attributes, skip it
      if (!attrs) return;

      for (const [attribute, value] of Object.entries(attrs)) {
        logger.debug("Attribute: %s, value: %s", attribute, value);
        logger.debug("Can convert: %s", this.converter.canConvert(attribute));

        const isBreakpointAttribute = !!attribute && attribute.includes(".");
        if (!this.converter.canConvert(attribute, isBreakpointAttribute)) {
          logger.debug("Cannot convert attribute: %s", attribute);

          continue;
        }

        const { attr, breakPoint } = this.extractAttributeAndBreakpoint(
          attribute,
          isBreakpointAttribute
        );

        this.converter.convert(attr, value, el, breakPoint);

        element.removeAttr(attribute);
      }
    });

    this.spinnies.succeed("elements", {
      text: `Migrating ${chalk.blue(inputFilename)}: ${chalk.cyan(
        "100%"
      )}, ${chalk.green(totalElements)} / ${chalk.green(
        totalElements
      )} Elements`,
    });

    // Serialize the Cheerio document back to HTML
    const migratedHtml = $.html({ xmlMode: false });

    // Ensure the output directory exists
    const outputDir = path.dirname(output);
    await fs.promises.mkdir(outputDir, { recursive: true });

    await fs.promises.writeFile(output, migratedHtml);

    this.spinnies.succeed(inputFilename, {
      text: `Migration completed for file: ${chalk.green(inputFilename)}`,
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
    attributes: string[]
  ): Cheerio<CheerioElement>[] {
    const elementsWithAttributes: Cheerio<CheerioElement>[] = [];

    function traverse(node: NodeWithChildren): void {
      if (!node || !node.children) return;

      node.children.forEach((childElement) => {
        if (childElement.type === "tag") {
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
    isBreakpointAttribute: boolean
  ): {
    attr: string;
    breakPoint: BreakPoint | undefined;
  } {
    // Check if the attribute is a breakpoint attribute
    if (isBreakpointAttribute) {
      const [attr, breakPoint] = attribute.split(".");
      return { attr, breakPoint: breakPoint as BreakPoint };
    }
    return { attr: attribute, breakPoint: undefined };
  }

  public async migrateFolder(
    inputFolder: string,
    outputFolder: string
  ): Promise<void> {
    const files = await fs.promises.readdir(inputFolder);
    const totalFiles = files.length;
    logger.info(
      chalk.yellow("Starting migration for %i files in folder: %s"),
      totalFiles,
      inputFolder
    );

    this.spinnies.add("folder", {
      text: `Migrating Files: ${chalk.cyan("0%")}, ${chalk.green(
        "0"
      )} / ${chalk.green(totalFiles)} Files`,
    });

    await Promise.all(
      files.map(async (file, index) => {
        const inputFile = path.join(inputFolder, file);
        const outputFile = path.join(outputFolder, file);

        await this.migrateFile(inputFile, outputFile);

        const progress = `${index + 1}/${totalFiles}`;
        this.spinnies.update("folder", {
          text: `Migrating folder: ${chalk.yellow(inputFolder)}, ${chalk.green(
            progress
          )} files`,
        });
      })
    );

    this.spinnies.succeed("folder", {
      text: chalk.green(`Migration completed for folder: ${inputFolder}`),
    });
  }

  public async migrate(input: string, output: string): Promise<void> {
    try {
      const absoluteInputPath = path.resolve(input);
      const stat = await fs.promises.stat(absoluteInputPath);

      if (stat.isDirectory()) {
        await this.migrateFolder(input, output);
      } else if (stat.isFile()) {
        await this.migrateFile(input, output);
      } else {
        handleError(
          `The input path is neither a file nor a directory: ${input}`
        );
      }
    } catch (error: any) {
      handleError(`Error while processing the input path: ${input}`, error);
    }
  }
}

export { Migrator };
