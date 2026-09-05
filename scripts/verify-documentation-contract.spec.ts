import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { verifyDocumentationContract } from './verify-documentation-contract.mjs';

const repository = path.resolve(import.meta.dirname, '..');
const temporaryRoots: string[] = [];
const fixtureFiles = [
  'src/cli/run-cli.ts',
  'src/analyzer/conversion-result.ts',
  'src/analyzer/flex-layout.catalog.ts',
  'src/migrator/migration-mode.ts',
  'src/report/migration-report.ts',
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
  'website/src/content/public-contract.ts',
  'website/src/content/cli-reference.ts',
  'website/src/content/diagnostic-reference.ts',
  'website/src/content/compatibility-reference.ts',
  'website/src/content/report-reference.ts',
  'website/src/content/example-reference.ts',
] as const;

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

  test('rejects an expected transformation that differs from its canonical fixture', async () => {
    const root = await createFixture();
    await mutate(root, 'test/fixtures/compatibility/static.expected.html', source =>
      source.replace('flex flex-col', 'flex flex-row'),
    );

    await expect(verifyDocumentationContract(root)).rejects.toThrow('transformation example static-flex');
  });
});

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'documentation-contract-'));
  temporaryRoots.push(root);
  await Promise.all(
    fixtureFiles.map(async relativePath => {
      const destination = path.join(root, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(repository, relativePath), destination);
    }),
  );
  return root;
}

async function mutate(root: string, relativePath: string, update: (source: string) => string): Promise<void> {
  const target = path.join(root, relativePath);
  const source = await readFile(target, 'utf8');
  const changed = update(source);
  if (changed === source) throw new Error(`Mutation did not change ${relativePath}`);
  await writeFile(target, changed, 'utf8');
}
