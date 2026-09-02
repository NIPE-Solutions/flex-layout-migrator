import { readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

import {
  inspectTypeScript,
  moduleReferenceContainsPath,
  productionTypeScriptFiles,
  type TypeScriptInspection,
} from './typescript-boundary';

const flexRoot = join(process.cwd(), 'src', 'flex');
const cssRoot = join(process.cwd(), 'src', 'adapter', 'css');
const productionRoot = join(process.cwd(), 'src');
const fixturePath = join(cssRoot, 'flex', 'fixture.css-renderer.ts');

const cssForbiddenModuleSegments = [
  'analyzer',
  'template',
  'edit',
  'tailwind',
  'cli',
  'report',
  'migrator',
  'transaction',
  'planner',
  'application',
];
const flexForbiddenModuleSegments = [
  'adapter/css',
  'adapter/tailwind',
  'tailwind',
  'transaction',
  'migrator',
  'cli',
  'report',
  'planner',
  'application',
];
const filesystemModules = new Set(['fs', 'fs/promises', 'node:fs', 'node:fs/promises']);
const directiveNames = /\bfx(?:Layout(?:Align|Gap)?|Flex(?:Align|Fill|Offset|Order)?|Fill)\b/u;
const standardAliases = new Set([
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  'lt-sm',
  'lt-md',
  'lt-lg',
  'lt-xl',
  'gt-xs',
  'gt-sm',
  'gt-md',
  'gt-lg',
]);
const standardBreakpointMediaValues = new Set([599.98, 600, 959.98, 960, 1279.98, 1280, 1919.98, 1920]);
const rendererContracts: Readonly<Record<string, { readonly name: string; readonly parameterType: string }>> = {
  'layout.css-renderer.ts': { name: 'renderLayoutCss', parameterType: 'LayoutSemantics' },
  'layout-align.css-renderer.ts': {
    name: 'renderLayoutAlignmentCss',
    parameterType: 'LayoutAlignmentSemantics',
  },
  'layout-gap.css-renderer.ts': { name: 'renderLayoutGapCss', parameterType: 'LayoutGapSemantics' },
  'flex-item.css-renderer.ts': { name: 'renderFlexItemCss', parameterType: 'FlexItemSemantics' },
  'flex-align.css-renderer.ts': { name: 'renderFlexAlignCss', parameterType: 'FlexAlignSemantics' },
  'flex-fill.css-renderer.ts': { name: 'renderFlexFillCss', parameterType: 'FlexFillSemantics' },
  'flex-offset.css-renderer.ts': { name: 'renderFlexOffsetCss', parameterType: 'FlexOffsetSemantics' },
  'flex-order.css-renderer.ts': { name: 'renderFlexOrderCss', parameterType: 'FlexOrderSemantics' },
};

function forbiddenCssModule(inspection: TypeScriptInspection): string | undefined {
  return inspection.moduleReferences.find(
    reference =>
      filesystemModules.has(reference) ||
      cssForbiddenModuleSegments.some(segment => moduleReferenceContainsPath(reference, segment)),
  );
}

function forbiddenFlexModule(inspection: TypeScriptInspection): string | undefined {
  return inspection.moduleReferences.find(reference =>
    flexForbiddenModuleSegments.some(segment => moduleReferenceContainsPath(reference, segment)),
  );
}

function duplicatedStandardBreakpointMediaValue(inspection: TypeScriptInspection): number | undefined {
  return inspection.breakpointMediaValues.find(value => standardBreakpointMediaValues.has(value));
}

function directiveSyntax(inspection: TypeScriptInspection): string | undefined {
  return [...inspection.identifiers, ...inspection.literalTexts].find(token => directiveNames.test(token));
}

function copiedBreakpointAlias(inspection: TypeScriptInspection): string | undefined {
  const literalAlias = inspection.literalTexts.find(token => standardAliases.has(token));
  if (literalAlias !== undefined) return literalAlias;

  for (const propertyNames of inspection.objectPropertyTables) {
    const aliases = propertyNames.filter(propertyName => standardAliases.has(propertyName));
    if (aliases.length >= 2) return aliases[0];
  }
  return undefined;
}

function rendererSignatureViolation(
  inspection: TypeScriptInspection,
  contract: { readonly name: string; readonly parameterType: string },
): string | undefined {
  const renderers = inspection.exportedFunctions.filter(declaration => declaration.name.endsWith('Css'));
  if (renderers.length !== 1) return 'expected exactly one CSS renderer export';
  const renderer = renderers[0];
  if (renderer?.name !== contract.name) return 'missing intended renderer';
  if (
    renderer.parameters.length !== 1 ||
    renderer.parameters[0]?.name !== 'value' ||
    renderer.parameters[0]?.type !== contract.parameterType
  ) {
    return 'renderer must accept only its semantic value type';
  }
  return undefined;
}

function semanticRendererLeak(inspection: TypeScriptInspection): string | undefined {
  return inspection.identifiers.find(identifier => /^render[A-Z]/u.test(identifier));
}

describe('native CSS architecture boundary', () => {
  test.each([
    "import { renderLayoutCss } from '../adapter/css/flex/layout.css-renderer';",
    "export { renderLayoutCss } from '../adapter/css/flex/layout.css-renderer';",
    "export * from '../adapter/css/flex/layout.css-renderer';",
    "const renderer = await import('../adapter/css/flex/layout.css-renderer');",
    "const renderer = require('../adapter/css/flex/layout.css-renderer');",
  ])('recognizes an adapter/css module reference in production syntax: %s', source => {
    expect(inspectTypeScript(source, join(flexRoot, 'fixture.ts')).moduleReferences).toContain(
      '../adapter/css/flex/layout.css-renderer',
    );
  });

  test('keeps target-neutral Flex semantics independent from the CSS adapter', () => {
    for (const path of productionTypeScriptFiles(flexRoot)) {
      const inspection = inspectTypeScript(readFileSync(path, 'utf8'), path);

      expect(
        inspection.moduleReferences.some(reference => reference.includes('adapter/css')),
        relative(process.cwd(), path),
      ).toBe(false);
    }
  });

  test.each([
    "import { renderLayoutCss } from '../adapter/css/flex/layout.css-renderer';",
    "const transaction = await import('../transaction/migration-transaction');",
    "import type { MigrationTransaction } from '../transaction';",
    "export { Migrator } from '../migrator/migrator';",
    "const report = require('../report/migration-report');",
    "import report from '../report';",
    "export * from '../adapter/tailwind';",
    "const tailwind = await import('../tailwind');",
    "import type { Application } from '../application';",
  ])('rejects a CSS or application dependency from Flex semantics: %s', source => {
    expect(forbiddenFlexModule(inspectTypeScript(source, join(flexRoot, 'fixture.ts')))).toBeDefined();
  });

  test('keeps target-neutral Flex semantics independent from CSS and application modules', () => {
    for (const path of productionTypeScriptFiles(flexRoot)) {
      expect(
        forbiddenFlexModule(inspectTypeScript(readFileSync(path, 'utf8'), path)),
        relative(process.cwd(), path),
      ).toBeUndefined();
    }
  });

  test.each([
    "import type { FlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';",
    "export type { TemplateElement } from '../../../template/template.model';",
    "const editor = await import('../../../edit/source-editor');",
    "const tailwind = require('../../tailwind/directives/layout.strategy');",
    "import '../../../cli/run-cli';",
    "import { JsonReportWriter } from '../../../report/json-report.writer';",
    "import type { MigrationReport } from '../../../report';",
    "import { Migrator } from '../../../migrator/migrator';",
    "export * from '../../../transaction';",
    "const planner = await import('../../../planner');",
    "import type { Application } from '../../../application';",
    "import { readFile } from 'node:fs/promises';",
  ])('rejects a forbidden CSS dependency: %s', source => {
    expect(forbiddenCssModule(inspectTypeScript(source, fixturePath))).toBeDefined();
  });

  test('keeps CSS production code independent from analyzer, template, editing, Tailwind, CLI, and filesystem modules', () => {
    for (const path of productionTypeScriptFiles(cssRoot)) {
      expect(
        forbiddenCssModule(inspectTypeScript(readFileSync(path, 'utf8'), path)),
        relative(process.cwd(), path),
      ).toBe(undefined);
    }
  });

  test.each([
    'export function renderLayoutCss(value: string) { return value.trim().split(/\\s+/); }',
    "const directive = 'fxLayout';",
    'const input = { fxFlexOrder: value };',
    'const directivePattern = /fxLayout|fxFlex/;',
  ])('rejects raw Flex-Layout directive interpretation in CSS production syntax: %s', source => {
    const inspection = inspectTypeScript(source, fixturePath);
    const rawParameter = inspection.exportedFunctions.some(
      declaration =>
        declaration.name.endsWith('Css') && declaration.parameters.some(parameter => parameter.type === 'string'),
    );

    expect(rawParameter || directiveSyntax(inspection) !== undefined).toBe(true);
  });

  test('keeps raw directive interpretation in the adapter and copied breakpoint aliases out of CSS production', () => {
    for (const path of productionTypeScriptFiles(cssRoot)) {
      const inspection = inspectTypeScript(readFileSync(path, 'utf8'), path);
      const sourcePath = relative(process.cwd(), path);

      if (path !== join(cssRoot, 'css.adapter.ts')) {
        expect(directiveSyntax(inspection), sourcePath).toBeUndefined();
      }
      expect(copiedBreakpointAlias(inspection), sourcePath).toBeUndefined();
    }
  });

  test('rejects a copied standard breakpoint alias/range table', () => {
    const source = `
      const breakpoints = [
        { alias: 'xs', min: 0, max: 599.98 },
        { alias: 'sm', min: 600, max: 959.98 },
        { alias: 'md', min: 960, max: 1279.98 },
      ];
    `;

    expect(copiedBreakpointAlias(inspectTypeScript(source, fixturePath))).toBe('xs');
  });

  test('rejects a standard breakpoint table with identifier-keyed aliases', () => {
    const source = `
      const breakpoints = {
        xs: { min: 0, max: 599.98 },
        sm: { min: 600, max: 959.98 },
        md: { min: 960, max: 1279.98 },
      };
    `;

    expect(copiedBreakpointAlias(inspectTypeScript(source, fixturePath))).toBe('xs');
  });

  test.each([599.98, 600, 959.98, 960, 1279.98, 1280, 1919.98, 1920])(
    'rejects a duplicated standard breakpoint in a hardcoded media feature: %s',
    value => {
      expect(
        duplicatedStandardBreakpointMediaValue(
          inspectTypeScript(`const condition = '(min-width: ${value}px)';`, fixturePath),
        ),
      ).toBe(value);
    },
  );

  test.each([
    ["const condition = '(max-width: 599.98px)';", [599.98]],
    ["const condition = 'screen and (min-width: 600px)';", [600]],
    ["const condition = '(min-width: 600px) and (max-width: 959.98px)';", [600, 959.98]],
    ['const condition = `screen and (min-width: 600px)`;', [600]],
    ['const condition = `screen and ${orientation} and (min-width: 600px)`;', [600]],
    ['const condition = `(min-width: ${minimum}px) and (max-width: 959.98px)`;', [959.98]],
    ['const condition = `(min-width: ${600}px)`;', [600]],
    ['const condition = `${prefix}(min-width: 600px) and (max-width: 959.98px)${suffix}`;', [600, 959.98]],
  ])('rejects duplicated standard breakpoints in media syntax: %s', (source, expected) => {
    expect(inspectTypeScript(source, fixturePath).breakpointMediaValues).toEqual(expected);
  });

  test.each([
    'const timeoutMs = 600;',
    'const queryTimeoutMs = 600;',
    'const breakpointRetryDelayMs = 960;',
    'const mediaBufferSize = 1280;',
    'const componentSize = { minWidth: 600, maxWidth: 960 };',
    "const documentation = 'Use (max-width: 599.98px) in the legacy example.';",
    "const documentation = 'Use screen and (min-width: 600px) in the legacy example.';",
    "throw new Error('Unexpected breakpoint-looking text (min-width: 600px)');",
    "throw new Error('(min-width: 600px)');",
  ])('ignores unrelated numeric or prose values: %s', source => {
    expect(duplicatedStandardBreakpointMediaValue(inspectTypeScript(source, fixturePath))).toBeUndefined();
  });

  test('keeps standard breakpoint media values in the breakpoint catalog only', () => {
    const breakpointCatalog = join(productionRoot, 'breakpoint', 'breakpoint-catalog.ts');

    for (const path of productionTypeScriptFiles(productionRoot)) {
      if (path === breakpointCatalog) continue;
      expect(
        duplicatedStandardBreakpointMediaValue(inspectTypeScript(readFileSync(path, 'utf8'), path)),
        relative(process.cwd(), path),
      ).toBeUndefined();
    }
  });

  test.each([
    "const selector = '.flm-' + digest;",
    'const selectorPattern = /^\\.flm-/;',
    'function renderFlexItemCss() { return []; }',
  ])('rejects target renderer leakage from semantic modules: %s', source => {
    const inspection = inspectTypeScript(source, join(flexRoot, 'fixture.semantic.ts'));

    expect(
      inspection.literalTexts.some(text => text.includes('flm-')) || semanticRendererLeak(inspection) !== undefined,
    ).toBe(true);
  });

  test('keeps selector prefixes and renderer names out of semantic production code', () => {
    for (const path of productionTypeScriptFiles(flexRoot)) {
      const inspection = inspectTypeScript(readFileSync(path, 'utf8'), path);
      const sourcePath = relative(process.cwd(), path);

      expect(
        inspection.literalTexts.some(text => text.includes('flm-')),
        sourcePath,
      ).toBe(false);
      expect(semanticRendererLeak(inspection), sourcePath).toBeUndefined();
    }
  });

  test('requires every CSS family renderer to accept its semantic value type', () => {
    const rendererRoot = join(cssRoot, 'flex');

    for (const path of productionTypeScriptFiles(rendererRoot)) {
      const contract = rendererContracts[basename(path)];
      const inspection = inspectTypeScript(readFileSync(path, 'utf8'), path);
      const renderers = inspection.exportedFunctions.filter(declaration => declaration.name.endsWith('Css'));

      expect(contract, relative(process.cwd(), path)).toBeDefined();
      if (contract === undefined) continue;
      expect(renderers, relative(process.cwd(), path)).toEqual([
        { name: contract.name, parameters: [{ name: 'value', type: contract.parameterType }] },
      ]);
      expect(rendererSignatureViolation(inspection, contract), relative(process.cwd(), path)).toBeUndefined();
    }
  });

  test('rejects a raw-string renderer after a valid renderer export', () => {
    const source = `
      export function renderLayoutCss(value: LayoutSemantics) { return value; }
      export function renderRawCss(value: string) { return value.trim(); }
    `;
    const inspection = inspectTypeScript(source, fixturePath);

    expect(
      rendererSignatureViolation(inspection, { name: 'renderLayoutCss', parameterType: 'LayoutSemantics' }),
    ).toBeDefined();
  });

  test('does not scan comments as production syntax', () => {
    const source = `
      // import { renderLayoutCss } from '../adapter/css/flex/layout.css-renderer';
      // fxLayout='row' and .flm-deadbeef
      // const directivePattern = /fxLayout|fxFlex/;
      // const selectorPattern = /^\\.flm-/;
      /* const copied = [{ alias: 'xs', min: 0, max: 599.98 }]; */
      export function harmless(value: LayoutSemantics): LayoutSemantics { return value; }
    `;
    const inspection = inspectTypeScript(source, join(flexRoot, 'fixture.semantic.ts'));

    expect(inspection.moduleReferences).toEqual([]);
    expect(directiveSyntax(inspection)).toBeUndefined();
    expect(copiedBreakpointAlias(inspection)).toBeUndefined();
    expect(duplicatedStandardBreakpointMediaValue(inspection)).toBeUndefined();
    expect(inspection.literalTexts.some(text => text.includes('flm-'))).toBe(false);
  });
});
