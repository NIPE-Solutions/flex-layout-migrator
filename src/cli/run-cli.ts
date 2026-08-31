import { Command, CommanderError, Option } from 'commander';
import packageJson from '../../package.json' with { type: 'json' };
import { AdapterFactory } from '../adapter/adapter.factory';
import { logger } from '../logger';
import { Migrator } from '../migrator/migrator';
import { JsonReportWriter } from '../report/json-report.writer';
import { TerminalPresenter, type TextOutput } from '../report/terminal.presenter';
import { getErrorMessage } from '../util/error.util';
import { resolveExitCode } from './exit-policy';
import { validateReportPath } from './report-path.validator';

interface ProgramOptions {
  readonly output?: string;
  readonly target: string;
  readonly dryRun: boolean;
  readonly report?: string;
  readonly allowUnresolved: boolean;
  readonly debug: boolean;
}

export interface CliOutput {
  readonly stdout: TextOutput;
  readonly stderr: TextOutput;
}

const processOutput: CliOutput = {
  stdout: process.stdout,
  stderr: process.stderr,
};

export async function runCli(argv: readonly string[], output: CliOutput = processOutput): Promise<0 | 1 | 2> {
  let exitCode: 0 | 1 | 2 = 0;
  let debug = false;
  const program = new Command();

  program
    .name('flex-layout-codemod')
    .version(packageJson.version)
    .description('Migrate Angular Flex-Layout attributes to Tailwind CSS utilities')
    .exitOverride()
    .configureOutput({
      writeOut: text => output.stdout.write(text),
      writeErr: text => output.stderr.write(text),
    })
    .argument('<input>', 'input HTML file or folder')
    .option(
      '-o, --output <path>',
      'output HTML file or folder; single-file output must end in .html; defaults to input',
    )
    .addOption(
      new Option('-t, --target <target>', 'conversion target; currently tailwind')
        .choices(['tailwind'])
        .default('tailwind'),
    )
    .option('--dry-run', 'analyze and plan without writing templates', false)
    .option('--report <path>', 'atomically write a JSON report; path must end in .json')
    .option('--allow-unresolved', 'return success when unresolved inputs remain', false)
    .option('-d, --debug', 'enable debug logging', false)
    .action(async (input: string, options: ProgramOptions) => {
      debug = options.debug;
      logger.level = debug ? 'debug' : 'warn';

      const destination = options.output ?? input;
      const adapter = AdapterFactory.create(options.target);
      if (options.report !== undefined) {
        validateReportPath(options.report);
      }
      const report = await new Migrator(adapter, input, destination).migrate({ dryRun: options.dryRun });
      const reportOutput = report.summary.parseErrors > 0 ? output.stderr : output.stdout;

      new TerminalPresenter().present(report, reportOutput);
      if (options.report !== undefined) {
        await new JsonReportWriter().write(options.report, report);
      }

      exitCode = resolveExitCode(report, options.allowUnresolved);
    });

  try {
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
