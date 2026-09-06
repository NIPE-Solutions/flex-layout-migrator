import { pathsOverlapOnFileSystem } from '../migrator/migration-path.validator';
import { loadMigrationConfig } from '../config/migration-config';
import { Command, CommanderError, InvalidArgumentError, Option } from 'commander';
import * as path from 'node:path';
import packageJson from '../../package.json' with { type: 'json' };
import { AdapterFactory } from '../adapter/adapter.factory';
import { logger } from '../logger';
import { AnalyzeProjectStage } from '../pipeline/analyze/analyze-project.stage';
import { ApplyProjectStage } from '../pipeline/apply/apply-project.stage';
import { DiscoverProjectStage } from '../pipeline/discover/discover-project.stage';
import { MigrationPipeline } from '../pipeline/migration-pipeline';
import { MigrationRunner } from '../pipeline/migration-runner';
import { migrationInvocation } from '../pipeline/project-manifest';
import { RenderProjectStage } from '../pipeline/render/render-project.stage';
import { ValidateProjectStage } from '../pipeline/validate/validate-project.stage';
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
  readonly config?: string;
  readonly tailwindStylesheet?: string;
  readonly tailwindPrefix?: string;
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

export interface RunCliDependencies {
  readonly createMigrationRunner?: (pipeline: MigrationPipeline) => Pick<MigrationRunner, 'run'>;
}

const processOutput: CliOutput = {
  stdout: process.stdout,
  stderr: process.stderr,
};

function parseSingleStylesheet(value: string, previous: string | undefined): string {
  if (previous !== undefined) throw new InvalidArgumentError('--stylesheet may only be specified once.');
  return value;
}

export async function runCli(
  argv: readonly string[],
  output: CliOutput = processOutput,
  dependencies: RunCliDependencies = {},
): Promise<0 | 1 | 2> {
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
    .option('--config <path>', 'declarative migration JSON configuration')
    .option('--tailwind-stylesheet <path>', 'statically analyze a Tailwind v4 target stylesheet')
    .option('--tailwind-prefix <prefix>', 'override Tailwind v4 prefix; empty string means none')
    .option('--plan', 'explicitly request the default review-only plan')
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

      const configuration = await loadMigrationConfig({
        config: options.config,
        stylesheet: options.tailwindStylesheet,
        prefix: options.tailwindPrefix,
      });
      const target =
        program.getOptionValueSource('target') === 'cli' ? options.target : (configuration.target ?? options.target);
      if (target !== 'tailwind' && (options.tailwindStylesheet !== undefined || options.tailwindPrefix !== undefined))
        throw new Error('Tailwind target options require --target tailwind.');
      const destination = options.output ?? input;
      let reportPath: string | undefined;
      if (options.report !== undefined) {
        validateReportPath(options.report);
        reportPath = path.resolve(options.report);
      }
      if (reportPath)
        for (const snapshot of configuration.snapshots) {
          if (await pathsOverlapOnFileSystem(reportPath, snapshot.path))
            throw new Error('Report path collides with a target configuration input.');
        }
      const stylesheetPath = await validateStylesheetPath({
        target,
        stylesheetPath: options.stylesheet,
        inputPath: input,
        outputPath: destination,
        reportPath,
      });
      const printWithBreakpoints =
        options.printWithBreakpoints === undefined
          ? undefined
          : parsePrintWithBreakpoints(options.printWithBreakpoints, options.orientationBreakpoints);
      const session = AdapterFactory.createRenderSession(target, {
        orientationBreakpoints: options.orientationBreakpoints,
        printWithBreakpoints,
        targetProfile: target === 'tailwind' ? configuration.targetProfile : undefined,
        sourceBreakpoints: configuration.sourceBreakpoints,
      });
      const render = new RenderProjectStage(session);
      const pipeline = new MigrationPipeline(
        new DiscoverProjectStage(),
        new AnalyzeProjectStage(),
        render,
        new ValidateProjectStage(),
        new ApplyProjectStage(mode),
      );
      const migrationRunner =
        dependencies.createMigrationRunner === undefined
          ? new MigrationRunner(pipeline)
          : dependencies.createMigrationRunner(pipeline);
      const report = await migrationRunner.run(
        migrationInvocation({
          inputPath: input,
          outputPath: destination,
          options: {
            mode,
            targetProfile: target === 'tailwind' ? configuration.targetProfile : undefined,
            sourceBreakpoints: configuration.sourceBreakpoints,
            configurationSnapshots: configuration.snapshots,
            responsiveImages: options.responsiveImages,
            stylesheetPath,
            stylesheetPathInput: options.stylesheet,
            reportPath,
          },
        }),
      );
      const reportOutput = report.summary.parseErrors > 0 ? output.stderr : output.stdout;

      new TerminalPresenter().present(report, reportOutput);
      if (reportPath !== undefined) {
        await new JsonReportWriter().write(reportPath, report, {
          protectedPaths: [
            ...configuration.snapshots.map(snapshot => snapshot.path),
            ...(stylesheetPath === undefined ? [] : [stylesheetPath]),
          ],
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
