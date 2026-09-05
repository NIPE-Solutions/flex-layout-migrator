import { Buffer } from 'node:buffer';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import { inspectWebsiteAssets } from './verify-website-assets.mjs';

const repository = resolve(import.meta.dirname, '..');
const temporaryDirectories: string[] = [];

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function fixturePng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => readonly [number, number, number, number],
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue, alpha] = pixel(x, y);
      const offset = row + 1 + x * 4;
      scanlines[offset] = red;
      scanlines[offset + 1] = green;
      scanlines[offset + 2] = blue;
      scanlines[offset + 3] = alpha;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function createFixture(): Promise<string> {
  const fixture = await mkdtemp(join(tmpdir(), 'website-assets-'));
  temporaryDirectories.push(fixture);
  await mkdir(join(fixture, 'website'), { recursive: true });
  await cp(join(repository, 'website/public'), join(fixture, 'website/public'), { recursive: true });
  await cp(join(repository, 'website/index.html'), join(fixture, 'website/index.html'));
  return fixture;
}

async function writeFixtureAsset(fixture: string, relativePath: string, contents: Buffer | string): Promise<void> {
  const path = join(fixture, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('website asset contract', () => {
  it('ships complete, correctly sized identity assets and metadata', async () => {
    expect(await inspectWebsiteAssets(repository)).toEqual([]);
  });

  it('rejects a transparent same-size favicon with no native-scale identity', async () => {
    const fixture = await createFixture();
    await writeFixtureAsset(
      fixture,
      'website/public/favicon-16x16.png',
      fixturePng(16, 16, () => [0, 0, 0, 0]),
    );

    expect(await inspectWebsiteAssets(fixture)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('favicon-16x16.png: favicon occupancy'),
        expect.stringContaining('favicon-16x16.png: missing favicon palette color #c9153d'),
        expect.stringContaining('favicon-16x16.png: missing favicon palette color #00afa1'),
      ]),
    );
  });

  it('rejects a same-dimension derivative that no longer follows the master', async () => {
    const fixture = await createFixture();
    await writeFixtureAsset(
      fixture,
      'website/public/icon-192.png',
      fixturePng(192, 192, () => [201, 21, 61, 255]),
    );

    expect(await inspectWebsiteAssets(fixture)).toContain(
      'website/public/icon-192.png: derivative does not match deterministic master rendering',
    );
  });

  it('rejects a social image that no longer follows its deterministic composition', async () => {
    const fixture = await createFixture();
    await writeFixtureAsset(
      fixture,
      'website/public/og-image.png',
      fixturePng(1200, 630, () => [246, 241, 231, 255]),
    );

    expect(await inspectWebsiteAssets(fixture)).toContain(
      'website/public/og-image.png: derivative does not match deterministic social composition',
    );
  });

  it('requires opaque maskable assets and keeps their artwork inside the safe circle', async () => {
    const fixture = await createFixture();
    const manifestPath = join(fixture, 'website/public/site.webmanifest');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { icons: Array<Record<string, string>> };
    manifest.icons = [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ];
    await writeFile(manifestPath, JSON.stringify(manifest));
    await writeFixtureAsset(
      fixture,
      'website/public/maskable-192.png',
      fixturePng(192, 192, (x, y) => (x === 0 && y === 0 ? [201, 21, 61, 255] : [246, 241, 231, 255])),
    );
    await writeFixtureAsset(
      fixture,
      'website/public/maskable-512.png',
      fixturePng(512, 512, () => [246, 241, 231, 0]),
    );

    expect(await inspectWebsiteAssets(fixture)).toEqual(
      expect.arrayContaining([
        'website/public/maskable-192.png: artwork exceeds the maskable safe circle',
        'website/public/maskable-512.png: maskable icon must be fully opaque',
      ]),
    );
  });

  it('rejects a manifest that reuses transparent any icons as maskable icons', async () => {
    const fixture = await createFixture();
    const manifestPath = join(fixture, 'website/public/site.webmanifest');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { icons: Array<Record<string, string>> };
    for (const icon of manifest.icons) {
      if (icon.purpose === 'maskable') icon.src = icon.sizes === '192x192' ? '/icon-192.png' : '/icon-512.png';
    }
    await writeFile(manifestPath, JSON.stringify(manifest));

    expect(await inspectWebsiteAssets(fixture)).toEqual(
      expect.arrayContaining([
        'website/public/site.webmanifest: maskable icons must use dedicated /maskable-192.png and /maskable-512.png assets',
      ]),
    );
  });

  it('rejects an ICO whose embedded payloads drift from the curated favicon PNGs', async () => {
    const fixture = await createFixture();
    const favicon = await readFile(join(fixture, 'website/public/favicon.ico'));
    favicon[favicon.length - 8] ^= 0xff;
    await writeFixtureAsset(fixture, 'website/public/favicon.ico', favicon);

    expect(await inspectWebsiteAssets(fixture)).toContain(
      'website/public/favicon.ico: embedded entries do not match the curated favicon PNGs',
    );
  });
});
