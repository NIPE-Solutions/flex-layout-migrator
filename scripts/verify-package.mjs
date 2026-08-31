import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repository = resolve(import.meta.dirname, '..');
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'flex-layout-codemod-package-'));
let tarball;

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

try {
  const packed = await execFileAsync('npm', ['pack', '--json', '--ignore-scripts'], { cwd: repository });
  const [manifest] = JSON.parse(packed.stdout);
  tarball = resolve(repository, manifest.filename);

  const forbidden = /(^|\/)(coverage|src|test|\.github|\.env|AGENTS\.md|CLAUDE\.md)(\/|$)/;
  const forbiddenFiles = manifest.files.map(file => file.path).filter(path => forbidden.test(path));
  if (forbiddenFiles.length > 0) {
    throw new Error(`Package contains forbidden files: ${forbiddenFiles.join(', ')}`);
  }

  await writeFile(join(temporaryDirectory, 'package.json'), '{"private":true}', 'utf8');
  await execFileAsync('npm', ['install', '--ignore-scripts', tarball], { cwd: temporaryDirectory });

  const executable = join(temporaryDirectory, 'node_modules', '.bin', 'flex-layout-codemod');
  const help = await execFileAsync(executable, ['--help'], { cwd: temporaryDirectory });
  for (const option of ['--dry-run', '--report <path>', '--allow-unresolved']) {
    if (!help.stdout.includes(option)) {
      throw new Error(`Packaged CLI help is missing ${option}`);
    }
  }
  if (!help.stdout.includes('path must end in .json')) {
    throw new Error('Packaged CLI help is missing the JSON report extension requirement');
  }
  if (!/single-file output must end\s+in \.html/.test(help.stdout)) {
    throw new Error('Packaged CLI help is missing the HTML single-file output requirement');
  }

  const version = await execFileAsync(executable, ['--version'], { cwd: temporaryDirectory });
  if (version.stdout.trim() !== '2.0.0-beta.0') {
    throw new Error(`Unexpected packaged CLI version: ${version.stdout.trim()}`);
  }

  const input = join(temporaryDirectory, 'input.html');
  const outputDirectory = join(temporaryDirectory, 'generated');
  const output = join(outputDirectory, 'output.html');
  const source = '<div fxLayout="row"></div>';
  await writeFile(input, source, 'utf8');

  const dryRun = await execFileAsync(executable, [input, '--output', output, '--dry-run'], {
    cwd: temporaryDirectory,
  });
  if (!dryRun.stdout.includes('Dry run: 1 files scanned, 1 would change')) {
    throw new Error(`Unexpected packaged CLI dry-run output: ${dryRun.stdout.trim()}`);
  }
  if (dryRun.stderr) {
    throw new Error(`Unexpected packaged CLI dry-run error output: ${dryRun.stderr.trim()}`);
  }
  if ((await readFile(input, 'utf8')) !== source) {
    throw new Error('Packaged CLI dry-run changed its input template');
  }
  if (await pathExists(output)) {
    throw new Error('Packaged CLI dry-run wrote template output');
  }
  if (await pathExists(outputDirectory)) {
    throw new Error('Packaged CLI dry-run created the template output directory');
  }
} finally {
  if (tarball) await rm(tarball, { force: true });
  await rm(temporaryDirectory, { recursive: true, force: true });
}
