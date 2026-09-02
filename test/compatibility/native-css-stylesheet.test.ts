import { CssArtifactRegistry } from '../../src/adapter/css/css-artifact.registry';
import type {
  CssDeclaration,
  CssRuleContext,
  CssSemanticFamily,
  OwnedCssRule,
} from '../../src/adapter/css/css-artifact.model';
import { cssRuleContext } from '../../src/adapter/css/css-breakpoint.context';
import { renderFlexAlignCss } from '../../src/adapter/css/flex/flex-align.css-renderer';
import { renderLayoutGapCss } from '../../src/adapter/css/flex/layout-gap.css-renderer';
import { renderLayoutCss } from '../../src/adapter/css/flex/layout.css-renderer';
import { parseOwnedCssBlock } from '../../src/adapter/css/stylesheet/owned-css-block.parser';
import { serializeOwnedCssBlock } from '../../src/adapter/css/stylesheet/owned-css-block.serializer';
import { mergeOwnedStylesheet } from '../../src/adapter/css/stylesheet/owned-stylesheet.merger';
import { BreakpointCatalog, type BreakpointDefinition } from '../../src/breakpoint/breakpoint-catalog';
import { planFlexAlignSemantics } from '../../src/flex/flex-align.semantic';
import { planLayoutGapSemantics } from '../../src/flex/layout-gap.semantic';
import { parseLayout } from '../../src/flex/layout.semantic';

const standardAliases = [
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
] as const;

const expectedRuleIds = [
  '6ae331818e3189b1bd4ceb90a8d7bc3b29b6f46b32ed0eea16fd2e0ff126dbd9',
  'dd734cc26a3c6c947f23cd39b3659737b0384708eeb3ee57b0b828df93090c90',
  'a0e5e9dd7330c10550dec6d418fdc28735d26f62f476b866383a6460cf6f2391',
  '63a9a63be732726b9073b2108fd32f562e1352ba19a3e2f90b3a48efe530a7cc',
  'ea87caa74386649cdf2b9ab42ba8f392ba16d6190fc3838d8438b333edecbf3c',
  '415c9233ba1b7e91a83321ebeebf75d7f67872bd7e2ac1060d4b9cc0315aaa41',
  'bd8c772ff3e0227febf73568da0bae5a29ff00f1ca61b4a3002e8675df9feeb9',
  '83e28dfc2f65e4bd2791946071873d8dc5ccfd666687da2f31fb3c050bcc0e59',
  'a0f5eac60e36b339300f6432e08209812dd2f33624e7bf84a1ef180c1b740631',
  '6214ed08ab887f9bf96da06acfaf94b0b57c71c736700bcacd7c9b06d550c5fc',
  '5db569964d7005fb7f43670e7b3717a9383141a116aa726650e687064263308e',
  'b2da7c7d7c270a15fb6a23bb497458d693e0e1cc81b4c35dd004778d3d911d63',
  '2943bb442fafabc50683021038fa1b94f758c725ca4093a83f9fc79aebcddba9',
  'd931799d6cdf205a3ba45bbeefc6b29adaf93a6aab3cabdd17b794184df3653d',
  'bc74dea29e0d48899caea3b580821fec03ffa1c075259a3c57908dff0ee8d802',
] as const;

const handwrittenPrefix = '/* handwritten prefix */\n.page { color: rebeccapurple; }\n\n';
const handwrittenSuffix = '\n\n/* handwritten suffix */\n.note::before { content: "kept"; }\n';

