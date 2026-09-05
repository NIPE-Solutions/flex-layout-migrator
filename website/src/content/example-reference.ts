import type { DiagnosticCode } from '../../../src/analyzer/conversion-result';
import type { FlexLayoutDirective } from '../../../src/analyzer/flex-layout.catalog';
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
  readonly category: 'flex' | 'grid' | 'visibility' | 'responsive-class-style' | 'preservation' | 'boundary';
  readonly directiveIds: readonly FlexLayoutDirective[];
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
    directiveIds: [
      'fxLayout',
      'fxLayoutAlign',
      'fxLayoutGap',
      'fxFlex',
      'fxGrow',
      'fxShrink',
      'fxFlexAlign',
      'fxFlexFill',
      'fxFill',
      'fxFlexOffset',
      'fxFlexOrder',
    ],
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
    directiveIds: [
      'gdAlignColumns',
      'gdAlignRows',
      'gdArea',
      'gdAreas',
      'gdAuto',
      'gdColumn',
      'gdColumns',
      'gdGap',
      'gdGridAlign',
      'gdInline',
      'gdRow',
      'gdRows',
    ],
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
    directiveIds: ['fxFlex', 'fxLayout', 'fxLayoutGap', 'fxLayoutAlign'],
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
  {
    id: 'native-css-flex',
    title: 'Native CSS Flex output',
    category: 'flex',
    directiveIds: [
      'fxLayout',
      'fxLayoutAlign',
      'fxLayoutGap',
      'fxFlex',
      'fxGrow',
      'fxShrink',
      'fxFlexAlign',
      'fxFlexFill',
      'fxFill',
      'fxFlexOffset',
      'fxFlexOrder',
    ],
    input: {
      target: 'css',
      fileName: 'native-css-flex.html',
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
    expectedOutput: `<section class="flm-a828e172b0300a6c401ffd2aae7fcdbf20b044dfb8b2711c323a8ce8a4ec9b11 flm-477f0598713dbaec88b9c294203ed09ff2b9365dfedf9a487c3d80642e9f6b23 flm-85c717b51446500814a5e69b88776b06ebcb7360b7fe6e381a2409b55714ff76">
  <div class="flm-f525ad6baa992fe4dd11d9b02574be4dab83210f708b25209af94f1a3499a9b7"></div>
  <div class="flm-4ca73f2e7f3a19a8306a8937e4b811d61575d2efe38df819aa15c02e03c57643"></div>
  <div class="flm-90b12790237040a0884cb31c1abf9af62b6e6655e7882c17972cc4963e766aea"></div>
  <div class="flm-93cc1c015cd36af4bd67e1bedbbba406d1a1092445d5925a18a0b89549072026"></div>
  <div class="flm-c630f923beec3f6db50a8ae81e985f03c8f38ca4a3d536141b400965363bc720"></div>
  <div class="flm-4ca73f2e7f3a19a8306a8937e4b811d61575d2efe38df819aa15c02e03c57643"></div>
  <div class="flm-53b95ee551397c750d0e7b368328e5244e12e4f7de5dc9eb61a3981bc7afb1be"></div>
  <div class="flm-0e099c5b784d4a75cff44f040a79f695922026488e4f802600071dfef71d7079"></div>
</section>
`,
    expectedCss: `/* flex-layout-codemod:start schema=1 */
/* flex-layout-codemod:rule id=0e099c5b784d4a75cff44f040a79f695922026488e4f802600071dfef71d7079 */
.flm-0e099c5b784d4a75cff44f040a79f695922026488e4f802600071dfef71d7079 {
  margin-block-start: 4%;
}
/* flex-layout-codemod:rule id=477f0598713dbaec88b9c294203ed09ff2b9365dfedf9a487c3d80642e9f6b23 */
.flm-477f0598713dbaec88b9c294203ed09ff2b9365dfedf9a487c3d80642e9f6b23 {
  gap: 4px;
}
/* flex-layout-codemod:rule id=4ca73f2e7f3a19a8306a8937e4b811d61575d2efe38df819aa15c02e03c57643 */
.flm-4ca73f2e7f3a19a8306a8937e4b811d61575d2efe38df819aa15c02e03c57643 {
  margin: 0;
  width: 100%;
  height: 100%;
  min-width: 100%;
  min-height: 100%;
}
/* flex-layout-codemod:rule id=53b95ee551397c750d0e7b368328e5244e12e4f7de5dc9eb61a3981bc7afb1be */
.flm-53b95ee551397c750d0e7b368328e5244e12e4f7de5dc9eb61a3981bc7afb1be {
  align-self: baseline;
}
/* flex-layout-codemod:rule id=85c717b51446500814a5e69b88776b06ebcb7360b7fe6e381a2409b55714ff76 */
.flm-85c717b51446500814a5e69b88776b06ebcb7360b7fe6e381a2409b55714ff76 {
  justify-content: center;
  align-items: flex-end;
  align-content: flex-end;
  display: flex;
  box-sizing: border-box;
  flex-direction: column;
}
/* flex-layout-codemod:rule id=90b12790237040a0884cb31c1abf9af62b6e6655e7882c17972cc4963e766aea */
.flm-90b12790237040a0884cb31c1abf9af62b6e6655e7882c17972cc4963e766aea {
  order: 2;
}
/* flex-layout-codemod:rule id=93cc1c015cd36af4bd67e1bedbbba406d1a1092445d5925a18a0b89549072026 */
.flm-93cc1c015cd36af4bd67e1bedbbba406d1a1092445d5925a18a0b89549072026 {
  margin-block-start: 10px;
}
/* flex-layout-codemod:rule id=a828e172b0300a6c401ffd2aae7fcdbf20b044dfb8b2711c323a8ce8a4ec9b11 */
.flm-a828e172b0300a6c401ffd2aae7fcdbf20b044dfb8b2711c323a8ce8a4ec9b11 {
  display: flex;
  box-sizing: border-box;
  flex-direction: column;
}
/* flex-layout-codemod:rule id=c630f923beec3f6db50a8ae81e985f03c8f38ca4a3d536141b400965363bc720 */
.flm-c630f923beec3f6db50a8ae81e985f03c8f38ca4a3d536141b400965363bc720 {
  flex: 2 0 25%;
  box-sizing: border-box;
}
/* flex-layout-codemod:rule id=f525ad6baa992fe4dd11d9b02574be4dab83210f708b25209af94f1a3499a9b7 */
.flm-f525ad6baa992fe4dd11d9b02574be4dab83210f708b25209af94f1a3499a9b7 {
  flex: 1 1 0%;
  box-sizing: border-box;
}
/* flex-layout-codemod:end */`,
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
    expectedOutputFixture: 'test/fixtures/compatibility/native-css-flex.expected.html',
    evidence: [
      'test/fixtures/compatibility/static.input.html',
      'test/fixtures/compatibility/native-css-flex.expected.html',
      compatibilityTest,
    ],
  },
  {
    id: 'native-css-flex-target-boundary',
    title: 'Native CSS Flex target boundary',
    category: 'boundary',
    directiveIds: ['fxLayout'],
    input: {
      target: 'css',
      fileName: 'native-css-flex-target-boundary.html',
      source: `<div fxLayout.handset="row"></div>
<div fxLayout.cinema="column"></div>
<div class="flex" fxLayout="row"></div>
`,
    },
    expectedOutput: `<div fxLayout.handset="row"></div>
<div fxLayout.cinema="column"></div>
<div class="flex flm-5db098b5a4e638fdd1aff69e13d53ea10eb01e6c58577e5ecdf136b90eaee103"></div>
`,
    expectedCss: `/* flex-layout-codemod:start schema=1 */
/* flex-layout-codemod:rule id=5db098b5a4e638fdd1aff69e13d53ea10eb01e6c58577e5ecdf136b90eaee103 */
.flm-5db098b5a4e638fdd1aff69e13d53ea10eb01e6c58577e5ecdf136b90eaee103 {
  display: flex;
  box-sizing: border-box;
  flex-direction: row;
}
/* flex-layout-codemod:end */`,
    expectedResults: [
      { status: 'unsupported', code: 'target-unsupported' },
      { status: 'unsupported', code: 'target-unsupported' },
      { status: 'converted' },
    ],
    inputFixture: 'test/fixtures/compatibility/native-css-flex-target-boundary.input.html',
    expectedOutputFixture: 'test/fixtures/compatibility/native-css-flex-target-boundary.expected.html',
    evidence: [
      'test/fixtures/compatibility/native-css-flex-target-boundary.input.html',
      'test/fixtures/compatibility/native-css-flex-target-boundary.expected.html',
      compatibilityTest,
    ],
  },
  {
    id: 'native-css-boundaries',
    title: 'Native CSS target boundaries',
    category: 'boundary',
    directiveIds: ['gdColumns', 'fxHide', 'ngClass', 'ngStyle'],
    input: {
      target: 'css',
      fileName: 'native-css-boundaries.html',
      source: `<div gdColumns="repeat(3, 1fr)"></div>
<div fxHide></div>
<div ngClass.sm="flex items-center"></div>
<div ngStyle.sm="color: #334155"></div>
`,
    },
    expectedOutput: `<div gdColumns="repeat(3, 1fr)"></div>
<div fxHide></div>
<div ngClass.sm="flex items-center"></div>
<div ngStyle.sm="color: #334155"></div>
`,
    expectedCss: '',
    expectedResults: [
      { status: 'unsupported', code: 'target-unsupported' },
      { status: 'unsupported', code: 'target-unsupported' },
      { status: 'unsupported', code: 'target-unsupported' },
      { status: 'unsupported', code: 'target-unsupported' },
    ],
    inputFixture: 'test/fixtures/compatibility/native-css-boundaries.input.html',
    expectedOutputFixture: 'test/fixtures/compatibility/native-css-boundaries.expected.html',
    evidence: [
      'test/fixtures/compatibility/native-css-boundaries.input.html',
      'test/fixtures/compatibility/native-css-boundaries.expected.html',
      compatibilityTest,
    ],
  },
  {
    id: 'responsive-class-style',
    title: 'Responsive class and style',
    category: 'responsive-class-style',
    directiveIds: ['ngClass', 'ngStyle'],
    input: {
      target: 'tailwind',
      fileName: 'responsive-class-style.html',
      source: `<div ngClass.sm="flex items-center" ngStyle.lt-md="font-size.px: 14; color: #334155"></div>
`,
    },
    expectedOutput: `<div class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:items-center [@media_screen_and_(max-width:_959.98px)]:[font-size:14px] [@media_screen_and_(max-width:_959.98px)]:[color:#334155]"></div>
`,
    expectedCss: undefined,
    expectedResults: [{ status: 'converted' }, { status: 'converted' }],
    inputFixture: 'test/fixtures/compatibility/responsive-class-style.input.html',
    expectedOutputFixture: 'test/fixtures/compatibility/responsive-class-style.expected.html',
    evidence: [
      'test/fixtures/compatibility/responsive-class-style.input.html',
      'test/fixtures/compatibility/responsive-class-style.expected.html',
      compatibilityTest,
    ],
  },
  {
    id: 'flex-item-atomicity',
    title: 'Flex-item atomicity',
    category: 'preservation',
    directiveIds: ['fxGrow', 'fxShrink'],
    input: {
      target: 'tailwind',
      fileName: 'flex-item-atomicity.html',
      source: `<div fxGrow="2"></div>
<div fxShrink="3"></div>
`,
    },
    expectedOutput: `<div fxGrow="2"></div>
<div fxShrink="3"></div>
`,
    expectedCss: undefined,
    expectedResults: [
      { status: 'invalid', code: 'invalid-value' },
      { status: 'invalid', code: 'invalid-value' },
    ],
    inputFixture: 'test/fixtures/compatibility/flex-item-atomicity.input.html',
    expectedOutputFixture: 'test/fixtures/compatibility/flex-item-atomicity.expected.html',
    evidence: [
      'test/fixtures/compatibility/flex-item-atomicity.input.html',
      'test/fixtures/compatibility/flex-item-atomicity.expected.html',
      compatibilityTest,
    ],
  },
  {
    id: 'visibility',
    title: 'Visibility conversion',
    category: 'visibility',
    directiveIds: ['fxHide'],
    input: {
      target: 'tailwind',
      fileName: 'visibility.html',
      source: `<img class="hero" fxHide src="base.png">
`,
    },
    expectedOutput: `<img class="hero hidden" src="base.png">
`,
    expectedCss: undefined,
    expectedResults: [{ status: 'converted' }],
    inputFixture: 'test/fixtures/compatibility/visibility-reference.input.html',
    expectedOutputFixture: 'test/fixtures/compatibility/visibility-reference.expected.html',
    evidence: [
      'test/fixtures/compatibility/visibility-reference.input.html',
      'test/fixtures/compatibility/visibility-reference.expected.html',
      compatibilityTest,
    ],
  },
] as const satisfies readonly VerifiedExample[]);
