import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { inspectTypeScript } from './typescript-boundary';

const sourceRoot = join(process.cwd(), 'src');

function runtimeModules(relativePath: string): readonly string[] {
  const path = join(sourceRoot, relativePath);
  return inspectTypeScript(readFileSync(path, 'utf8'), path).runtimeImports.map(item => item.moduleReference);
}

function productionTypeScriptFiles(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('semantic/render ownership', () => {
  test('keeps visibility, extended-family, breakpoint selection, and Grid closure planners out of renderers', () => {
    const rendererModules = [
      ...runtimeModules('render/tailwind/tailwind.renderer.ts'),
      ...runtimeModules('render/css/css.renderer.ts'),
    ];

    for (const forbidden of [
      'extended-family.planner',
      'extended-display-composition.planner',
      'generated-property-composition.planner',
      'responsive-class-value.parser',
      'responsive-style-value.parser',
      'visibility-state.planner',
      'display-composition.planner',
      'breakpoint-catalog',
    ]) {
      expect(rendererModules, forbidden).not.toEqual(expect.arrayContaining([expect.stringContaining(forbidden)]));
    }

    expect(readFileSync(join(sourceRoot, 'render/tailwind/tailwind.renderer.ts'), 'utf8')).not.toContain(
      'closeGridContainerDependencies',
    );
  });

  test('keeps compatibility adapters free of semantic planning dependencies', () => {
    const adapterModules = [
      ...runtimeModules('adapter/renderer-backed-conversion.adapter.ts'),
      ...runtimeModules('adapter/tailwind/tailwind.adapter.ts'),
      ...runtimeModules('adapter/css/css.adapter.ts'),
    ];

    for (const forbidden of ['semantic/element-semantic.planner', 'semantic/responsive-family.planner']) {
      expect(adapterModules, forbidden).not.toEqual(expect.arrayContaining([expect.stringContaining(forbidden)]));
    }
  });

  test('keeps resolved-family composition in semantic planning before target rendering', () => {
    const coordinatorModules = runtimeModules('planner/semantic-render.coordinator.ts');

    expect(coordinatorModules).not.toEqual(
      expect.arrayContaining([expect.stringContaining('tailwind-output.coordinator')]),
    );
  });

  test('keeps semantic production code independent from target adapters and renderers', () => {
    for (const path of productionTypeScriptFiles(join(sourceRoot, 'semantic'))) {
      const inspection = inspectTypeScript(readFileSync(path, 'utf8'), path);
      const targetDependency = inspection.runtimeImports.find(
        item => item.moduleReference.includes('/adapter/') || /\/render\/(?:tailwind|css)/u.test(item.moduleReference),
      );

      expect(targetDependency, path).toBeUndefined();
      expect(
        inspection.identifiers.filter(identifier =>
          [
            'classNames',
            'ExtendedResponsiveEmitter',
            'TailwindCandidateClassifier',
            'describeTailwindDisplay',
            'describeTailwindUtility',
            'emitClass',
            'emitStyle',
          ].includes(identifier),
        ),
        path,
      ).toEqual([]);
    }
  });

  test('keeps target candidate emission out of the deprecated extended planner', () => {
    const path = join(sourceRoot, 'adapter/tailwind/extended/extended-responsive.planner.ts');
    const inspection = inspectTypeScript(readFileSync(path, 'utf8'), path);

    expect(inspection.runtimeImports.map(item => item.moduleReference)).not.toContain('./extended-responsive.emitter');
    expect(inspection.identifiers).not.toContain('classNames');
  });

  test('uses semantic-plan as the only directive-family identity owner', () => {
    const semanticPlan = readFileSync(join(sourceRoot, 'semantic/semantic-plan.ts'), 'utf8');
    const responsivePlanner = readFileSync(join(sourceRoot, 'semantic/responsive-family.planner.ts'), 'utf8');

    expect(semanticPlan).toContain('export function directiveFamily');
    expect(responsivePlanner).not.toContain('familyByDirective');
  });
});
