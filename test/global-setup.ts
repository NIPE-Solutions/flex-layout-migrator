import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export default async function buildCli(): Promise<void> {
  await execFileAsync('npm', ['run', 'build'], {
    cwd: resolve(import.meta.dirname, '..'),
  });
}
