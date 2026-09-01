import { readFile } from 'node:fs/promises';
import { compile } from 'tailwindcss';
import { TailwindCandidateClassifier } from './tailwind-candidate-classifier';

const tailwindSource = readFile(
  new URL('../../../../node_modules/tailwindcss/theme.css', import.meta.url),
  'utf8',
).then(theme => `${theme}\n@tailwind utilities;`);

const accepted = [
  ['flex', ['display']],
  ['grid', ['display']],
  ['hidden', ['display']],
  ['flex-row', ['flex-direction']],
  ['flex-wrap', ['flex-wrap']],
  ['items-center', ['align-items']],
  ['gap-4', ['gap']],
  ['gap-x-4', ['column-gap']],
  ['gap-y-4', ['row-gap']],
  ['-mt-2', ['margin-top']],
  ['mx-4', ['margin-inline']],
  ['ms-4', ['margin-inline-start']],
  ['w-[17px]', ['width']],
  ['p-4', ['padding']],
  ['px-4', ['padding-inline']],
  ['ps-4', ['padding-inline-start']],
  ['text-sm', ['font-size', 'line-height']],
  ['text-sm/5', ['font-size', 'line-height']],
  ['text-[17px]', ['font-size']],
  ['text-[length:17px]/5', ['font-size', 'line-height']],
  ['text-slate-700', ['color']],
  ['bg-blue-500', ['background-color']],
  ['bg-[url(hero.png)]', ['background-image']],
  ['bg-[url(data:image/svg+xml;base64,AAAA)]', ['background-image']],
  ['border', ['border-style', 'border-width']],
  ['border-solid', ['--tw-border-style', 'border-style']],
  ['border-red-500', ['border-color']],
  ['border-[3px]', ['border-style', 'border-width']],
  ['border-[#fff]', ['border-color']],
  ['border-(--card-border)', ['border-color']],
  ['rounded-lg', ['border-radius']],
  ['shadow-md', ['--tw-shadow', 'box-shadow']],
  ['shadow-[1px_2px_3px_red]', ['--tw-shadow', 'box-shadow']],
  ['opacity-50', ['opacity']],
  ['overflow-hidden', ['overflow']],
  ['absolute', ['position']],
  ['inset-x-0', ['inset-inline']],
  ['inset-y-0', ['inset-block']],
  ['top-0', ['top']],
  ['rotate-45', ['rotate']],
  ['scale-50', ['--tw-scale-x', '--tw-scale-y', '--tw-scale-z', 'scale']],
  ['scale-[1.2]', ['scale']],
  ['scale-(--factor)', ['scale']],
  ['translate-4', ['--tw-translate-x', '--tw-translate-y', 'translate']],
  ['transition-colors', ['transition-property', 'transition-timing-function', 'transition-duration']],
  ['transition-none', ['transition-property']],
  ['grid-cols-3', ['grid-template-columns']],
  ['table-auto', ['table-layout']],
  ['list-disc', ['list-style-type']],
  ['object-cover', ['object-fit']],
  ['cursor-pointer', ['cursor']],
  ['pointer-events-none', ['pointer-events']],
  ['visible', ['visibility']],
  [
    'sr-only',
    ['position', 'width', 'height', 'padding', 'margin', 'overflow', 'clip-path', 'white-space', 'border-width'],
  ],
  ['not-sr-only', ['position', 'width', 'height', 'padding', 'margin', 'overflow', 'clip-path', 'white-space']],
  ['hover:bg-blue-600', ['background-color']],
  ['dark:hover:text-white', ['color']],
  ['[&>*]:p-4', ['padding']],
  ['![color:red]', ['color']],
  ['[color:red]!', ['color']],
  ['[color:red!important]', ['color']],
  ['[color:red!important_]', ['color']],
  ['[color:red!important/**/]', ['color']],
  ['[color:red!/**/important]', ['color']],
  ['[color:red_!_important_]', ['color']],
  ['text-[color:red!important]', ['color']],
  ['text-[color:red!important_]', ['color']],
  ['w-[17px!important]', ['width']],
  ['w-[17px!important/**/]', ['width']],
  ['[--card-gap:1rem]', ['--card-gap']],
  ['w-(--card-width)', ['width']],
] as const;

const compilerRejected = [
  'card',
  'selected',
  'dashboard-panel',
  'plugin-widget',
  'text-brand',
  'bg-brand',
  'gap-brand',
  'w-brand',
  'w-7xs',
  'h-3xs',
  'min-h-3xs',
  'max-h-3xs',
  'text-sm/brand',
  'm-1/2',
  'm-full',
  '-m-auto',
  'max-w-auto',
  'translate-auto',
  'border-0.5',
  'rotate-0.5',
  'scale-0.5',
  'flexible',
  'items-centered',
  'grid-cols-',
  'hover:',
  'w-[17px',
  'w-17px]',
  'w-[1px;color:red]',
  '[;]:flex',
  'bg-[image:]',
  'bg-[image:\n]',
  'text-[14px]junk',
  'text-[length:14px]junk',
  'text-[color:red]junk',
  'w-[{}]',
  'gap-[{}]',
  'flex\\',
  '[color:]',
  '[:red]',
] as const;

