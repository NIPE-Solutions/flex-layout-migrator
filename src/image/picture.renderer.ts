import type { SourceEdit } from '../edit/source-edit';
import { SourceEditor } from '../edit/source-editor';
import type { MediaClause } from '../breakpoint/breakpoint-catalog';
import { encodeHtmlAttribute } from './html-attribute.encoder';
import type { ResponsiveImagePlan, ResponsiveImageSource } from './responsive-image.model';

function mediaClause(clause: MediaClause): string {
  const conditions: string[] = [];
  if (clause.min !== undefined) conditions.push(`(min-width: ${clause.min}px)`);
  if (clause.max !== undefined) conditions.push(`(max-width: ${clause.max}px)`);
  if (clause.orientation !== undefined) conditions.push(`(orientation: ${clause.orientation})`);
  return conditions.join(' and ');
}

function mediaValue(source: ResponsiveImageSource): string {
  const { media } = source.definition;
  const clauses = media.clauses.map(mediaClause).filter(Boolean);
  if (!clauses.length) return media.type;
  return `${media.type} and ${clauses.map(clause => (clauses.length > 1 ? `(${clause})` : clause)).join(', ')}`;
}

function removalStart(source: string, elementStart: number, attributeStart: number): number {
  let start = attributeStart;
  while (start > elementStart && /\s/u.test(source[start - 1] ?? '')) start--;
  return start;
}

export class PictureRenderer {
  render(source: string, plan: ResponsiveImagePlan, innerEdits: readonly SourceEdit[] = []): string {
    const { element } = plan;
    const imageSource = source.slice(element.source.start, element.source.end);
    const removalEdits: SourceEdit[] = plan.sources.map(responsiveSource => ({
      range: {
        start: removalStart(source, element.startTag.start, responsiveSource.input.source.start) - element.source.start,
        end: responsiveSource.input.source.end - element.source.start,
      },
      text: '',
      inputId: responsiveSource.input.id,
    }));
    const localInnerEdits = innerEdits.map(edit => ({
      ...edit,
      range: {
        start: edit.range.start - element.source.start,
        end: edit.range.end - element.source.start,
      },
    }));
    const edited = new SourceEditor().apply(imageSource, [...removalEdits, ...localInnerEdits]);
    if (edited.status === 'invalid') {
      throw new Error(`Cannot compose responsive image edits: ${edited.diagnostics[0]?.message ?? 'invalid edit'}`);
    }

    const sourceTags = plan.sources.map(
      responsiveSource =>
        `<source media="${encodeHtmlAttribute(mediaValue(responsiveSource))}" srcset="${encodeHtmlAttribute(responsiveSource.url)}">`,
    );
    const lineEnding = imageSource.includes('\r\n') ? '\r\n' : '\n';
    if (!imageSource.includes('\n')) {
      return `<picture>${sourceTags.join('')}${edited.output}</picture>`;
    }

    const indentation = imageSource.match(/\r?\n([\t ]+)\S/u)?.[1] ?? '  ';
    return `<picture>${lineEnding}${sourceTags.map(tag => `${indentation}${tag}`).join(lineEnding)}${lineEnding}${indentation}${edited.output}${lineEnding}</picture>`;
  }
}
