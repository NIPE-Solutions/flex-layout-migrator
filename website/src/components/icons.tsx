import type { ReactNode, SVGProps } from 'react';

type SharedIconProps = Omit<SVGProps<SVGSVGElement>, 'aria-label' | 'children'>;

export type IconProps = SharedIconProps &
  ({ readonly decorative: true; readonly label?: never } | { readonly decorative?: false; readonly label: string });

type IconFrameProps = IconProps & {
  readonly children: ReactNode;
  readonly viewBox?: string;
};

function IconFrame({ children, decorative, label, viewBox = '0 0 24 24', ...props }: IconFrameProps) {
  return (
    <svg
      {...props}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : label}
      focusable="false"
      role={decorative ? undefined : 'img'}
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect x="8" y="8" width="11" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 8V5H5v11h3" fill="none" stroke="currentColor" strokeWidth="2" />
    </IconFrame>
  );
}

export function ResetIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M5.2 8.4A8 8 0 1 1 4 15M5.2 8.4H10M5.2 8.4V3.6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeWidth="2"
      />
    </IconFrame>
  );
}

export function GitHubIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.5 9.5 0 0 1 12 6.82a9.5 9.5 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85V21c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
      />
    </IconFrame>
  );
}

export function NpmIcon(props: IconProps) {
  return (
    <IconFrame {...props} viewBox="0 0 28 24">
      <path fill="currentColor" d="M2 5h24v12H14v2h-5v-2H2V5Zm4 3v6h4V8h2v6h2V8h2v6h4V8h2v7H18V8H6Z" />
    </IconFrame>
  );
}

export function ThemeIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0-1.42-1.42M7.06 7.06 5.64 5.64"
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
    </IconFrame>
  );
}

export function ArrowIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 12h15m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeLinecap="square" strokeWidth="2" />
    </IconFrame>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" strokeLinecap="square" strokeWidth="2.5" />
    </IconFrame>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 3 2.8 20h18.4L12 3Z" fill="none" stroke="currentColor" strokeLinejoin="miter" strokeWidth="2" />
      <path d="M12 9v5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </IconFrame>
  );
}
