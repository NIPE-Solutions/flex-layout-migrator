import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { inspectWebsiteAssets } from './verify-website-assets.mjs';

describe('website asset contract', () => {
  it('ships complete, correctly sized identity assets and metadata', async () => {
    const repository = resolve(import.meta.dirname, '..');

    expect(await inspectWebsiteAssets(repository)).toEqual([]);
  });
});
