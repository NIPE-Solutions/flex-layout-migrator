import console from 'node:console';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { decodeRgbaPng, expectedWebsiteAssets, PALETTE } from './generate-website-assets.mjs';

const THEME_COLOR = '#111b24';
const pngAssets = Object.freeze([
  { path: 'website/public/icon-source.png', width: 1024, height: 1024, kind: 'master' },
  { path: 'website/public/favicon-16x16.png', width: 16, height: 16, kind: 'favicon' },
  { path: 'website/public/favicon-32x32.png', width: 32, height: 32, kind: 'favicon' },
  { path: 'website/public/apple-touch-icon.png', width: 180, height: 180, kind: 'derivative' },
  { path: 'website/public/icon-192.png', width: 192, height: 192, kind: 'derivative' },
  { path: 'website/public/icon-512.png', width: 512, height: 512, kind: 'derivative' },
  { path: 'website/public/maskable-192.png', width: 192, height: 192, kind: 'maskable' },
  { path: 'website/public/maskable-512.png', width: 512, height: 512, kind: 'maskable' },
  { path: 'website/public/og-image.png', width: 1200, height: 630, kind: 'social' },
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

function hex(red, green, blue) {
  return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;
}

function pixelsOfColor(image, color) {
  const coordinates = [];
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (
        image.pixels[offset] === color[0] &&
        image.pixels[offset + 1] === color[1] &&
        image.pixels[offset + 2] === color[2] &&
        image.pixels[offset + 3] >= 128
      ) {
        coordinates.push([x, y]);
      }
    }
  }
  return coordinates;
}

function componentCount(coordinates) {
  const remaining = new Set(coordinates.map(([x, y]) => `${x},${y}`));
  let count = 0;
  while (remaining.size > 0) {
    count += 1;
    const first = remaining.values().next().value;
    remaining.delete(first);
    const queue = [first];
    while (queue.length > 0) {
      const [x, y] = queue.pop().split(',').map(Number);
      for (const adjacent of [`${x - 1},${y}`, `${x + 1},${y}`, `${x},${y - 1}`, `${x},${y + 1}`]) {
        if (remaining.delete(adjacent)) queue.push(adjacent);
      }
    }
  }
  return count;
}

function inspectFavicon(image, path, issues) {
  const visible = [];
  const colors = new Set();
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.pixels[offset + 3] >= 128) {
        visible.push([x, y]);
        colors.add(hex(image.pixels[offset], image.pixels[offset + 1], image.pixels[offset + 2]));
      }
    }
  }

  const occupancy = visible.length / (image.width * image.height);
  if (occupancy < 0.22 || occupancy > 0.65) {
    issues.push(`${path}: favicon occupancy must stay between 22% and 65% (received ${(occupancy * 100).toFixed(1)}%)`);
  }
  for (const color of ['#111b24', '#c9153d', '#00afa1', '#f6f1e7']) {
    if (!colors.has(color)) issues.push(`${path}: missing favicon palette color ${color}`);
  }
  if (visible.length > 0) {
    const xs = visible.map(([x]) => x);
    const ys = visible.map(([, y]) => y);
    const width = Math.max(...xs) - Math.min(...xs) + 1;
    const height = Math.max(...ys) - Math.min(...ys) + 1;
    if (width / image.width < 0.75 || height / image.height < 0.55) {
      issues.push(`${path}: favicon silhouette does not use enough of the native pixel grid`);
    }
  }
  if (componentCount(pixelsOfColor(image, PALETTE.red)) < 3) {
    issues.push(`${path}: favicon must preserve three distinguishable red input rails`);
  }
  if (componentCount(pixelsOfColor(image, PALETTE.teal)) < 6) {
    issues.push(`${path}: favicon must preserve six distinguishable teal output cells`);
  }
}

function inspectTransparency(image, path, issues) {
  let transparent = false;
  let visible = false;
  for (let offset = 3; offset < image.pixels.length; offset += 4) {
    transparent ||= image.pixels[offset] === 0;
    visible ||= image.pixels[offset] >= 128;
  }
  if (!transparent) issues.push(`${path}: transparent icon must include zero-alpha background pixels`);
  if (!visible) issues.push(`${path}: icon has no visible pixels`);
}

function inspectMaster(image, path, issues) {
  inspectTransparency(image, path, issues);
  const colors = new Set();
  for (let offset = 0; offset < image.pixels.length; offset += 4) {
    if (image.pixels[offset + 3] >= 250) {
      colors.add(hex(image.pixels[offset], image.pixels[offset + 1], image.pixels[offset + 2]));
    }
  }
  for (const color of ['#111b24', '#c9153d', '#00afa1', '#f6f1e7']) {
    if (!colors.has(color)) issues.push(`${path}: missing approved palette color ${color}`);
  }
}

function inspectMaskable(image, path, issues) {
  let opaque = true;
  let outsideSafeCircle = false;
  const centerX = (image.width - 1) / 2;
  const centerY = (image.height - 1) / 2;
  const safeRadius = image.width * 0.4;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      opaque &&= image.pixels[offset + 3] === 255;
      const isBackground =
        image.pixels[offset] === PALETTE.paper[0] &&
        image.pixels[offset + 1] === PALETTE.paper[1] &&
        image.pixels[offset + 2] === PALETTE.paper[2];
      if (!isBackground && Math.hypot(x - centerX, y - centerY) > safeRadius) outsideSafeCircle = true;
    }
  }
  if (!opaque) issues.push(`${path}: maskable icon must be fully opaque`);
  if (outsideSafeCircle) issues.push(`${path}: artwork exceeds the maskable safe circle`);
}

