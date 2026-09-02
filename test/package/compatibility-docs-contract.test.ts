import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { COMPATIBILITY_INVENTORY } from '../../src/analyzer/compatibility-inventory';

const compatibilityUrl = new URL('../../docs/compatibility.md', import.meta.url);
const startMarker = '<!-- compatibility-inventory:start -->';
const endMarker = '<!-- compatibility-inventory:end -->';

const statusLabels = new Map([
  ['Limited', 'limited'],
  ['Planned', 'planned'],
  ['Preserved', 'preserved'],
  ['Not applicable', 'not-applicable'],
]);
const familyLabels = new Map([
  ['Flex', 'flex'],
  ['Grid', 'grid'],
  ['Visibility', 'visibility'],
  ['Class/style', 'class-style'],
  ['Image', 'image'],
]);

function tableCells(row: string): string[] | undefined {
  if (!row.startsWith('|') || !row.endsWith('|')) return undefined;
  return row
    .slice(1, -1)
    .split('|')
    .map(cell => cell.trim());
}

function parseCompatibilityRows(markdown: string) {
  const start = markdown.indexOf(startMarker);
  if (start === -1) throw new Error('Missing compatibility inventory start marker');

  const end = markdown.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error('Missing compatibility inventory end marker');

  const tableLines = markdown
    .slice(start + startMarker.length, end)
    .split('\n')
    .filter(line => line.trim().length > 0);
  for (const line of tableLines) {
    if (!line.startsWith('|')) {
      throw new Error(`Unexpected compatibility inventory content: ${line.trim()}`);
    }
  }
  const [header, separator, ...dataRows] = tableLines;

  const headerCells = header ? tableCells(header) : undefined;
  const separatorCells = separator ? tableCells(separator) : undefined;
  if (
    !headerCells ||
    headerCells.join('|') !== 'Directive|Family|Tailwind CSS 4|Native CSS|Responsive image' ||
    !separatorCells ||
    separatorCells.length !== 5 ||
    !separatorCells.every(cell => /^:?-{3,}:?$/u.test(cell))
  ) {
    throw new Error('Malformed compatibility inventory table header');
  }

  const directives = new Set<string>();
  return dataRows.map((row, index) => {
    const cells = tableCells(row);
    if (!cells || cells.length !== 5 || cells.some(cell => cell.length === 0)) {
      throw new Error(`Malformed compatibility inventory row ${index + 1}`);
    }

    const [directiveCell, familyCell, tailwindCell, cssCell, imageCell] = cells;
    const directive = directiveCell.match(/^`(.+)`$/u)?.[1];
    if (!directive) throw new Error(`Malformed compatibility inventory row ${index + 1}`);
    if (directives.has(directive)) {
      throw new Error(`Duplicate compatibility directive "${directive}"`);
    }
    directives.add(directive);

    const parseStatus = (label: string) => {
      const status = statusLabels.get(label);
      if (!status) throw new Error(`Unknown compatibility status "${label}"`);
      return status;
    };
    const family = familyLabels.get(familyCell);
    if (!family) throw new Error(`Unknown compatibility family "${familyCell}"`);

    return {
      directive,
      family,
      tailwind: parseStatus(tailwindCell),
      css: parseStatus(cssCell),
      image: parseStatus(imageCell),
    };
  });
}

describe('compatibility reference contract', () => {
  it('documents every recognized directive with the executable target statuses', async () => {
    const markdown = await readFile(compatibilityUrl, 'utf8');
    const rows = parseCompatibilityRows(markdown);
    expect(rows).toEqual(
      COMPATIBILITY_INVENTORY.map(entry => ({
        directive: entry.directive,
        family: entry.family,
        tailwind: entry.tailwind,
        css: entry.css,
        image: entry.image,
      })),
    );
  });

  it.each([
    ['missing start marker', `${endMarker}\n`, 'Missing compatibility inventory start marker'],
    ['missing end marker', `${startMarker}\n`, 'Missing compatibility inventory end marker'],
    [
      'malformed cells',
      `${startMarker}\n| Directive | Family | Tailwind CSS 4 | Native CSS | Responsive image |\n| --- | --- | --- | --- | --- |\n| \`fxLayout\` | Flex | Limited | Planned |\n${endMarker}`,
      'Malformed compatibility inventory row 1',
    ],
    [
      'unexpected nonblank content',
      `${startMarker}\n| Directive | Family | Tailwind CSS 4 | Native CSS | Responsive image |\n| --- | --- | --- | --- | --- |\nunexpected markdown\n| \`fxLayout\` | Flex | Limited | Planned | Not applicable |\n${endMarker}`,
      'Unexpected compatibility inventory content: unexpected markdown',
    ],
    [
      'unknown status label',
      `${startMarker}\n| Directive | Family | Tailwind CSS 4 | Native CSS | Responsive image |\n| --- | --- | --- | --- | --- |\n| \`fxLayout\` | Flex | Available | Planned | Not applicable |\n${endMarker}`,
      'Unknown compatibility status "Available"',
    ],
    [
      'duplicate directive',
      `${startMarker}\n| Directive | Family | Tailwind CSS 4 | Native CSS | Responsive image |\n| --- | --- | --- | --- | --- |\n| \`fxLayout\` | Flex | Limited | Planned | Not applicable |\n| \`fxLayout\` | Flex | Limited | Planned | Not applicable |\n${endMarker}`,
      'Duplicate compatibility directive "fxLayout"',
    ],
  ])('rejects %s', (_description, markdown, message) => {
    expect(() => parseCompatibilityRows(markdown)).toThrow(message);
  });

  it('retains the detailed current Tailwind safety boundaries', async () => {
    const markdown = await readFile(compatibilityUrl, 'utf8');

    for (const safetyBoundary of [
      'Static directions plus wrap and inline modifiers; coupled unresolved gaps preserve the layout.',
      'Static main/cross axes with layout, content alignment, sizing, and border-box semantics.',
      'Static nonnegative non-wrapping gaps; unitless values remain pixels. Grid, computed, negative, and wrapped gaps are review.',
      'Static basis, keyword, and three-part forms with parent-axis min/max sizing.',
      'Converted atomically with a static `fxFlex`; standalone use is invalid.',
      'Static `align-self` keywords.',
      'Static full-size rule including its zero-margin behavior.',
      'Non-responsive alias of `fxFlexFill`.',
      'Static values with a statically known parent axis; unitless values remain percentages.',
      'Static integer values emitted independently of the Tailwind theme.',
      'Literal base and standard viewport states convert when display restoration and the complete visibility family are safe.',
      'Literal base and standard viewport states convert with `fxShow`; hiding emits exact base or responsive `hidden` utilities.',
      'Converts complete families whose class tokens are proven Tailwind CSS v4 candidates.',
      'Converts complete, sanitizer-safe declaration lists with exact CSS ownership.',
      'Version-dependent replacement and merge behavior is not inferred.',
      'Recognized and reported; no target conversion is implemented.',
    ]) {
      expect(markdown).toContain(safetyBoundary);
    }

    expect(markdown).toContain('are currently converted together as one atomic visibility family per element');
    expect(markdown).not.toContain('are planned together as one atomic visibility family per element');
  });
});
