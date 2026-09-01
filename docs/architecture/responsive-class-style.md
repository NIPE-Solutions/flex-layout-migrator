# Exact responsive class and style conversion

## Status

This document defines the supported conversion boundary for Angular Flex-Layout's extended responsive `ngClass` and `ngStyle` inputs. Tailwind CSS v4 is the only output target.

The design follows the final Angular Flex-Layout implementation at commit `84ac0ed`. Responsive class values are applied through Angular's `NgClass` directive. Responsive style values are parsed, sanitized, merged over fallback styles, and applied through `NgStyle`. The migration must preserve those observable semantics rather than merely producing plausible responsive CSS.

## Goals

- Convert literal responsive `ngClass` and `ngStyle` values for all 13 verified standard viewport aliases.
- Support the common built-in Tailwind CSS v4 utility surface without importing Tailwind at runtime.
- Preserve arbitrary application classes, plugin utilities, dynamic expressions, unsafe CSS, and precedence that cannot be proven.
- Reuse the existing breakpoint, class-token, CSS-declaration, conflict, dependency-closure, and reporting boundaries.
- Produce deterministic, idempotent template edits with no companion stylesheet and no runtime dependency.
- Keep the design open to a later companion-CSS mode without coupling the current implementation to it.

## Non-goals

- Evaluating Angular expressions, including constant-looking property bindings.
- Converting arbitrary application classes or project-specific Tailwind plugin utilities.
- Editing component or global CSS, Sass, Less, or Tailwind configuration files.
- Converting responsive `imgSrc`, CSS Grid directives, orientation aliases, print aliases, or custom breakpoints.
- General standalone conversion of ordinary unsuffixed Angular `ngClass` and `ngStyle` inputs. When responsive siblings exist, these inputs are still inspected as runtime fallback authorities.
- Replacing Angular sanitization with a less restrictive CSS interpretation.

## Source inputs

The current upstream selectors are the 13 responsive forms of `ngClass.<alias>` and `ngStyle.<alias>`:

`xs`, `sm`, `md`, `lg`, `xl`, `lt-sm`, `lt-md`, `lt-lg`, `lt-xl`, `gt-xs`, `gt-sm`, `gt-md`, and `gt-lg`.

Only unbound literal attributes are candidates for conversion:

```html
<div ngClass.sm="flex items-center"></div>
<div ngStyle.lt-md="font-size: 14px; color: #334155"></div>
```

Property bindings, interpolation, two-way bindings, orientation and print aliases, custom aliases, and empty breakpoint suffixes remain unchanged with their intrinsic diagnostics.

The deprecated responsive `class.<alias>` and `style.<alias>` spellings varied across Angular Flex-Layout releases. They remain recognized authorities but are not converted by this contract. This avoids selecting one historical replacement or merge behavior for projects whose installed version is not inspected.

## Semantic model

### Extended family

All responsive inputs for one extended directive on one element form an atomic family:

```ts
type ExtendedResponsiveKind = 'class' | 'style';

interface ExtendedResponsiveState<T> {
  readonly input: LocatedFlexLayoutInput;
  readonly activation: ResponsiveActivation;
  readonly value: T;
}
```

The planner classifies the complete family before emitting classes. A member with an intrinsic binding or breakpoint diagnostic keeps that diagnostic. Otherwise convertible siblings receive `context-unverified` when the family must be preserved.

States use the existing verified breakpoint catalog and canonical order. Output never depends on source attribute order.

### Upstream activation semantics

Angular Flex-Layout selects one responsive value according to breakpoint priority and falls back to the unsuffixed extended input when no responsive value is active:

- `ngClass`: an active responsive value replaces the unsuffixed `ngClass` value. A static HTML `class` value remains independently active through Angular `NgClass`'s initial-class channel.
- `ngStyle`: an active responsive value replaces the unsuffixed `ngStyle` value. Static inline `style` declarations are captured separately and merged under whichever extended style value is selected.

Responsive values are not treated as an additive union. Two intersecting ranges may convert together only when their normalized values are identical. Conflicting overlaps preserve the complete family with `responsive-precedence-unverified`.

Disjoint ranges may convert independently. Duplicate activations may convert only when their normalized values are identical.

## Responsive class conversion

### Literal parsing

A literal class value is decoded by the Angular template parser and split with Angular 15 `NgClass`'s `/\s+/` expression. This includes non-breaking and the other ECMAScript whitespace characters, not only HTML whitespace. Empty tokens are discarded and duplicates are removed in first-seen order.

