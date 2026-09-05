import { Buffer } from 'node:buffer';
import console from 'node:console';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const THEME_COLOR = '#111b24';

const pngAssets = Object.freeze([
  { path: 'website/public/favicon-16x16.png', width: 16, height: 16 },
  { path: 'website/public/favicon-32x32.png', width: 32, height: 32 },
  { path: 'website/public/apple-touch-icon.png', width: 180, height: 180 },
  { path: 'website/public/icon-192.png', width: 192, height: 192 },
  { path: 'website/public/icon-512.png', width: 512, height: 512 },
  { path: 'website/public/og-image.png', width: 1200, height: 630 },
]);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function inspectPng(buffer, expected, issues) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    issues.push(`${expected.path}: not a valid PNG`);
    return;
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer[25];
  if (width !== expected.width || height !== expected.height) {
    issues.push(`${expected.path}: expected ${expected.width}x${expected.height}, received ${width}x${height}`);
  }
  if (colorType !== 4 && colorType !== 6) {
    issues.push(`${expected.path}: PNG must retain an alpha channel`);
  }
  if (buffer.length <= 100) issues.push(`${expected.path}: PNG is empty or implausibly small`);
}

function paethPredictor(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodeRgbaPixels(buffer) {
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (buffer[24] !== 8 || buffer[25] !== 6 || buffer[28] !== 0) {
    throw new Error('master must be an 8-bit, non-interlaced RGBA PNG');
  }

  const imageDataChunks = [];
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') imageDataChunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }

  const inflated = inflateSync(Buffer.concat(imageDataChunks));
  const stride = width * 4;
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
  return pixels;
}

function inspectMasterPixels(buffer, issues) {
  try {
    const pixels = decodeRgbaPixels(buffer);
    const colors = new Set();
    let transparentPixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const alpha = pixels[offset + 3];
      if (alpha === 0) transparentPixels += 1;
      if (alpha >= 250) {
        colors.add(
          `#${pixels[offset].toString(16).padStart(2, '0')}${pixels[offset + 1]
            .toString(16)
            .padStart(2, '0')}${pixels[offset + 2].toString(16).padStart(2, '0')}`,
        );
      }
    }
    if (transparentPixels === 0) issues.push('website/public/icon-source.png: master background is not transparent');
    for (const color of ['#111b24', '#c9153d', '#00afa1', '#f6f1e7']) {
      if (!colors.has(color)) issues.push(`website/public/icon-source.png: missing approved palette color ${color}`);
    }
  } catch (error) {
    issues.push(
      `website/public/icon-source.png: cannot inspect pixels (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

function hasTag(html, expression) {
  return expression.test(html);
}

function inspectHtml(html, issues) {
  const checks = [
    [
      'website/index.html: missing canonical URL',
      /<link\s+rel=["']canonical["']\s+href=["']https:\/\/angular-flex-layout-codemod\.nipesolutions\.com\/["']\s*\/?>/iu,
    ],
    [
      'website/index.html: missing 16x16 favicon declaration',
      /<link\s+rel=["']icon["'][^>]*sizes=["']16x16["'][^>]*href=["']\/favicon-16x16\.png["'][^>]*>/iu,
    ],
    [
      'website/index.html: missing 32x32 favicon declaration',
      /<link\s+rel=["']icon["'][^>]*sizes=["']32x32["'][^>]*href=["']\/favicon-32x32\.png["'][^>]*>/iu,
    ],
    [
      'website/index.html: missing ICO favicon declaration',
      /<link\s+rel=["']icon["'][^>]*href=["']\/favicon\.ico["'][^>]*>/iu,
    ],
    [
      'website/index.html: missing Apple touch icon declaration',
      /<link\s+rel=["']apple-touch-icon["'][^>]*sizes=["']180x180["'][^>]*href=["']\/apple-touch-icon\.png["'][^>]*>/iu,
    ],
    [
      'website/index.html: missing web manifest declaration',
      /<link\s+rel=["']manifest["']\s+href=["']\/site\.webmanifest["']\s*\/?>/iu,
    ],
    [
      `website/index.html: theme color must be ${THEME_COLOR}`,
      /<meta\s+name=["']theme-color["']\s+content=["']#111b24["']\s*\/?>/iu,
    ],
    [
      'website/index.html: missing Open Graph URL',
      /<meta\s+property=["']og:url["']\s+content=["']https:\/\/angular-flex-layout-codemod\.nipesolutions\.com\/["']\s*\/?>/iu,
    ],
    [
      'website/index.html: missing Open Graph social image',
      /<meta\s+property=["']og:image["']\s+content=["']https:\/\/angular-flex-layout-codemod\.nipesolutions\.com\/og-image\.png["']\s*\/?>/iu,
    ],
    [
      'website/index.html: missing Open Graph title',
      /<meta\s+property=["']og:title["']\s+content=["'][^"']+["']\s*\/?>/iu,
    ],
    [
      'website/index.html: missing Open Graph description',
      /<meta\s+property=["']og:description["']\s+content=["'][^"']+["']\s*\/?>/iu,
    ],
    [
      'website/index.html: missing large-image Twitter card',
      /<meta\s+name=["']twitter:card["']\s+content=["']summary_large_image["']\s*\/?>/iu,
    ],
  ];

  for (const [message, expression] of checks) if (!hasTag(html, expression)) issues.push(message);
}

function inspectManifest(manifest, issues) {
  if (manifest.theme_color !== THEME_COLOR) {
    issues.push(`website/public/site.webmanifest: theme_color must be ${THEME_COLOR}`);
  }
  if (manifest.background_color !== THEME_COLOR) {
    issues.push(`website/public/site.webmanifest: background_color must be ${THEME_COLOR}`);
  }
  if (manifest.start_url !== '/') issues.push('website/public/site.webmanifest: start_url must be /');
  if (manifest.display !== 'standalone') issues.push('website/public/site.webmanifest: display must be standalone');

  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  for (const [src, sizes] of [
    ['/icon-192.png', '192x192'],
    ['/icon-512.png', '512x512'],
  ]) {
    const matches = icons.filter(icon => icon?.src === src && icon?.sizes === sizes && icon?.type === 'image/png');
    if (!matches.some(icon => icon.purpose === 'any')) {
      issues.push(`website/public/site.webmanifest: ${src} must declare purpose any`);
    }
    if (!matches.some(icon => icon.purpose === 'maskable')) {
      issues.push(`website/public/site.webmanifest: ${src} must declare purpose maskable`);
    }
  }
}

function inspectIco(buffer, issues) {
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
    issues.push('website/public/favicon.ico: not a valid ICO file');
    return;
  }
  const count = buffer.readUInt16LE(4);
  if (count < 2) issues.push('website/public/favicon.ico: must contain 16x16 and 32x32 entries');
  const dimensions = new Set();
  for (let index = 0; index < count && 6 + index * 16 + 16 <= buffer.length; index += 1) {
    const offset = 6 + index * 16;
    const width = buffer[offset] === 0 ? 256 : buffer[offset];
    const height = buffer[offset + 1] === 0 ? 256 : buffer[offset + 1];
    dimensions.add(`${width}x${height}`);
  }
  for (const dimension of ['16x16', '32x32']) {
    if (!dimensions.has(dimension)) issues.push(`website/public/favicon.ico: missing ${dimension} entry`);
  }
}

export async function inspectWebsiteAssets(repository = resolve(import.meta.dirname, '..')) {
  const issues = [];

  const source = { path: 'website/public/icon-source.png', width: 1024, height: 1024 };
  for (const asset of [source, ...pngAssets]) {
    const path = resolve(repository, asset.path);
    if (!(await exists(path))) {
      issues.push(`${asset.path}: missing asset`);
      continue;
    }
    const buffer = await readFile(path);
    inspectPng(buffer, asset, issues);
    if (asset === source) inspectMasterPixels(buffer, issues);
  }

  const faviconPath = resolve(repository, 'website/public/favicon.ico');
  if (!(await exists(faviconPath))) issues.push('website/public/favicon.ico: missing asset');
  else inspectIco(await readFile(faviconPath), issues);

  const manifestPath = resolve(repository, 'website/public/site.webmanifest');
  if (!(await exists(manifestPath))) issues.push('website/public/site.webmanifest: missing asset');
  else {
    try {
      inspectManifest(JSON.parse(await readFile(manifestPath, 'utf8')), issues);
    } catch (error) {
      issues.push(
        `website/public/site.webmanifest: invalid JSON (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  const htmlPath = resolve(repository, 'website/index.html');
  if (!(await exists(htmlPath))) issues.push('website/index.html: missing file');
  else inspectHtml(await readFile(htmlPath, 'utf8'), issues);

  return issues;
}

export async function verifyWebsiteAssets(repository) {
  const issues = await inspectWebsiteAssets(repository);
  if (issues.length > 0) throw new Error(`Website asset verification failed:\n- ${issues.join('\n- ')}`);
}

function isDirectInvocation(moduleUrl, argumentPath = process.argv[1]) {
  if (!argumentPath) return false;
  return resolve(fileURLToPath(moduleUrl)) === resolve(argumentPath);
}

if (isDirectInvocation(import.meta.url)) {
  verifyWebsiteAssets()
    .then(() => console.log('Website assets verified.'))
    .catch(error => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
