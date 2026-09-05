export const siteContent = {
  productionUrl: 'https://angular-flex-layout-codemod.nipesolutions.com',
  identity: {
    productName: 'Flex Layout Codemod',
    familyName: 'NIPE Open Source',
  },
  navigationLabel: 'Primary navigation',
  navigation: [
    { label: 'Overview', href: '/#overview' },
    { label: 'Playground', href: '/#playground' },
    { label: 'Documentation', href: '/docs' },
  ],
  hero: {
    heading: 'Migrate Angular Flex-Layout with confidence.',
    introduction:
      'Convert supported template directives to Tailwind CSS or native CSS while preserving the source that still needs a human decision.',
  },
  installCommand: 'npm install --save-dev --save-exact @nipe-solutions/flex-layout-codemod@beta',
  links: {
    nipeOpenSource: {
      label: 'NIPE Open Source',
      href: 'https://opensource.nipesolutions.com',
    },
    github: {
      label: 'View on GitHub',
      href: 'https://github.com/NIPE-Solutions/flex-layout-migrator',
    },
    npm: {
      label: 'View on npm',
      href: 'https://www.npmjs.com/package/@nipe-solutions/flex-layout-codemod',
    },
  },
  supportHeading: 'A migration boundary you can inspect.',
  supportStatements: [
    {
      term: 'Source-aware',
      description:
        'Angular template parsing and source-range edits preserve unrelated text, comments, and control flow.',
    },
    {
      term: 'Two explicit targets',
      description: 'Tailwind CSS v4 is the default; supported Flex families can also emit owned native CSS.',
    },
    {
      term: 'Conservative by design',
      description: 'Dynamic, ambiguous, conflicting, or unsupported inputs remain unchanged with diagnostics.',
    },
  ],
  playground: {
    heading: 'Preview one template in your browser.',
    description: 'The interactive playground uses the same browser-safe migration boundary as the production engine.',
    privacyStatement: 'Your template never leaves this browser.',
    regionLabel: 'Migration playground preview',
  },
  limitations: [
    'The browser preview handles one template at a time.',
    'Only the installed CLI performs discovery, project validation, reporting, transactional writes, rollback, and multi-file work.',
    'Unsupported or ambiguous source remains available for review instead of being guessed.',
  ],
  documentation: {
    heading: 'Use the CLI for project migrations.',
    description:
      'Review the compatibility boundary, plan before writing, and keep the generated report with your migration work.',
    link: { label: 'Read the documentation', href: '/docs' },
  },
  legalPages: {
    '/privacy': {
      heading: 'Privacy',
      introduction: 'The template playground is designed as a local, in-browser preview.',
      sections: [
        {
          heading: 'Playground source',
          paragraphs: [
            'Template text is held only in the current page component memory. It is not submitted to a server, persisted by the site, or included in a network request. Reloading or leaving the page clears it.',
            'Clipboard access occurs only after you select a Copy action and is subject to your browser permissions.',
          ],
        },
        {
          heading: 'Hosting',
          paragraphs: [
            'The static site host may process ordinary request metadata needed to deliver the site. Do not paste secrets into any online development tool.',
          ],
        },
      ],
    },
    '/imprint': {
      heading: 'Imprint',
      introduction: 'Project and publisher information for Flex Layout Codemod.',
      sections: [
        {
          heading: 'Publisher',
          paragraphs: [
            'Flex Layout Codemod is an open-source project by Nicholas Petrasek in the NIPE Open Source family. Package and repository details are available through the global project links.',
          ],
        },
        {
          heading: 'License and support',
          paragraphs: [
            'The software is provided under the MIT License. Use the repository issue tracker for general project support and GitHub private vulnerability reporting for security reports.',
          ],
        },
      ],
    },
  },
  footerLabel: 'Project links',
  footerLinks: [
    {
      label: 'NIPE Open Source',
      href: 'https://opensource.nipesolutions.com',
    },
    {
      label: 'Repository',
      href: 'https://github.com/NIPE-Solutions/flex-layout-migrator',
    },
    {
      label: 'Package',
      href: 'https://www.npmjs.com/package/@nipe-solutions/flex-layout-codemod',
    },
    {
      label: 'License',
      href: 'https://github.com/NIPE-Solutions/flex-layout-migrator/blob/main/LICENSE',
    },
    { label: 'Imprint', href: '/imprint' },
    { label: 'Privacy', href: '/privacy' },
  ],
} as const;
