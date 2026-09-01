import { readFile } from 'node:fs/promises';
import postcss, { CssSyntaxError } from 'postcss';
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
  ['shadow-(--card-shadow)', ['--tw-shadow', 'box-shadow']],
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
  '[{}]:flex',
  '[>img]:flex',
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
  '[&>*]:p-4',
  '[&:hover]:flex',
  'before:flex',
  'after:flex',
  'placeholder:text-slate-700',
  'selection:bg-blue-500',
  'marker:text-slate-700',
  'file:border',
  'backdrop:bg-blue-500',
  'group-hover:flex',
  'peer-checked:flex',
  '[@supports(display:grid)]:flex',
  'text-[1px_2px_3px_red]',
  'text-[0]',
  'text-[1]',
  'text-[.5]',
  'text-[17foobar]',
  'text-[1.px]',
  'text-[1PX]',
  'text-[1q]',
  'text-[LENGTH:1px]',
  'text-[COLOR:red]',
  'text-[red]',
  'text-[rebeccapurple]',
  'text-[transparent]',
  'text-[currentColor]',
  'border-[1px_2px_3px_red]',
  'border-[50%]',
  'border-[17foobar]',
  'border-[1.]',
  'border-[1.px]',
  'border-[1PX]',
  'border-[1q]',
  'border-[LENGTH:1px]',
  'border-[COLOR:red]',
  'border-[red]',
  'border-[rebeccapurple]',
  'border-[transparent]',
  'border-[currentColor]',
  'shadow-[red]',
  'shadow-[rebeccapurple]',
  'shadow-[transparent]',
  'shadow-[currentColor]',
  'shadow-[color:red]',
  'shadow-[#fff]',
  'shadow-[rgb(1_2_3)]',
  'shadow-[oklch(50%_0.2_10)]',
  'shadow-[1px_2px_3px_red]',
  'shadow-[0_1px_2px]',
  'shadow-[var(--shadow)]',
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
  const css = compiler.build([candidate]);
  const properties: string[] = [];

  try {
    postcss.parse(css).walkRules(rule => {
      if (!rule.selector.includes('.')) return;
      rule.walkDecls(declaration => {
        if (!properties.includes(declaration.prop)) properties.push(declaration.prop);
      });
    });
  } catch (error) {
    if (!(error instanceof CssSyntaxError)) throw error;
    return [];
  }
  return properties;
}

const fractionNamespaces = [
  'w',
  'h',
  'min-w',
  'min-h',
  'max-w',
  'max-h',
  'inset',
  'inset-x',
  'inset-y',
  'top',
  'right',
  'bottom',
  'left',
  'translate',
] as const;
const negativeFractionNamespaces = [
  'inset',
  'inset-x',
  'inset-y',
  'top',
  'right',
  'bottom',
  'left',
  'translate',
] as const;
const validFractionCandidates = fractionNamespaces.flatMap(namespace =>
  ['0/2', '1/2', '2/3', '10/12'].map(value => `${namespace}-${value}`),
);
const validNegativeFractionCandidates = negativeFractionNamespaces.flatMap(namespace =>
  ['1/2', '2/3'].map(value => `-${namespace}-${value}`),
);
const invalidFractionCandidates = [
  ...fractionNamespaces,
  ...negativeFractionNamespaces.map(namespace => `-${namespace}`),
].flatMap(namespace => ['0.5/2', '1.5/2', '01/2', '1/02'].map(value => `${namespace}-${value}`));

