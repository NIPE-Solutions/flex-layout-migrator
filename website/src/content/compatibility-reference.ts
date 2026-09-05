import type { DiagnosticCode } from '../../../src/analyzer/conversion-result';
import type { FlexLayoutDirective } from '../../../src/analyzer/flex-layout.catalog';
import type { TemplatePreviewInput } from '../../../src/browser/template-preview';

import { deepFreeze, type CompatibilityStatus, type DocumentationEvidencePath } from './public-contract';

export interface CompatibilityTargetDetail {
  readonly status: CompatibilityStatus;
  readonly supportedForms: readonly string[];
  readonly limitedForms: readonly string[];
  readonly exampleIds: readonly string[];
  readonly diagnosticCodes: readonly DiagnosticCode[];
  readonly diagnosticEvidence?: readonly CompatibilityDiagnosticEvidence[];
  readonly targetDifference: string;
}

export interface CompatibilityDiagnosticEvidence {
  readonly code: DiagnosticCode;
  readonly status: 'review' | 'unsupported' | 'invalid';
  readonly sourceName: string;
  readonly input: TemplatePreviewInput;
}

export interface CompatibilityEntry {
  readonly id: FlexLayoutDirective;
  readonly directiveFamily: string;
  readonly category: 'flex' | 'visibility' | 'grid' | 'responsive-class-style' | 'images';
  readonly tailwind: CompatibilityStatus;
  readonly css: CompatibilityStatus;
  readonly targetDetails: Readonly<Record<'tailwind' | 'css', CompatibilityTargetDetail>>;
  readonly evidence: readonly DocumentationEvidencePath[];
}

const evidence = [
  'docs/compatibility.md',
  'test/compatibility/compatibility-inventory.ts',
  'test/compatibility/compatibility-inventory.test.ts',
] as const;

const flexDiagnostics = [
  'bound-class',
  'class-conflict',
  'breakpoint-unverified',
  'custom-breakpoint',
  'dynamic-binding',
  'invalid-value',
  'context-unverified',
  'responsive-precedence-unverified',
  'semantic-unsupported',
] as const;
const gridDiagnostics = [
  'bound-class',
  'class-conflict',
  'breakpoint-unverified',
  'custom-breakpoint',
  'dynamic-binding',
  'invalid-value',
  'context-unverified',
  'responsive-precedence-unverified',
  'semantic-unsupported',
  'tailwind-candidate-unverified',
] as const;
const classDiagnostics = [
  'bound-class',
  'class-conflict',
  'breakpoint-unverified',
  'custom-breakpoint',
  'dynamic-binding',
  'context-unverified',
  'responsive-precedence-unverified',
  'semantic-unsupported',
  'tailwind-candidate-unverified',
] as const;
const styleDiagnostics = [
  'bound-class',
  'class-conflict',
  'breakpoint-unverified',
  'custom-breakpoint',
  'dynamic-binding',
  'context-unverified',
  'responsive-precedence-unverified',
  'semantic-unsupported',
  'style-value-unverified',
] as const;

const cssFlexItemBoundInput = {
  target: 'css',
  fileName: 'css-flex-item-bound.html',
  source: '<section fxLayout="row"><div [class]="classes" fxFlex="20" fxGrow="2" fxShrink="0"></div></section>\n',
} as const satisfies TemplatePreviewInput;
const cssFlexItemContextInput = {
  target: 'css',
  fileName: 'css-flex-item-context.html',
  source:
    '<section fxLayout="row"><div fxFlex="20" fxGrow="2" fxShrink="0" fxFlex.handset="30" fxGrow.handset="3" fxShrink.handset="1"></div></section>\n',
} as const satisfies TemplatePreviewInput;
const cssFlexItemPrecedenceInput = {
  target: 'css',
  fileName: 'css-flex-item-precedence.html',
  source:
    '<section fxLayout="row"><div fxFlex.sm="10" fxGrow.sm="2" fxShrink.sm="0" fxFlex.lt-md="20" fxGrow.lt-md="3" fxShrink.lt-md="1"></div></section>\n',
} as const satisfies TemplatePreviewInput;
const cssFlexItemTargetInput = {
  target: 'css',
  fileName: 'css-flex-item-target.html',
  source: '<section fxLayout="row"><div fxFlex.handset="20" fxGrow.handset="2" fxShrink.handset="0"></div></section>\n',
} as const satisfies TemplatePreviewInput;

const cssLayoutDiagnosticEvidence = [
  {
    code: 'bound-class',
    status: 'review',
    sourceName: 'fxLayout',
    input: {
      target: 'css',
      fileName: 'css-layout-bound.html',
      source: '<div [class]="classes" fxLayout="row"></div>\n',
    },
  },
  {
    code: 'dynamic-binding',
    status: 'review',
    sourceName: '[fxLayout]',
    input: { target: 'css', fileName: 'css-layout-dynamic.html', source: '<div [fxLayout]="direction"></div>\n' },
  },
  {
    code: 'invalid-value',
    status: 'invalid',
    sourceName: 'fxLayout',
    input: { target: 'css', fileName: 'css-layout-invalid.html', source: '<div fxLayout="diagonal"></div>\n' },
  },
  {
    code: 'context-unverified',
    status: 'review',
    sourceName: 'fxLayout',
    input: {
      target: 'css',
      fileName: 'css-layout-context.html',
      source: '<div fxLayout="row" fxLayout.handset="column"></div>\n',
    },
  },
  {
    code: 'responsive-precedence-unverified',
    status: 'review',
    sourceName: 'fxLayout.sm',
    input: {
      target: 'css',
      fileName: 'css-layout-precedence.html',
      source: '<div fxLayout.sm="row" fxLayout.lt-md="column"></div>\n',
    },
  },
  {
    code: 'target-unsupported',
    status: 'unsupported',
    sourceName: 'fxLayout.handset',
    input: { target: 'css', fileName: 'css-layout-target.html', source: '<div fxLayout.handset="row"></div>\n' },
  },
] as const satisfies readonly CompatibilityDiagnosticEvidence[];

