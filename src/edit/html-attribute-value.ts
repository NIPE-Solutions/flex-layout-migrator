import type { TemplateAttribute, TemplateElement } from '../template/template.model';
import type { SourceEdit } from './source-edit';

const htmlSourceWhitespace = /[\t\n\f\r ]/u;
const htmlReferencePrefix = /&(?:#|[a-z\d])/iu;

/**
 * Tailwind scans template bytes without first decoding HTML. A generated class
 * token is therefore safe only when the same bytes survive Angular's HTML
 * parsing and can be placed in both quote styles without entity escaping.
 */
export function isByteExactHtmlClassToken(token: string): boolean {
  return (
    token.length > 0 &&
    ![...token].some(character => htmlSourceWhitespace.test(character)) &&
    !/["'<]/u.test(token) &&
    !htmlReferencePrefix.test(token)
  );
}

function isDoubleQuotedHtmlClassToken(token: string): boolean {
  return (
    token.length > 0 &&
    ![...token].some(character => htmlSourceWhitespace.test(character)) &&
    !/["<]/u.test(token) &&
    !htmlReferencePrefix.test(token)
  );
}

function appendedRawValue(rawValue: string, missingClassNames: readonly string[]): string {
  const separator = rawValue.length > 0 && !htmlSourceWhitespace.test(rawValue.at(-1) ?? '') ? ' ' : '';
  return `${rawValue}${separator}${missingClassNames.join(' ')}`;
}

export function appendLiteralClassNames(
  source: string,
  element: TemplateElement,
  classAttribute: TemplateAttribute | undefined,
  generatedClassNames: readonly string[],
  inputId: string,
): SourceEdit | undefined {
  const uniqueGenerated = [...new Set(generatedClassNames)];
  // Deduplicate only against byte-identical source candidates. An entity-decoded
  // equivalent has the same Angular token but remains invisible to Tailwind's
  // raw source scanner, so the generated spelling must still be appended.
  const existingRawClassNames = classAttribute?.rawValue.split(/[\t\n\f\r ]+/u).filter(Boolean) ?? [];
  const missingClassNames = uniqueGenerated.filter(className => !existingRawClassNames.includes(className));
  if (missingClassNames.length === 0) return undefined;

  if (!missingClassNames.every(isDoubleQuotedHtmlClassToken)) {
    throw new Error('Generated class names must be byte-exact HTML source tokens before editing.');
  }

  if (classAttribute !== undefined) {
    if (classAttribute.valueSource === undefined) {
      return {
        range: classAttribute.source,
        text: `${classAttribute.rawName}="${missingClassNames.join(' ')}"`,
        inputId,
      };
    }

    const value = appendedRawValue(classAttribute.rawValue, missingClassNames);
    const delimiter = source[classAttribute.valueSource.start - 1];
    if (delimiter === '"') {
      return { range: classAttribute.valueSource, text: value, inputId };
    }
    if (delimiter === "'" && missingClassNames.every(isByteExactHtmlClassToken)) {
      return { range: classAttribute.valueSource, text: value, inputId };
    }
    if (delimiter === "'" && !classAttribute.rawValue.includes('"')) {
      return {
        range: classAttribute.source,
        text: `${classAttribute.rawName}="${value}"`,
        inputId,
      };
    }

    return {
      range: classAttribute.source,
      text: `${classAttribute.rawName}="${value}"`,
      inputId,
    };
  }

  const startTag = source.slice(element.startTag.start, element.startTag.end);
  const selfClosing = startTag.endsWith('/>');
  const insertionOffset = element.startTag.end - (selfClosing ? 2 : 1);
  const hasClosingWhitespace = htmlSourceWhitespace.test(source[insertionOffset - 1] ?? '');
  const classAttributeText = `class="${missingClassNames.join(' ')}"`;
  return {
    range: { start: insertionOffset, end: insertionOffset },
    text: selfClosing && hasClosingWhitespace ? `${classAttributeText} ` : ` ${classAttributeText}`,
    inputId,
  };
}
