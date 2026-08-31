import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repository = resolve(import.meta.dirname, '..');
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'flex-layout-codemod-package-'));
let tarball;

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
  const result = await execFileAsync(executable, ['--version'], { cwd: temporaryDirectory });
  if (result.stdout.trim() !== '2.0.0-beta.0') {
    throw new Error(`Unexpected packaged CLI version: ${result.stdout.trim()}`);
  }
} finally {
  if (tarball) await rm(tarball, { force: true });
  await rm(temporaryDirectory, { recursive: true, force: true });
}