const cssLayoutAlignDiagnosticEvidence = [
  {
    code: 'bound-class',
    status: 'review',
    sourceName: 'fxLayoutAlign',
    input: {
      target: 'css',
      fileName: 'css-layout-align-bound.html',
      source: '<div [class]="classes" fxLayoutAlign="center"></div>\n',
    },
  },
  {
    code: 'dynamic-binding',
    status: 'review',
    sourceName: '[fxLayoutAlign]',
    input: {
      target: 'css',
      fileName: 'css-layout-align-dynamic.html',
      source: '<div [fxLayoutAlign]="alignment"></div>\n',
    },
  },
  {
    code: 'invalid-value',
    status: 'invalid',
    sourceName: 'fxLayoutAlign',
    input: {
      target: 'css',
      fileName: 'css-layout-align-invalid.html',
      source: '<div fxLayoutAlign="sideways"></div>\n',
    },
  },
  {
    code: 'context-unverified',
    status: 'review',
    sourceName: 'fxLayoutAlign',
    input: {
      target: 'css',
      fileName: 'css-layout-align-context.html',
      source: '<div fxLayout="row" fxLayoutAlign="center" fxLayoutAlign.handset="end"></div>\n',
    },
  },
  {
    code: 'responsive-precedence-unverified',
    status: 'review',
    sourceName: 'fxLayoutAlign.sm',
    input: {
      target: 'css',
      fileName: 'css-layout-align-precedence.html',
      source: '<div fxLayout="row" fxLayoutAlign.sm="start" fxLayoutAlign.lt-md="end"></div>\n',
    },
  },
  {
    code: 'target-unsupported',
    status: 'unsupported',
    sourceName: 'fxLayoutAlign.handset',
    input: {
      target: 'css',
      fileName: 'css-layout-align-target.html',
      source: '<div fxLayoutAlign.handset="center"></div>\n',
    },
  },
] as const satisfies readonly CompatibilityDiagnosticEvidence[];

const cssLayoutGapDiagnosticEvidence = [
  {
    code: 'bound-class',
    status: 'review',
    sourceName: 'fxLayoutGap',
    input: {
      target: 'css',
      fileName: 'css-layout-gap-bound.html',
      source: '<div [class]="classes" fxLayout="row" fxLayoutGap="4"></div>\n',
    },
  },
  {
    code: 'dynamic-binding',
    status: 'review',
    sourceName: '[fxLayoutGap]',
    input: { target: 'css', fileName: 'css-layout-gap-dynamic.html', source: '<div [fxLayoutGap]="gap"></div>\n' },
  },
  {
    code: 'invalid-value',
    status: 'invalid',
    sourceName: 'fxLayoutGap',
    input: {
      target: 'css',
      fileName: 'css-layout-gap-invalid.html',
      source: '<div fxLayout="row" fxLayoutGap="bogus"></div>\n',
    },
  },
  {
    code: 'context-unverified',
    status: 'review',
    sourceName: 'fxLayoutGap',
    input: {
      target: 'css',
      fileName: 'css-layout-gap-context.html',
      source: '<div fxLayout="row" fxLayoutGap="4" fxLayoutGap.handset="8"></div>\n',
    },
  },
  {
    code: 'responsive-precedence-unverified',
    status: 'review',
    sourceName: 'fxLayoutGap.sm',
    input: {
      target: 'css',
      fileName: 'css-layout-gap-precedence.html',
      source: '<div fxLayout="row" fxLayoutGap.sm="4" fxLayoutGap.lt-md="8"></div>\n',
    },
  },
  {
    code: 'semantic-unsupported',
    status: 'review',
    sourceName: 'fxLayoutGap',
    input: {
      target: 'css',
      fileName: 'css-layout-gap-semantic.html',
      source: '<div fxLayout="row wrap" fxLayoutGap="4"></div>\n',
    },
  },
  {
    code: 'target-unsupported',
    status: 'unsupported',
    sourceName: 'fxLayoutGap.handset',
    input: { target: 'css', fileName: 'css-layout-gap-target.html', source: '<div fxLayoutGap.handset="4"></div>\n' },
  },
] as const satisfies readonly CompatibilityDiagnosticEvidence[];

const cssFlexDiagnosticEvidence = [
  { code: 'bound-class', status: 'review', sourceName: 'fxFlex', input: cssFlexItemBoundInput },
  {
    code: 'dynamic-binding',
    status: 'review',
    sourceName: '[fxFlex]',
    input: {
      target: 'css',
      fileName: 'css-flex-dynamic.html',
      source: '<section fxLayout="row"><div [fxFlex]="basis"></div></section>\n',
    },
  },
  {
    code: 'invalid-value',
    status: 'invalid',
    sourceName: 'fxFlex',
    input: {
      target: 'css',
      fileName: 'css-flex-invalid.html',
      source: '<section fxLayout="row"><div fxFlex="1 2 3 4"></div></section>\n',
    },
  },
  { code: 'context-unverified', status: 'review', sourceName: 'fxFlex', input: cssFlexItemContextInput },
  {
    code: 'responsive-precedence-unverified',
    status: 'review',
    sourceName: 'fxFlex.sm',
    input: cssFlexItemPrecedenceInput,
  },
  { code: 'target-unsupported', status: 'unsupported', sourceName: 'fxFlex.handset', input: cssFlexItemTargetInput },
] as const satisfies readonly CompatibilityDiagnosticEvidence[];

const cssGrowDiagnosticEvidence = [
  { code: 'bound-class', status: 'review', sourceName: 'fxGrow', input: cssFlexItemBoundInput },
  {
    code: 'dynamic-binding',
    status: 'review',
    sourceName: '[fxGrow]',
    input: { target: 'css', fileName: 'css-grow-dynamic.html', source: '<div [fxGrow]="grow"></div>\n' },
  },
  {
    code: 'invalid-value',
    status: 'invalid',
    sourceName: 'fxGrow',
    input: { target: 'css', fileName: 'css-grow-invalid.html', source: '<div fxGrow="2"></div>\n' },
  },
  { code: 'context-unverified', status: 'review', sourceName: 'fxGrow', input: cssFlexItemContextInput },
  {
    code: 'responsive-precedence-unverified',
    status: 'review',
    sourceName: 'fxGrow.sm',
    input: cssFlexItemPrecedenceInput,
  },
  { code: 'target-unsupported', status: 'unsupported', sourceName: 'fxGrow.handset', input: cssFlexItemTargetInput },
] as const satisfies readonly CompatibilityDiagnosticEvidence[];

