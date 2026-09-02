import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { COMPATIBILITY_INVENTORY } from '../../src/analyzer/compatibility-inventory';

const compatibilityUrl = new URL('../../docs/compatibility.md', import.meta.url);
const conversionSafetyUrl = new URL('../../docs/architecture/conversion-safety.md', import.meta.url);
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

function hasFiveNonemptyCells(cells: string[] | undefined): cells is [string, string, string, string, string] {
  return cells !== undefined && cells.length === 5 && cells.every(cell => cell.length > 0);
}

function visibleMarkdownLines(markdown: string): string[] {
  const lines: string[] = [];
  let line = '';
  let commentDepth = 0;

  for (let index = 0; index < markdown.length;) {
    if (commentDepth > 0) {
      if (markdown.startsWith('<!--', index)) {
        commentDepth += 1;
        index += 4;
        continue;
      }
      if (markdown.startsWith('-->', index)) {
        commentDepth -= 1;
        index += 3;
        continue;
      }
    } else if (markdown.startsWith('<!--', index)) {
      commentDepth = 1;
      index += 4;
      continue;
    }

    const character = markdown[index];
    if (character === undefined) throw new Error('Markdown scan reached an invalid index');
    if (character === '\n') {
      lines.push(line);
      line = '';
    } else if (commentDepth === 0) {
      line += character;
    }
    index += 1;
  }

  lines.push(line);
  return lines;
}

