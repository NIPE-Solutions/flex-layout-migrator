import * as fs from "fs-extra";
import * as path from "path";
import * as cheerio from "cheerio";
import { Converter } from "./converter";
import { handleError, logger } from "./logger";

class Migrator {
  private converter: Converter;

  constructor(converter: Converter) {
    this.converter = converter;
  }

  public async migrateFile(input: string, output: string): Promise<void> {
    const inputFilename = path.basename(input);
    logger.info("Starting migration for file: %s", inputFilename);

    const html = await fs.promises.readFile(input, "utf8");
    const $ = cheerio.load(
      html,
      { xml: { decodeEntities: false, lowerCaseAttributeNames: false } },
      false
    );

    // Find all elements that have Flex-Layout attributes
    const selectors = this.converter.getAllSelectors();
    logger.debug("Selectors: [%s]", selectors);
    const elements = $(selectors);

    logger.debug("Found %i elements", elements.length);

    // Iterate through the elements and perform the conversion
    elements.each((_, element) => {
      const el = $(element);
      const attrs = el.attr();

      if (!attrs) return;
      for (const [attribute, value] of Object.entries(attrs)) {
        logger.debug("Attribute: %s, value: %s", attribute, value);
        logger.debug("Can convert: %s", this.converter.canConvert(attribute));
        if (this.converter.canConvert(attribute)) {
          this.converter.convert(attribute, value, el);
          el.removeAttr(attribute);
          // el.addClass(convertedValue);
        }
      }
    });

    const migratedHtml = $.html({ xmlMode: false });

    // Ensure the output directory exists
    const outputDir = path.dirname(output);
    await fs.promises.mkdir(outputDir, { recursive: true });

    await fs.promises.writeFile(output, migratedHtml);

    logger.info("Migration completed for file: %s", inputFilename);
  }

  public async migrateFolder(
    inputFolder: string,
    outputFolder: string
  ): Promise<void> {
    const files = await fs.promises.readdir(inputFolder);
    const totalFiles = files.length;
    logger.info(
      "Starting migration for %i files in folder: %s",
      totalFiles,
      inputFolder
    );

    await Promise.all(
      files.map(async (file) => {
        const inputFile = path.join(inputFolder, file);
        const outputFile = path.join(outputFolder, file);
        await this.migrateFile(inputFile, outputFile);
        logger.info("Migration completed for file: %s", file);
      })
    );

    logger.info("Migration completed for folder: %s", inputFolder);
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