Every token must be independently proven as a Tailwind CSS v4 candidate. If one token is unverified, the complete responsive class family is preserved.

### Tailwind candidate classifier

`TailwindCandidateClassifier` is a pure parser and registry. It does not invoke Tailwind, inspect project configuration, or read stylesheets.

It accepts:

- arbitrary properties such as `[color:#334155]` and `[--card-gap:1rem]`;
- arbitrary values under a recognized built-in utility namespace when Tailwind's selected property set is unambiguous and completely modeled;
- built-in Tailwind v4 utility families represented by an explicit namespace and exact-token registry;
- explicitly registered same-element state and media variants, important modifiers, and negative modifiers when their base utility is recognized.

The initial registry covers the common layout, spacing, sizing, typography, color, background, border, radius, shadow, opacity, overflow, position, inset, transform, transition, grid, table, list, object, cursor, pointer, visibility, and accessibility utility families.

It rejects:

- bare application class names such as `card`, `selected`, or `dashboard-panel`;
- unknown namespaces and project plugin utilities;
- malformed arbitrary values or variants;
- variants that retarget a pseudo-element, descendant, group/peer target, or another element, plus arbitrary selector and at-rule variants until selector ownership is modeled;
- fractions whose numerator or denominator is not a canonical integer;
- bare-number, named-color, unknown-unit, or complex inferred arbitrary typography values; ambiguous arbitrary border values; and every bracketed arbitrary shadow value;
- candidates containing ambiguous source escapes;
- decoded candidates that require HTML entity serialization or otherwise differ from the raw bytes Tailwind scans;
- source candidates containing a migrator-generated exact-media variant;
- tokens whose Tailwind meaning depends on project configuration and cannot be distinguished from an application class.

The registry is data, not a chain of directive-specific conditionals. Every accepted audit candidate is compiled with pinned Tailwind CSS v4 and its complete direct declaration-property list is compared with the modeled ownership set. The test boundary parses generated CSS with PostCSS, so candidate declarations nested under constructs such as `@supports` are attributed to the candidate rule without treating global fallback declarations as utility ownership. Untyped arbitrary text sizes are admitted only for numeric known-length or percentage forms. Arbitrary border widths require numeric or known-length forms, while admitted arbitrary border colors require an explicit type, hash, color function, or CSS variable. Bracketed arbitrary shadows remain unverified; built-in sizes and the CSS-variable shorthand retain exact geometry ownership. Compiler-valid utilities such as `truncate`, `size-*`, `divide-*`, or `ring-*` remain unverified until their full stable output is admitted deliberately.

### Emission

Each proven token is wrapped in the existing exact arbitrary media variant:

```html
<div ngClass.sm="flex items-center"></div>
```

becomes:

```html
<div
  class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:items-center"
></div>
```

Existing literal classes are retained byte-for-byte apart from the repository's established append behavior. Property-bound class authorities preserve any family that would generate classes.

Existing Tailwind utilities are checked through the shared activation and CSS-ownership model. Exact descriptors cover shorthands, axis-specific utilities such as `gap-y-*`, inferred arbitrary text sizes, logical and physical border style/width pairs, universal properties such as `all`, and multi-property utilities such as `text-sm/5`, `sr-only`, transforms, transitions, and shadows. Named and arbitrary existing shadow colors own `--tw-shadow-color`; geometry sizes own `--tw-shadow` and `box-shadow`. A parsed-CSS differential exercises the modeled families, including declarations nested under `@supports`, while a pinned default-theme class-list audit ensures no compiler-listed utility is silently ignored. A recognized utility whose complete declaration set is not modeled carries unknown authority and conservatively conflicts with generated ownership. A conflicting utility in an intersecting activation range preserves the family with `class-conflict`. Identical output tokens are reused rather than duplicated.

An unsuffixed `ngClass` is part of the complete replacement family even though it is not reported as a responsive source occurrence. A bound fallback preserves every responsive sibling, including an empty sibling. An empty literal fallback is compatible. A non-empty literal fallback is redundant only when every responsive value is exactly the same normalized class list. Even then, its retained base tokens remain non-suppressible ownership evidence during class/style/layout/visibility composition; overlapping coupled families are preserved when conversion cannot remove or translate that base authority safely.

## Responsive style conversion

### Literal style parsing

