import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
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
      load: async () => Object.freeze({ ignores: () => false }),
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
      load: async () => ({ ignores: candidate => candidate === `${ignoredRoot}${sep}` }),
    };

    const manifest = await new DiscoverProjectStage(fileSystem, ignoreMatchers).run(
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
