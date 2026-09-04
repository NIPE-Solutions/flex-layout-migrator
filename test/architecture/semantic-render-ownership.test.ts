import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { inspectTypeScript } from './typescript-boundary';

const sourceRoot = join(process.cwd(), 'src');
const compatibilityModulePaths = [
  'adapter/conversion-adapter.session.ts',
  'adapter/conversion-adapter.ts',
  'adapter/css/css.adapter.ts',
  'adapter/renderer-backed-conversion.adapter.ts',
  'adapter/tailwind/extended/css-property-ownership.ts',
  'adapter/tailwind/extended/extended-display-composition.planner.ts',
  'adapter/tailwind/extended/extended-family.planner.ts',
  'adapter/tailwind/extended/extended-responsive.planner.ts',
  'adapter/tailwind/extended/generated-property-composition.planner.ts',
  'adapter/tailwind/extended/responsive-class-value.parser.ts',
  'adapter/tailwind/extended/responsive-class.model.ts',
  'adapter/tailwind/extended/responsive-style-value.parser.ts',
  'adapter/tailwind/extended/responsive-style.model.ts',
  'adapter/tailwind/independent-directive.registry.ts',
  'adapter/tailwind/responsive-plan.ts',
  'adapter/tailwind/tailwind.adapter.ts',
  'adapter/tailwind/visibility/display-composition.planner.ts',
  'adapter/tailwind/visibility/literal-style-display.ts',
  'adapter/tailwind/visibility/visibility-state.planner.ts',
  'adapter/tailwind/visibility/visibility-value.parser.ts',
  'adapter/tailwind/visibility/visibility.model.ts',
  'adapter/tailwind/visibility/visible-display.resolver.ts',
  'render/tailwind/extended-responsive.renderer.ts',
] as const;

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

  test('keeps compatibility adapters, aliases, and superseded target-planning facades out of production', () => {
    const productionPaths = productionTypeScriptFiles(sourceRoot).map(path =>
      path.slice(sourceRoot.length + 1).replaceAll('\\', '/'),
    );

    expect(productionPaths).not.toEqual(expect.arrayContaining([...compatibilityModulePaths]));
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

  test('keeps production imports on canonical semantic and render owners', () => {
    const compatibilityReferences = productionTypeScriptFiles(sourceRoot).flatMap(path =>
      inspectTypeScript(readFileSync(path, 'utf8'), path).moduleReferences.filter(reference =>
        compatibilityModulePaths.some(candidate =>
          reference.replace(/\.[cm]?[jt]s$/u, '').endsWith(candidate.replace(/\.ts$/u, '')),
        ),
      ),
    );

    expect(compatibilityReferences).toEqual([]);
  });

  test('uses semantic-plan as the only directive-family identity owner', () => {
    const semanticPlan = readFileSync(join(sourceRoot, 'semantic/semantic-plan.ts'), 'utf8');
    const responsivePlanner = readFileSync(join(sourceRoot, 'semantic/responsive-family.planner.ts'), 'utf8');

    expect(semanticPlan).toContain('export function directiveFamily');
    expect(responsivePlanner).not.toContain('familyByDirective');
  });
});
