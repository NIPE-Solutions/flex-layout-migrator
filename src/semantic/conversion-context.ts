import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { TemplateAttribute, TemplateElement } from '../template/template.model';

export interface SemanticConversionContext {
  readonly element: TemplateElement;
  readonly parent?: TemplateElement;
  readonly inputs: readonly LocatedFlexLayoutInput[];
  readonly parentInputs: readonly LocatedFlexLayoutInput[];
  readonly existingClassNames: readonly string[];
  readonly attributeEvidence: readonly TemplateAttribute[];
  readonly activeLayout?: string;
  readonly activeParentLayout?: string;
}
