import type { DiagnosticCode } from '@core/analyzer/conversion-result';

import { deepFreeze } from './public-contract';

export interface DiagnosticReference {
  readonly code: DiagnosticCode | 'template-parse-error' | 'generated-template-parse-error';
  readonly family: string;
  readonly meaning: string;
  readonly unsafeToGuess: string;
  readonly resolution: readonly string[];
  readonly rerunEligible: boolean;
}

export const diagnosticReference = deepFreeze([
  {
    code: 'bound-class',
    family: 'class ownership',
    meaning: 'Generated classes cannot be merged safely with a bound class value.',
    unsafeToGuess: 'The runtime binding may replace or conflict with generated classes.',
    resolution: ['Merge the generated classes into the binding manually.'],
    rerunEligible: true,
  },
  {
    code: 'class-conflict',
    family: 'class ownership',
    meaning: 'An existing class owns CSS properties that intersect the proposed conversion.',
    unsafeToGuess: 'HTML class order does not prove which Tailwind declaration wins.',
    resolution: ['Remove the conflicting authority or migrate the directive family manually.'],
    rerunEligible: true,
  },
  {
    code: 'breakpoint-unverified',
    family: 'breakpoints',
    meaning: 'An optional orientation or print breakpoint is not enabled by explicit migration configuration.',
    unsafeToGuess: 'The codemod cannot discover the source application provider configuration.',
    resolution: ['Verify the source breakpoint configuration.', 'Rerun with the matching explicit breakpoint flag.'],
    rerunEligible: true,
  },
  {
    code: 'custom-breakpoint',
    family: 'breakpoints',
    meaning: 'The breakpoint alias may be registered by the project.',
    unsafeToGuess: 'A custom alias has no production-owned media definition.',
    resolution: ['Provide its media query manually or migrate the responsive input manually.'],
    rerunEligible: true,
  },
  {
    code: 'dynamic-binding',
    family: 'runtime values',
    meaning: 'An Angular property binding or interpolation may depend on runtime state.',
    unsafeToGuess: 'Static analysis cannot evaluate the application expression safely.',
    resolution: ['Replace the binding manually or make it a literal before migration.'],
    rerunEligible: true,
  },
  {
    code: 'display-restoration-unverified',
    family: 'visibility',
    meaning: 'The visible display value cannot be proven from one unambiguous source.',
    unsafeToGuess: 'Restoring the wrong display mode changes layout semantics.',
    resolution: ['Provide one unambiguous visible display value or migrate the visibility family manually.'],
    rerunEligible: true,
  },
  {
    code: 'invalid-value',
    family: 'input validity',
    meaning: 'The directive value does not satisfy the supported source grammar or semantic constraints.',
    unsafeToGuess: 'Repairing malformed or contradictory source would be a project-specific decision.',
    resolution: ['Correct the value or migrate the directive manually.'],
    rerunEligible: true,
  },
  {
    code: 'context-unverified',
    family: 'semantic context',
    meaning: 'The conversion depends on parent, layout, display, or family context that is not proven.',
    unsafeToGuess: 'A locally plausible edit can be wrong when its surrounding semantic family is unresolved.',
    resolution: ['Migrate the complete dependent context together manually.'],
    rerunEligible: true,
  },
  {
    code: 'responsive-precedence-unverified',
    family: 'responsive precedence',
    meaning: 'Intersecting responsive ranges produce different values for the same semantic family.',
    unsafeToGuess: 'Reordering or selecting one value would change source activation precedence.',
    resolution: ['Make intersecting values identical or migrate the complete responsive family manually.'],
    rerunEligible: true,
  },
  {
    code: 'semantic-unsupported',
    family: 'source semantics',
    meaning: 'The source behavior is recognized but has no proven equivalent in the current conversion.',
    unsafeToGuess: 'A visually similar replacement may omit source behavior.',
    resolution: ['Keep the directive or replace the full behavior manually.'],
    rerunEligible: false,
  },
  {
    code: 'style-value-unverified',
    family: 'responsive styles',
    meaning: 'A responsive style declaration cannot be sanitized and encoded exactly.',
    unsafeToGuess: 'Unsafe or ambiguous declaration text cannot become a stable generated class.',
    resolution: ['Replace unsafe declarations or migrate the complete responsive style family manually.'],
    rerunEligible: true,
  },
  {
    code: 'tailwind-candidate-unverified',
    family: 'responsive classes',
    meaning: 'A class token is not proven to be a stable Tailwind CSS v4 candidate.',
    unsafeToGuess: 'The token may be application-defined, plugin-provided, escaped ambiguously, or malformed.',
    resolution: ['Replace unverified classes or migrate the complete responsive class family manually.'],
    rerunEligible: true,
  },
  {
    code: 'target-unsupported',
    family: 'migration target',
    meaning: 'The selected target does not implement the directive family.',
    unsafeToGuess: 'Inventing target output would exceed the target renderer contract.',
    resolution: ['Use a target that supports the input or migrate the directive manually.'],
    rerunEligible: false,
  },
  {
    code: 'template-parse-error',
    family: 'template parsing',
    meaning: 'The Angular compiler could not parse the source template.',
    unsafeToGuess: 'Edits against an invalid source tree cannot be located or validated safely.',
    resolution: ['Repair the source template syntax, then rerun the migration.'],
    rerunEligible: true,
  },
  {
    code: 'generated-template-parse-error',
    family: 'generated validation',
    meaning: 'The proposed output failed the Angular compiler validation pass.',
    unsafeToGuess: 'Applying an invalid generated template would corrupt the migration result.',
    resolution: ['Keep the original source and report a minimal reproduction before retrying.'],
    rerunEligible: true,
  },
] as const satisfies readonly DiagnosticReference[]);
