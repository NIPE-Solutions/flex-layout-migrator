import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { createGitIgnoreMatcher } from '../../lib/gitignore.helper';
import { logger } from '../../logger';
import { migrationInvocation } from '../project-manifest';
import type { DiscoveryFileSystem } from './discovery-file-system.port';
import { DiscoverProjectStage } from './discover-project.stage';
import type { IgnoreMatcherFactory } from './ignore-matcher.port';

describe('DiscoverProjectStage', () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'discover-project-'));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test('discovers one HTML file without reading its contents', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output.html');
    await writeFile(input, '<div>contents must remain unread</div>', 'utf8');
    let readCalls = 0;
    const fileSystem: DiscoveryFileSystem & { read(path: string): Promise<string> } = {
      async kind(path) {
        expect(path).toBe(resolve(input));
        return 'file';
      },
      async entries() {
        throw new Error('A file input must not be enumerated.');
      },
      async read() {
        readCalls++;
        return 'unexpected';
      },
    };
    const ignoreMatchers: IgnoreMatcherFactory = {
      async load() {
        throw new Error('A file input does not require ignore matching.');
      },
    };
    const stage = new DiscoverProjectStage(fileSystem, ignoreMatchers);

    const manifest = await stage.run(
      migrationInvocation({
        inputPath: input,
        outputPath: output,
        options: { mode: 'plan' },
      }),
    );

    expect(manifest.templates).toEqual([{ inputPath: resolve(input), outputPath: resolve(output) }]);
    expect(readCalls).toBe(0);
  });

  test('orders nested folder templates by UTF-16 code units and preserves relative outputs', async () => {
    const inputRoot = join(temporaryDirectory, 'input');
    const outputRoot = join(temporaryDirectory, 'output');
    const fileSystem: DiscoveryFileSystem = {
      kind: async candidate => (candidate === inputRoot ? 'directory' : 'other'),
      entries: async directory =>
        directory === inputRoot
          ? [
              { name: 'a.html', kind: 'file' },
              { name: 'notes.txt', kind: 'file' },
              { name: 'Z', kind: 'directory' },
              { name: 'A.html', kind: 'file' },
            ]
          : [{ name: 'nested.html', kind: 'file' }],
    };
    const ignoreMatchers: IgnoreMatcherFactory = {
      load: async () => Object.freeze({ ignores: () => false, ignoresDirectory: () => false }),
    };

    const manifest = await new DiscoverProjectStage(fileSystem, ignoreMatchers).run(
      migrationInvocation({ inputPath: inputRoot, outputPath: outputRoot, options: { mode: 'plan' } }),
    );

    expect(manifest.templates.map(template => relative(inputRoot, template.inputPath))).toEqual([
      'A.html',
      join('Z', 'nested.html'),
      'a.html',
    ]);
    expect(manifest.templates.map(template => relative(outputRoot, template.outputPath))).toEqual([
      'A.html',
      join('Z', 'nested.html'),
      'a.html',
    ]);
  });

  test('does not select ignored files, descend into ignored directories, or select the configured stylesheet', async () => {
    const inputRoot = join(temporaryDirectory, 'input');
    const outputRoot = join(temporaryDirectory, 'output');
    const stylesheetPath = join(inputRoot, 'generated.html');
    await mkdir(join(inputRoot, 'ignored'), { recursive: true });
    await Promise.all([
      writeFile(join(inputRoot, '.gitignore'), 'ignored-file.html\nignored/\n', 'utf8'),
      writeFile(join(inputRoot, 'kept.html'), '<div></div>', 'utf8'),
      writeFile(join(inputRoot, 'ignored-file.html'), '<div></div>', 'utf8'),
      writeFile(join(inputRoot, 'ignored', 'nested.html'), '<div></div>', 'utf8'),
      writeFile(stylesheetPath, 'previous generated artifact', 'utf8'),
    ]);

    const manifest = await new DiscoverProjectStage().run(
      migrationInvocation({
        inputPath: inputRoot,
        outputPath: outputRoot,
        options: { mode: 'plan', stylesheetPath },
      }),
    );

    expect(manifest.templates).toEqual([
      { inputPath: join(inputRoot, 'kept.html'), outputPath: join(outputRoot, 'kept.html') },
    ]);
  });

  test('emits the legacy folder progress sequence with raw relative path spelling and ignore loading', async () => {
    const inputRoot = join(temporaryDirectory, 'input');
    const outputRoot = join(temporaryDirectory, 'output');
    const nested = join(inputRoot, 'nested');
    const ignoredDirectory = join(inputRoot, 'ignored-dir');
    await Promise.all([mkdir(nested, { recursive: true }), mkdir(ignoredDirectory, { recursive: true })]);
    await Promise.all([
      writeFile(join(inputRoot, '.gitignore'), 'ignored.html\nignored-dir/\n', 'utf8'),
      writeFile(join(inputRoot, 'A.html'), '<div></div>', 'utf8'),
      writeFile(join(inputRoot, 'ignored.html'), '<div></div>', 'utf8'),
      writeFile(join(ignoredDirectory, 'hidden.html'), '<div></div>', 'utf8'),
      writeFile(join(nested, 'b.html'), '<div></div>', 'utf8'),
      writeFile(join(nested, 'z.txt'), 'notes', 'utf8'),
    ]);
    const rawInputRoot = relative(process.cwd(), inputRoot);
    const rawOutputRoot = relative(process.cwd(), outputRoot);
    const debug = vi.spyOn(logger, 'debug').mockImplementation(() => logger);

    try {
      await new DiscoverProjectStage().run(
        migrationInvocation({ inputPath: rawInputRoot, outputPath: rawOutputRoot, options: { mode: 'plan' } }),
      );

      expect(debug.mock.calls.map(([message]) => message)).toEqual([
        `Loaded .gitignore file from ${join(rawInputRoot, '.gitignore')}`,
        `Processing ${join(rawInputRoot, '.gitignore')}`,
        `Processing ${join(rawInputRoot, 'A.html')}`,
        `Processing ${join(rawInputRoot, 'ignored-dir')}`,
        `Processing ${join(rawInputRoot, 'ignored.html')}`,
        `Processing ${join(rawInputRoot, 'nested')}`,
        `Processing ${join(rawInputRoot, 'nested', 'b.html')}`,
        `Processing ${join(rawInputRoot, 'nested', 'z.txt')}`,
      ]);
    } finally {
      debug.mockRestore();
    }
  });

  test('checks ignored and output directories before descending into them', async () => {
    const inputRoot = join(temporaryDirectory, 'input');
    const outputRoot = join(inputRoot, 'generated');
    const ignoredRoot = join(inputRoot, 'ignored');
    const enumeratedDirectories: string[] = [];
    const fileSystem: DiscoveryFileSystem = {
      kind: async () => 'directory',
      entries: async directory => {
        enumeratedDirectories.push(directory);
        if (directory !== inputRoot) throw new Error(`Unexpected descent into ${directory}`);
        return [
          { name: 'ignored', kind: 'directory' },
          { name: 'generated', kind: 'directory' },
          { name: 'kept.html', kind: 'file' },
        ];
      },
    };
    const ignoreMatchers: IgnoreMatcherFactory = {
      load: async () => ({
        ignores: () => false,
        ignoresDirectory: candidate => candidate === ignoredRoot,
      }),
    };

    const manifest = await new DiscoverProjectStage(fileSystem, ignoreMatchers).run(
      migrationInvocation({ inputPath: inputRoot, outputPath: outputRoot, options: { mode: 'plan' } }),
    );

    expect(enumeratedDirectories).toEqual([inputRoot]);
    expect(manifest.templates).toEqual([
      { inputPath: join(inputRoot, 'kept.html'), outputPath: join(outputRoot, 'kept.html') },
    ]);
  });

  test('follows a symlinked HTML file with the same stat semantics as legacy discovery', async ({ skip }) => {
    const inputRoot = join(temporaryDirectory, 'input');
    const outputRoot = join(temporaryDirectory, 'output');
    const target = join(temporaryDirectory, 'external.html');
    const linked = join(inputRoot, 'linked.html');
    await mkdir(inputRoot);
    await writeFile(target, '<div></div>', 'utf8');
    try {
      await symlink(target, linked, 'file');
    } catch (error: unknown) {
      if (isSymlinkPermissionError(error)) return skip();
      throw error;
    }

    const manifest = await new DiscoverProjectStage().run(
      migrationInvocation({ inputPath: inputRoot, outputPath: outputRoot, options: { mode: 'plan' } }),
    );

    expect(manifest.templates).toEqual([{ inputPath: linked, outputPath: join(outputRoot, 'linked.html') }]);
  });

  test('follows a symlinked directory and discovers its nested HTML files', async ({ skip }) => {
    const inputRoot = join(temporaryDirectory, 'input');
    const outputRoot = join(temporaryDirectory, 'output');
    const target = join(temporaryDirectory, 'external');
    const linked = join(inputRoot, 'linked');
    await mkdir(inputRoot);
    await mkdir(target);
    await writeFile(join(target, 'nested.html'), '<div></div>', 'utf8');
    try {
      await symlink(target, linked, 'dir');
    } catch (error: unknown) {
      if (isSymlinkPermissionError(error)) return skip();
      throw error;
    }

    const manifest = await new DiscoverProjectStage().run(
      migrationInvocation({ inputPath: inputRoot, outputPath: outputRoot, options: { mode: 'plan' } }),
    );

    expect(manifest.templates).toEqual([
      { inputPath: join(linked, 'nested.html'), outputPath: join(outputRoot, 'linked', 'nested.html') },
    ]);
  });

  test('surfaces the legacy stat failure for a dangling symlink instead of dropping the entry', async ({ skip }) => {
    const inputRoot = join(temporaryDirectory, 'input');
    const outputRoot = join(temporaryDirectory, 'output');
    const linked = join(inputRoot, 'dangling.html');
    await mkdir(inputRoot);
    try {
      await symlink(join(temporaryDirectory, 'missing.html'), linked, 'file');
    } catch (error: unknown) {
      if (isSymlinkPermissionError(error)) return skip();
      throw error;
    }

    await expect(
      new DiscoverProjectStage().run(
        migrationInvocation({ inputPath: inputRoot, outputPath: outputRoot, options: { mode: 'plan' } }),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT', path: linked });
  });

  test('does not let a directory-only ignore rule hide a dangling symlink stat failure', async ({ skip }) => {
    const inputRoot = join(temporaryDirectory, 'input');
    const outputRoot = join(temporaryDirectory, 'output');
    const linked = join(inputRoot, 'dangling.html');
    await mkdir(inputRoot);
    await writeFile(join(inputRoot, '.gitignore'), 'dangling.html/\n', 'utf8');
    try {
      await symlink(join(temporaryDirectory, 'missing.html'), linked, 'file');
    } catch (error: unknown) {
      if (isSymlinkPermissionError(error)) return skip();
      throw error;
    }

    await expect(
      new DiscoverProjectStage().run(
        migrationInvocation({ inputPath: inputRoot, outputPath: outputRoot, options: { mode: 'plan' } }),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT', path: linked });
  });

  test('resolves an injected unknown directory entry kind exactly once through the filesystem port', async () => {
    const inputRoot = join(temporaryDirectory, 'input');
    const outputRoot = join(temporaryDirectory, 'output');
    const candidate = join(inputRoot, 'unknown.html');
    const kind = vi.fn<DiscoveryFileSystem['kind']>(async path => (path === inputRoot ? 'directory' : 'file'));
    const fileSystem: DiscoveryFileSystem = {
      kind,
      entries: vi.fn<DiscoveryFileSystem['entries']>(async () => [{ name: 'unknown.html', kind: 'other' }]),
    };
    const ignoreMatchers: IgnoreMatcherFactory = {
      load: async () => ({ ignores: () => false, ignoresDirectory: () => false }),
    };

    const manifest = await new DiscoverProjectStage(fileSystem, ignoreMatchers).run(
      migrationInvocation({ inputPath: inputRoot, outputPath: outputRoot, options: { mode: 'plan' } }),
    );

    expect(manifest.templates).toEqual([{ inputPath: candidate, outputPath: join(outputRoot, 'unknown.html') }]);
    expect(kind.mock.calls).toEqual([[inputRoot], [candidate]]);
  });

  test('does not enumerate a directory ignored by the production matcher with a directory-only rule', async () => {
    const inputRoot = join(temporaryDirectory, 'input');
    const outputRoot = join(temporaryDirectory, 'output');
    const ignoredRoot = join(inputRoot, 'ignored');
    await mkdir(inputRoot);
    await writeFile(join(inputRoot, '.gitignore'), 'ignored/\n', 'utf8');
    const enumeratedDirectories: string[] = [];
    const fileSystem: DiscoveryFileSystem = {
      kind: async () => 'directory',
      entries: async directory => {
        enumeratedDirectories.push(directory);
        if (directory === ignoredRoot) throw new Error(`Unexpected descent into ${directory}`);
        return [
          { name: 'ignored', kind: 'directory' },
          { name: 'kept.html', kind: 'file' },
        ];
      },
    };

    const manifest = await new DiscoverProjectStage(fileSystem, { load: createGitIgnoreMatcher }).run(
      migrationInvocation({ inputPath: inputRoot, outputPath: outputRoot, options: { mode: 'plan' } }),
    );

    expect(enumeratedDirectories).toEqual([inputRoot]);
    expect(manifest.templates).toEqual([
      { inputPath: join(inputRoot, 'kept.html'), outputPath: join(outputRoot, 'kept.html') },
    ]);
  });

  test.each([
    { inputName: 'input.css', outputName: 'output.html', message: 'Unsupported file type:' },
    {
      inputName: 'input.html',
      outputName: 'output.css',
      message: 'Single-file output path must have a .html extension.',
    },
  ])('rejects unsupported file extension pair $inputName -> $outputName', async scenario => {
    const input = join(temporaryDirectory, scenario.inputName);
    const output = join(temporaryDirectory, scenario.outputName);
    await writeFile(input, '<div></div>', 'utf8');

    const result = new DiscoverProjectStage().run(
      migrationInvocation({ inputPath: input, outputPath: output, options: { mode: 'plan' } }),
    );

    await expect(result).rejects.toThrow(
      scenario.inputName.endsWith('.css') ? `${scenario.message} ${input}` : scenario.message,
    );
  });

  test('rejects a non-file/non-directory input with the existing error text', async () => {
    const input = join(temporaryDirectory, 'pipe');
    const fileSystem: DiscoveryFileSystem = {
      kind: async () => 'other',
      entries: async () => [],
    };

    const result = new DiscoverProjectStage(fileSystem).run(
      migrationInvocation({
        inputPath: input,
        outputPath: join(temporaryDirectory, 'output'),
        options: { mode: 'plan' },
      }),
    );

    await expect(result).rejects.toThrow(`Unsupported input type: ${resolve(input)}`);
  });

  test('preserves raw and canonical invocation identities when the cwd changes before discovery', async () => {
    const originalWorkingDirectory = process.cwd();
    const input = join(temporaryDirectory, 'input.html');
    await writeFile(input, '<div></div>', 'utf8');
    process.chdir(temporaryDirectory);
    const canonicalInputPath = resolve('input.html');
    const canonicalOutputPath = resolve('output.html');
    const invocation = migrationInvocation({
      inputPath: 'input.html',
      outputPath: 'output.html',
      options: { mode: 'plan' },
    });

    try {
      process.chdir(dirname(temporaryDirectory));
      const manifest = await new DiscoverProjectStage().run(invocation);

      expect(manifest.invocation).toEqual({
        inputPath: 'input.html',
        outputPath: 'output.html',
        canonicalInputPath,
        canonicalOutputPath,
        options: { mode: 'plan' },
      });
      expect(manifest.templates).toEqual([{ inputPath: canonicalInputPath, outputPath: canonicalOutputPath }]);
    } finally {
      process.chdir(originalWorkingDirectory);
    }
  });
});

function isSymlinkPermissionError(error: unknown): boolean {
  return (
    process.platform === 'win32' &&
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'EPERM' || error.code === 'EACCES')
  );
}