const compilerToleratedPolicyRejected = [
  '[content:"quoted&copy;"]',
  "[content:'quoted&copy;']",
  'w-[1px\u0007]',
  'w-[1px\\]',
  '[color:red!important/*unterminated]',
  '[@media_screen_and_(min-width:_700px)_and_(max-width:_600px)]:flex',
  'truncate',
  'size-4',
  'divide-x-2',
  'ring-2',
] as const;

const classifierRejected = [
  ...compilerRejected,
  ...compilerToleratedPolicyRejected,
  '[content:&copy;]',
  '',
  '!',
  'w-\\[17px\\]',
  'hover\\:flex',
  '[color:red\\]',
  '[color:red\\!important]',
  '[color:red!important\\_]',
  '[@media_screen_and_(min-width:_600px)]:flex',
] as const;

async function compiles(candidate: string): Promise<boolean> {
  const compiler = await compile(await tailwindSource);
  const emptyCss = compiler.build([]);

  try {
    return compiler.build([candidate]) !== emptyCss;
  } catch {
    return false;
  }
}

async function compiledCssProperties(candidate: string): Promise<readonly string[]> {
  const compiler = await compile(await tailwindSource);
  const css = compiler.build([candidate]).replace(/^\/\*![\s\S]*?\*\/\s*/u, '');
  const properties: string[] = [];

  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    if (!block[1]?.includes('.')) continue;
    for (const declaration of block[2]?.split(';') ?? []) {
      const property = declaration.trim().match(/^(-{0,2}[a-z][a-z\d-]*)\s*:/iu)?.[1];
      if (property !== undefined && !properties.includes(property)) properties.push(property);
    }
  }
  return properties;
}

describe('TailwindCandidateClassifier', () => {
  test.each(accepted)(
    'verifies compiler-backed candidate %s with complete CSS ownership',
    (candidate, cssProperties) => {
      const result = new TailwindCandidateClassifier().classify(candidate);

      expect(result.status).toBe('verified');
      if (result.status !== 'verified') return;
      expect(result.descriptor).toMatchObject({
        token: candidate,
        cssProperties,
      });
    },
  );

  test.each(classifierRejected)('leaves unproven or unsafe source candidate %j unverified', candidate => {
    const result = new TailwindCandidateClassifier().classify(candidate);

    expect(result.status).toBe('unverified');
    if (result.status !== 'unverified') return;
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test.each(accepted)('has Tailwind CSS v4 compiler evidence for accepted candidate %s', async candidate => {
    await expect(compiles(candidate)).resolves.toBe(true);
  });

  test.each(accepted)(
    'models every Tailwind CSS v4 declaration property emitted by accepted candidate %s',
    async (candidate, cssProperties) => {
      await expect(compiledCssProperties(candidate)).resolves.toEqual(cssProperties);
    },
  );

  test.each([
    '[color:red!important]',
    '[color:red!important_]',
    '[color:red!important/**/]',
    '[color:red!/**/important]',
    '[color:red_!_important_]',
    'text-[color:red!important_]',
    'w-[17px!important/**/]',
  ])('has Tailwind CSS v4 declaration-importance evidence for %s', async candidate => {
    const compiler = await compile(await tailwindSource);
    const cssWithoutComments = compiler.build([candidate]).replace(/\/\*[\s\S]*?\*\//gu, ' ');

    expect(cssWithoutComments).toMatch(/!\s*important\s*;/iu);
  });

  test.each([
    '[color:"red!important"]',
    "[color:'red!important']",
    '[color:var(--fallback!important)]',
    '[color:var(--fallback_!important)]',
    '[color:oklch(50%_0.2_10_!important)]',
  ])('has Tailwind CSS v4 normal-declaration evidence for nested or quoted %s', async candidate => {
    const compiler = await compile(await tailwindSource);
    const cssWithoutComments = compiler.build([candidate]).replace(/\/\*[\s\S]*?\*\//gu, ' ');

    expect(cssWithoutComments).not.toMatch(/!\s*important\s*;/iu);
  });

  test.each(compilerRejected)('has no Tailwind CSS v4 output for rejected candidate %j', async candidate => {
    await expect(compiles(candidate)).resolves.toBe(false);
  });

  test.each(compilerToleratedPolicyRejected)(
    'rejects compiler-tolerated unsafe arbitrary syntax in %j',
    async candidate => {
      expect(new TailwindCandidateClassifier().classify(candidate).status).toBe('unverified');
      await expect(compiles(candidate)).resolves.toBe(true);
    },
  );
});
