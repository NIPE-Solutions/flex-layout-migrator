import { Command } from "commander";
import { Migrator } from "./migrator";
import { PlainCssConverter, TailwindCssConverter } from "./converter";
import * as fs from "fs";

import "tsconfig-paths/register";

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
  .action((input, output, options) => {
    const converter =
      options.target === "tailwind"
        ? new TailwindCssConverter()
        : new PlainCssConverter();

    const migrator = new Migrator(converter);
    migrator.migrate(input, output);
  });

program.parse(process.argv);
