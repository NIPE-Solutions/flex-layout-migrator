import { allBreakpointDefinitions } from '../breakpoint/breakpoint-catalog';
import { cssRuleContext } from '../adapter/css/css-breakpoint.context';
import type { OwnedCssRule } from '../adapter/css/css-artifact.model';
import {
  mergeOwnedStylesheet,
  type OwnedCssReferences,
  type OwnedStylesheetMergeResult,
  type RetainedMediaContextResolver,
} from '../adapter/css/stylesheet/owned-stylesheet.merger';
import { serializeCssMedia } from '../adapter/css/stylesheet/css-media.serializer';

const retainedMediaContexts = new Map(
  allBreakpointDefinitions().map(definition => [serializeCssMedia(definition.media), cssRuleContext(definition)]),
);

const resolveRetainedMediaContext: RetainedMediaContextResolver = media => retainedMediaContexts.get(media);

export function mergeStylesheetContents(
  existing: string,
  rules: readonly OwnedCssRule[],
  references: ReadonlySet<string> | OwnedCssReferences = new Set(rules.map(rule => rule.className)),
): OwnedStylesheetMergeResult {
  return mergeOwnedStylesheet(existing, rules, references, resolveRetainedMediaContext);
}
