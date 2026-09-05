import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

export const PALETTE = Object.freeze({
  ink: [17, 27, 36, 255],
  red: [201, 21, 61, 255],
  teal: [0, 175, 161, 255],
  paper: [246, 241, 231, 255],
  transparent: [0, 0, 0, 0],
});

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

export function encodeRgbaPng({ width, height, pixels }) {
  if (pixels.length !== width * height * 4) throw new Error('RGBA pixel buffer length does not match dimensions');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    pixels.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function paethPredictor(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

export function decodeRgbaPng(buffer) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG');
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (buffer[24] !== 8 || buffer[25] !== 6 || buffer[28] !== 0) {
    throw new Error('expected an 8-bit, non-interlaced RGBA PNG');
  }

  const imageDataChunks = [];
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const typeBytes = buffer.subarray(offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
    if (crc32(Buffer.concat([typeBytes, data])) !== expectedCrc) throw new Error(`invalid ${typeBytes} checksum`);
    if (typeBytes.toString('ascii') === 'IDAT') imageDataChunks.push(data);
    offset += 12 + length;
  }

  const inflated = inflateSync(Buffer.concat(imageDataChunks));
  const stride = width * 4;
  if (inflated.length !== height * (stride + 1)) throw new Error('unexpected PNG scanline length');
  const pixels = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) {
    const inputOffset = row * (stride + 1);
    const outputOffset = row * stride;
    const filter = inflated[inputOffset];
    for (let column = 0; column < stride; column += 1) {
      const value = inflated[inputOffset + column + 1];
      const left = column >= 4 ? pixels[outputOffset + column - 4] : 0;
      const above = row > 0 ? pixels[outputOffset - stride + column] : 0;
      const upperLeft = row > 0 && column >= 4 ? pixels[outputOffset - stride + column - 4] : 0;
      const reconstructed =
        filter === 0
          ? value
          : filter === 1
            ? value + left
            : filter === 2
              ? value + above
              : filter === 3
                ? value + Math.floor((left + above) / 2)
                : filter === 4
                  ? value + paethPredictor(left, above, upperLeft)
                  : Number.NaN;
      if (Number.isNaN(reconstructed)) throw new Error(`unsupported PNG filter ${filter}`);
      pixels[outputOffset + column] = reconstructed & 0xff;
    }
  }
  return { width, height, pixels };
}

function samplePremultiplied(image, x, y) {
  const clampedX = Math.max(0, Math.min(image.width - 1, x));
  const clampedY = Math.max(0, Math.min(image.height - 1, y));
  const offset = (clampedY * image.width + clampedX) * 4;
  const alpha = image.pixels[offset + 3] / 255;
  return [
    image.pixels[offset] * alpha,
    image.pixels[offset + 1] * alpha,
    image.pixels[offset + 2] * alpha,
    image.pixels[offset + 3],
  ];
}

export function resizeRgba(image, width, height = width) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = ((y + 0.5) * image.height) / height - 0.5;
    const y0 = Math.floor(sourceY);
    const y1 = y0 + 1;
    const yWeight = sourceY - y0;
    for (let x = 0; x < width; x += 1) {
      const sourceX = ((x + 0.5) * image.width) / width - 0.5;
      const x0 = Math.floor(sourceX);
      const x1 = x0 + 1;
      const xWeight = sourceX - x0;
      const samples = [
        [samplePremultiplied(image, x0, y0), (1 - xWeight) * (1 - yWeight)],
        [samplePremultiplied(image, x1, y0), xWeight * (1 - yWeight)],
        [samplePremultiplied(image, x0, y1), (1 - xWeight) * yWeight],
        [samplePremultiplied(image, x1, y1), xWeight * yWeight],
      ];
      const premultiplied = [0, 0, 0];
      let alpha = 0;
      for (const [sample, weight] of samples) {
        premultiplied[0] += sample[0] * weight;
        premultiplied[1] += sample[1] * weight;
        premultiplied[2] += sample[2] * weight;
        alpha += sample[3] * weight;
      }
      const outputOffset = (y * width + x) * 4;
      const normalizedAlpha = alpha / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[outputOffset + channel] =
          normalizedAlpha === 0 ? 0 : Math.round(premultiplied[channel] / normalizedAlpha);
      }
      pixels[outputOffset + 3] = Math.round(alpha);
    }
  }
  return { width, height, pixels };
}

function createCanvas(size, color = PALETTE.transparent) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels.set(color, offset);
  }
  return { width: size, height: size, pixels };
}

function fillRect(image, left, top, right, bottom, color) {
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) image.pixels.set(color, (y * image.width + x) * 4);
  }
}

function createFavicon16() {
  const icon = createCanvas(16);
  fillRect(icon, 1, 3, 3, 4, PALETTE.red);
  fillRect(icon, 5, 3, 6, 4, PALETTE.red);
  fillRect(icon, 1, 7, 3, 8, PALETTE.red);
  fillRect(icon, 5, 7, 6, 8, PALETTE.red);
  fillRect(icon, 1, 11, 3, 12, PALETTE.red);
  fillRect(icon, 5, 11, 6, 12, PALETTE.red);
  fillRect(icon, 7, 5, 9, 10, PALETTE.ink);
  fillRect(icon, 8, 4, 9, 11, PALETTE.ink);
  fillRect(icon, 10, 6, 11, 9, PALETTE.ink);
  icon.pixels.set(PALETTE.ink, (8 * 16 + 12) * 4);
  icon.pixels.set(PALETTE.red, (5 * 16 + 7) * 4);
  icon.pixels.set(PALETTE.red, (10 * 16 + 7) * 4);
  icon.pixels.set(PALETTE.paper, (7 * 16 + 9) * 4);
  icon.pixels.set(PALETTE.paper, (8 * 16 + 9) * 4);
  for (const top of [3, 7, 11]) {
    fillRect(icon, 13, top, 13, top + 1, PALETTE.teal);
    fillRect(icon, 15, top, 15, top + 1, PALETTE.teal);
  }
  return icon;
}

