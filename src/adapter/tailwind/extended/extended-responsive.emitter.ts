import { ResponsiveVariantEmitter } from '../responsive-variant.emitter';
import { describeTailwindUtility } from '../tailwind-class-conflict';
import type { ExtendedResponsiveState, ResponsiveClassValue } from '../../../semantic/extended/responsive-class.model';
import type { ResponsiveStyleValue } from '../../../semantic/extended/responsive-style.model';
import { TailwindArbitraryPropertyEncoder } from './tailwind-arbitrary-property.encoder';
import { TailwindCandidateClassifier } from './tailwind-candidate-classifier';

export class ExtendedResponsiveEmitter {
  constructor(
    private readonly responsiveEmitter = new ResponsiveVariantEmitter(),
    private readonly styleEncoder = new TailwindArbitraryPropertyEncoder(),
    private readonly classifier = new TailwindCandidateClassifier(),
  ) {}

  emitClass(state: ExtendedResponsiveState<ResponsiveClassValue>): readonly string[] {
    const emitted: string[] = [];
    const seen = new Set<string>();

    for (const token of state.value.tokens) {
      if (seen.has(token)) continue;
      seen.add(token);

      const classification = this.classifier.classify(token);
      if (classification.status !== 'verified' || classification.descriptor.cssProperties.length === 0) {
        throw new Error('Cannot emit an unverified or ungrouped Tailwind class candidate.');
      }
      emitted.push(...this.responsiveEmitter.emitCandidate(state.activation.definition, token));
    }

    return emitted;
  }

  emitStyle(state: ExtendedResponsiveState<ResponsiveStyleValue>): readonly string[] {
    const emitted: string[] = [];
    const seen = new Set<string>();

    for (const declaration of state.value.declarations) {
      const candidate = this.styleEncoder.encode(declaration);
      if (seen.has(candidate)) continue;
      seen.add(candidate);

      const descriptor = describeTailwindUtility(candidate);
      if (descriptor === undefined || descriptor.cssProperties.length === 0) {
        throw new Error('Cannot emit an ungrouped Tailwind arbitrary-property candidate.');
      }
      emitted.push(...this.responsiveEmitter.emitCandidate(state.activation.definition, candidate));
    }

    return emitted;
  }
}