const goldenStylesheet = `/* handwritten prefix */
.page { color: rebeccapurple; }

/* flex-layout-codemod:start schema=1 */
/* flex-layout-codemod:rule id=6ae331818e3189b1bd4ceb90a8d7bc3b29b6f46b32ed0eea16fd2e0ff126dbd9 */
.flm-6ae331818e3189b1bd4ceb90a8d7bc3b29b6f46b32ed0eea16fd2e0ff126dbd9 {
  display: flex;
  box-sizing: border-box;
  flex-direction: row;
  flex-wrap: wrap;
}
@media screen and (min-width: 0px) and (max-width: 599.98px) {
  /* flex-layout-codemod:rule id=dd734cc26a3c6c947f23cd39b3659737b0384708eeb3ee57b0b828df93090c90 */
  .flm-dd734cc26a3c6c947f23cd39b3659737b0384708eeb3ee57b0b828df93090c90 {
    gap: 8px;
  }
}
@media screen and (max-width: 599.98px) {
  /* flex-layout-codemod:rule id=a0e5e9dd7330c10550dec6d418fdc28735d26f62f476b866383a6460cf6f2391 */
  .flm-a0e5e9dd7330c10550dec6d418fdc28735d26f62f476b866383a6460cf6f2391 {
    gap: 8px;
  }
}
@media screen and (min-width: 600px) and (max-width: 959.98px) {
  /* flex-layout-codemod:rule id=63a9a63be732726b9073b2108fd32f562e1352ba19a3e2f90b3a48efe530a7cc */
  .flm-63a9a63be732726b9073b2108fd32f562e1352ba19a3e2f90b3a48efe530a7cc {
    gap: 8px;
  }
  /* flex-layout-codemod:rule id=ea87caa74386649cdf2b9ab42ba8f392ba16d6190fc3838d8438b333edecbf3c */
  .flm-ea87caa74386649cdf2b9ab42ba8f392ba16d6190fc3838d8438b333edecbf3c {
    align-self: center;
  }
}
@media screen and (max-width: 959.98px) {
  /* flex-layout-codemod:rule id=415c9233ba1b7e91a83321ebeebf75d7f67872bd7e2ac1060d4b9cc0315aaa41 */
  .flm-415c9233ba1b7e91a83321ebeebf75d7f67872bd7e2ac1060d4b9cc0315aaa41 {
    gap: 8px;
  }
}
@media screen and (min-width: 960px) and (max-width: 1279.98px) {
  /* flex-layout-codemod:rule id=bd8c772ff3e0227febf73568da0bae5a29ff00f1ca61b4a3002e8675df9feeb9 */
  .flm-bd8c772ff3e0227febf73568da0bae5a29ff00f1ca61b4a3002e8675df9feeb9 {
    gap: 8px;
  }
}
@media screen and (max-width: 1279.98px) {
  /* flex-layout-codemod:rule id=83e28dfc2f65e4bd2791946071873d8dc5ccfd666687da2f31fb3c050bcc0e59 */
  .flm-83e28dfc2f65e4bd2791946071873d8dc5ccfd666687da2f31fb3c050bcc0e59 {
    gap: 8px;
  }
}
@media screen and (min-width: 1280px) and (max-width: 1919.98px) {
  /* flex-layout-codemod:rule id=a0f5eac60e36b339300f6432e08209812dd2f33624e7bf84a1ef180c1b740631 */
  .flm-a0f5eac60e36b339300f6432e08209812dd2f33624e7bf84a1ef180c1b740631 {
    gap: 8px;
  }
}
@media screen and (max-width: 1919.98px) {
  /* flex-layout-codemod:rule id=6214ed08ab887f9bf96da06acfaf94b0b57c71c736700bcacd7c9b06d550c5fc */
  .flm-6214ed08ab887f9bf96da06acfaf94b0b57c71c736700bcacd7c9b06d550c5fc {
    gap: 8px;
  }
}
@media screen and (min-width: 1920px) and (max-width: 4999.98px) {
  /* flex-layout-codemod:rule id=5db569964d7005fb7f43670e7b3717a9383141a116aa726650e687064263308e */
  .flm-5db569964d7005fb7f43670e7b3717a9383141a116aa726650e687064263308e {
    gap: 8px;
  }
}
@media screen and (min-width: 1920px) {
  /* flex-layout-codemod:rule id=b2da7c7d7c270a15fb6a23bb497458d693e0e1cc81b4c35dd004778d3d911d63 */
  .flm-b2da7c7d7c270a15fb6a23bb497458d693e0e1cc81b4c35dd004778d3d911d63 {
    gap: 8px;
  }
}
@media screen and (min-width: 1280px) {
  /* flex-layout-codemod:rule id=2943bb442fafabc50683021038fa1b94f758c725ca4093a83f9fc79aebcddba9 */
  .flm-2943bb442fafabc50683021038fa1b94f758c725ca4093a83f9fc79aebcddba9 {
    gap: 8px;
  }
}
@media screen and (min-width: 960px) {
  /* flex-layout-codemod:rule id=d931799d6cdf205a3ba45bbeefc6b29adaf93a6aab3cabdd17b794184df3653d */
  .flm-d931799d6cdf205a3ba45bbeefc6b29adaf93a6aab3cabdd17b794184df3653d {
    gap: 8px;
  }
}
@media screen and (min-width: 600px) {
  /* flex-layout-codemod:rule id=bc74dea29e0d48899caea3b580821fec03ffa1c075259a3c57908dff0ee8d802 */
  .flm-bc74dea29e0d48899caea3b580821fec03ffa1c075259a3c57908dff0ee8d802 {
    gap: 8px;
  }
}
/* flex-layout-codemod:end */

/* handwritten suffix */
.note::before { content: "kept"; }
`;

