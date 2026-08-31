import path from 'node:path';
import type { ConversionResult } from '../analyzer/conversion-result';
import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { FileMigrationResult } from '../migrator/file-migration-result';
import type { FileReport, MigrationReport, MigrationSummary, ReportResult } from './migration-report';

type PathApi = typeof path.posix;

export class MigrationReportBuilder {
  public build(
    inputRoot: string,
    outputRoot: string,
    target: 'tailwind',
    dryRun: boolean,
    durationMs: number,
    files: readonly FileMigrationResult[],
  ): MigrationReport {
    const pathApi = this.pathApi(inputRoot);
    const singleFile = files.length === 1 && this.samePath(pathApi, inputRoot, files[0]?.inputPath ?? '');
    const fileReports = files
      .map(file => this.fileReport(pathApi, inputRoot, singleFile, file))
      .sort((left, right) => left.path.localeCompare(right.path));
    const reportPaths = this.reportPaths(pathApi, inputRoot, outputRoot, singleFile);

    return {
      schemaVersion: 1,
      target,
      dryRun,
      input: reportPaths.input,
      output: reportPaths.output,
      durationMs: Math.trunc(durationMs),
      summary: this.summary(fileReports),
      files: fileReports,
    };
  }

  private pathApi(value: string): PathApi {
    return /^[A-Za-z]:[\\/]/.test(value) || value.includes('\\') ? path.win32 : path.posix;
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
