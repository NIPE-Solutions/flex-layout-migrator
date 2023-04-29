import { Command } from "commander";
import { Migrator } from "./migrator/migrator";

import "tsconfig-paths/register";
import { ConverterFactory } from "./converter/converter.factory";
import { logger } from "./logger";

const program = new Command();

program
  .version("0.0.1")
  .description(
    "Migrate Angular Flex-Layout attributes to CSS classes or inline styles"
  )
  .argument("<input>", "input HTML file or folder")
  .argument("<output>", "output HTML file or folder")
  .option(
    "--target <target>",
    'Target CSS technology (default: "plain-css")',
    "plain-css"
  )
  .option("-d, --debug", "display some debugging")
  .option("-v, --verbose", "display verbose output")
  .action(async (input, output, options, command) => {
    if (options.debug || options.verbose) {
      logger.level = options.debug ? "debug" : "verbose";
      logger.error("Called %s with options %o", command.name(), options);
    }

    const target = options.target;
    const converter = ConverterFactory.createConverter(target);
    const migrator = new Migrator(converter, input, output);
    await migrator.migrate();
  });

program.parse(process.argv);
