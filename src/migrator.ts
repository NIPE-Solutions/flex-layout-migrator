import * as fs from "fs-extra";
import * as path from "path";
import * as cheerio from "cheerio";
import chalk from "chalk";
import cliProgress from "cli-progress";
import { Converter } from "./converter";
import { handleError, logger } from "./logger";
import { BreakPoint } from "./converter/converter.type";

class Migrator {
  private converter: Converter;

  constructor(converter: Converter) {
    this.converter = converter;
  }

  public async migrateFile(input: string, output: string): Promise<void> {
    const inputFilename = path.basename(input);
    logger.info("Starting migration for file: %s", inputFilename);

    const html = await fs.promises.readFile(input, "utf8");

    // Load the HTML into Cheerio and disable XML encoding
    // otherwise attributenames will be lowercased
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

    const fileProgressBar = createFileProgressBar(inputFilename);
    fileProgressBar.start(elements.length, 0);

    // Iterate through the elements and perform the conversion
    elements.each((index, element) => {
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

        el.removeAttr(attribute);
      }

      fileProgressBar.update(index + 1);
    });

    fileProgressBar.stop();

    const migratedHtml = $.html({ xmlMode: false });

    // Ensure the output directory exists
    const outputDir = path.dirname(output);
    await fs.promises.mkdir(outputDir, { recursive: true });

    await fs.promises.writeFile(output, migratedHtml);

    logger.info("Migration completed for file: %s", inputFilename);
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

    // Starten Sie den Fortschrittsbalken
    this.progressBar.start(totalFiles, 0);

    await Promise.all(
      files.map(async (file, index) => {
        const inputFile = path.join(inputFolder, file);
        const outputFile = path.join(outputFolder, file);
        await this.migrateFile(inputFile, outputFile);
        logger.info(chalk.green("Migration completed for file: %s"), file);

        // Aktualisieren Sie den Fortschrittsbalken
        this.progressBar.update(index + 1);
      })
    );

    // Beenden Sie den Fortschrittsbalken
    this.progressBar.stop();

    logger.info(chalk.green("Migration completed for folder: %s"), inputFolder);
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

  private progressBar = new cliProgress.SingleBar({
    format:
      chalk.yellow("Migrating Files") +
      " |" +
      chalk.cyan("{bar}") +
      "| {percentage}% || {value}/{total} Files",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
  });
}

function createFileProgressBar(fileName: string): cliProgress.SingleBar {
  const fileProgressBar = new cliProgress.SingleBar({
    format:
      chalk.blue(`Migrating ${fileName}`) +
      " |" +
      chalk.cyan("{bar}") +
      "| {percentage}% || {value}/{total} Elements",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
  });

  return fileProgressBar;
}

export { Migrator };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
