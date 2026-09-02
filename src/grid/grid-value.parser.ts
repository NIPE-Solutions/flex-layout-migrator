import type { FlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { GridDeclaration, GridParseResult, GridSemanticPlan } from './grid-semantic.model';

const contentAlignment = new Set([
  'center',
  'space-around',
  'space-between',
  'space-evenly',
  'end',
  'start',
  'stretch',
]);
const itemAlignment = new Set(['start', 'center', 'end', 'stretch']);

function parsed(
  role: GridSemanticPlan['role'],
  declarations: readonly GridDeclaration[],
  displayDependency = role !== 'child',
  inline?: boolean,
): GridParseResult {
  return {
    status: 'parsed',
    plan: Object.freeze({
      role,
      declarations: Object.freeze(declarations.map(declaration => Object.freeze(declaration))),
      displayDependency,
      ...(inline === undefined ? {} : { inline }),
    }),
  };
}

function declaration(property: GridDeclaration['property'], value: string): GridDeclaration {
  return { property, value };
}

function alignment(value: string, prefix: 'align' | 'justify'): GridParseResult {
  const [rawMain, rawCross] = (value || 'start stretch').split(' ');
  const main = rawMain !== undefined && contentAlignment.has(rawMain) ? rawMain : 'start';
  const cross = rawCross !== undefined && itemAlignment.has(rawCross) ? rawCross : 'stretch';
  return parsed('container', [declaration(`${prefix}-content`, main), declaration(`${prefix}-items`, cross)]);
}

function tracks(value: string, axis: 'columns' | 'rows'): GridParseResult {
  let normalized = value || 'none';
  const auto = normalized.endsWith('!');
  if (auto) normalized = normalized.slice(0, normalized.indexOf('!'));
  return parsed('container', [declaration(`grid-${auto ? 'auto' : 'template'}-${axis}`, normalized)]);
}

export function parseGridValue(input: FlexLayoutInput): GridParseResult {
  if (input.binding === 'property') {
    return {
      status: 'review',
      code: 'dynamic-binding',
      reason: 'Bound Grid values cannot be evaluated statically.',
    };
  }

  switch (input.directive) {
    case 'gdAlignColumns':
      return alignment(input.value, 'align');
    case 'gdAlignRows':
      return alignment(input.value, 'justify');
    case 'gdAreas': {
      const rows = (input.value || 'none').split('|').map(row => `"${row.trim()}"`);
      return parsed('container', [declaration('grid-template-areas', rows.join(' '))]);
    }
    case 'gdAuto': {
      let [direction, dense] = (input.value || 'initial').split(' ');
      if (!['column', 'row', 'dense'].includes(direction ?? '')) direction = 'row';
      dense = dense === 'dense' && direction !== 'dense' ? ' dense' : '';
      return parsed('container', [declaration('grid-auto-flow', `${direction}${dense}`)]);
    }
    case 'gdColumns':
      return tracks(input.value, 'columns');
    case 'gdRows':
      return tracks(input.value, 'rows');
    case 'gdGap':
      return parsed('container', [declaration('grid-gap', input.value || '0')]);
    case 'gdArea':
      return parsed('child', [declaration('grid-area', input.value || 'auto')], false);
    case 'gdColumn':
      return parsed('child', [declaration('grid-column', input.value || 'auto')], false);
    case 'gdRow':
      return parsed('child', [declaration('grid-row', input.value || 'auto')], false);
    case 'gdGridAlign': {
      const [rawRow, rawColumn] = (input.value || 'stretch').split(' ');
      const row = rawRow !== undefined && itemAlignment.has(rawRow) ? rawRow : 'stretch';
      const column = rawColumn !== undefined && itemAlignment.has(rawColumn) ? rawColumn : 'stretch';
      return parsed('child', [declaration('justify-self', row), declaration('align-self', column)], false);
    }
    case 'gdInline':
      return parsed('modifier', [], true, input.value !== 'false');
    default:
      return {
        status: 'invalid',
        code: 'invalid-value',
        reason: `${input.directive} is not a Grid directive.`,
      };
  }
}