`ResponsiveStyleValueParser` reproduces the final Flex-Layout raw-string transform before applying conservative safety checks. The decoded string is trimmed and split at every semicolon, including semicolons inside quotes or functions. Each entry is split at its first colon and all single- and double-quote characters are removed from its key and value. Flex-Layout first reduces exact keys into a JavaScript object: a duplicate exact key replaces its value without moving that key's first insertion position. Distinct exact ordinary keys can still apply to the same CSS property after Angular removes a unit suffix and the browser normalizes the property name. Every such alias, including casing differences and `font-size` versus `font-size.px`, is rejected both within one state and across the complete responsive family because removal/application order after an activation transition can depend on prior state. Custom properties are case-sensitive and do not collide under this rule. Remaining declarations then follow Angular 15 `NgStyle` property and optional unit handling.

Supported declarations include:

- ordinary CSS properties with literal values;
- custom properties;
- Angular unit suffixes that have an exact CSS representation, such as `font-size.px: 14` becoming `font-size: 14px`;
- quote-stripped scalar values, CSS variables, and calc expressions when the transformed browser-facing value can be encoded losslessly as a Tailwind arbitrary value.

The parser rejects the complete family for:

- entries made ambiguous by upstream semicolon splitting, unsupported renderer property spelling, or ambiguous escapes;
- URL-bearing or sanitizer-sensitive values whose upstream sanitized result cannot be reproduced statically;
- Angular expression syntax or interpolation;
- property/unit combinations without an exact CSS representation;
- distinct exact ordinary keys that apply to the same CSS property within a state or across the responsive family, including case and unit-suffix aliases;
- declaration `!important` text, including case and trivia variants, because Angular `NgStyle` passes the text as a value without setting CSS priority;
- values that cannot be encoded as byte-identical raw HTML source and compiler-proven without semantic change.

### Fallback style authority

Responsive `ngStyle` is merged over static fallback inline styles at runtime. Tailwind classes cannot override an ordinary inline declaration with the same property without changing priority.

The style family therefore remains unchanged when a static literal or bound style authority may control a property emitted by the responsive family. A static literal `style` value is parsed property-by-property: non-overlapping properties are compatible, while an overlapping property preserves the family. A bound style authority is treated as potentially controlling every property.

An unsuffixed `ngStyle` has different semantics: it is the replaceable base value, not the static inline-style fallback. A bound unsuffixed value always preserves the responsive family. A non-empty literal raw-string fallback also preserves the family because leaving it behind would make it permanently active, while removing it would broaden this feature into standalone `ngStyle` conversion. Only an exact empty literal fallback is compatible with responsive emission.

### Emission

Each declaration becomes an exact responsive arbitrary-property utility:

```html
<div ngStyle.lt-md="font-size: 14px; color: #334155"></div>
```

becomes:

```html
<div
  class="[@media_screen_and_(max-width:_959.98px)]:[font-size:14px] [@media_screen_and_(max-width:_959.98px)]:[color:#334155]"
></div>
```

Property names, custom-property case, transformed scalar whitespace, and value semantics are preserved by a dedicated Tailwind arbitrary-value encoder. Compiler-backed tests assert the emitted declarations and media ranges; values requiring quotes or HTML character-reference escaping remain unconverted because Tailwind scans raw template bytes.

Existing arbitrary-property utilities participate in the shared conflict model. Intersecting utilities that control the same CSS property preserve the family unless the emitted token is identical.

## Element planning and dependencies

Extended class and style planning runs after template analysis and before final external-authority closure:

1. classify complete responsive families;
2. parse and normalize literal values;
3. validate responsive precedence;
4. emit candidate tokens;
5. compose with visibility and layout display ownership;
6. evaluate existing classes and style authorities;
7. close dependencies;
8. create edits only for fully converted families.

Responsive class/style inputs are display authorities when their normalized output controls `display`. They must participate in the existing visibility composition boundary rather than being handled by a later generic conflict pass.

An unresolved extended family retains its original attributes. It may force a related visibility or layout family to remain unchanged when the unresolved value can control a shared property. Unrelated extended properties do not block independent layout conversion.

No empty `class` attribute or byte-identical class-value edit is created.

The class editor never reserializes an existing value. Quoted values retain their delimiter and raw bytes; a physical separator and proven generated tokens are appended. A valid unquoted value is safely quoted as one attribute, a valueless `class` is replaced rather than duplicated, and an absent attribute is inserted normally. Generated candidates are admitted only when their raw bytes need no escaping under both supported quote delimiters and Angular reparses the same token. Existing source such as `[&>*]:p-4` therefore remains byte-identical while other proven tokens are appended; the same token in responsive `ngClass` is preserved because its selector targets descendants. Quote or named-reference content is also rejected because HTML escaping would hide the decoded token from Tailwind's raw scanner.

