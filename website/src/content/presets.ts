export interface PlaygroundPreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly source: string;
}

export const playgroundPresets = [
  {
    id: 'row-with-gap',
    label: 'Row with gap',
    description: 'A static Flex row and pixel gap that both targets can represent.',
    source: '<div fxLayout="row" fxLayoutGap="16px"></div>',
  },
  {
    id: 'responsive-stack',
    label: 'Responsive stack',
    description: 'A column that becomes a row above the archived gt-sm breakpoint.',
    source: '<section fxLayout="column" fxLayout.gt-sm="row" fxLayoutGap="24px"></section>',
  },
  {
    id: 'review-a-binding',
    label: 'Binding to review',
    description: 'A runtime expression that remains unchanged with a diagnostic.',
    source: '<div [fxFlex]="basis"></div>',
  },
] as const satisfies readonly PlaygroundPreset[];

export const initialPlaygroundPreset = playgroundPresets[0];