function sectionBody(markdown: string, heading: string): string[] {
  const lines = visibleMarkdownLines(markdown);
  const headingLine = lines.findIndex(line => line.trim() === heading);
  if (headingLine === -1) throw new Error(`Missing compatibility section: ${heading}`);

  const body = lines.slice(headingLine + 1);
  const nextHeading = body.findIndex(line => /^#{1,3} /u.test(line));
  return nextHeading === -1 ? body : body.slice(0, nextHeading);
}

function leadingSafetyBullets(markdown: string, heading: string): string[] {
  const body = sectionBody(markdown, heading);
  const firstEntry = body.findIndex(line => line.trim().length > 0);
  if (firstEntry === -1) throw new Error(`Missing visible safety entries: ${heading}`);

  const entries: string[] = [];
  for (const line of body.slice(firstEntry)) {
    if (line.trim().length === 0) break;
    if (!line.startsWith('- ')) throw new Error(`Malformed visible safety entry: ${line}`);
    entries.push(line);
  }
  return entries;
}

function parseAvailableNowSafetyEntries(markdown: string): Map<string, string> {
  const entries = new Map<string, string>();
  const knownDirectives = new Set<string>(COMPATIBILITY_INVENTORY.map(entry => entry.directive));
  for (const heading of ['### Available now: directive-specific boundaries', '## Responsive class and style inputs']) {
    for (const line of leadingSafetyBullets(markdown, heading)) {
      const match = line.match(/^- (.+?): (.+)$/u);
      if (!match) throw new Error(`Malformed visible safety entry: ${line}`);

      const [label, note] = match.slice(1);
      if (label === undefined || note === undefined) throw new Error('Malformed visible safety entry');
      const codeLabels = [...label.matchAll(/`([^`]+)`/gu)].map(labelMatch => labelMatch[1]);
      const names = codeLabels
        .map(name => name?.replace(/\.<alias>$/u, ''))
        .filter((name): name is string => name !== undefined);
      if (names.length !== codeLabels.length) throw new Error(`Malformed compatibility safety label: ${label}`);
      if (names.length === 0) {
        names.push(...[...knownDirectives].filter(directive => new RegExp(`\\b${directive}\\b`, 'u').test(label)));
      }
      if (names.length === 0 || names.some(name => !knownDirectives.has(name))) {
        throw new Error(`Unknown compatibility safety label: ${label}`);
      }

      for (const name of names) {
        if (entries.has(name)) throw new Error(`Duplicate compatibility safety entry "${name}"`);
        entries.set(name, note);
      }
    }
  }
  return entries;
}

function parseCompatibilityRows(markdown: string) {
  const lines = markdown.split('\n');
  const startLines = lines.flatMap((line, index) => (line.trim() === startMarker ? [index] : []));
  const endLines = lines.flatMap((line, index) => (line.trim() === endMarker ? [index] : []));
  if (startLines.length === 0) throw new Error('Missing compatibility inventory start marker');
  if (endLines.length === 0) throw new Error('Missing compatibility inventory end marker');
  if (startLines.length !== 1) throw new Error('Expected exactly one compatibility inventory start marker');
  if (endLines.length !== 1) throw new Error('Expected exactly one compatibility inventory end marker');
  const startLine = startLines.at(0);
  const endLine = endLines.at(0);
  if (startLine === undefined || endLine === undefined) {
    throw new Error('Compatibility inventory marker lookup failed');
  }
  if (startLine > endLine) throw new Error('Compatibility inventory markers are out of order');

  const tableLines = markdown
    .split('\n')
    .slice(startLine + 1, endLine)
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
    if (!hasFiveNonemptyCells(cells)) {
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
      'duplicate start marker',
      `${startMarker}\n${startMarker}\n| Directive | Family | Tailwind CSS 4 | Native CSS | Responsive image |\n| --- | --- | --- | --- | --- |\n| \`fxLayout\` | Flex | Limited | Planned | Not applicable |\n${endMarker}`,
      'Expected exactly one compatibility inventory start marker',
    ],
    [
      'duplicate end marker',
      `${startMarker}\n| Directive | Family | Tailwind CSS 4 | Native CSS | Responsive image |\n| --- | --- | --- | --- | --- |\n| \`fxLayout\` | Flex | Limited | Planned | Not applicable |\n${endMarker}\n${endMarker}`,
      'Expected exactly one compatibility inventory end marker',
    ],
    ['out-of-order markers', `${endMarker}\n${startMarker}`, 'Compatibility inventory markers are out of order'],
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

    expect(parseAvailableNowSafetyEntries(markdown)).toEqual(
      new Map([
        ['fxLayout', 'Static directions plus wrap and inline modifiers; coupled unresolved gaps preserve the layout.'],
        ['fxLayoutAlign', 'Static main/cross axes with layout, content alignment, sizing, and border-box semantics.'],
        [
          'fxLayoutGap',
          'Static nonnegative non-wrapping gaps; unitless values remain pixels. Grid, computed, negative, and wrapped gaps are review.',
        ],
        ['fxFlex', 'Static basis, keyword, and three-part forms with parent-axis min/max sizing.'],
        ['fxGrow', 'Converted atomically with a static `fxFlex`; standalone use is invalid.'],
        ['fxShrink', 'Converted atomically with a static `fxFlex`; standalone use is invalid.'],
        ['fxFlexAlign', 'Static `align-self` keywords.'],
        ['fxFlexFill', 'Static full-size rule including its zero-margin behavior.'],
        ['fxFill', 'Non-responsive alias of `fxFlexFill`.'],
        ['fxFlexOffset', 'Static values with a statically known parent axis; unitless values remain percentages.'],
        ['fxFlexOrder', 'Static integer values emitted independently of the Tailwind theme.'],
        [
          'fxShow',
          'Literal base and configured viewport, orientation, or print states convert when display restoration and the complete visibility family are safe.',
        ],
        [
          'fxHide',
          'Literal base and configured responsive states convert with `fxShow`; hiding emits exact base or responsive `hidden` utilities.',
        ],
        ...[
          'gdAlignColumns',
          'gdAlignRows',
          'gdArea',
          'gdAreas',
          'gdAuto',
          'gdColumn',
          'gdColumns',
          'gdGap',
          'gdGridAlign',
          'gdInline',
          'gdRow',
          'gdRows',
        ].map(
          directive =>
            [
              directive,
              'Literal values convert when compiler output, display composition, context, and ownership are exact.',
            ] as const,
        ),
        ['ngClass', 'Converts complete families whose class tokens are proven Tailwind CSS v4 candidates.'],
        ['ngStyle', 'Converts complete, sanitizer-safe declaration lists with exact CSS ownership.'],
        ['class', 'Version-dependent replacement and merge behavior is not inferred.'],
        ['style', 'Version-dependent replacement and merge behavior is not inferred.'],
        [
          'imgSrc',
          'Opt-in literal standard aliases convert to picture markup when URL, fallback, and structural context are safe.',
        ],
      ]),
    );

    expect(markdown).toContain('are currently converted together as one atomic visibility family per element');
    expect(markdown).not.toContain('are planned together as one atomic visibility family per element');
    expect(markdown).toContain('--orientation-breakpoints');
    expect(markdown).toContain('--print-with-breakpoints');
    expect(markdown).toContain('--responsive-images');
    const reporting = sectionBody(markdown, '## Reporting API').join('\n');
    expect(reporting).toContain('uses schema version `2`');
    expect(reporting).toContain('The previous report contract used schema version `1`');
    expect(reporting).toContain('required `application` outcome');
    expect(markdown).toContain('handset.portrait');
    expect(markdown).toContain('web.landscape');
    expect(markdown).toContain('printWithBreakpoints');
  });

  it('keeps the shared conversion-safety contract current with plan/write and schema 2', async () => {
    const markdown = await readFile(conversionSafetyUrl, 'utf8');

    expect(markdown).toContain('[Plan-by-default CLI and explicit application](adaptive-cli-plan-default.md)');
    expect(markdown).not.toContain('plans and preflights every invocation');
    expect(markdown).toContain('The current CLI uses plan mode by default');
    expect(markdown).toContain('After successful parsing, it preflights the complete transaction plan');
    expect(markdown).toContain(
      'Parse-error runs still complete configuration and path validation, return a complete report, and apply nothing',
    );
    expect(markdown).toContain('`--write` authorizes transactional application');
    expect(markdown).toContain('schema version `2`');
    expect(markdown).toContain('required `mode` and `application` fields');
    expect(markdown).not.toContain('A future native CSS adapter is outside the current implementation');
    expect(markdown).not.toContain('real mode; dry-run');
    expect(markdown).not.toContain('Both real and dry-run execution');
    expect(markdown).not.toContain('schema-version `1` JSON report');
  });

  it('rejects duplicate visible safety entries', async () => {
    const markdown = await readFile(compatibilityUrl, 'utf8');
    const duplicate = markdown.replace(
      '- `fxFlexFill`: Static full-size rule including its zero-margin behavior.',
      '- `fxFlexFill`: Incorrect behavior.\n- `fxFlexFill`: Static full-size rule including its zero-margin behavior.',
    );

    expect(() => parseAvailableNowSafetyEntries(duplicate)).toThrow(
      'Duplicate compatibility safety entry "fxFlexFill"',
    );
  });

  it('does not treat nested or adjacent HTML-comment content as visible safety entries', async () => {
    const markdown = await readFile(compatibilityUrl, 'utf8');
    const crafted = markdown.replace(
      '- `fxFlexFill`: Static full-size rule including its zero-margin behavior.',
      '<!-- outer comment <!-- nested opener -->\n- `fxFlexFill`: Static full-size rule including its zero-margin behavior.\n--><!-- adjacent comment -->',
    );

    expect(sectionBody(crafted, '### Available now: directive-specific boundaries')).not.toContain(
      '- `fxFlexFill`: Static full-size rule including its zero-margin behavior.',
    );
    expect(parseAvailableNowSafetyEntries(crafted).has('fxFlexFill')).toBe(false);
  });
});