const smallerGoldenStylesheet = `/* handwritten prefix */
.page { color: rebeccapurple; }

/* flex-layout-codemod:start schema=1 */
/* flex-layout-codemod:rule id=6ae331818e3189b1bd4ceb90a8d7bc3b29b6f46b32ed0eea16fd2e0ff126dbd9 */
.flm-6ae331818e3189b1bd4ceb90a8d7bc3b29b6f46b32ed0eea16fd2e0ff126dbd9 {
  display: flex;
  box-sizing: border-box;
  flex-direction: row;
  flex-wrap: wrap;
}
@media screen and (min-width: 600px) and (max-width: 959.98px) {
  /* flex-layout-codemod:rule id=63a9a63be732726b9073b2108fd32f562e1352ba19a3e2f90b3a48efe530a7cc */
  .flm-63a9a63be732726b9073b2108fd32f562e1352ba19a3e2f90b3a48efe530a7cc {
    gap: 8px;
  }
  /* flex-layout-codemod:rule id=ea87caa74386649cdf2b9ab42ba8f392ba16d6190fc3838d8438b333edecbf3c */
  .flm-ea87caa74386649cdf2b9ab42ba8f392ba16d6190fc3838d8438b333edecbf3c {
    align-self: center;
  }
}
/* flex-layout-codemod:end */

/* handwritten suffix */
.note::before { content: "kept"; }
`;

interface ScenarioArtifact {
  readonly label: string;
  readonly family: CssSemanticFamily;
  readonly declarations: readonly CssDeclaration[];
  readonly context: CssRuleContext;
}

function plannedLayoutDeclarations(): readonly CssDeclaration[] {
  const planned = parseLayout('row wrap');
  if (!planned.ok) throw new Error('Expected planned layout semantics');
  return renderLayoutCss(planned.value);
}

function plannedGapDeclarations(): readonly CssDeclaration[] {
  const planned = planLayoutGapSemantics('8px', 'row');
  if (planned.status !== 'planned') throw new Error('Expected planned layout gap semantics');
  return renderLayoutGapCss(planned.value);
}

function plannedAlignmentDeclarations(): readonly CssDeclaration[] {
  const planned = planFlexAlignSemantics('center');
  if (planned.status !== 'planned') throw new Error('Expected planned flex alignment semantics');
  return renderFlexAlignCss(planned.value);
}

function verifiedDefinition(catalog: BreakpointCatalog, alias: string): BreakpointDefinition {
  const classification = catalog.classify(alias);
  if (classification.kind !== 'verified') throw new Error(`Expected ${alias} to be a verified breakpoint`);
  return classification.definition;
}

