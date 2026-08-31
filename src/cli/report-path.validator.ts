import { readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { compareCodeUnits } from '../util/compare-code-units';

interface ReportPathValidationOptions {
  readonly reportPath: string;
  readonly inputPath: string;
  readonly outputPath: string;
}

interface TemplatePathPair {
  readonly input: string;
  readonly output: string;
}

export async function validateReportPath(options: ReportPathValidationOptions): Promise<void> {
  if (options.reportPath.trim().length === 0) {
    throw new Error('Report path must not be empty.');
  }

  const templates = await templatePaths(options.inputPath, options.outputPath);
  const reportPath = await canonicalPath(options.reportPath);

  for (const template of templates) {
    const [inputPath, outputPath] = await Promise.all([canonicalPath(template.input), canonicalPath(template.output)]);
    if (reportPath === inputPath || reportPath === outputPath) {
      throw new Error(`Report path conflicts with a template path: ${options.reportPath}`);
    }
  }
}

async function templatePaths(inputPath: string, outputPath: string): Promise<readonly TemplatePathPair[]> {
  const inputStat = await stat(inputPath);
  if (inputStat.isFile()) return [{ input: inputPath, output: outputPath }];
  if (!inputStat.isDirectory()) return [];

  return collectTemplatePaths(outputPath, inputPath, '');
}

async function collectTemplatePaths(
  outputRoot: string,
  directory: string,
  relativeDirectory: string,
): Promise<readonly TemplatePathPair[]> {
  const names = await readdir(directory);
  names.sort(compareCodeUnits);
  const templates: TemplatePathPair[] = [];

  for (const name of names) {
    const input = path.join(directory, name);
    const inputStat = await stat(input);
    const relativePath = path.join(relativeDirectory, name);

    if (inputStat.isDirectory()) {
      templates.push(...(await collectTemplatePaths(outputRoot, input, relativePath)));
    } else if (inputStat.isFile() && path.extname(name).toLowerCase() === '.html') {
      templates.push({ input, output: path.join(outputRoot, relativePath) });
    }
  }

  return templates;
}

async function canonicalPath(value: string): Promise<string> {
  let candidate = path.resolve(value);
  const missingSegments: string[] = [];

  for (;;) {
    try {
      const canonicalParent = await realpath(candidate);
      const canonical = path.resolve(canonicalParent, ...missingSegments);
      return process.platform === 'win32' ? canonical.toLowerCase() : canonical;
    } catch (error: unknown) {
      if (!isMissingPathError(error)) throw error;

      const parent = path.dirname(candidate);
      if (parent === candidate) throw error;
      missingSegments.unshift(path.basename(candidate));
      candidate = parent;
    }
  }
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}
