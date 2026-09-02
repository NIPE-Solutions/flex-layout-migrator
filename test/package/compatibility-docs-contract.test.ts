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
    .trim()
    .split('\n')
    .filter(line => line.startsWith('|'));
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

    const [directiveCell, _family, tailwindCell, cssCell, imageCell] = cells;
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

    return {
      directive,
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
});
