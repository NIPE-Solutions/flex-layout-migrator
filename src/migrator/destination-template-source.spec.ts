import { describe, expect, test, vi } from 'vitest';

const readFile = vi.hoisted(() => vi.fn<(path: string, encoding: 'utf8') => Promise<string>>());

vi.mock('node:fs/promises', () => ({ readFile }));

import { nodeDestinationTemplateSource } from './destination-template-source';

describe('nodeDestinationTemplateSource', () => {
  test('reads one named destination as UTF-8', async () => {
    readFile.mockResolvedValueOnce('<main>existing destination</main>');

    await expect(nodeDestinationTemplateSource.read('/project/output/card.html')).resolves.toBe(
      '<main>existing destination</main>',
    );
    expect(readFile).toHaveBeenCalledOnce();
    expect(readFile).toHaveBeenCalledWith('/project/output/card.html', 'utf8');
  });

  test('preserves the filesystem error identity for the owning caller to classify', async () => {
    const error = Object.assign(new Error('missing destination'), { code: 'ENOENT' });
    readFile.mockRejectedValueOnce(error);

    await expect(nodeDestinationTemplateSource.read('/project/output/missing.html')).rejects.toBe(error);
  });
});
