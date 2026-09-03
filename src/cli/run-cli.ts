import { Command, CommanderError, InvalidArgumentError, Option } from 'commander';
import * as path from 'node:path';
import packageJson from '../../package.json' with { type: 'json' };
import { AdapterFactory } from '../adapter/adapter.factory';
import { logger } from '../logger';
import { Migrator } from '../migrator/migrator';
import { JsonReportWriter } from '../report/json-report.writer';
import { TerminalPresenter, type TextOutput } from '../report/terminal.presenter';
import { getErrorMessage } from '../util/error.util';
import { resolveExitCode } from './exit-policy';
import { validateReportPath } from './report-path.validator';
import { parsePrintWithBreakpoints } from '../config/breakpoint-migration-config';
import { validateStylesheetPath } from './stylesheet-path.validator';
import { resolveMigrationMode } from './migration-mode.parser';

interface ProgramOptions {
  readonly output?: string;
  readonly target: string;
  readonly write: boolean;
  readonly report?: string;
  readonly stylesheet?: string;
  readonly allowUnresolved: boolean;
  readonly debug: boolean;
  readonly orientationBreakpoints: boolean;
  readonly responsiveImages: boolean;
  readonly printWithBreakpoints?: string;
}

export interface CliOutput {
  readonly stdout: TextOutput;
  readonly stderr: TextOutput;
}

const processOutput: CliOutput = {
  stdout: process.stdout,
  stderr: process.stderr,
};

function parseSingleStylesheet(value: string, previous: string | undefined): string {
  if (previous !== undefined) throw new InvalidArgumentError('--stylesheet may only be specified once.');
  return value;
}

export async function runCli(argv: readonly string[], output: CliOutput = processOutput): Promise<0 | 1 | 2> {
  let exitCode: 0 | 1 | 2 = 0;
  let debug = false;
  const program = new Command();

  program
    .name('flex-layout-codemod')
    .version(packageJson.version)
    .description('Plan Angular Flex-Layout migrations by default; use --write to apply')
    .exitOverride()
    .configureOutput({
      writeOut: text => output.stdout.write(text),
      writeErr: text => output.stderr.write(text),
    })
    .argument('<input>', 'input HTML file or folder')
    .option(
      '-o, --output <path>',
      'planned output HTML file or folder; single-file output must end in .html; defaults to input',
    )
    .addOption(
      new Option('-t, --target <target>', 'conversion target; css requires --stylesheet')
        .choices(['tailwind', 'css'])
        .default('tailwind'),
    )
    .addOption(
      new Option('--stylesheet <path>', 'companion stylesheet; required when --target css').argParser(
        parseSingleStylesheet,
      ),
    )
    .option('--write', 'apply the validated migration plan', false)
    .option('--report <path>', 'atomically write a JSON report; path must end in .json')
    .option('--allow-unresolved', 'return success when unresolved inputs remain', false)
    .option('--orientation-breakpoints', 'confirm the source enables the archived orientation breakpoints', false)
    .option(
      '--responsive-images',
      'wrap eligible responsive images in picture elements; acknowledges selector and layout risk',
      false,
    )
    .option(
      '--print-with-breakpoints <aliases>',
      'confirm the source printWithBreakpoints list; comma-separated aliases or none',
    )
    .option('-d, --debug', 'enable debug logging', false)
    .action(async (input: string, options: ProgramOptions) => {
      const mode = resolveMigrationMode(argv, options.write);
      debug = options.debug;
      logger.level = debug ? 'debug' : 'warn';

      const destination = options.output ?? input;
      let reportPath: string | undefined;
      if (options.report !== undefined) {
        validateReportPath(options.report);
        reportPath = path.resolve(options.report);
      }
      const stylesheetPath = await validateStylesheetPath({
        target: options.target,
        stylesheetPath: options.stylesheet,
        inputPath: input,
        outputPath: destination,
        reportPath,
      });
      const printWithBreakpoints =
        options.printWithBreakpoints === undefined
          ? undefined
          : parsePrintWithBreakpoints(options.printWithBreakpoints, options.orientationBreakpoints);
      const session = AdapterFactory.createSession(options.target, {
        orientationBreakpoints: options.orientationBreakpoints,
        printWithBreakpoints,
      });
      const report = await new Migrator(session, input, destination).migrate({
        mode,
        responsiveImages: options.responsiveImages,
        stylesheetPath,
        reportPath,
      });
      const reportOutput = report.summary.parseErrors > 0 ? output.stderr : output.stdout;

      new TerminalPresenter().present(report, reportOutput);
      if (reportPath !== undefined) {
        await new JsonReportWriter().write(reportPath, report, {
          protectedPaths: stylesheetPath === undefined ? [] : [stylesheetPath],
        });
      }

      exitCode = resolveExitCode(report, options.allowUnresolved);
    });

  try {
    resolveMigrationMode(argv, false);
    await program.parseAsync([...argv]);
    return exitCode;
  } catch (error: unknown) {
    if (error instanceof CommanderError) {
      return error.exitCode === 0 ? 0 : 1;
    }

    output.stderr.write(`Error: ${getErrorMessage(error)}\n`);
    if (debug && error instanceof Error && error.stack) {
      output.stderr.write(`${error.stack}\n`);
    }
    return 1;
  }
}