const cssShrinkDiagnosticEvidence = [
  { code: 'bound-class', status: 'review', sourceName: 'fxShrink', input: cssFlexItemBoundInput },
  {
    code: 'dynamic-binding',
    status: 'review',
    sourceName: '[fxShrink]',
    input: { target: 'css', fileName: 'css-shrink-dynamic.html', source: '<div [fxShrink]="shrink"></div>\n' },
  },
  {
    code: 'invalid-value',
    status: 'invalid',
    sourceName: 'fxShrink',
    input: { target: 'css', fileName: 'css-shrink-invalid.html', source: '<div fxShrink="2"></div>\n' },
  },
  { code: 'context-unverified', status: 'review', sourceName: 'fxShrink', input: cssFlexItemContextInput },
  {
    code: 'responsive-precedence-unverified',
    status: 'review',
    sourceName: 'fxShrink.sm',
    input: cssFlexItemPrecedenceInput,
  },
  { code: 'target-unsupported', status: 'unsupported', sourceName: 'fxShrink.handset', input: cssFlexItemTargetInput },
] as const satisfies readonly CompatibilityDiagnosticEvidence[];

const cssFlexAlignDiagnosticEvidence = [
  {
    code: 'bound-class',
    status: 'review',
    sourceName: 'fxFlexAlign',
    input: {
      target: 'css',
      fileName: 'css-flex-align-bound.html',
      source: '<div [class]="classes" fxFlexAlign="center"></div>\n',
    },
  },
  {
    code: 'dynamic-binding',
    status: 'review',
    sourceName: '[fxFlexAlign]',
    input: {
      target: 'css',
      fileName: 'css-flex-align-dynamic.html',
      source: '<div [fxFlexAlign]="alignment"></div>\n',
    },
  },
  {
    code: 'invalid-value',
    status: 'invalid',
    sourceName: 'fxFlexAlign',
    input: { target: 'css', fileName: 'css-flex-align-invalid.html', source: '<div fxFlexAlign="sideways"></div>\n' },
  },
  {
    code: 'context-unverified',
    status: 'review',
    sourceName: 'fxFlexAlign',
    input: {
      target: 'css',
      fileName: 'css-flex-align-context.html',
      source: '<div fxFlexAlign="center" fxFlexAlign.handset="end"></div>\n',
    },
  },
  {
    code: 'responsive-precedence-unverified',
    status: 'review',
    sourceName: 'fxFlexAlign.sm',
    input: {
      target: 'css',
      fileName: 'css-flex-align-precedence.html',
      source: '<div fxFlexAlign.sm="start" fxFlexAlign.lt-md="end"></div>\n',
    },
  },
  {
    code: 'target-unsupported',
    status: 'unsupported',
    sourceName: 'fxFlexAlign.handset',
    input: {
      target: 'css',
      fileName: 'css-flex-align-target.html',
      source: '<div fxFlexAlign.handset="center"></div>\n',
    },
  },
] as const satisfies readonly CompatibilityDiagnosticEvidence[];

const cssFlexFillDiagnosticEvidence = [
  {
    code: 'bound-class',
    status: 'review',
    sourceName: 'fxFlexFill',
    input: {
      target: 'css',
      fileName: 'css-flex-fill-bound.html',
      source: '<div [class]="classes" fxFlexFill></div>\n',
    },
  },
  {
    code: 'dynamic-binding',
    status: 'review',
    sourceName: '[fxFlexFill]',
    input: { target: 'css', fileName: 'css-flex-fill-dynamic.html', source: '<div [fxFlexFill]="fill"></div>\n' },
  },
  {
    code: 'context-unverified',
    status: 'review',
    sourceName: 'fxFlexFill',
    input: {
      target: 'css',
      fileName: 'css-flex-fill-context.html',
      source: '<div fxFlexFill fxFlexFill.handset></div>\n',
    },
  },
  {
    code: 'target-unsupported',
    status: 'unsupported',
    sourceName: 'fxFlexFill.handset',
    input: { target: 'css', fileName: 'css-flex-fill-target.html', source: '<div fxFlexFill.handset></div>\n' },
  },
] as const satisfies readonly CompatibilityDiagnosticEvidence[];

const cssFillDiagnosticEvidence = [
  {
    code: 'bound-class',
    status: 'review',
    sourceName: 'fxFill',
    input: { target: 'css', fileName: 'css-fill-bound.html', source: '<div [class]="classes" fxFill></div>\n' },
  },
  {
    code: 'dynamic-binding',
    status: 'review',
    sourceName: '[fxFill]',
    input: { target: 'css', fileName: 'css-fill-dynamic.html', source: '<div [fxFill]="fill"></div>\n' },
  },
  {
    code: 'context-unverified',
    status: 'review',
    sourceName: 'fxFill',
    input: { target: 'css', fileName: 'css-fill-context.html', source: '<div fxFill fxFill.handset></div>\n' },
  },
  {
    code: 'target-unsupported',
    status: 'unsupported',
    sourceName: 'fxFill.handset',
    input: { target: 'css', fileName: 'css-fill-target.html', source: '<div fxFill.handset></div>\n' },
  },
] as const satisfies readonly CompatibilityDiagnosticEvidence[];

