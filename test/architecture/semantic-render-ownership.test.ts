import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { inspectTypeScript } from './typescript-boundary';

const sourceRoot = join(process.cwd(), 'src');

function runtimeModules(relativePath: string): readonly string[] {
  const path = join(sourceRoot, relativePath);
  return inspectTypeScript(readFileSync(path, 'utf8'), path).runtimeImports.map(item => item.moduleReference);
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

  test('uses semantic-plan as the only directive-family identity owner', () => {
    const semanticPlan = readFileSync(join(sourceRoot, 'semantic/semantic-plan.ts'), 'utf8');
    const responsivePlanner = readFileSync(join(sourceRoot, 'semantic/responsive-family.planner.ts'), 'utf8');

    expect(semanticPlan).toContain('export function directiveFamily');
    expect(responsivePlanner).not.toContain('familyByDirective');
  });
});
