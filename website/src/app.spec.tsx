// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './app';

afterEach(cleanup);

describe('documentation website shell', () => {
  it('connects the product introduction to its install and project destinations', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Migrate Angular Flex-Layout with confidence.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('npm install --save-dev --save-exact @nipe-solutions/flex-layout-codemod@beta'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/NIPE-Solutions/flex-layout-migrator',
    );
    expect(screen.getByRole('link', { name: 'View on npm' })).toHaveAttribute(
      'href',
      'https://www.npmjs.com/package/@nipe-solutions/flex-layout-codemod',
    );
  });

  it('keeps the NIPE family destination in both global landmarks', () => {
    render(<App />);

    const familyUrl = 'https://opensource.nipesolutions.com';
    expect(
      within(screen.getByRole('banner')).getByRole('link', {
        name: 'NIPE Open Source',
      }),
    ).toHaveAttribute('href', familyUrl);
    expect(
      within(screen.getByRole('contentinfo')).getByRole('link', {
        name: 'NIPE Open Source',
      }),
    ).toHaveAttribute('href', familyUrl);
  });
});