const cssFlexOffsetDiagnosticEvidence = [
  {
    code: 'bound-class',
    status: 'review',
    sourceName: 'fxFlexOffset',
    input: {
      target: 'css',
      fileName: 'css-flex-offset-bound.html',
      source: '<section fxLayout="row"><div [class]="classes" fxFlexOffset="10"></div></section>\n',
    },
  },
  {
    code: 'dynamic-binding',
    status: 'review',
    sourceName: '[fxFlexOffset]',
    input: {
      target: 'css',
      fileName: 'css-flex-offset-dynamic.html',
      source: '<section fxLayout="row"><div [fxFlexOffset]="offset"></div></section>\n',
    },
  },
  {
    code: 'invalid-value',
    status: 'invalid',
    sourceName: 'fxFlexOffset',
    input: {
      target: 'css',
      fileName: 'css-flex-offset-invalid.html',
      source: '<section fxLayout="row"><div fxFlexOffset="bogus"></div></section>\n',
    },
  },
  {
    code: 'context-unverified',
    status: 'review',
    sourceName: 'fxFlexOffset',
    input: {
      target: 'css',
      fileName: 'css-flex-offset-context.html',
      source: '<section fxLayout="row"><div fxFlexOffset="10" fxFlexOffset.handset="20"></div></section>\n',
    },
  },
  {
    code: 'responsive-precedence-unverified',
    status: 'review',
    sourceName: 'fxFlexOffset.sm',
    input: {
      target: 'css',
      fileName: 'css-flex-offset-precedence.html',
      source: '<section fxLayout="row"><div fxFlexOffset.sm="10" fxFlexOffset.lt-md="20"></div></section>\n',
    },
  },
  {
    code: 'target-unsupported',
    status: 'unsupported',
    sourceName: 'fxFlexOffset.handset',
    input: {
      target: 'css',
      fileName: 'css-flex-offset-target.html',
      source: '<section fxLayout="row"><div fxFlexOffset.handset="10"></div></section>\n',
    },
  },
] as const satisfies readonly CompatibilityDiagnosticEvidence[];

const cssFlexOrderDiagnosticEvidence = [
  {
    code: 'bound-class',
    status: 'review',
    sourceName: 'fxFlexOrder',
    input: {
      target: 'css',
      fileName: 'css-flex-order-bound.html',
      source: '<div [class]="classes" fxFlexOrder="2"></div>\n',
    },
  },
  {
    code: 'dynamic-binding',
    status: 'review',
    sourceName: '[fxFlexOrder]',
    input: { target: 'css', fileName: 'css-flex-order-dynamic.html', source: '<div [fxFlexOrder]="order"></div>\n' },
  },
  {
    code: 'context-unverified',
    status: 'review',
    sourceName: 'fxFlexOrder',
    input: {
      target: 'css',
      fileName: 'css-flex-order-context.html',
      source: '<div fxFlexOrder="1" fxFlexOrder.handset="2"></div>\n',
    },
  },
  {
    code: 'responsive-precedence-unverified',
    status: 'review',
    sourceName: 'fxFlexOrder.sm',
    input: {
      target: 'css',
      fileName: 'css-flex-order-precedence.html',
      source: '<div fxFlexOrder.sm="1" fxFlexOrder.lt-md="2"></div>\n',
    },
  },
  {
    code: 'target-unsupported',
    status: 'unsupported',
    sourceName: 'fxFlexOrder.handset',
    input: { target: 'css', fileName: 'css-flex-order-target.html', source: '<div fxFlexOrder.handset="2"></div>\n' },
  },
] as const satisfies readonly CompatibilityDiagnosticEvidence[];

