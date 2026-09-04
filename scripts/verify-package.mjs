import { execFile } from 'node:child_process';
import console from 'node:console';
import { realpathSync } from 'node:fs';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const expectedPackageFiles = Object.freeze([
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'dist/cli.js',
  'dist/cli.js.map',
  'package.json',
]);

export function npmExecutable(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function isDirectInvocation(moduleUrl, argumentPath = process.argv[1]) {
  if (!argumentPath) return false;
  try {
    return realpathSync(resolve(argumentPath)) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

function inspectPackageFiles(manifest) {
  const forbidden = /(^|\/)(coverage|src|test|\.github|\.env|AGENTS\.md|CLAUDE\.md)(\/|$)/;
  const forbiddenFiles = manifest.files.map(file => file.path).filter(path => forbidden.test(path));
  if (forbiddenFiles.length > 0) {
    throw new Error(`Package contains forbidden files: ${forbiddenFiles.join(', ')}`);
  }

  const actualPackageFiles = manifest.files.map(file => file.path).sort();
  const missingFiles = expectedPackageFiles.filter(path => !actualPackageFiles.includes(path));
  const unexpectedFiles = actualPackageFiles.filter(path => !expectedPackageFiles.includes(path));
  if (missingFiles.length > 0 || unexpectedFiles.length > 0) {
    throw new Error(
      `Package file surface mismatch: missing [${missingFiles.join(', ')}]; unexpected [${unexpectedFiles.join(', ')}]`,
    );
  }
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function smokePackageTarball({
  tarballPath,
  packageName,
  expectedVersion,
  platform = process.platform,
  nodeExecutable = process.execPath,
  execFileImpl = execFileAsync,
} = {}) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'flex-layout-codemod-package-'));

  try {
    await writeFile(join(temporaryDirectory, 'package.json'), '{"private":true}', 'utf8');
    await execFileImpl(
      npmExecutable(platform),
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarballPath],
      {
        cwd: temporaryDirectory,
      },
    );

    const installedModuleExecutable = join(
      temporaryDirectory,
      'node_modules',
      ...packageName.split('/'),
      'dist',
      'cli.js',
    );
    const executable =
      platform === 'win32' ? nodeExecutable : join(temporaryDirectory, 'node_modules', '.bin', 'flex-layout-codemod');
    const executableArguments = platform === 'win32' ? [installedModuleExecutable] : [];
    const help = await execFileImpl(executable, [...executableArguments, '--help'], { cwd: temporaryDirectory });
    for (const option of [
      '--write',
      '--report <path>',
      '--allow-unresolved',
      '--stylesheet <path>',
      '--orientation-breakpoints',
      '--print-with-breakpoints <aliases>',
    ]) {
      if (!help.stdout.includes(option)) {
        throw new Error(`Packaged CLI help is missing ${option}`);
      }
    }
    if (help.stdout.includes('--dry-run')) {
      throw new Error('Packaged CLI help still exposes the removed --dry-run option');
    }
    if (!/\bplan\b[^.]*\bmigrations?\s+by\s+default\b/iu.test(help.stdout)) {
      throw new Error('Packaged CLI help does not disclose the plan-only default');
    }
    if (!/planned\s+output\s+HTML\s+file\s+or\s+folder/iu.test(help.stdout)) {
      throw new Error('Packaged CLI help does not describe --output as planned output');
    }
    if (!/path must\s+end in \.json/u.test(help.stdout)) {
      throw new Error('Packaged CLI help is missing the JSON report extension requirement');
    }
    if (!/single-file\s+output must\s+end\s+in \.html/u.test(help.stdout)) {
      throw new Error('Packaged CLI help is missing the HTML single-file output requirement');
    }

    const version = await execFileImpl(executable, [...executableArguments, '--version'], { cwd: temporaryDirectory });
    if (version.stdout.trim() !== expectedVersion) {
      throw new Error(`Unexpected packaged CLI version: ${version.stdout.trim()}`);
    }

    const input = join(temporaryDirectory, 'input.html');
    const outputDirectory = join(temporaryDirectory, 'generated');
    const output = join(outputDirectory, 'output.html');
    const report = join(temporaryDirectory, 'reports', 'migration.json');
    const source = '<div fxLayout="row"></div>';
    await writeFile(input, source, 'utf8');

    const planArguments = [...executableArguments, input, '--output', output, '--report', report];
    const plan = await execFileImpl(executable, planArguments, { cwd: temporaryDirectory });
    if (!plan.stdout.includes('Plan: 1 files scanned, 1 would change')) {
      throw new Error(`Unexpected packaged CLI plan output: ${plan.stdout.trim()}`);
    }
    if (plan.stderr) {
      throw new Error(`Unexpected packaged CLI plan error output: ${plan.stderr.trim()}`);
    }
    if ((await readFile(input, 'utf8')) !== source) {
      throw new Error('Packaged CLI plan changed its input template');
    }
    if (await pathExists(output)) {
      throw new Error('Packaged CLI plan wrote template output');
    }
    if (await pathExists(outputDirectory)) {
      throw new Error('Packaged CLI plan created the template output directory');
    }
    const planReport = JSON.parse(await readFile(report, 'utf8'));
    if (planReport.schemaVersion !== 2) {
      throw new Error('Packaged CLI report did not use schema version 2');
    }
    if (
      planReport.mode !== 'plan' ||
      planReport.application?.status !== 'skipped' ||
      planReport.application?.reason !== 'plan-only' ||
      Object.hasOwn(planReport, 'dryRun')
    ) {
      throw new Error('Packaged CLI plan report did not expose the expected execution and application state');
    }

    const write = await execFileImpl(executable, [...planArguments, '--write'], { cwd: temporaryDirectory });
    if (!write.stdout.includes('Applied: 1 files scanned, 1 changed')) {
      throw new Error(`Unexpected packaged CLI write output: ${write.stdout.trim()}`);
    }
    if (write.stderr) {
      throw new Error(`Unexpected packaged CLI write error output: ${write.stderr.trim()}`);
    }
    if ((await readFile(output, 'utf8')) !== '<div class="flex flex-row box-border"></div>') {
      throw new Error('Packaged CLI write did not produce the expected Tailwind template bytes');
    }
    const writeReport = JSON.parse(await readFile(report, 'utf8'));
    if (
      writeReport.schemaVersion !== 2 ||
      writeReport.mode !== 'write' ||
      writeReport.application?.status !== 'applied' ||
      Object.hasOwn(writeReport, 'dryRun')
    ) {
      throw new Error('Packaged CLI write report did not expose the expected execution and application state');
    }

    const cssOutput = join(temporaryDirectory, 'css-generated', 'output.html');
    const cssOutputDirectory = join(temporaryDirectory, 'css-generated');
    const stylesheet = join(temporaryDirectory, 'styles', 'migration.css');
    const stylesheetDirectory = join(temporaryDirectory, 'styles');
    const cssArguments = [
      ...executableArguments,
      input,
      '--output',
      cssOutput,
      '--target',
      'css',
      '--stylesheet',
      stylesheet,
    ];
    const cssPlan = await execFileImpl(executable, cssArguments, { cwd: temporaryDirectory });
    if (!cssPlan.stdout.includes('Plan: 1 files scanned, 1 would change')) {
      throw new Error(`Unexpected packaged CLI CSS plan output: ${cssPlan.stdout.trim()}`);
    }
    if (cssPlan.stderr) {
      throw new Error(`Unexpected packaged CLI CSS plan error output: ${cssPlan.stderr.trim()}`);
    }
    if (await pathExists(cssOutput)) {
      throw new Error('Packaged CLI CSS plan wrote template output');
    }
    if (await pathExists(stylesheet)) {
      throw new Error('Packaged CLI CSS plan wrote stylesheet output');
    }
    if ((await pathExists(cssOutputDirectory)) || (await pathExists(stylesheetDirectory))) {
      throw new Error('Packaged CLI CSS plan created output directories');
    }

    const cssWriteArguments = [...cssArguments, '--write'];
    const cssWrite = await execFileImpl(executable, cssWriteArguments, { cwd: temporaryDirectory });
    if (!cssWrite.stdout.includes('Applied: 1 files scanned, 1 changed')) {
      throw new Error(`Unexpected packaged CLI CSS write output: ${cssWrite.stdout.trim()}`);
    }
    if (cssWrite.stderr) {
      throw new Error(`Unexpected packaged CLI CSS write error output: ${cssWrite.stderr.trim()}`);
    }
    const cssClass = 'flm-5db098b5a4e638fdd1aff69e13d53ea10eb01e6c58577e5ecdf136b90eaee103';
    const expectedTemplate = `<div class="${cssClass}"></div>`;
    const expectedStylesheet = `/* flex-layout-codemod:start schema=1 */
/* flex-layout-codemod:rule id=${cssClass.slice('flm-'.length)} */
.${cssClass} {
  display: flex;
  box-sizing: border-box;
  flex-direction: row;
}
/* flex-layout-codemod:end */`;
    if ((await readFile(cssOutput, 'utf8')) !== expectedTemplate) {
      throw new Error('Packaged CLI CSS write did not produce the expected template bytes');
    }
    if ((await readFile(stylesheet, 'utf8')) !== expectedStylesheet) {
      throw new Error('Packaged CLI CSS write did not produce the expected stylesheet bytes');
    }
    const writtenTemplate = await readFile(cssOutput, 'utf8');
    const writtenStylesheet = await readFile(stylesheet, 'utf8');

    const cssRerun = await execFileImpl(executable, cssWriteArguments, { cwd: temporaryDirectory });
    if (!cssRerun.stdout.includes('Applied: 1 files scanned, 0 changed')) {
      throw new Error(`Unexpected packaged CLI CSS rerun output: ${cssRerun.stdout.trim()}`);
    }
    if (cssRerun.stderr) {
      throw new Error(`Unexpected packaged CLI CSS rerun error output: ${cssRerun.stderr.trim()}`);
    }
    if ((await readFile(cssOutput, 'utf8')) !== writtenTemplate) {
      throw new Error('Packaged CLI CSS rerun changed template bytes');
    }
    if ((await readFile(stylesheet, 'utf8')) !== writtenStylesheet) {
      throw new Error('Packaged CLI CSS rerun changed stylesheet bytes');
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function runPackageCheck({
  repository = resolve(import.meta.dirname, '..'),
  platform = process.platform,
  execFileImpl = execFileAsync,
} = {}) {
  const repositoryManifest = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'));
  let tarballPath;

  try {
    const packed = await execFileImpl(npmExecutable(platform), ['pack', '--json', '--ignore-scripts'], {
      cwd: repository,
    });
    const descriptors = JSON.parse(packed.stdout);
    if (!Array.isArray(descriptors) || descriptors.length !== 1) {
      throw new Error('Package check requires exactly one npm pack descriptor');
    }
    const [manifest] = descriptors;
    inspectPackageFiles(manifest);
    tarballPath = resolve(repository, manifest.filename);

    await smokePackageTarball({
      tarballPath,
      packageName: repositoryManifest.name,
      expectedVersion: repositoryManifest.version,
      platform,
      execFileImpl,
    });
  } finally {
    if (tarballPath) await rm(tarballPath, { force: true });
  }
}

if (isDirectInvocation(import.meta.url)) {
  runPackageCheck().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
