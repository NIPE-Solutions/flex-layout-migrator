import type { EditDiagnostic, EditResult, SourceEdit } from './source-edit';
import { compareCodeUnits } from '../util/compare-code-units';

export class SourceEditor {
  apply(source: string, edits: readonly SourceEdit[]): EditResult {
    const diagnostics = this.validate(source, edits);
    if (diagnostics.length) return { status: 'invalid', diagnostics };

    const orderedEdits = [...edits].sort(
      (left, right) => right.range.start - left.range.start || compareCodeUnits(right.inputId, left.inputId),
    );

    let output = source;
    for (const edit of orderedEdits) {
      output = output.slice(0, edit.range.start) + edit.text + output.slice(edit.range.end);
    }

    return { status: 'applied', output };
  }

  private validate(source: string, edits: readonly SourceEdit[]): EditDiagnostic[] {
    const invalidRanges = edits
      .filter(
        edit =>
          !Number.isInteger(edit.range.start) ||
          !Number.isInteger(edit.range.end) ||
          edit.range.start < 0 ||
          edit.range.end < edit.range.start ||
          edit.range.end > source.length,
      )
      .map(edit => ({
        code: 'invalid-range' as const,
        message: `Edit ${edit.inputId} has a range outside the source.`,
        inputIds: [edit.inputId],
      }));

    if (invalidRanges.length) return invalidRanges;

    const byStart = [...edits].sort(
      (left, right) => left.range.start - right.range.start || left.range.end - right.range.end,
    );

    for (let index = 0; index < byStart.length; index++) {
      const left = byStart[index];
      if (!left) continue;

      for (let nextIndex = index + 1; nextIndex < byStart.length; nextIndex++) {
        const right = byStart[nextIndex];
        if (!right || right.range.start > left.range.end) break;

        if (left.range.start < right.range.end && right.range.start < left.range.end) {
          const inputIds = [left.inputId, right.inputId].sort();
          return [
            {
              code: 'overlapping-edits',
              message: `Edits ${inputIds[0]} and ${inputIds[1]} overlap.`,
              inputIds,
            },
          ];
        }
      }
    }

    return [];
  }
}