function scenarioArtifacts(): readonly ScenarioArtifact[] {
  const catalog = new BreakpointCatalog();
  const gap = plannedGapDeclarations();
  const responsive = standardAliases.map(alias => ({
    label: alias,
    family: 'layout-gap' as const,
    declarations: gap,
    context: cssRuleContext(verifiedDefinition(catalog, alias)),
  }));
  const smContext = cssRuleContext(verifiedDefinition(catalog, 'sm'));

  return [
    { label: 'base', family: 'layout', declarations: plannedLayoutDeclarations(), context: cssRuleContext() },
    ...responsive,
    {
      label: 'sm-align',
      family: 'flex-align',
      declarations: plannedAlignmentDeclarations(),
      context: smContext,
    },
  ];
}

function buildScenario(
  direction: 'forward' | 'reverse' = 'forward',
  includedLabels?: ReadonlySet<string>,
): {
  readonly registry: CssArtifactRegistry;
  readonly labelById: ReadonlyMap<string, string>;
} {
  const registry = new CssArtifactRegistry();
  const labelById = new Map<string, string>();
  const selected = scenarioArtifacts().filter(artifact => includedLabels?.has(artifact.label) ?? true);
  const artifacts = direction === 'reverse' ? [...selected].reverse() : selected;

  for (const artifact of artifacts) {
    const rule = registry.register(artifact.family, artifact.declarations, artifact.context);
    labelById.set(rule.id, artifact.label);
  }

  return { registry, labelById };
}

function orderedLabels(rules: readonly OwnedCssRule[], labelById: ReadonlyMap<string, string>): readonly string[] {
  return rules.map(rule => labelById.get(rule.id) ?? 'missing');
}

