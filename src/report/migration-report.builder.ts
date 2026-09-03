import path from 'node:path';
import type { ConversionResult } from '../analyzer/conversion-result';
import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { FileMigrationResult } from '../migrator/file-migration-result';
import { compareCodeUnits } from '../util/compare-code-units';
import type {
  FileReport,
  MigrationApplication,
  MigrationMode,
  MigrationReport,
  MigrationSummary,
  ReportResult,
  StylesheetReport,
} from './migration-report';

type PathApi = typeof path.posix;

export interface StylesheetMigrationResult {
  readonly path: string;
  readonly change: StylesheetReport['change'];
}

export class MigrationReportBuilder {
  public build(
    inputRoot: string,
    outputRoot: string,
    target: 'css' | 'tailwind',
    mode: MigrationMode,
    application: MigrationApplication,
    durationMs: number,
    files: readonly FileMigrationResult[],
    stylesheet?: StylesheetMigrationResult,
  ): MigrationReport {
    const pathApi = this.pathApi(inputRoot, stylesheet?.path ?? '', ...files.map(file => file.inputPath));
    const singleFile = files.length === 1 && this.samePath(pathApi, inputRoot, files[0]?.inputPath ?? '');
    const fileReports = files
      .map(file => this.fileReport(pathApi, inputRoot, singleFile, file))
      .sort((left, right) => compareCodeUnits(left.path, right.path));
    const reportPaths = this.reportPaths(pathApi, inputRoot, outputRoot, singleFile);
    const summary = this.summary(fileReports);

    return {
      schemaVersion: 2,
      mode,
      target,
      application,
      input: reportPaths.input,
      output: reportPaths.output,
      durationMs: Math.trunc(durationMs),
      summary,
      files: fileReports,
      ...(target === 'css' && stylesheet
        ? { stylesheet: this.stylesheetReport(pathApi, inputRoot, singleFile, stylesheet) }
        : {}),
    };
  }

  private stylesheetReport(
    pathApi: PathApi,
    inputRoot: string,
    singleFile: boolean,
    stylesheet: StylesheetMigrationResult,
  ): StylesheetReport {
    const base = pathApi.resolve(singleFile ? pathApi.dirname(inputRoot) : inputRoot);
    const relativePath = pathApi.relative(base, stylesheet.path);
    const displayPath = pathApi.isAbsolute(relativePath) ? pathApi.basename(stylesheet.path) : relativePath;

    return { path: this.forwardSlashes(pathApi, displayPath), change: stylesheet.change };
  }

  private pathApi(...values: readonly string[]): PathApi {
    if (values.some(value => /^[A-Za-z]:[\\/]/.test(value) || value.includes('\\'))) return path.win32;
    if (values.some(value => value.includes('/'))) return path.posix;
    return path;
  }

  private samePath(pathApi: PathApi, left: string, right: string): boolean {
    return pathApi.normalize(left) === pathApi.normalize(right);
  }

  private fileReport(pathApi: PathApi, inputRoot: string, singleFile: boolean, file: FileMigrationResult): FileReport {
    const relativePath = singleFile ? pathApi.basename(file.inputPath) : pathApi.relative(inputRoot, file.inputPath);
    return {
      path: this.forwardSlashes(pathApi, relativePath),
      changed: file.changed,
      results: file.results.map(result => this.result(result)),
    };
  }

  private result(result: ConversionResult): ReportResult {
    if (result.status === 'parse-error') {
      return {
        status: result.status,
        offset: result.source.start,
        code: result.code,
        reason: result.reason,
      };
    }

    const input = result.input as LocatedFlexLayoutInput;
    if (result.status === 'converted') {
      return {
        status: result.status,
        directive: input.directive,
        sourceName: input.sourceName,
        offset: input.source.start,
      };
    }

    return {
      status: result.status,
      directive: input.directive,
      sourceName: input.sourceName,
      offset: input.source.start,
      code: result.code,
      reason: result.reason,
      suggestion: result.suggestion,
    };
  }

  private reportPaths(
    pathApi: PathApi,
    inputRoot: string,
    outputRoot: string,
    singleFile: boolean,
  ): { readonly input: string; readonly output: string } {
    const base = singleFile ? pathApi.dirname(inputRoot) : inputRoot;
    const input = singleFile ? pathApi.basename(inputRoot) : '.';
    const relativeOutput = pathApi.relative(base, outputRoot);
    const output = pathApi.isAbsolute(relativeOutput) ? pathApi.basename(outputRoot) : relativeOutput || '.';

    return {
      input: this.forwardSlashes(pathApi, input),
      output: this.forwardSlashes(pathApi, output),
    };
  }

  private forwardSlashes(pathApi: PathApi, value: string): string {
    return value.split(pathApi.sep).join('/');
  }

  private summary(files: readonly FileReport[]): MigrationSummary {
    const resultCounts = {
      converted: 0,
      review: 0,
      unsupported: 0,
      invalid: 0,
      parseErrors: 0,
    };

    for (const result of files.flatMap(file => file.results)) {
      if (result.status === 'parse-error') resultCounts.parseErrors += 1;
      else resultCounts[result.status] += 1;
    }

    return {
      filesScanned: files.length,
      filesChanged: files.filter(file => file.changed).length,
      ...resultCounts,
    };
  }
}