const exactAdmissionCandidates = [
  'inline',
  'block',
  'inline-block',
  'flow-root',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'contents',
  'table',
  'inline-table',
  'list-item',
  'hidden',
  'flex-row',
  'flex-row-reverse',
  'flex-col',
  'flex-col-reverse',
  'flex-wrap',
  'flex-wrap-reverse',
  'flex-nowrap',
  'static',
  'fixed',
  'absolute',
  'relative',
  'sticky',
  'border',
  'shadow',
  'transition',
  'visible',
  'invisible',
  'collapse',
  'sr-only',
  'not-sr-only',
] as const;
const namespaceAdmissionPrefixes = [
  'items',
  'gap',
  'gap-x',
  'gap-y',
  'm',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
  'ms',
  'me',
  'p',
  'px',
  'py',
  'pt',
  'pr',
  'pb',
  'pl',
  'ps',
  'pe',
  'w',
  'h',
  'min-w',
  'min-h',
  'max-w',
  'max-h',
  'text',
  'bg',
  'border',
  'rounded',
  'shadow',
  'opacity',
  'overflow',
  'inset',
  'inset-x',
  'inset-y',
  'top',
  'right',
  'bottom',
  'left',
  'rotate',
  'scale',
  'translate',
  'transition',
  'grid-cols',
  'table',
  'list',
  'object',
  'cursor',
  'pointer-events',
] as const;
const namespaceAdmissionSuffixes = [
  '0',
  '0.5',
  '1',
  '2',
  '4',
  '50',
  '100',
  'px',
  'auto',
  'full',
  'screen',
  'dvh',
  'min',
  'max',
  'fit',
  '3xs',
  '2xs',
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  '2xl',
  '4xl',
  '7xl',
  'none',
  'start',
  'end',
  'center',
  'baseline',
  'stretch',
  'solid',
  'dashed',
  'hidden',
  'visible',
  'scroll',
  'all',
  'colors',
  'transform',
  'subgrid',
  'fixed',
  'disc',
  'inside',
  'cover',
  'left-top',
  'pointer',
  'not-allowed',
  'red-500',
  'red-500/50',
  '[17px]',
  '[length:17px]',
  '[color:red]',
  '[#fff]',
  '[url(hero.png)]',
  '[linear-gradient(red,blue)]',
  '[1px_2px_3px_red]',
  '[var(--probe)]',
  '[{}]',
  '(--probe)',
  '1/2',
  '0.5/2',
  '01/2',
  '1/02',
] as const;
const namespaceAdmissionCandidates = namespaceAdmissionPrefixes.flatMap(namespace =>
  namespaceAdmissionSuffixes.flatMap(value => [`${namespace}-${value}`, `-${namespace}-${value}`]),
);
const variantAdmissionCandidates = [
  'hover',
  'focus',
  'dark',
  'sm',
  'before',
  'after',
  'placeholder',
  'selection',
  'marker',
  'file',
  'backdrop',
  'group-hover',
  'peer-checked',
  '[&>*]',
  '[&:hover]',
  '[{}]',
  '[>img]',
  '[@supports(display:grid)]',
].flatMap(variant => ['flex', 'p-4', 'text-sm'].map(utility => `${variant}:${utility}`));
const admissionAuditCandidates = [
  ...exactAdmissionCandidates,
  ...namespaceAdmissionCandidates,
  ...variantAdmissionCandidates,
];

