import { tailwindBuiltinVariants } from './tailwind-builtin-variants';
import type { TailwindTargetProfile } from './tailwind-target-profile';

/** Only min-only px ranges can be named without a unit conversion or exclusive-bound change. */
export function renderTargetCandidate(candidate: string, profile: TailwindTargetProfile): string {
  const match = /^\[@media_screen_and_\(min-width:_(\d+(?:\.\d+)?)px\)\]:(.+)$/.exec(candidate);
  if (match) {
    const exact = Object.entries(profile.breakpoints).find(
      ([name, setting]) =>
        setting.confidence !== 'unknown' && setting.value === `${match[1]}px` && isNamedBreakpoint(name),
    );
    // Tailwind named variants apply to all media; retain the source's screen restriction.
    if (exact) candidate = `[@media_screen]:${exact[0]}:${match[2]}`;
  }
  return profile.prefix.value ? `${profile.prefix.value}:${candidate}` : candidate;
}
export function normalizeTargetCandidate(candidate: string, profile: TailwindTargetProfile): string {
  const prefix = profile.prefix.value;
  if (prefix && candidate.startsWith(`${prefix}:`)) candidate = candidate.slice(prefix.length + 1);
  const match = /^\[@media_screen\]:([^:]+):(.+)$/.exec(candidate);
  if (match) {
    const setting = profile.breakpoints[match[1]!];
    const width = setting?.value;
    if (setting?.confidence !== 'unknown' && isNamedBreakpoint(match[1]!) && width?.endsWith('px'))
      return `[@media_screen_and_(min-width:_${width})]:${match[2]}`;
  }
  return candidate;
}

function isNamedBreakpoint(name: string): boolean {
  return !tailwindBuiltinVariants.some(root => name === root || name.startsWith(`${root}-`));
}
