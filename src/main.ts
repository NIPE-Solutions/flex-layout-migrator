import { Command } from 'commander';
import { Migrator } from './migrator/migrator';
import { ConverterFactory } from './converter/converter.factory';
import { logger } from './logger';
import { getErrorMessage } from './util/error.util';
import fs from 'fs';
import chalk from 'chalk';
import packageJson from '../package.json' with { type: 'json' };

interface ProgramOptions {
  output: string;
  target: string;
  debug: boolean;
}

const handleArguments = async (input: string, options: ProgramOptions) => {
  try {
    if (options.debug) {
      logger.level = 'debug';
      logger.log('Called CLI with options %o', options);
    }

    const output = options.output || input;

    const target = options.target;
    const converter = ConverterFactory.createConverter(target);
    const migrator = new Migrator(converter, input, output);
    await migrator.migrate();
  } catch (error) {
    logger.error(chalk.red('Failed to execute the command. Error: '), error);
  }
};

async function main() {
  const program = new Command();

  program
    .version(packageJson.version)
    .description('Migrate Angular Flex-Layout attributes to CSS classes or inline styles');

  program.argument('<input>', 'input HTML file or folder', value => {
    if (!fs.existsSync(value)) {
      logger.error(
        chalk.red(`Error: The input path ${value} does not exist. Please specify a valid file or directory.`),
      );
      process.exit(1);
    }
    return value;
  });

  program.option('-o, --output <output>', 'output HTML file or folder (default: "input path")', (value, previous) => {
    if (value && !fs.existsSync(value)) {
      logger.error(
        chalk.red(`Error: The output path ${value} does not exist. Please specify a valid file or directory.`),
      );
      process.exit(1);
    }
    return value || previous;
  });

  program.option(
    '-t, --target <target>',
    'Target CSS technology (options: "tailwind", "plain-css")',
    value => {
      const validTargets = ['tailwind', 'plain-css'];
      if (!validTargets.includes(value)) {
        logger.error(chalk.red(`Error: Invalid target ${value}. Valid targets are: ${validTargets.join(', ')}`));
        process.exit(1);
      }
      return value;
    },
    'tailwind',
  );

  program.option('-d, --debug', 'display some debugging');

  program.action(handleArguments);

  try {
    await program.parseAsync(process.argv);
  } catch (error: unknown) {
    logger.error(chalk.red('An error occurred: %s', getErrorMessage(error)));
    process.exit(1);
  }
}

void main();
