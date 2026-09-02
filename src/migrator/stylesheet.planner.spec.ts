import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Stats } from 'node:fs';
import type { OwnedCssRule } from '../adapter/css/css-artifact.model';
import { serializeOwnedCssBlock } from '../adapter/css/stylesheet/owned-css-block.serializer';
import { StylesheetPlanner } from './stylesheet.planner';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const START = '/* flex-layout-codemod:start schema=1 */';

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

function responsiveRule(id: string, priority: number, min: number, max: number): OwnedCssRule {
  return {
    ...rule(id),
    context: {
      priority,
      media: { type: 'screen', clauses: [{ min, max }] },
    },
  };
}

function block(newline: '\n' | '\r\n', rules: readonly OwnedCssRule[]): string {
  return serializeOwnedCssBlock(rules, newline);
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

  test('places an incoming base rule before a retained responsive rule so the responsive rule remains effective', async () => {
    const responsive = responsiveRule(B, 900, 600, 959.98);
    await writeFile(stylesheet, block('\n', [responsive]), 'utf8');

    await expect(
      planWithTemplateReferences(planner, stylesheet, [rule(A)], new Set([`flm-${A}`, `flm-${B}`])),
    ).resolves.toMatchObject({
      proposed: { status: 'present', contents: block('\n', [rule(A), responsive]) },
    });
  });

  test('orders retained and incoming responsive rules by breakpoint priority then stable ID', async () => {
    const xsIncoming = responsiveRule(C, 1000, 0, 599.98);
    const smIncoming = responsiveRule(A, 900, 600, 959.98);
    const smRetained = responsiveRule(D, 900, 600, 959.98);
    const mdRetained = responsiveRule(B, 800, 960, 1279.98);
    await writeFile(stylesheet, block('\n', [smRetained, mdRetained]), 'utf8');

    await expect(
      planWithTemplateReferences(
        planner,
        stylesheet,
        [xsIncoming, smIncoming],
        new Set([`flm-${A}`, `flm-${B}`, `flm-${C}`, `flm-${D}`]),
      ),
    ).resolves.toMatchObject({
      proposed: { status: 'present', contents: block('\n', [xsIncoming, smIncoming, smRetained, mdRetained]) },
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
