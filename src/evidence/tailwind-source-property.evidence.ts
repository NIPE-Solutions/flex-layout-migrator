import type { TailwindTargetProfile } from '../config/tailwind-target-profile';
import { TailwindArbitraryPropertyEncoder } from '../adapter/tailwind/extended/tailwind-arbitrary-property.encoder';
import { TailwindCandidateClassifier } from '../adapter/tailwind/extended/tailwind-candidate-classifier';
import { describeTailwindDisplay } from '../adapter/tailwind/tailwind-class-conflict';
import { analyzeTailwindArbitrarySyntax } from '../adapter/tailwind/tailwind-arbitrary-syntax';
import type {
  SourceClassTokenClassification,
  SourcePropertyEvidence,
  SourceStyleDeclaration,
  SourceStyleDeclarationClassification,
} from '../semantic/source-property-evidence';

export class TailwindSourcePropertyEvidence implements SourcePropertyEvidence {
  private readonly classifier = new TailwindCandidateClassifier();
  private readonly styleEncoder = new TailwindArbitraryPropertyEncoder();

  constructor(private readonly profile?: TailwindTargetProfile) {}

  classifyClassToken(token: string): SourceClassTokenClassification {
    const prefix = this.profile?.prefix.value;
    if (prefix && !token.startsWith(`${prefix}:`))
      return { status: 'unverified', reason: 'Class is not a utility in the declared prefixed target.' };
    const normalized = prefix ? token.slice(prefix.length + 1) : token;
    const classification = this.classifier.classify(normalized);
    if (classification.status === 'unverified') return classification;
    const display = describeTailwindDisplay(normalized);
    return {
      status: 'verified',
      evidence: {
        source: token,
        properties: classification.descriptor.cssProperties,
        important: classification.descriptor.important || this.profile?.important.value === 'important',
        activation: classification.descriptor.activation,
        ...(display === undefined ? {} : { display: display.utility }),
      },
    };
  }

  classifyStyleDeclaration(declaration: SourceStyleDeclaration): SourceStyleDeclarationClassification {
    try {
      const candidate = this.styleEncoder.encode(declaration);
      const arbitrary = analyzeTailwindArbitrarySyntax(candidate);
      return arbitrary === undefined || arbitrary.important
        ? { status: 'unverified', priorityText: arbitrary?.important === true }
        : { status: 'verified' };
    } catch {
      let priorityText = false;
      try {
        priorityText = analyzeTailwindArbitrarySyntax(this.styleEncoder.encode(declaration))?.important === true;
      } catch {
        // The source declaration is not encodable by this target.
      }
      return { status: 'unverified', priorityText };
    }
  }
}
