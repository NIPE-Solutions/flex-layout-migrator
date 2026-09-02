import type { MediaDefinition } from '../../../breakpoint/breakpoint-catalog';
import { serializeCssMedia } from './css-media.serializer';

describe('serializeCssMedia', () => {
  test.each([
    [{ type: 'screen', clauses: [{ min: 600 }] }, 'screen and (min-width: 600px)'],
    [{ type: 'screen', clauses: [{ max: 599.98 }] }, 'screen and (max-width: 599.98px)'],
    [
      { type: 'screen', clauses: [{ min: 600, max: 959.98 }] },
      'screen and (min-width: 600px) and (max-width: 959.98px)',
    ],
    [
      { type: 'screen', clauses: [{ min: 600, orientation: 'landscape' }] },
      'screen and (min-width: 600px) and (orientation: landscape)',
    ],
    [{ type: 'print', clauses: [{}] }, 'print'],
    [
      {
        type: 'screen',
        clauses: [
          { max: 599.98, orientation: 'portrait' },
          { max: 959.98, orientation: 'landscape' },
        ],
      },
      'screen and (max-width: 599.98px) and (orientation: portrait), screen and (max-width: 959.98px) and (orientation: landscape)',
    ],
  ] as const)('serializes %o exactly', (media: MediaDefinition, expected) => {
    expect(serializeCssMedia(media)).toBe(expected);
  });
});
