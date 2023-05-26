import { Command } from 'commander';
import { Migrator } from './migrator/migrator';
import 'tsconfig-paths/register';
import { ConverterFactory } from './converter/converter.factory';
import { logger } from './logger';
import { getErrorMessage } from './util/error.util';
import fs from 'fs';
import figlet from 'figlet';
import chalk from 'chalk';

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

  program.version('0.0.1').description('Migrate Angular Flex-Layout attributes to CSS classes or inline styles');

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

const theme = {
  title: chalk.cyan.bold,
  border: chalk.gray.dim,
  subtitle: chalk.yellow,
  text: chalk.whiteBright,
};

const title = figlet.textSync('Flex-Layout Migrator', { font: 'Big', horizontalLayout: 'full' });

const titleLines = title.split('\n');

const borderWidth = Math.max(...titleLines.map(line => line.length));

const border = theme.border('+' + '-'.repeat(borderWidth + 2) + '+');

console.log(border);
titleLines.forEach(line =>
  console.log(
    theme.border('| ') + theme.title(chalk.cyan(line)) + ' '.repeat(borderWidth - line.length) + theme.border(' |'),
  ),
);
console.log(border);
console.log(theme.subtitle('\nWelcome to the Flex-Layout Migrator!\n'));
console.log(
  theme.text('This tool will help you migrate your Angular Flex-Layout attributes to CSS classes or inline styles.\n'),
);

main();
