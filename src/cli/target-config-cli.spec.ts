import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { runCli } from './run-cli';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
it('plans and writes prefixed target output and reproducible environment reports', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'target-cli-'));
  roots.push(root);
  const input = path.join(root, 'input.html');
  const config = path.join(root, 'migration.json');
  const report = path.join(root, 'report.json');
  await writeFile(input, '<div fxLayout="row"></div>');
  await writeFile(config, '{"tailwind":{"prefix":"tw"}}');
  let text = '';
  const output = {
    stdout: {
      write: (value: string) => {
        text += value;
      },
    },
    stderr: {
      write: (value: string) => {
        text += value;
      },
    },
  };
  expect(await runCli(['node', 'cli', input, '--config', config, '--plan', '--report', report], output)).toBe(0);
  expect(await readFile(input, 'utf8')).toContain('fxLayout');
  expect(text).toContain('Target environment');
  expect(JSON.parse(await readFile(report, 'utf8')).targetProfile.prefix.value).toBe('tw');
  expect(await runCli(['node', 'cli', input, '--config', config, '--write'], output)).toBe(0);
  expect(await readFile(input, 'utf8')).toContain('tw:flex');
});
it('rejects contradictory plan/write options', async () => {
  let text = '';
  const output = {
    stdout: {
      write: (value: string) => {
        text += value;
      },
    },
    stderr: {
      write: (value: string) => {
        text += value;
      },
    },
  };
  expect(await runCli(['node', 'cli', '.', '--plan', '--write'], output)).toBe(1);
  expect(text).toContain('--plan');
});
it('analyzes --tailwind-stylesheet and applies --tailwind-prefix before planning', async () => {
  const root = await mkdtemp(path.join(process.cwd(), '.target-cli-'));
  roots.push(root);
  const input = path.join(root, 'input.html');
  const stylesheet = path.join(root, 'style.css');
  await writeFile(input, '<div fxLayout="row"></div>');
  await writeFile(stylesheet, '@import "tailwindcss" prefix(tw);');
  let text = '';
  const output = {
    stdout: {
      write: (value: string) => {
        text += value;
      },
    },
    stderr: {
      write: (value: string) => {
        text += value;
      },
    },
  };
  expect(
    await runCli(
      ['node', 'cli', input, '--tailwind-stylesheet', stylesheet, '--tailwind-prefix', 'tw', '--write'],
      output,
    ),
  ).toBe(0);
  expect(await readFile(input, 'utf8')).toContain('tw:flex');
  expect(text).toContain('Prefix: tw (CLI; explicit)');
});