## Diagnostics

Existing diagnostic codes are reused where their meaning is exact:

- `dynamic-binding`
- `breakpoint-unverified`
- `custom-breakpoint`
- `responsive-precedence-unverified`
- `class-conflict`
- `bound-class`
- `context-unverified`
- `semantic-unsupported`

A new `tailwind-candidate-unverified` diagnostic identifies a literal responsive class containing an application, plugin, or otherwise unproven token. A new `style-value-unverified` diagnostic identifies a literal responsive style list that cannot be encoded with equivalent sanitized CSS semantics.

Diagnostics identify the source attribute, preserve deterministic ordering, and provide an actionable reason and suggested next step.

## Compatibility and measurement

The compatibility corpus covers:

- all 13 aliases for class and style;
- representative built-in Tailwind utility families and arbitrary properties;
- decoded entities and Angular `NgClass` ECMAScript whitespace, including non-breaking space;
- disjoint, duplicate, identical-overlap, and conflicting-overlap families;
- existing literal and bound class/style evidence;
- application classes and plugin-like utilities;
- fallback inline-style overlap;
- empty, literal, and bound unsuffixed `ngClass`/`ngStyle` fallback authority;
- Flex-Layout raw-string quote removal and unconditional semicolon splitting;
- exact-key duplicates plus atomic preservation of within-state and cross-state aliases after case and unit normalization;
- declaration-priority rejection;
- raw Tailwind source discovery and complete multi-property ownership;
- display interaction with visibility and layout;
- dynamic, interpolation, orientation, print, custom, and malformed inputs;
- source-order independence and second-run idempotence.

Coverage is measured by directive occurrences, not by declaring an entire project converted or unconverted. Public reports already expose exact unresolved results; documentation will explain how teams can aggregate diagnostic counts across representative repositories. The project does not claim universal conversion of arbitrary runtime behavior.

The byte-exact compatibility fixture produces 78 extended responsive report results. It asserts 41 converted and 37 preserved results, every standard alias for both directives, the complete diagnostic histogram, one raw Tailwind CSS v4 CLI proof covering every expected generated token, and a zero-edit second migration. A separate compatibility test asserts source-order independence within multi-state class and style families. Empty breakpoint suffixes remain unchanged without being classified as responsive inputs. Visibility and other non-extended inputs in the fixture are counted separately by the public report contract.

## Compiler-proven output examples

The release suite compiles emitted candidates with pinned Tailwind CSS v4, verifies complete declaration ownership and exact media ranges, and scans the public expected fixture as raw template source. The proven surface includes:

| Source value                                        | Emitted candidate                                                                                         | Verified CSS effect                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `ngClass.gt-xs="w-[17px]"`                          | `[@media_screen_and_(min-width:_600px)]:w-[17px]`                                                         | `width: 17px` inside the minimum-width range      |
| `ngClass.gt-sm="hover:bg-blue-600"`                 | `[@media_screen_and_(min-width:_960px)]:hover:bg-blue-600`                                                | a hover background rule inside the range          |
| `ngStyle.lt-md="font-size.px: 14"`                  | `[@media_screen_and_(max-width:_959.98px)]:[font-size:14px]`                                              | `font-size: 14px` inside the maximum-width range  |
| `ngStyle.sm="--Card_Gap: 1rem"`                     | `[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:[--Card_Gap:1rem]`                      | the custom property and spelling are retained     |
| `ngStyle.md="width: calc(100% - var(--gap, 1rem))"` | `[@media_screen_and_(min-width:_960px)_and_(max-width:_1279.98px)]:[width:calc(100%_-_var(--gap,_1rem))]` | source spaces decode back to the same calculation |

## Release contract

- No runtime dependency or new CLI option is added.
- The published package remains the existing six-file bundle.
- Documentation states both the expanded conversion boundary and the preserved cases.
- User-facing support receives a minor Changeset.
- `npm run verify`, audit, package-content, tracked-control-file, and bundle-import gates must pass.

## Deferred work

- responsive `imgSrc` conversion;
- CSS Grid directive conversion;
- optional project-aware Tailwind/plugin resolution;
- optional companion stylesheet generation for application classes;
- conversion of deprecated version-dependent `class.<alias>` and `style.<alias>` spellings;
- orientation, print, and custom breakpoint conversion.
