import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { verifyDocumentationContract } from './verify-documentation-contract.mjs';

const repository = path.resolve(import.meta.dirname, '..');
const temporaryRoots: string[] = [];
const fixtureFiles = [
  'package.json',
  'README.md',
  'docs/compatibility.md',
  'test/compatibility/compatibility-inventory.ts',
  'test/compatibility/angular-template-engine.test.ts',
  'test/compatibility/compatibility-inventory.test.ts',
  'test/fixtures/compatibility/static.input.html',
  'test/fixtures/compatibility/static.expected.html',
  'test/fixtures/compatibility/grid.input.html',
  'test/fixtures/compatibility/grid.expected.html',
  'test/fixtures/compatibility/unresolved.input.html',
  'test/fixtures/compatibility/unresolved.expected.html',
  'test/fixtures/compatibility/native-css-flex.expected.html',
  'test/fixtures/compatibility/native-css-boundaries.input.html',
  'test/fixtures/compatibility/native-css-boundaries.expected.html',
  'test/fixtures/compatibility/responsive-class-style.input.html',
  'test/fixtures/compatibility/responsive-class-style.expected.html',
  'test/fixtures/compatibility/flex-item-atomicity.input.html',
  'test/fixtures/compatibility/flex-item-atomicity.expected.html',
  'test/fixtures/compatibility/visibility-reference.input.html',
  'test/fixtures/compatibility/visibility-reference.expected.html',
  'website/src/content/public-contract.ts',
  'website/src/content/cli-reference.ts',
  'website/src/content/diagnostic-reference.ts',
  'website/src/content/compatibility-reference.ts',
  'website/src/content/report-reference.ts',
  'website/src/content/example-reference.ts',
] as const;
const fixtureDirectories = ['src'] as const;

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('documentation contract verification', () => {
  test('accepts registries synchronized with current production and fixture evidence', async () => {
    const root = await createFixture();

    await expect(verifyDocumentationContract(root)).resolves.toBeUndefined();
  });

  test('rejects a documented CLI option removed from the Commander definition', async () => {
    const root = await createFixture();
    await mutate(root, 'src/cli/run-cli.ts', source =>
      source.replace("    .option('--write', 'apply the validated migration plan', false)\n", ''),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow('CLI option registry');
  });

  test('rejects mutated Commander version flags and descriptions instead of assuming its defaults', async () => {
    const root = await createFixture();
    await mutate(root, 'src/cli/run-cli.ts', source =>
      source.replace('.version(packageJson.version)', ".version(packageJson.version, '-v, --version', 'show version')"),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow(
      'CLI option registry metadata differs for --version',
    );
  });

  test('rejects a missing CLI evidence path', async () => {
    const root = await createFixture();
    await mutate(root, 'website/src/content/cli-reference.ts', source =>
      replaceInRecord(source, "longFlag: '--output'", "'src/cli/run-cli.spec.ts'", "'src/cli/missing.spec.ts'"),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow('CLI option --output evidence does not exist');
  });

  test('rejects an existing but irrelevant CLI evidence path', async () => {
    const root = await createFixture();
    await mutate(root, 'website/src/content/cli-reference.ts', source =>
      replaceInRecord(
        source,
        "longFlag: '--debug'",
        "evidence: ['src/cli/run-cli.ts']",
        "evidence: ['src/cli/run-cli.ts', 'package.json']",
      ),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow('CLI option --debug evidence is not relevant');
  });

  test('rejects a diagnostic that is no longer part of the production union', async () => {
    const root = await createFixture();
    await mutate(root, 'src/analyzer/conversion-result.ts', source => source.replace("  | 'bound-class'\n", ''));

    await expect(verifyDocumentationContract(root)).rejects.toThrow('diagnostic registry');
  });

  test('rejects a report field removed from the schema-2 TypeScript contract', async () => {
    const root = await createFixture();
    await mutate(root, 'src/report/migration-report.ts', source =>
      source.replace('  readonly durationMs: number;\n', ''),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow('report field registry');
  });

  test('rejects a Tailwind report carrying a CSS stylesheet result', async () => {
    const root = await createFixture();
    await mutate(root, 'website/src/content/report-reference.ts', source =>
      replaceInRecord(source, "id: 'write'", "target: 'css'", "target: 'tailwind'"),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow(
      'report example write must include stylesheet exactly for the css target',
    );
  });

  test('accepts plan-only application when a plan contains parse errors', async () => {
    const root = await createFixture();
    await mutate(root, 'website/src/content/report-reference.ts', source =>
      replaceInRecord(
        replaceInRecord(source, "id: 'parse-error'", "mode: 'write'", "mode: 'plan'"),
        "id: 'parse-error'",
        "reason: 'parse-errors'",
        "reason: 'plan-only'",
      ),
    );

    await expect(verifyDocumentationContract(root)).resolves.toBeUndefined();
  });

  test('rejects parse-errors application when a plan contains parse errors', async () => {
    const root = await createFixture();
    await mutate(root, 'website/src/content/report-reference.ts', source =>
      replaceInRecord(source, "id: 'parse-error'", "mode: 'write'", "mode: 'plan'"),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow(
      'report example parse-error application {"status":"skipped","reason":"parse-errors"} differs from {"status":"skipped","reason":"plan-only"}',
    );
  });

  test('rejects plan-only application when a write contains parse errors', async () => {
    const root = await createFixture();
    await mutate(root, 'website/src/content/report-reference.ts', source =>
      replaceInRecord(source, "id: 'parse-error'", "reason: 'parse-errors'", "reason: 'plan-only'"),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow(
      'report example parse-error application {"status":"skipped","reason":"plan-only"} differs from {"status":"skipped","reason":"parse-errors"}',
    );
  });

  test('rejects an invented non-parse report diagnostic code', async () => {
    const root = await createFixture();
    await mutate(root, 'website/src/content/report-reference.ts', source =>
      replaceInRecord(source, "id: 'plan'", "code: 'dynamic-binding'", "code: 'invented-code'"),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow(
      'report example plan uses unknown diagnostic code invented-code',
    );
  });

  test('rejects a report example that differs from production builder normalization', async () => {
    const root = await createFixture();
    await mutate(root, 'website/src/content/report-reference.ts', source =>
      replaceInRecord(source, "id: 'write'", 'durationMs: 8', 'durationMs: 8.5'),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow(
      'report example write differs from production builder',
    );
  });

  test('rejects a compatibility target that contradicts the compatibility contract', async () => {
    const root = await createFixture();
    await mutate(root, 'docs/compatibility.md', source =>
      source.replace(
        '| `gdColumns`      | Grid        | Limited        | Preserved      | Not applicable   |',
        '| `gdColumns`      | Grid        | Limited        | Limited        | Not applicable   |',
      ),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow('compatibility registry');
  });

  test('rejects duplicate compatibility entries', async () => {
    const root = await createFixture();
    await mutate(root, 'website/src/content/compatibility-reference.ts', source =>
      source.replace("id: 'fxLayoutAlign'", "id: 'fxLayout'"),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow('duplicate compatibility entry: fxLayout');
  });

  test('rejects duplicate rows in the Markdown compatibility contract', async () => {
    const root = await createFixture();
    await mutate(root, 'docs/compatibility.md', source => {
      const row = source.match(/^\| `gdColumns`.*$/mu)?.[0];
      if (row === undefined) return source;
      return source.replace('<!-- compatibility-inventory:end -->', `${row}\n\n<!-- compatibility-inventory:end -->`);
    });

    await expect(verifyDocumentationContract(root)).rejects.toThrow(
      'duplicate compatibility contract entry: gdColumns',
    );
  });

  test('rejects duplicate entries in the structured compatibility inventory', async () => {
    const root = await createFixture();
    await mutate(root, 'test/compatibility/compatibility-inventory.ts', source => {
      const start = source.indexOf("  {\n    directive: 'gdColumns'");
      const end = source.indexOf('  },', start) + '  },'.length;
      if (start < 0 || end < '  },'.length) return source;
      return `${source.slice(0, end)}\n${source.slice(start, end)}${source.slice(end)}`;
    });

    await expect(verifyDocumentationContract(root)).rejects.toThrow(
      'duplicate structured compatibility inventory entry: gdColumns',
    );
  });

  test('rejects compatibility details that link a Tailwind example from the Native CSS target', async () => {
    const root = await createFixture();
    await mutate(root, 'website/src/content/compatibility-reference.ts', source =>
      replaceInRecord(source, "id: 'gdColumns'", "exampleIds: ['native-css-boundaries']", "exampleIds: ['grid']"),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow(
      'compatibility gdColumns css example grid uses target tailwind',
    );
  });

  test('rejects incomplete structured compatibility target details', async () => {
    const root = await createFixture();
    await mutate(root, 'website/src/content/compatibility-reference.ts', source =>
      replaceInRecord(
        source,
        "id: 'fxGrow'",
        "supportedForms: ['fxGrow converts only with fxFlex in the same base or responsive flex-item group.']",
        'supportedForms: []',
      ),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow(
      'compatibility fxGrow tailwind supportedForms must contain actionable text',
    );
  });

  test('rejects unknown diagnostics in compatibility target details', async () => {
    const root = await createFixture();
    await mutate(root, 'website/src/content/compatibility-reference.ts', source =>
      replaceInRecord(source, "id: 'imgSrc'", "'target-unsupported'", "'invented-code'"),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow(
      'compatibility imgSrc tailwind uses unknown diagnostic invented-code',
    );
  });

  test('rejects an expected transformation that differs from its canonical fixture', async () => {
    const root = await createFixture();
    await mutate(root, 'test/fixtures/compatibility/static.expected.html', source =>
      source.replace('flex flex-col', 'flex flex-row'),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow('transformation example static-flex');
  });

  test('rejects matching duplicated output bytes when the production preview produces different output', async () => {
    const root = await createFixture();
    await mutate(root, 'website/src/content/example-reference.ts', source =>
      replaceInRecord(source, "id: 'static-flex'", 'flex flex-col', 'flex flex-row'),
    );
    await mutate(root, 'test/fixtures/compatibility/static.expected.html', source =>
      source.replace('flex flex-col', 'flex flex-row'),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow(
      'transformation example static-flex output differs from production preview',
    );
  });

  test('rejects expected result status drift from the production preview', async () => {
    const root = await createFixture();
    await mutate(root, 'website/src/content/example-reference.ts', source =>
      replaceInRecord(
        source,
        "id: 'static-flex'",
        "{ status: 'converted' }",
        "{ status: 'review', code: 'dynamic-binding' }",
      ),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow(
      'transformation example static-flex results differ from production preview',
    );
  });

  test('rejects invented expected diagnostic codes', async () => {
    const root = await createFixture();
    await mutate(root, 'website/src/content/example-reference.ts', source =>
      replaceInRecord(
        source,
        "id: 'static-flex'",
        "{ status: 'converted' }",
        "{ status: 'review', code: 'invented-code' }",
      ),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow(
      'transformation example static-flex uses unknown diagnostic code invented-code',
    );
  });

  test('rejects a conversion diagnostic paired with parse-error status', async () => {
    const root = await createFixture();
    await mutate(root, 'website/src/content/example-reference.ts', source =>
      replaceInRecord(
        source,
        "id: 'static-flex'",
        "{ status: 'converted' }",
        "{ status: 'parse-error', code: 'dynamic-binding' }",
      ),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow(
      'transformation example static-flex uses diagnostic code dynamic-binding with parse-error status',
    );
  });
});

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'documentation-contract-'));
  temporaryRoots.push(root);
  await Promise.all(
    fixtureDirectories.map(async relativePath => {
      await cp(path.join(repository, relativePath), path.join(root, relativePath), { recursive: true });
    }),
  );
  await Promise.all(
    fixtureFiles.map(async relativePath => {
      const destination = path.join(root, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(repository, relativePath), destination);
    }),
  );
  await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  return root;
}

async function mutate(root: string, relativePath: string, update: (source: string) => string): Promise<void> {
  const target = path.join(root, relativePath);
  const source = await readFile(target, 'utf8');
  const changed = update(source);
  if (changed === source) throw new Error(`Mutation did not change ${relativePath}`);
  await writeFile(target, changed, 'utf8');
}

function replaceInRecord(source: string, marker: string, from: string, to: string): string {
  const start = source.indexOf(marker);
  const lineStart = source.lastIndexOf('\n', start) + 1;
  const indentation = source.slice(lineStart, start).length;
  const end = source.indexOf(`\n${' '.repeat(Math.max(0, indentation - 2))}},`, start);
  if (start < 0 || end < 0) return source;
  return `${source.slice(0, start)}${source.slice(start, end).replace(from, to)}${source.slice(end)}`;
}
