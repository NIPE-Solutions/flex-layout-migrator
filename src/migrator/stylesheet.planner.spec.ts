import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Stats } from 'node:fs';
import type { OwnedCssRule } from '../adapter/css/css-artifact.model';
import { StylesheetPlanner } from './stylesheet.planner';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const START = '/* flex-layout-codemod:start schema=1 */';
const END = '/* flex-layout-codemod:end */';

function rule(id: string): OwnedCssRule {
  return {
    owner: 'flex-layout-codemod',
    id,
    className: `flm-${id}`,
    family: 'layout',
    declarations: [{ property: 'display', value: 'flex' }],
    context: { priority: 0 },
  };
}

function block(newline: '\n' | '\r\n', rules: readonly OwnedCssRule[]): string {
  if (rules.length === 0) return '';

  return [
    START,
    ...rules.flatMap(current => [
      `/* flex-layout-codemod:rule id=${current.id} */`,
      `.${current.className} {`,
      ...current.declarations.map(declaration => `  ${declaration.property}: ${declaration.value};`),
      '}',
    ]),
    END,
  ].join(newline);
}

function planWithTemplateReferences(
  planner: StylesheetPlanner,
  stylesheet: string,
  rules: readonly OwnedCssRule[],
  references: ReadonlySet<string>,
) {
  return (
    planner as unknown as {
      plan(
        path: string,
        currentRules: readonly OwnedCssRule[],
        templateReferences: ReadonlySet<string>,
      ): ReturnType<StylesheetPlanner['plan']>;
    }
  ).plan(stylesheet, rules, references);
}

describe('StylesheetPlanner', () => {
  let directory: string;
  let stylesheet: string;
  let planner: StylesheetPlanner;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'stylesheet-planner-'));
    stylesheet = join(directory, 'flex.css');
    planner = new StylesheetPlanner();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test('returns no artifact for an absent stylesheet and no generated rules', async () => {
    await expect(planner.plan(stylesheet, [])).resolves.toBeUndefined();
  });

  test('plans creation for an absent stylesheet with generated rules', async () => {
    await expect(planner.plan(stylesheet, [rule(A)])).resolves.toMatchObject({
      kind: 'stylesheet',
      path: stylesheet,
      original: { status: 'absent' },
      proposed: { status: 'present', contents: block('\n', [rule(A)]) },
    });
  });

  test('returns no artifact when an existing owned stylesheet is already current', async () => {
    await writeFile(stylesheet, block('\n', [rule(A)]), 'utf8');

    await expect(planner.plan(stylesheet, [rule(A)])).resolves.toBeUndefined();
  });

  test('plans an update when generated rules change', async () => {
    const original = block('\n', [rule(A)]);
    await writeFile(stylesheet, original, 'utf8');

    await expect(planner.plan(stylesheet, [rule(B)])).resolves.toMatchObject({
      kind: 'stylesheet',
      path: stylesheet,
      original: { status: 'present', contents: original },
      proposed: { status: 'present', contents: block('\n', [rule(B)]) },
    });
  });

  test('plans removal when an owned-only stylesheet has no generated rules', async () => {
    const original = block('\n', [rule(A)]);
    await writeFile(stylesheet, original, 'utf8');

    await expect(planner.plan(stylesheet, [])).resolves.toMatchObject({
      kind: 'stylesheet',
      path: stylesheet,
      original: { status: 'present', contents: original },
      proposed: { status: 'absent' },
    });
  });

  test('retains only owned rules referenced by proposed templates when no directive is converted on a rerun', async () => {
    const original = block('\n', [rule(A), rule(B)]);
    await writeFile(stylesheet, original, 'utf8');

    await expect(planWithTemplateReferences(planner, stylesheet, [], new Set([`flm-${A}`]))).resolves.toMatchObject({
      kind: 'stylesheet',
      original: { status: 'present', contents: original },
      proposed: { status: 'present', contents: block('\n', [rule(A)]) },
    });
  });

  test('rejects a generated class reference that has no matching owned CSS rule', async () => {
    await writeFile(stylesheet, block('\n', [rule(A)]), 'utf8');

    await expect(planWithTemplateReferences(planner, stylesheet, [], new Set([`flm-${B}`]))).rejects.toMatchObject({
      code: 'stylesheet-ownership-invalid',
      paths: [stylesheet],
    });
  });

  test('merges retained and newly generated base rules once in stable rule order', async () => {
    await writeFile(stylesheet, block('\n', [rule(B)]), 'utf8');

    await expect(
      planWithTemplateReferences(planner, stylesheet, [rule(A)], new Set([`flm-${A}`, `flm-${B}`])),
    ).resolves.toMatchObject({
      proposed: { status: 'present', contents: block('\n', [rule(A), rule(B)]) },
    });
  });

  test('retains handwritten bytes exactly when adding owned rules', async () => {
    const handwritten = '.handwritten { display: block; }';
    await writeFile(stylesheet, handwritten, 'utf8');

    await expect(planner.plan(stylesheet, [rule(A)])).resolves.toMatchObject({
      original: { status: 'present', contents: handwritten },
      proposed: { status: 'present', contents: `${handwritten}${block('\n', [rule(A)])}` },
    });
  });

  test('preserves CRLF bytes when merging a stylesheet', async () => {
    const handwritten = '.handwritten {}\r\n';
    await writeFile(stylesheet, handwritten, 'utf8');

    await expect(planner.plan(stylesheet, [rule(A)])).resolves.toMatchObject({
      proposed: { status: 'present', contents: `${handwritten}${block('\r\n', [rule(A)])}` },
    });
  });

  test('maps ownership corruption to a stylesheet application error', async () => {
    await writeFile(stylesheet, START, 'utf8');

    await expect(planner.plan(stylesheet, [rule(A)])).rejects.toMatchObject({
      code: 'stylesheet-ownership-invalid',
      paths: [stylesheet],
      cause: expect.objectContaining({ code: 'malformed-ownership-block' }),
    });
  });

  test('rejects a directory stylesheet path', async () => {
    await mkdir(stylesheet);

    await expect(planner.plan(stylesheet, [rule(A)])).rejects.toMatchObject({
      code: 'unsupported-path-type',
      paths: [stylesheet],
    });
  });

  test('rejects a symbolic-link stylesheet path', async () => {
    await symlink(join(directory, 'target.css'), stylesheet);

    await expect(planner.plan(stylesheet, [rule(A)])).rejects.toMatchObject({
      code: 'unsupported-path-type',
      paths: [stylesheet],
    });
  });

  test('preserves non-ENOENT read failures', async () => {
    const readError = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    const planner = new StylesheetPlanner({
      lstat: async () =>
        ({
          isDirectory: () => false,
          isFile: () => true,
          isSymbolicLink: () => false,
        }) as unknown as Stats,
      readFile: async () => {
        throw readError;
      },
    });

    await expect(planner.plan(stylesheet, [rule(A)])).rejects.toBe(readError);
  });
});
