import { Command } from 'commander';
import { Migrator } from './migrator/migrator';

import 'tsconfig-paths/register';
import { ConverterFactory } from './converter/converter.factory';
import { logger } from './logger';
import { getErrorMessage } from './util/error.util';

async function main() {
  const program = new Command();

  program
    .version('0.0.1')
    .description('Migrate Angular Flex-Layout attributes to CSS classes or inline styles')
    .argument('<input>', 'input HTML file or folder')
    .option('--output <output>', 'output HTML file or folder (default: "input path")')
    .option('--target <target>', 'Target CSS technology (default: "plain-css")', 'plain-css')
    .option('-d, --debug', 'display some debugging')
    .option('-v, --verbose', 'display verbose output')
    .action(async (input, options, command) => {
      if (options.debug || options.verbose) {
        logger.level = options.debug ? 'debug' : 'verbose';
        logger.error('Called %s with options %o', command.name(), options);
      }

      const output = options.output || input;

      const target = options.target;
      const converter = ConverterFactory.createConverter(target);
      const migrator = new Migrator(converter, input, output);
      await migrator.migrate();
    });

  try {
    await program.parseAsync(process.argv);
  } catch (error: unknown) {
    logger.error('An error occurred: %s', getErrorMessage(error));
    process.exit(1);
  }
}

main();