describe('native CSS stylesheet end-to-end compatibility', () => {
  test('keeps all 14 catalog contexts, stable IDs, and registry order independent of registration order', () => {
    const forward = buildScenario();
    const reverse = buildScenario('reverse');
    const forwardRules = forward.registry.rules();
    const reverseRules = reverse.registry.rules();
    const expectedLabels = [
      'base',
      'xs',
      'lt-sm',
      'sm',
      'sm-align',
      'lt-md',
      'md',
      'lt-lg',
      'lg',
      'lt-xl',
      'xl',
      'gt-lg',
      'gt-md',
      'gt-sm',
      'gt-xs',
    ];

    expect(forwardRules.map(rule => rule.id)).toEqual(expectedRuleIds);
    expect(reverseRules.map(rule => rule.id)).toEqual(expectedRuleIds);
    expect(orderedLabels(forwardRules, forward.labelById)).toEqual(expectedLabels);
    expect(orderedLabels(reverseRules, reverse.labelById)).toEqual(expectedLabels);
    expect(forwardRules.map(rule => rule.context)).toEqual([
      { priority: 0 },
      { priority: 1000, media: { type: 'screen', clauses: [{ min: 0, max: 599.98 }] } },
      { priority: 950, media: { type: 'screen', clauses: [{ max: 599.98 }] } },
      { priority: 900, media: { type: 'screen', clauses: [{ min: 600, max: 959.98 }] } },
      { priority: 900, media: { type: 'screen', clauses: [{ min: 600, max: 959.98 }] } },
      { priority: 850, media: { type: 'screen', clauses: [{ max: 959.98 }] } },
      { priority: 800, media: { type: 'screen', clauses: [{ min: 960, max: 1279.98 }] } },
      { priority: 750, media: { type: 'screen', clauses: [{ max: 1279.98 }] } },
      { priority: 700, media: { type: 'screen', clauses: [{ min: 1280, max: 1919.98 }] } },
      { priority: 650, media: { type: 'screen', clauses: [{ max: 1919.98 }] } },
      { priority: 600, media: { type: 'screen', clauses: [{ min: 1920, max: 4999.98 }] } },
      { priority: -650, media: { type: 'screen', clauses: [{ min: 1920 }] } },
      { priority: -750, media: { type: 'screen', clauses: [{ min: 1280 }] } },
      { priority: -850, media: { type: 'screen', clauses: [{ min: 960 }] } },
      { priority: -950, media: { type: 'screen', clauses: [{ min: 600 }] } },
    ]);
  });

  test('merges one exact grouped golden stylesheet, preserves bytes, parses its range, and is idempotent', () => {
    const full = buildScenario();
    const previous = buildScenario('forward', new Set(['base']));
    const existing = handwrittenPrefix + serializeOwnedCssBlock(previous.registry.rules(), '\n') + handwrittenSuffix;
    const merged = mergeOwnedStylesheet(existing, full.registry.rules());

    expect(merged).toEqual({ changed: true, output: goldenStylesheet });
    expect(merged.output.startsWith(handwrittenPrefix)).toBe(true);
    expect(merged.output.endsWith(handwrittenSuffix)).toBe(true);
    expect(merged.output.match(/^@media /gmu)).toHaveLength(13);
    expect(
      merged.output.match(/^@media screen and \(min-width: 600px\) and \(max-width: 959\.98px\) \{/gmu),
    ).toHaveLength(1);
    expect(parseOwnedCssBlock(merged.output)).toEqual({
      status: 'found',
      range: { start: handwrittenPrefix.length, end: goldenStylesheet.length - handwrittenSuffix.length },
      newline: '\n',
    });
    expect(mergeOwnedStylesheet(merged.output, full.registry.rules())).toEqual({
      changed: false,
      output: goldenStylesheet,
    });
  });

  test('replaces the golden block with a smaller registry and removes ownership without changing surrounding bytes', () => {
    const smaller = buildScenario('forward', new Set(['base', 'sm', 'sm-align']));
    const shrunk = mergeOwnedStylesheet(goldenStylesheet, smaller.registry.rules());

    expect(shrunk).toEqual({ changed: true, output: smallerGoldenStylesheet });
    expect(shrunk.output.startsWith(handwrittenPrefix)).toBe(true);
    expect(shrunk.output.endsWith(handwrittenSuffix)).toBe(true);
    expect(mergeOwnedStylesheet(shrunk.output, [])).toEqual({
      changed: true,
      output: handwrittenPrefix + handwrittenSuffix,
    });
  });

  test('emits the same golden bytes when all artifacts are registered in reverse order', () => {
    const reverse = buildScenario('reverse');
    const previous = buildScenario('forward', new Set(['base']));
    const existing = handwrittenPrefix + serializeOwnedCssBlock(previous.registry.rules(), '\n') + handwrittenSuffix;

    expect(mergeOwnedStylesheet(existing, reverse.registry.rules())).toEqual({
      changed: true,
      output: goldenStylesheet,
    });
  });

  test.each([
    {
      label: 'unsupported schema',
      source: '/* flex-layout-codemod:start schema=2 *//* flex-layout-codemod:end */',
      code: 'unsupported-ownership-schema',
    },
    {
      label: 'different rule selector ID',
      source: `/* flex-layout-codemod:start schema=1 */
/* flex-layout-codemod:rule id=${'a'.repeat(64)} */
.flm-${'b'.repeat(64)} {}
/* flex-layout-codemod:end */`,
      code: 'ownership-rule-mismatch',
    },
    {
      label: 'rule ID used only as a selector prefix',
      source: `/* flex-layout-codemod:start schema=1 */
/* flex-layout-codemod:rule id=${'a'.repeat(64)} */
.flm-${'a'.repeat(64)}0 {}
/* flex-layout-codemod:end */`,
      code: 'ownership-rule-mismatch',
    },
  ] as const)('rejects $label in the final ownership corruption matrix', ({ source, code }) => {
    expect(parseOwnedCssBlock(source)).toEqual(expect.objectContaining({ status: 'invalid', code }));
  });
});
