import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import * as Icons from './icons';

const iconExports = [
  'ArrowIcon',
  'CheckIcon',
  'CopyIcon',
  'GitHubIcon',
  'NpmIcon',
  'ResetIcon',
  'ThemeIcon',
  'WarningIcon',
] as const;

afterEach(cleanup);

describe('UI icon contract', () => {
  it('exports exactly the approved symbols and paints them with currentColor', () => {
    expect(Object.keys(Icons).sort()).toEqual(iconExports);

    for (const name of iconExports) {
      const Icon = Icons[name];
      const { container, unmount } = render(<Icon decorative data-testid={name} />);
      const paintedElements = container.querySelectorAll('path, rect, circle');
      expect(paintedElements.length).toBeGreaterThan(0);
      expect(
        [...paintedElements].every(element =>
          ['fill', 'stroke'].every(attribute => {
            const value = element.getAttribute(attribute);
            return value === null || value === 'none' || value === 'currentColor';
          }),
        ),
      ).toBe(true);
      expect(
        [...paintedElements].some(element =>
          ['fill', 'stroke'].some(attribute => element.getAttribute(attribute) === 'currentColor'),
        ),
      ).toBe(true);
      unmount();
    }
  });

  it('hides decorative icons and names semantic icons', () => {
    render(
      <>
        <Icons.CopyIcon decorative data-testid="decorative" />
        <Icons.WarningIcon label="Migration warning" />
      </>,
    );

    expect(screen.getByTestId('decorative').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByTestId('decorative').getAttribute('role')).toBeNull();
    expect(screen.getByRole('img', { name: 'Migration warning' }).getAttribute('aria-hidden')).toBeNull();
  });

  it('rejects an empty or whitespace-only semantic label', () => {
    expect(() => render(<Icons.CheckIcon label="   " />)).toThrow(/non-empty label/u);
    expect(() => render(<Icons.CheckIcon {...({} as Icons.IconProps)} />)).toThrow(/non-empty label/u);
  });
});
