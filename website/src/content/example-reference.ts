import type { DiagnosticCode } from '../../../src/analyzer/conversion-result';
import type { TemplatePreviewInput } from '../../../src/browser/template-preview';

import { deepFreeze, type DocumentationEvidencePath } from './public-contract';

export type VerifiedExampleResult =
  | { readonly status: 'converted' }
  | { readonly status: 'review' | 'unsupported' | 'invalid'; readonly code: DiagnosticCode }
  | {
      readonly status: 'parse-error';
      readonly code: 'template-parse-error' | 'generated-template-parse-error';
    };

export interface VerifiedExample {
  readonly id: string;
  readonly title: string;
  readonly category: 'flex' | 'grid' | 'preservation';
  readonly input: TemplatePreviewInput;
  readonly expectedOutput: string;
  readonly expectedCss?: string;
  readonly expectedResults: readonly VerifiedExampleResult[];
  readonly inputFixture: DocumentationEvidencePath;
  readonly expectedOutputFixture: DocumentationEvidencePath;
  readonly evidence: readonly DocumentationEvidencePath[];
}

const compatibilityTest = 'test/compatibility/angular-template-engine.test.ts';

export const verifiedExamples = deepFreeze([
  {
    id: 'static-flex',
    title: 'Static Flex directives',
    category: 'flex',
    input: {
      target: 'tailwind',
      fileName: 'static.html',
      source: `<section fxLayout="column" fxLayoutGap="4" fxLayoutAlign="center end">
  <div fxFlex="1 1 0%"></div>
  <div fxFlexFill></div>
  <div fxFlexOrder="2"></div>
  <div fxFlexOffset="10px"></div>
  <div fxFlex="25" fxGrow="2" fxShrink="0"></div>
  <div fxFill></div>
  <div fxFlexAlign="baseline"></div>
  <div fxFlexOffset="4"></div>
</section>
`,
    },
    expectedOutput: `<section class="flex flex-col box-border gap-[4px] justify-center items-end content-end">
  <div class="[flex:1_1_0%] box-border"></div>
  <div class="m-0 w-full h-full min-w-full min-h-full"></div>
  <div class="[order:2]"></div>
  <div class="mt-[10px]"></div>
  <div class="[flex:2_0_25%] box-border"></div>
  <div class="m-0 w-full h-full min-w-full min-h-full"></div>
  <div class="self-baseline"></div>
  <div class="mt-[4%]"></div>
</section>
`,
    expectedCss: undefined,
    expectedResults: [
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
    ],
    inputFixture: 'test/fixtures/compatibility/static.input.html',
    expectedOutputFixture: 'test/fixtures/compatibility/static.expected.html',
    evidence: [
      'test/fixtures/compatibility/static.input.html',
      'test/fixtures/compatibility/static.expected.html',
      compatibilityTest,
    ],
  },
  {
    id: 'grid',
    title: 'Grid directives and preserved inputs',
    category: 'grid',
    input: {
      target: 'tailwind',
      fileName: 'grid.html',
      source: `<!-- prettier-ignore -->
<section gdAlignColumns="start center" gdAlignRows="space-between stretch" gdAreas="hero hero | nav main" gdAuto="column dense" gdColumns="12rem 1fr" gdGap="1rem" gdRows="auto 1fr" gdInline>
  <div gdArea="hero" gdColumn="1 / span 2" gdGridAlign="start end" gdRow="1"></div>
</section>

<!-- prettier-ignore -->
<div gdColumns.sm="repeat(2, minmax(0, 1fr))"></div>
<div [gdRows]="rows"></div>
<div gdGap.print="1rem"></div>
`,
    },
    expectedOutput: `<!-- prettier-ignore -->
<section class="[align-content:start] [align-items:center] [justify-content:space-between] [justify-items:stretch] [grid-template-areas:'hero_hero'_'nav_main'] [grid-auto-flow:column_dense] [grid-template-columns:12rem_1fr] [grid-gap:1rem] [grid-template-rows:auto_1fr] inline-grid">
  <div class="[grid-area:hero] [grid-column:1_/_span_2] [justify-self:start] [align-self:end] [grid-row:1]"></div>
</section>

<!-- prettier-ignore -->
<div class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:grid [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:[grid-template-columns:repeat(2,_minmax(0,_1fr))]"></div>
<div [gdRows]="rows"></div>
<div gdGap.print="1rem"></div>
`,
    expectedCss: undefined,
    expectedResults: [
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'converted' },
      { status: 'review', code: 'dynamic-binding' },
      { status: 'review', code: 'breakpoint-unverified' },
    ],
    inputFixture: 'test/fixtures/compatibility/grid.input.html',
    expectedOutputFixture: 'test/fixtures/compatibility/grid.expected.html',
    evidence: [
      'test/fixtures/compatibility/grid.input.html',
      'test/fixtures/compatibility/grid.expected.html',
      compatibilityTest,
    ],
  },
  {
    id: 'preserved-unresolved',
    title: 'Unresolved inputs remain unchanged',
    category: 'preservation',
    input: {
      target: 'tailwind',
      fileName: 'unresolved.html',
      source: `<div [fxFlex]="basis"></div>
<div fxLayout.cinema="row"></div>
<div [class]="classes" fxLayout="row"></div>
<div fxLayout="row wrap" fxLayoutGap="4"></div>
<div fxLayoutGap="8px grid"></div>
<div [fxLayout]="direction" fxLayoutAlign="center"></div>
`,
    },
    expectedOutput: `<div [fxFlex]="basis"></div>
<div fxLayout.cinema="row"></div>
<div [class]="classes" fxLayout="row"></div>
<div fxLayout="row wrap" fxLayoutGap="4"></div>
<div fxLayoutGap="8px grid"></div>
<div [fxLayout]="direction" fxLayoutAlign="center"></div>
`,
    expectedCss: undefined,
    expectedResults: [
      { status: 'review', code: 'dynamic-binding' },
      { status: 'review', code: 'custom-breakpoint' },
      { status: 'review', code: 'bound-class' },
      { status: 'review', code: 'context-unverified' },
      { status: 'review', code: 'semantic-unsupported' },
      { status: 'review', code: 'semantic-unsupported' },
      { status: 'review', code: 'dynamic-binding' },
      { status: 'review', code: 'context-unverified' },
    ],
    inputFixture: 'test/fixtures/compatibility/unresolved.input.html',
    expectedOutputFixture: 'test/fixtures/compatibility/unresolved.expected.html',
    evidence: [
      'test/fixtures/compatibility/unresolved.input.html',
      'test/fixtures/compatibility/unresolved.expected.html',
      compatibilityTest,
    ],
  },
] as const satisfies readonly VerifiedExample[]);
