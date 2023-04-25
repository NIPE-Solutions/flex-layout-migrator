import * as fs from "fs-extra";
import * as path from "path";
import * as cheerio from "cheerio";
import { Converter } from "./converter";

class Migrator {
  private converter: Converter;

  constructor(converter: Converter) {
    this.converter = converter;
  }

  public migrateFile(input: string, output: string): void {
    const inputFilename = path.basename(input);
    console.log(`Starting migration for file: ${inputFilename}`);

    const html = fs.readFileSync(input, "utf8");
    const $ = cheerio.load(html, null, false);

    // Find all elements that have Flex-Layout attributes
    const selectors = this.converter.getAllSelectors();
    const elements = $(selectors);

    // Iterate through the elements and perform the conversion
    elements.each((_, element) => {
      const el = $(element);
      const attrs = el.attr();
      if (!attrs) return;
      for (const [attribute, value] of Object.entries(attrs)) {
        if (this.converter.canConvert(attribute)) {
          this.converter.convert(attribute, value, el);
          // el.removeAttr(attribute);
          // el.addClass(convertedValue);
        }
      }
    });

    const migratedHtml = $.html();
    fs.writeFileSync(output, migratedHtml);

    console.log(`Migration completed for file: ${inputFilename}`);
  }

  public migrateFolder(inputFolder: string, outputFolder: string): void {
    const files = fs.readdirSync(inputFolder);
    const totalFiles = files.length;
    console.log(
      `Starting migration for ${totalFiles} files in folder: ${inputFolder}`
    );

    let completedFiles = 0;

    files.forEach((file) => {
      const inputFile = path.join(inputFolder, file);
      const outputFile = path.join(outputFolder, file);
      this.migrateFile(inputFile, outputFile);
      completedFiles++;
      console.log(`Progress: ${completedFiles}/${totalFiles} files completed.`);
    });

    console.log(`Migration completed for folder: ${inputFolder}`);
  }
}

export { Migrator };