export const compatibilityReference = deepFreeze([
  {
    id: 'fxLayout',
    directiveFamily: 'Flex',
    category: 'flex',
    tailwind: 'limited',
    css: 'limited',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: [
          'Static direction values, including supported responsive suffixes, convert as one layout family.',
        ],
        limitedForms: [
          'Runtime values, custom or disabled breakpoints, conflicts, and unresolved family context stay unchanged.',
        ],
        exampleIds: ['static-flex', 'preserved-unresolved'],
        diagnosticCodes: flexDiagnostics,
        targetDifference: 'Tailwind CSS emits verified utility or arbitrary-value classes.',
      },
      css: {
        status: 'limited',
        supportedForms: [
          'Static direction values, including supported responsive suffixes, convert into generated rules.',
        ],
        limitedForms: [
          'Runtime or invalid values and unresolved family context stay unchanged; non-standard breakpoints are target-unsupported.',
        ],
        exampleIds: ['native-css-flex', 'native-css-flex-target-boundary'],
        diagnosticCodes: [
          'bound-class',
          'dynamic-binding',
          'invalid-value',
          'context-unverified',
          'responsive-precedence-unverified',
          'target-unsupported',
        ],
        diagnosticEvidence: cssLayoutDiagnosticEvidence,
        targetDifference:
          'Native CSS appends a deterministic flm-* class and tool-owned rule; an existing literal flex class is retained and is not treated as a class conflict.',
      },
    },
    evidence,
  },
  {
    id: 'fxLayoutAlign',
    directiveFamily: 'Flex',
    category: 'flex',
    tailwind: 'limited',
    css: 'limited',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static main-axis and cross-axis alignment values convert when layout context is proven.'],
        limitedForms: ['Dynamic values and alignment whose layout context is unresolved stay unchanged.'],
        exampleIds: ['static-flex', 'preserved-unresolved'],
        diagnosticCodes: flexDiagnostics,
        targetDifference: 'Tailwind CSS emits alignment utilities.',
      },
      css: {
        status: 'limited',
        supportedForms: ['Static main-axis and cross-axis alignment values convert when layout context is proven.'],
        limitedForms: [
          'Dynamic or invalid values and unresolved layout context stay unchanged; non-standard breakpoints are target-unsupported.',
        ],
        exampleIds: ['native-css-flex'],
        diagnosticCodes: [
          'bound-class',
          'dynamic-binding',
          'invalid-value',
          'context-unverified',
          'responsive-precedence-unverified',
          'target-unsupported',
        ],
        diagnosticEvidence: cssLayoutAlignDiagnosticEvidence,
        targetDifference: 'Native CSS emits alignment declarations in deterministic rules.',
      },
    },
    evidence,
  },
  {
    id: 'fxLayoutGap',
    directiveFamily: 'Flex',
    category: 'flex',
    tailwind: 'limited',
    css: 'limited',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static supported gap lengths convert when the complete layout family is safe.'],
        limitedForms: ['Grid-mode gaps, dynamic values, and unresolved family context stay unchanged.'],
        exampleIds: ['static-flex', 'preserved-unresolved'],
        diagnosticCodes: flexDiagnostics,
        targetDifference: 'Tailwind CSS emits gap utilities or verified arbitrary values.',
      },
      css: {
        status: 'limited',
        supportedForms: ['Static supported gap lengths convert when the complete layout family is safe.'],
        limitedForms: [
          'Grid-mode, dynamic, invalid, or unresolved-context gaps stay unchanged; non-standard breakpoints are target-unsupported.',
        ],
        exampleIds: ['native-css-flex'],
        diagnosticCodes: [
          'bound-class',
          'dynamic-binding',
          'invalid-value',
          'context-unverified',
          'responsive-precedence-unverified',
          'semantic-unsupported',
          'target-unsupported',
        ],
        diagnosticEvidence: cssLayoutGapDiagnosticEvidence,
        targetDifference: 'Native CSS emits gap declarations in deterministic rules.',
      },
    },
    evidence,
  },
  {
    id: 'fxFlex',
    directiveFamily: 'Flex',
    category: 'flex',
    tailwind: 'limited',
    css: 'limited',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: [
          'Static supported flex shorthand values convert atomically with same-breakpoint fxGrow and fxShrink modifiers.',
        ],
        limitedForms: ['Dynamic values, invalid shorthand, or incomplete dependent context stay unchanged.'],
        exampleIds: ['static-flex', 'preserved-unresolved'],
        diagnosticCodes: flexDiagnostics,
        targetDifference: 'Tailwind CSS emits a verified flex utility or arbitrary flex value.',
      },
      css: {
        status: 'limited',
        supportedForms: [
          'Static supported flex shorthand values convert atomically with same-breakpoint fxGrow and fxShrink modifiers.',
        ],
        limitedForms: [
          'Dynamic values, invalid shorthand, or incomplete dependent context stay unchanged; non-standard breakpoints are target-unsupported.',
        ],
        exampleIds: ['native-css-flex'],
        diagnosticCodes: [
          'bound-class',
          'dynamic-binding',
          'invalid-value',
          'context-unverified',
          'responsive-precedence-unverified',
          'target-unsupported',
        ],
        diagnosticEvidence: cssFlexDiagnosticEvidence,
        targetDifference: 'Native CSS emits a flex declaration in a deterministic rule.',
      },
    },
    evidence,
  },
  {
    id: 'fxGrow',
    directiveFamily: 'Flex',
    category: 'flex',
    tailwind: 'limited',
    css: 'limited',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['fxGrow converts only with fxFlex in the same base or responsive flex-item group.'],
        limitedForms: [
          'A standalone fxGrow is preserved with invalid-value; the flex-item family converts atomically or not at all.',
        ],
        exampleIds: ['static-flex', 'flex-item-atomicity'],
        diagnosticCodes: ['invalid-value', 'dynamic-binding', 'context-unverified', 'responsive-precedence-unverified'],
        targetDifference: 'Tailwind CSS folds the proven modifier into one flex class.',
      },
      css: {
        status: 'limited',
        supportedForms: ['fxGrow converts only with fxFlex in the same base or responsive flex-item group.'],
        limitedForms: [
          'A standalone fxGrow is preserved with invalid-value; the flex-item family converts atomically or not at all, and non-standard breakpoints are target-unsupported.',
        ],
        exampleIds: ['native-css-flex'],
        diagnosticCodes: [
          'bound-class',
          'dynamic-binding',
          'invalid-value',
          'context-unverified',
          'responsive-precedence-unverified',
          'target-unsupported',
        ],
        diagnosticEvidence: cssGrowDiagnosticEvidence,
        targetDifference: 'Native CSS folds the proven modifier into one generated flex declaration.',
      },
    },
    evidence,
  },
  {
    id: 'fxShrink',
    directiveFamily: 'Flex',
    category: 'flex',
    tailwind: 'limited',
    css: 'limited',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['fxShrink converts only with fxFlex in the same base or responsive flex-item group.'],
        limitedForms: [
          'A standalone fxShrink is preserved with invalid-value; the flex-item family converts atomically or not at all.',
        ],
        exampleIds: ['static-flex', 'flex-item-atomicity'],
        diagnosticCodes: ['invalid-value', 'dynamic-binding', 'context-unverified', 'responsive-precedence-unverified'],
        targetDifference: 'Tailwind CSS folds the proven modifier into one flex class.',
      },
      css: {
        status: 'limited',
        supportedForms: ['fxShrink converts only with fxFlex in the same base or responsive flex-item group.'],
        limitedForms: [
          'A standalone fxShrink is preserved with invalid-value; the flex-item family converts atomically or not at all, and non-standard breakpoints are target-unsupported.',
        ],
        exampleIds: ['native-css-flex'],
        diagnosticCodes: [
          'bound-class',
          'dynamic-binding',
          'invalid-value',
          'context-unverified',
          'responsive-precedence-unverified',
          'target-unsupported',
        ],
        diagnosticEvidence: cssShrinkDiagnosticEvidence,
        targetDifference: 'Native CSS folds the proven modifier into one generated flex declaration.',
      },
    },
    evidence,
  },
  {
    id: 'fxFlexAlign',
    directiveFamily: 'Flex',
    category: 'flex',
    tailwind: 'limited',
    css: 'limited',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static supported self-alignment values convert.'],
        limitedForms: ['Dynamic, invalid, conflicting, or unverified responsive forms stay unchanged.'],
        exampleIds: ['static-flex'],
        diagnosticCodes: flexDiagnostics,
        targetDifference: 'Tailwind CSS emits a self-alignment utility.',
      },
      css: {
        status: 'limited',
        supportedForms: ['Static supported self-alignment values convert.'],
        limitedForms: ['Dynamic or invalid forms stay unchanged; non-standard breakpoints are target-unsupported.'],
        exampleIds: ['native-css-flex'],
        diagnosticCodes: [
          'bound-class',
          'dynamic-binding',
          'invalid-value',
          'context-unverified',
          'responsive-precedence-unverified',
          'target-unsupported',
        ],
        diagnosticEvidence: cssFlexAlignDiagnosticEvidence,
        targetDifference: 'Native CSS emits align-self in a deterministic rule.',
      },
    },
    evidence,
  },
  {
    id: 'fxFlexFill',
    directiveFamily: 'Flex',
    category: 'flex',
    tailwind: 'limited',
    css: 'limited',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Unsuffixed fxFlexFill converts to the bounded fill declaration set.'],
        limitedForms: ['Conflicting class ownership and unsupported responsive semantics stay unchanged.'],
        exampleIds: ['static-flex'],
        diagnosticCodes: flexDiagnostics,
        targetDifference: 'Tailwind CSS emits the fill utility set.',
      },
      css: {
        status: 'limited',
        supportedForms: ['Unsuffixed fxFlexFill converts to the bounded fill declaration set.'],
        limitedForms: [
          'Bound class ownership and unresolved families stay unchanged; non-standard breakpoints are target-unsupported.',
        ],
        exampleIds: ['native-css-flex'],
        diagnosticCodes: ['bound-class', 'dynamic-binding', 'context-unverified', 'target-unsupported'],
        diagnosticEvidence: cssFlexFillDiagnosticEvidence,
        targetDifference: 'Native CSS emits the fill declaration set in a deterministic rule.',
      },
    },
    evidence,
  },
  {
    id: 'fxFill',
    directiveFamily: 'Flex',
    category: 'flex',
    tailwind: 'limited',
    css: 'limited',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Unsuffixed fxFill is the non-responsive alias of fxFlexFill.'],
        limitedForms: ['This reference does not claim responsive fxFill suffixes as supported.'],
        exampleIds: ['static-flex'],
        diagnosticCodes: ['bound-class', 'class-conflict', 'semantic-unsupported'],
        targetDifference: 'Tailwind CSS emits the fill utility set for the unsuffixed alias.',
      },
      css: {
        status: 'limited',
        supportedForms: ['Unsuffixed fxFill is the non-responsive alias of fxFlexFill.'],
        limitedForms: ['This reference does not claim responsive fxFill suffixes as supported.'],
        exampleIds: ['native-css-flex'],
        diagnosticCodes: ['bound-class', 'dynamic-binding', 'context-unverified', 'target-unsupported'],
        diagnosticEvidence: cssFillDiagnosticEvidence,
        targetDifference: 'Native CSS emits the fill declaration set for the unsuffixed alias.',
      },
    },
    evidence,
  },
  {
    id: 'fxFlexOffset',
    directiveFamily: 'Flex',
    category: 'flex',
    tailwind: 'limited',
    css: 'limited',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static supported percentage and length offsets convert when direction context is proven.'],
        limitedForms: ['Dynamic values and offsets without proven direction context stay unchanged.'],
        exampleIds: ['static-flex'],
        diagnosticCodes: flexDiagnostics,
        targetDifference: 'Tailwind CSS emits the direction-appropriate margin utility.',
      },
      css: {
        status: 'limited',
        supportedForms: ['Static supported percentage and length offsets convert when direction context is proven.'],
        limitedForms: [
          'Dynamic or invalid offsets and unproven direction context stay unchanged; non-standard breakpoints are target-unsupported.',
        ],
        exampleIds: ['native-css-flex'],
        diagnosticCodes: [
          'bound-class',
          'dynamic-binding',
          'invalid-value',
          'context-unverified',
          'responsive-precedence-unverified',
          'target-unsupported',
        ],
        diagnosticEvidence: cssFlexOffsetDiagnosticEvidence,
        targetDifference: 'Native CSS emits the direction-appropriate logical margin declaration.',
      },
    },
    evidence,
  },
  {
    id: 'fxFlexOrder',
    directiveFamily: 'Flex',
    category: 'flex',
    tailwind: 'limited',
    css: 'limited',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static supported integer order values convert.'],
        limitedForms: ['Dynamic, invalid, conflicting, or unverified responsive forms stay unchanged.'],
        exampleIds: ['static-flex'],
        diagnosticCodes: flexDiagnostics,
        targetDifference: 'Tailwind CSS emits an order utility or verified arbitrary order value.',
      },
      css: {
        status: 'limited',
        supportedForms: ['Static supported integer order values convert.'],
        limitedForms: ['Dynamic forms stay unchanged; non-standard breakpoints are target-unsupported.'],
        exampleIds: ['native-css-flex'],
        diagnosticCodes: [
          'bound-class',
          'dynamic-binding',
          'context-unverified',
          'responsive-precedence-unverified',
          'target-unsupported',
        ],
        diagnosticEvidence: cssFlexOrderDiagnosticEvidence,
        targetDifference: 'Native CSS emits order in a deterministic rule.',
      },
    },
    evidence,
  },
  {
    id: 'fxShow',
    directiveFamily: 'Visibility',
    category: 'visibility',
    tailwind: 'limited',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static visibility families convert only when the visible display value is proven.'],
        limitedForms: ['Dynamic, conflicting, or ambiguous display restoration stays unchanged.'],
        exampleIds: [],
        diagnosticCodes: [
          'bound-class',
          'class-conflict',
          'breakpoint-unverified',
          'custom-breakpoint',
          'dynamic-binding',
          'display-restoration-unverified',
          'responsive-precedence-unverified',
        ],
        targetDifference: 'Tailwind CSS can express proven hide and display-restoration classes.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert visibility directives.'],
        limitedForms: ['Recognized fxShow inputs stay unchanged for manual migration.'],
        exampleIds: [],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported and emits no stylesheet rule for this family.',
      },
    },
    evidence,
  },
  {
    id: 'fxHide',
    directiveFamily: 'Visibility',
    category: 'visibility',
    tailwind: 'limited',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static hide families convert when breakpoint precedence and display restoration are proven.'],
        limitedForms: ['Dynamic, conflicting, or ambiguous display restoration stays unchanged.'],
        exampleIds: ['visibility'],
        diagnosticCodes: [
          'bound-class',
          'class-conflict',
          'breakpoint-unverified',
          'custom-breakpoint',
          'dynamic-binding',
          'display-restoration-unverified',
          'responsive-precedence-unverified',
        ],
        targetDifference: 'Tailwind CSS emits proven visibility classes.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert visibility directives.'],
        limitedForms: ['Recognized fxHide inputs stay unchanged for manual migration.'],
        exampleIds: ['native-css-boundaries'],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported and emits no stylesheet rule for this family.',
      },
    },
    evidence,
  },
  {
    id: 'gdAlignColumns',
    directiveFamily: 'Grid',
    category: 'grid',
    tailwind: 'limited',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static supported column alignment values convert.'],
        limitedForms: ['Dynamic, invalid, conflicting, or unverified responsive forms stay unchanged.'],
        exampleIds: ['grid'],
        diagnosticCodes: gridDiagnostics,
        targetDifference: 'Tailwind CSS emits Grid alignment classes.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert Grid directives.'],
        limitedForms: ['Recognized gdAlignColumns inputs stay unchanged.'],
        exampleIds: [],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported for Grid.',
      },
    },
    evidence,
  },
  {
    id: 'gdAlignRows',
    directiveFamily: 'Grid',
    category: 'grid',
    tailwind: 'limited',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static supported row alignment values convert.'],
        limitedForms: ['Dynamic, invalid, conflicting, or unverified responsive forms stay unchanged.'],
        exampleIds: ['grid'],
        diagnosticCodes: gridDiagnostics,
        targetDifference: 'Tailwind CSS emits Grid alignment classes.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert Grid directives.'],
        limitedForms: ['Recognized gdAlignRows inputs stay unchanged.'],
        exampleIds: [],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported for Grid.',
      },
    },
    evidence,
  },
  {
    id: 'gdArea',
    directiveFamily: 'Grid',
    category: 'grid',
    tailwind: 'limited',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static supported grid-area values convert.'],
        limitedForms: ['Dynamic, invalid, conflicting, or unverified responsive forms stay unchanged.'],
        exampleIds: ['grid'],
        diagnosticCodes: gridDiagnostics,
        targetDifference: 'Tailwind CSS emits a verified arbitrary grid-area class.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert Grid directives.'],
        limitedForms: ['Recognized gdArea inputs stay unchanged.'],
        exampleIds: [],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported for Grid.',
      },
    },
    evidence,
  },
  {
    id: 'gdAreas',
    directiveFamily: 'Grid',
    category: 'grid',
    tailwind: 'limited',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static supported grid-template-area rows convert.'],
        limitedForms: ['Dynamic, malformed, conflicting, or unverified responsive forms stay unchanged.'],
        exampleIds: ['grid'],
        diagnosticCodes: gridDiagnostics,
        targetDifference: 'Tailwind CSS emits a verified arbitrary grid-template-areas class.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert Grid directives.'],
        limitedForms: ['Recognized gdAreas inputs stay unchanged.'],
        exampleIds: [],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported for Grid.',
      },
    },
    evidence,
  },
  {
    id: 'gdAuto',
    directiveFamily: 'Grid',
    category: 'grid',
    tailwind: 'limited',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static supported grid-auto-flow values convert.'],
        limitedForms: ['Dynamic, invalid, conflicting, or unverified responsive forms stay unchanged.'],
        exampleIds: ['grid'],
        diagnosticCodes: gridDiagnostics,
        targetDifference: 'Tailwind CSS emits a verified arbitrary grid-auto-flow class.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert Grid directives.'],
        limitedForms: ['Recognized gdAuto inputs stay unchanged.'],
        exampleIds: [],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported for Grid.',
      },
    },
    evidence,
  },
  {
    id: 'gdColumn',
    directiveFamily: 'Grid',
    category: 'grid',
    tailwind: 'limited',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static supported grid-column values convert.'],
        limitedForms: ['Dynamic, invalid, conflicting, or unverified responsive forms stay unchanged.'],
        exampleIds: ['grid'],
        diagnosticCodes: gridDiagnostics,
        targetDifference: 'Tailwind CSS emits a verified arbitrary grid-column class.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert Grid directives.'],
        limitedForms: ['Recognized gdColumn inputs stay unchanged.'],
        exampleIds: [],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported for Grid.',
      },
    },
    evidence,
  },
  {
    id: 'gdColumns',
    directiveFamily: 'Grid',
    category: 'grid',
    tailwind: 'limited',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: [
          'Static supported grid-template-columns values convert, including configured standard responsive suffixes.',
        ],
        limitedForms: ['Dynamic, invalid, conflicting, custom, or disabled breakpoint forms stay unchanged.'],
        exampleIds: ['grid'],
        diagnosticCodes: gridDiagnostics,
        targetDifference: 'Tailwind CSS emits Grid display and a verified template-columns class.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert Grid directives.'],
        limitedForms: ['Recognized gdColumns inputs stay unchanged and produce no CSS rule.'],
        exampleIds: ['native-css-boundaries'],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported for Grid.',
      },
    },
    evidence,
  },
  {
    id: 'gdGap',
    directiveFamily: 'Grid',
    category: 'grid',
    tailwind: 'limited',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static supported grid-gap values convert.'],
        limitedForms: ['Dynamic, invalid, conflicting, or unverified responsive forms stay unchanged.'],
        exampleIds: ['grid'],
        diagnosticCodes: gridDiagnostics,
        targetDifference: 'Tailwind CSS emits a verified grid-gap class.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert Grid directives.'],
        limitedForms: ['Recognized gdGap inputs stay unchanged.'],
        exampleIds: [],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported for Grid.',
      },
    },
    evidence,
  },
  {
    id: 'gdGridAlign',
    directiveFamily: 'Grid',
    category: 'grid',
    tailwind: 'limited',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static supported grid-item alignment values convert.'],
        limitedForms: ['Dynamic, invalid, conflicting, or unverified responsive forms stay unchanged.'],
        exampleIds: ['grid'],
        diagnosticCodes: gridDiagnostics,
        targetDifference: 'Tailwind CSS emits Grid item alignment classes.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert Grid directives.'],
        limitedForms: ['Recognized gdGridAlign inputs stay unchanged.'],
        exampleIds: [],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported for Grid.',
      },
    },
    evidence,
  },
  {
    id: 'gdInline',
    directiveFamily: 'Grid',
    category: 'grid',
    tailwind: 'limited',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['The static unsuffixed gdInline form converts.'],
        limitedForms: ['Dynamic, conflicting, or unverified responsive forms stay unchanged.'],
        exampleIds: ['grid'],
        diagnosticCodes: gridDiagnostics,
        targetDifference: 'Tailwind CSS emits inline-grid.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert Grid directives.'],
        limitedForms: ['Recognized gdInline inputs stay unchanged.'],
        exampleIds: [],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported for Grid.',
      },
    },
    evidence,
  },
  {
    id: 'gdRow',
    directiveFamily: 'Grid',
    category: 'grid',
    tailwind: 'limited',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static supported grid-row values convert.'],
        limitedForms: ['Dynamic, invalid, conflicting, or unverified responsive forms stay unchanged.'],
        exampleIds: ['grid'],
        diagnosticCodes: gridDiagnostics,
        targetDifference: 'Tailwind CSS emits a verified arbitrary grid-row class.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert Grid directives.'],
        limitedForms: ['Recognized gdRow inputs stay unchanged.'],
        exampleIds: [],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported for Grid.',
      },
    },
    evidence,
  },
  {
    id: 'gdRows',
    directiveFamily: 'Grid',
    category: 'grid',
    tailwind: 'limited',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: ['Static supported grid-template-rows values convert.'],
        limitedForms: ['Dynamic, invalid, conflicting, or unverified responsive forms stay unchanged.'],
        exampleIds: ['grid'],
        diagnosticCodes: gridDiagnostics,
        targetDifference: 'Tailwind CSS emits Grid display and a verified template-rows class.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert Grid directives.'],
        limitedForms: ['Recognized gdRows inputs stay unchanged.'],
        exampleIds: [],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported for Grid.',
      },
    },
    evidence,
  },
  {
    id: 'class',
    directiveFamily: 'Class/style',
    category: 'responsive-class-style',
    tailwind: 'preserved',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'preserved',
        supportedForms: ['No direct class.<breakpoint> conversion is claimed.'],
        limitedForms: ['Recognized responsive class inputs stay unchanged for manual migration.'],
        exampleIds: [],
        diagnosticCodes: [
          'semantic-unsupported',
          'dynamic-binding',
          'context-unverified',
          'custom-breakpoint',
          'breakpoint-unverified',
        ],
        targetDifference:
          'Tailwind CSS conversion is implemented for bounded ngClass responsive families, not direct class bindings.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert responsive class directives.'],
        limitedForms: ['Recognized class.<breakpoint> inputs stay unchanged.'],
        exampleIds: [],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported for responsive class/style.',
      },
    },
    evidence,
  },
  {
    id: 'ngClass',
    directiveFamily: 'Class/style',
    category: 'responsive-class-style',
    tailwind: 'limited',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: [
          'Complete literal responsive families whose every token is a verified Tailwind CSS v4 candidate convert atomically.',
        ],
        limitedForms: [
          'Bound, conflicting, custom, disabled, overlapping, semantically unsupported, or unverified-token families stay unchanged.',
        ],
        exampleIds: ['responsive-class-style'],
        diagnosticCodes: classDiagnostics,
        targetDifference: 'Tailwind CSS emits arbitrary media variants for the complete proven family.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert responsive class directives.'],
        limitedForms: ['Recognized ngClass responsive inputs stay unchanged and produce no CSS rule.'],
        exampleIds: ['native-css-boundaries'],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported for responsive class/style.',
      },
    },
    evidence,
  },
  {
    id: 'style',
    directiveFamily: 'Class/style',
    category: 'responsive-class-style',
    tailwind: 'preserved',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'preserved',
        supportedForms: ['No direct style.<property>.<breakpoint> conversion is claimed.'],
        limitedForms: ['Recognized responsive style inputs stay unchanged for manual migration.'],
        exampleIds: [],
        diagnosticCodes: [
          'semantic-unsupported',
          'dynamic-binding',
          'context-unverified',
          'custom-breakpoint',
          'breakpoint-unverified',
        ],
        targetDifference:
          'Tailwind CSS conversion is implemented for bounded ngStyle responsive families, not direct style bindings.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert responsive style directives.'],
        limitedForms: ['Recognized style responsive inputs stay unchanged.'],
        exampleIds: [],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported for responsive class/style.',
      },
    },
    evidence,
  },
  {
    id: 'ngStyle',
    directiveFamily: 'Class/style',
    category: 'responsive-class-style',
    tailwind: 'limited',
    css: 'preserved',
    targetDetails: {
      tailwind: {
        status: 'limited',
        supportedForms: [
          'Complete literal responsive families with sanitizer-safe declaration lists convert atomically.',
        ],
        limitedForms: [
          'Bound, conflicting, custom, disabled, overlapping, semantically unsupported, or unsafe-value families stay unchanged.',
        ],
        exampleIds: ['responsive-class-style'],
        diagnosticCodes: styleDiagnostics,
        targetDifference: 'Tailwind CSS emits arbitrary media variants containing sanitized declarations.',
      },
      css: {
        status: 'preserved',
        supportedForms: ['Native CSS does not automatically convert responsive style directives.'],
        limitedForms: ['Recognized ngStyle responsive inputs stay unchanged and produce no CSS rule.'],
        exampleIds: ['native-css-boundaries'],
        diagnosticCodes: ['target-unsupported'],
        targetDifference: 'Native CSS reports target-unsupported for responsive class/style.',
      },
    },
    evidence,
  },
  {
    id: 'imgSrc',
    directiveFamily: 'Image',
    category: 'images',
    tailwind: 'not-applicable',
    css: 'not-applicable',
    targetDetails: {
      tailwind: {
        status: 'not-applicable',
        supportedForms: [
          'Responsive imgSrc is handled by the separate opt-in responsive-image path, not the Tailwind target renderer.',
        ],
        limitedForms: ['Without that opt-in, recognized responsive image inputs stay unchanged.'],
        exampleIds: [],
        diagnosticCodes: [
          'target-unsupported',
          'dynamic-binding',
          'invalid-value',
          'context-unverified',
          'custom-breakpoint',
          'breakpoint-unverified',
          'responsive-precedence-unverified',
        ],
        targetDifference: 'Tailwind selection does not itself enable responsive-image rewriting.',
      },
      css: {
        status: 'not-applicable',
        supportedForms: [
          'Responsive imgSrc is handled by the separate opt-in responsive-image path, not the Native CSS target renderer.',
        ],
        limitedForms: ['Without that opt-in, recognized responsive image inputs stay unchanged.'],
        exampleIds: [],
        diagnosticCodes: [
          'target-unsupported',
          'dynamic-binding',
          'invalid-value',
          'context-unverified',
          'custom-breakpoint',
          'breakpoint-unverified',
          'responsive-precedence-unverified',
        ],
        targetDifference: 'Native CSS selection does not itself enable responsive-image rewriting.',
      },
    },
    evidence,
  },
] as const satisfies readonly CompatibilityEntry[]);
