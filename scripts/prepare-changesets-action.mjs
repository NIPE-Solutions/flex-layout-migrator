import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';

const repository = resolve(process.argv[2] ?? process.cwd());
await rm(join(repository, '.changeset', 'pre'), { recursive: true, force: true });