const arbitraryCompilerOwnershipMatrix = [
  { candidate: 'text-[17px]', cssProperties: ['font-size'], admission: 'verified' },
  { candidate: 'text-[.5rem]', cssProperties: ['font-size'], admission: 'verified' },
  { candidate: 'text-[50%]', cssProperties: ['font-size'], admission: 'verified' },
  { candidate: 'text-[length:17px]', cssProperties: ['font-size'], admission: 'verified' },
  { candidate: 'text-[color:red]', cssProperties: ['color'], admission: 'verified' },
  { candidate: 'text-[#fff]', cssProperties: ['color'], admission: 'verified' },
  { candidate: 'text-[rgb(1_2_3)]', cssProperties: ['color'], admission: 'verified' },
  { candidate: 'text-[var(--text)]', cssProperties: ['color'], admission: 'verified' },
  { candidate: 'text-[0]', cssProperties: ['color'], admission: 'unverified' },
  { candidate: 'text-[1]', cssProperties: ['color'], admission: 'unverified' },
  { candidate: 'text-[.5]', cssProperties: ['color'], admission: 'unverified' },
  { candidate: 'text-[17foobar]', cssProperties: ['color'], admission: 'unverified' },
  { candidate: 'text-[1.px]', cssProperties: ['color'], admission: 'unverified' },
  { candidate: 'text-[1PX]', cssProperties: ['color'], admission: 'unverified' },
  { candidate: 'text-[1q]', cssProperties: ['color'], admission: 'unverified' },
  { candidate: 'text-[1Q]', cssProperties: ['font-size'], admission: 'verified' },
  { candidate: 'text-[LENGTH:1px]', cssProperties: [], admission: 'unverified' },
  { candidate: 'text-[COLOR:red]', cssProperties: [], admission: 'unverified' },
  { candidate: 'text-[red]', cssProperties: ['color'], admission: 'unverified' },
  { candidate: 'text-[rebeccapurple]', cssProperties: ['color'], admission: 'unverified' },
  { candidate: 'text-[transparent]', cssProperties: ['color'], admission: 'unverified' },
  { candidate: 'text-[currentColor]', cssProperties: ['color'], admission: 'unverified' },
  { candidate: 'text-[calc(1rem+1px)]', cssProperties: ['font-size'], admission: 'unverified' },
  { candidate: 'text-[length:var(--text)]', cssProperties: ['font-size'], admission: 'unverified' },
  { candidate: 'text-[1px_2px_3px_red]', cssProperties: ['color'], admission: 'unverified' },
  { candidate: 'border-[0]', cssProperties: ['border-style', 'border-width'], admission: 'verified' },
  { candidate: 'border-[.5]', cssProperties: ['border-style', 'border-width'], admission: 'verified' },
  { candidate: 'border-[3px]', cssProperties: ['border-style', 'border-width'], admission: 'verified' },
  { candidate: 'border-[.5rem]', cssProperties: ['border-style', 'border-width'], admission: 'verified' },
  { candidate: 'border-[length:3px]', cssProperties: ['border-style', 'border-width'], admission: 'verified' },
  { candidate: 'border-[color:red]', cssProperties: ['border-color'], admission: 'verified' },
  { candidate: 'border-[#fff]', cssProperties: ['border-color'], admission: 'verified' },
  { candidate: 'border-[rgb(1_2_3)]', cssProperties: ['border-color'], admission: 'verified' },
  { candidate: 'border-[var(--border)]', cssProperties: ['border-color'], admission: 'verified' },
  { candidate: 'border-(--border)', cssProperties: ['border-color'], admission: 'verified' },
  { candidate: 'border-[50%]', cssProperties: ['border-color'], admission: 'unverified' },
  { candidate: 'border-[17foobar]', cssProperties: ['border-color'], admission: 'unverified' },
  { candidate: 'border-[1.]', cssProperties: ['border-color'], admission: 'unverified' },
  { candidate: 'border-[1.px]', cssProperties: ['border-color'], admission: 'unverified' },
  { candidate: 'border-[1PX]', cssProperties: ['border-color'], admission: 'unverified' },
  { candidate: 'border-[1q]', cssProperties: ['border-color'], admission: 'unverified' },
  { candidate: 'border-[1Q]', cssProperties: ['border-style', 'border-width'], admission: 'verified' },
  { candidate: 'border-[LENGTH:1px]', cssProperties: [], admission: 'unverified' },
  { candidate: 'border-[COLOR:red]', cssProperties: [], admission: 'unverified' },
  { candidate: 'border-[red]', cssProperties: ['border-color'], admission: 'unverified' },
  { candidate: 'border-[rebeccapurple]', cssProperties: ['border-color'], admission: 'unverified' },
  { candidate: 'border-[transparent]', cssProperties: ['border-color'], admission: 'unverified' },
  { candidate: 'border-[currentColor]', cssProperties: ['border-color'], admission: 'unverified' },
  {
    candidate: 'border-[length:var(--border)]',
    cssProperties: ['border-style', 'border-width'],
    admission: 'unverified',
  },
  { candidate: 'border-[1px_2px_3px_red]', cssProperties: ['border-color'], admission: 'unverified' },
  { candidate: 'shadow-(--shadow)', cssProperties: ['--tw-shadow', 'box-shadow'], admission: 'verified' },
  { candidate: 'shadow-[red]', cssProperties: ['--tw-shadow-color'], admission: 'unverified' },
  { candidate: 'shadow-[rebeccapurple]', cssProperties: ['--tw-shadow-color'], admission: 'unverified' },
  { candidate: 'shadow-[transparent]', cssProperties: ['--tw-shadow-color'], admission: 'unverified' },
  { candidate: 'shadow-[currentColor]', cssProperties: ['--tw-shadow-color'], admission: 'unverified' },
  { candidate: 'shadow-[#fff]', cssProperties: ['--tw-shadow-color'], admission: 'unverified' },
  { candidate: 'shadow-[rgb(1_2_3)]', cssProperties: ['--tw-shadow-color'], admission: 'unverified' },
  { candidate: 'shadow-[oklch(50%_0.2_10)]', cssProperties: ['--tw-shadow-color'], admission: 'unverified' },
  { candidate: 'shadow-[color:red]', cssProperties: ['--tw-shadow-color'], admission: 'unverified' },
  {
    candidate: 'shadow-[1px_2px_3px_red]',
    cssProperties: ['--tw-shadow', 'box-shadow'],
    admission: 'unverified',
  },
  { candidate: 'shadow-[0_1px_2px]', cssProperties: ['--tw-shadow', 'box-shadow'], admission: 'unverified' },
  {
    candidate: 'shadow-[var(--shadow)]',
    cssProperties: ['--tw-shadow', 'box-shadow'],
    admission: 'unverified',
  },
] as const;

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

  test.each(arbitraryCompilerOwnershipMatrix)(
    'uses compiler-exact arbitrary ownership for $candidate and keeps it $admission',
    async ({ candidate, cssProperties, admission }) => {
      const result = new TailwindCandidateClassifier().classify(candidate);

      await expect(compiledCssProperties(candidate)).resolves.toEqual(cssProperties);
      expect(result.status).toBe(admission);
      if (result.status === 'verified') expect(result.descriptor.cssProperties).toEqual(cssProperties);
    },
  );

  test.each([...validFractionCandidates, ...validNegativeFractionCandidates])(
    'admits integer Tailwind fraction grammar with compiler output for %s',
    async candidate => {
      expect(new TailwindCandidateClassifier().classify(candidate).status).toBe('verified');
      await expect(compiles(candidate)).resolves.toBe(true);
    },
  );

  test.each(invalidFractionCandidates)(
    'rejects non-integer or non-canonical Tailwind fraction grammar with no compiler output for %s',
    async candidate => {
      expect(new TailwindCandidateClassifier().classify(candidate).status).toBe('unverified');
      await expect(compiles(candidate)).resolves.toBe(false);
    },
  );

  test('keeps every verified candidate in a parameterized namespace and variant audit compiler-backed', async () => {
    const classifier = new TailwindCandidateClassifier();
    const mismatches: {
      readonly candidate: string;
      readonly modeled: readonly string[];
      readonly emitted: readonly string[];
    }[] = [];

    for (const candidate of admissionAuditCandidates) {
      const result = classifier.classify(candidate);
      if (result.status !== 'verified') continue;
      const emitted = await compiledCssProperties(candidate);
      if (emitted.join('\0') !== result.descriptor.cssProperties.join('\0')) {
        mismatches.push({ candidate, modeled: result.descriptor.cssProperties, emitted });
      }
    }

    expect(mismatches).toEqual([]);
  }, 15_000);
});