function createFavicon32() {
  const icon = createCanvas(32);
  for (const top of [6, 14, 22]) {
    fillRect(icon, 1, top, 6, top + 3, PALETTE.red);
    fillRect(icon, 8, top, 10, top + 3, PALETTE.red);
  }
  fillRect(icon, 11, 8, 12, 11, PALETTE.red);
  fillRect(icon, 11, 20, 12, 23, PALETTE.red);
  fillRect(icon, 14, 10, 17, 21, PALETTE.ink);
  fillRect(icon, 12, 12, 19, 19, PALETTE.ink);
  fillRect(icon, 11, 14, 21, 17, PALETTE.ink);
  fillRect(icon, 20, 14, 22, 17, PALETTE.ink);
  fillRect(icon, 23, 15, 23, 16, PALETTE.ink);
  fillRect(icon, 15, 14, 17, 17, PALETTE.paper);
  for (const top of [6, 14, 22]) {
    fillRect(icon, 25, top, 27, top + 3, PALETTE.teal);
    fillRect(icon, 29, top, 31, top + 3, PALETTE.teal);
  }
  return icon;
}

export function createPixelCuratedFavicon(size) {
  if (size === 16) return createFavicon16();
  if (size === 32) return createFavicon32();
  throw new Error(`Unsupported favicon size ${size}`);
}

function composite(destination, source, left, top) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = (y * source.width + x) * 4;
      const destinationOffset = ((top + y) * destination.width + left + x) * 4;
      const sourceAlpha = source.pixels[sourceOffset + 3] / 255;
      const destinationAlpha = destination.pixels[destinationOffset + 3] / 255;
      const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
      for (let channel = 0; channel < 3; channel += 1) {
        const sourceValue = source.pixels[sourceOffset + channel];
        const destinationValue = destination.pixels[destinationOffset + channel];
        destination.pixels[destinationOffset + channel] = Math.round(
          (sourceValue * sourceAlpha + destinationValue * destinationAlpha * (1 - sourceAlpha)) / outputAlpha,
        );
      }
      destination.pixels[destinationOffset + 3] = Math.round(outputAlpha * 255);
    }
  }
}

export function createMaskableIcon(master, size) {
  const canvas = createCanvas(size, PALETTE.paper);
  const artworkSize = Math.round(size * 0.7);
  const artwork = resizeRgba(master, artworkSize);
  composite(canvas, artwork, Math.floor((size - artworkSize) / 2), Math.floor((size - artworkSize) / 2));
  return canvas;
}

export function createSocialImage(master) {
  const width = 1200;
  const height = 630;
  const pixels = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(PALETTE.paper, offset);
  const canvas = { width, height, pixels };
  const artwork = resizeRgba(master, 540);
  composite(canvas, artwork, Math.floor((width - 540) / 2), Math.floor((height - 540) / 2));
  return canvas;
}

export function createIco(entries) {
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let dataOffset = header.length;
  entries.forEach(({ size, png }, index) => {
    const offset = 6 + index * 16;
    header[offset] = size;
    header[offset + 1] = size;
    header[offset + 2] = 0;
    header[offset + 3] = 0;
    header.writeUInt16LE(1, offset + 4);
    header.writeUInt16LE(32, offset + 6);
    header.writeUInt32LE(png.length, offset + 8);
    header.writeUInt32LE(dataOffset, offset + 12);
    dataOffset += png.length;
  });
  return Buffer.concat([header, ...entries.map(entry => entry.png)]);
}

export function expectedWebsiteAssets(masterBuffer) {
  const master = decodeRgbaPng(masterBuffer);
  const favicon16 = encodeRgbaPng(createPixelCuratedFavicon(16));
  const favicon32 = encodeRgbaPng(createPixelCuratedFavicon(32));
  return new Map([
    ['favicon-16x16.png', favicon16],
    ['favicon-32x32.png', favicon32],
    [
      'favicon.ico',
      createIco([
        { size: 16, png: favicon16 },
        { size: 32, png: favicon32 },
      ]),
    ],
    ['apple-touch-icon.png', encodeRgbaPng(resizeRgba(master, 180))],
    ['icon-192.png', encodeRgbaPng(resizeRgba(master, 192))],
    ['icon-512.png', encodeRgbaPng(resizeRgba(master, 512))],
    ['maskable-192.png', encodeRgbaPng(createMaskableIcon(master, 192))],
    ['maskable-512.png', encodeRgbaPng(createMaskableIcon(master, 512))],
    ['og-image.png', encodeRgbaPng(createSocialImage(master))],
  ]);
}

export async function generateWebsiteAssets(repository = resolve(import.meta.dirname, '..')) {
  const publicDirectory = resolve(repository, 'website/public');
  await mkdir(publicDirectory, { recursive: true });
  const master = await readFile(resolve(publicDirectory, 'icon-source.png'));
  await Promise.all(
    [...expectedWebsiteAssets(master)].map(([name, contents]) => writeFile(resolve(publicDirectory, name), contents)),
  );
}

function isDirectInvocation(moduleUrl, argumentPath = process.argv[1]) {
  if (!argumentPath) return false;
  return resolve(fileURLToPath(moduleUrl)) === resolve(argumentPath);
}

if (isDirectInvocation(import.meta.url)) {
  generateWebsiteAssets().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