function derivationIssue(kind, path) {
  if (kind === 'favicon') return `${path}: favicon does not match the separately pixel-curated treatment`;
  if (kind === 'social') return `${path}: derivative does not match deterministic social composition`;
  if (kind === 'maskable') return `${path}: derivative does not match deterministic maskable composition`;
  return `${path}: derivative does not match deterministic master rendering`;
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
  for (const [message, expression] of checks) if (!expression.test(html)) issues.push(message);
}

function inspectManifest(manifest, issues) {
  if (manifest.theme_color !== THEME_COLOR)
    issues.push(`website/public/site.webmanifest: theme_color must be ${THEME_COLOR}`);
  if (manifest.background_color !== THEME_COLOR)
    issues.push(`website/public/site.webmanifest: background_color must be ${THEME_COLOR}`);
  if (manifest.start_url !== '/') issues.push('website/public/site.webmanifest: start_url must be /');
  if (manifest.display !== 'standalone') issues.push('website/public/site.webmanifest: display must be standalone');
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  const expected = [
    ['/icon-192.png', '192x192', 'any'],
    ['/icon-512.png', '512x512', 'any'],
    ['/maskable-192.png', '192x192', 'maskable'],
    ['/maskable-512.png', '512x512', 'maskable'],
  ];
  for (const [src, sizes, purpose] of expected) {
    if (
      !icons.some(
        icon => icon?.src === src && icon?.sizes === sizes && icon?.type === 'image/png' && icon?.purpose === purpose,
      )
    ) {
      issues.push(`website/public/site.webmanifest: missing ${purpose} icon ${src} at ${sizes}`);
    }
  }
  if (icons.some(icon => icon?.purpose === 'maskable' && !String(icon?.src).startsWith('/maskable-'))) {
    issues.push(
      'website/public/site.webmanifest: maskable icons must use dedicated /maskable-192.png and /maskable-512.png assets',
    );
  }
}

function inspectIco(buffer, faviconBuffers, issues) {
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
    issues.push('website/public/favicon.ico: not a valid ICO file');
    return;
  }
  const count = buffer.readUInt16LE(4);
  const payloads = new Map();
  for (let index = 0; index < count && 6 + index * 16 + 16 <= buffer.length; index += 1) {
    const offset = 6 + index * 16;
    const width = buffer[offset] === 0 ? 256 : buffer[offset];
    const height = buffer[offset + 1] === 0 ? 256 : buffer[offset + 1];
    const length = buffer.readUInt32LE(offset + 8);
    const dataOffset = buffer.readUInt32LE(offset + 12);
    payloads.set(`${width}x${height}`, buffer.subarray(dataOffset, dataOffset + length));
  }
  for (const [dimension, png] of faviconBuffers) {
    if (!payloads.has(dimension)) issues.push(`website/public/favicon.ico: missing ${dimension} entry`);
    else if (!payloads.get(dimension).equals(png)) {
      issues.push('website/public/favicon.ico: embedded entries do not match the curated favicon PNGs');
      break;
    }
  }
}

export async function inspectWebsiteAssets(repository = resolve(import.meta.dirname, '..')) {
  const issues = [];
  const buffers = new Map();
  const images = new Map();
  for (const asset of pngAssets) {
    const fullPath = resolve(repository, asset.path);
    if (!(await exists(fullPath))) {
      issues.push(`${asset.path}: missing asset`);
      continue;
    }
    const buffer = await readFile(fullPath);
    buffers.set(asset.path, buffer);
    try {
      const image = decodeRgbaPng(buffer);
      images.set(asset.path, image);
      if (image.width !== asset.width || image.height !== asset.height) {
        issues.push(`${asset.path}: expected ${asset.width}x${asset.height}, received ${image.width}x${image.height}`);
      }
      if (asset.kind === 'master') inspectMaster(image, asset.path, issues);
      if (asset.kind === 'favicon') inspectFavicon(image, asset.path, issues);
      if (asset.kind === 'derivative') inspectTransparency(image, asset.path, issues);
      if (asset.kind === 'maskable') inspectMaskable(image, asset.path, issues);
    } catch (error) {
      issues.push(`${asset.path}: invalid PNG (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  const masterBuffer = buffers.get('website/public/icon-source.png');
  if (masterBuffer !== undefined) {
    try {
      const expected = expectedWebsiteAssets(masterBuffer);
      for (const asset of pngAssets) {
        if (asset.kind === 'master') continue;
        const actual = images.get(asset.path);
        const expectedBuffer = expected.get(asset.path.replace('website/public/', ''));
        if (actual !== undefined && expectedBuffer !== undefined) {
          const expectedImage = decodeRgbaPng(expectedBuffer);
          if (
            actual.width !== expectedImage.width ||
            actual.height !== expectedImage.height ||
            !actual.pixels.equals(expectedImage.pixels)
          ) {
            issues.push(derivationIssue(asset.kind, asset.path));
          }
        }
      }
    } catch (error) {
      issues.push(
        `website/public/icon-source.png: cannot derive assets (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  const faviconPath = resolve(repository, 'website/public/favicon.ico');
  if (!(await exists(faviconPath))) issues.push('website/public/favicon.ico: missing asset');
  else {
    const favicon16 = buffers.get('website/public/favicon-16x16.png');
    const favicon32 = buffers.get('website/public/favicon-32x32.png');
    if (favicon16 !== undefined && favicon32 !== undefined) {
      inspectIco(
        await readFile(faviconPath),
        new Map([
          ['16x16', favicon16],
          ['32x32', favicon32],
        ]),
        issues,
      );
    }
  }

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
