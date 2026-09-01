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
- Converting ordinary unsuffixed Angular `ngClass` and `ngStyle` inputs.
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

Angular Flex-Layout selects one responsive value according to breakpoint priority and combines it with the unsuffixed fallback:

- `ngClass`: the selected responsive class value is applied through `NgClass`; ordinary base classes remain fallback classes.
- `ngStyle`: the selected responsive style map is merged over the element's fallback inline styles.

Responsive values are not treated as an additive union. Two intersecting ranges may convert together only when their normalized values are identical. Conflicting overlaps preserve the complete family with `responsive-precedence-unverified`.

Disjoint ranges may convert independently. Duplicate activations may convert only when their normalized values are identical.

## Responsive class conversion

### Literal parsing

A literal class value is decoded by the Angular template parser and split using HTML whitespace rules. Empty tokens are discarded and duplicates are removed in first-seen order.

Every token must be independently proven as a Tailwind CSS v4 candidate. If one token is unverified, the complete responsive class family is preserved.

### Tailwind candidate classifier

`TailwindCandidateClassifier` is a pure parser and registry. It does not invoke Tailwind, inspect project configuration, or read stylesheets.

It accepts:

- arbitrary properties such as `[color:#334155]` and `[--card-gap:1rem]`;
- arbitrary values under a recognized built-in utility namespace;
- built-in Tailwind v4 utility families represented by an explicit namespace and exact-token registry;
- ordinary Tailwind variants, important modifiers, and negative modifiers when their base utility is recognized.

The initial registry covers the common layout, spacing, sizing, typography, color, background, border, radius, shadow, opacity, overflow, position, inset, transform, transition, grid, table, list, object, cursor, pointer, visibility, and accessibility utility families.

It rejects:

- bare application class names such as `card`, `selected`, or `dashboard-panel`;
- unknown namespaces and project plugin utilities;
- malformed arbitrary values or variants;
- candidates containing ambiguous source escapes;
- source candidates containing a migrator-generated exact-media variant;
- tokens whose Tailwind meaning depends on project configuration and cannot be distinguished from an application class.

The registry is data, not a chain of directive-specific conditionals. Its tests compile representative accepted candidates with Tailwind CSS v4 and assert that representative rejected candidates produce no generated utility.

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

Existing Tailwind utilities are checked through the shared activation/property conflict model. A conflicting utility in an intersecting activation range preserves the family with `class-conflict`. Identical output tokens are reused rather than duplicated.

## Responsive style conversion

### Literal style parsing

`ResponsiveStyleValueParser` extends the existing conservative declaration-list scanner. It returns a canonical ordered map only when the entire decoded value is structurally valid and safe.

Supported declarations include:

- ordinary CSS properties with literal values;
- custom properties;
- Angular unit suffixes that have an exact CSS representation, such as `font-size.px: 14` becoming `font-size: 14px`;
- values containing balanced functions, quoted strings, CSS variables, and calc expressions when they can be encoded losslessly as Tailwind arbitrary values.

The parser rejects the complete family for:

- malformed declarations, duplicate properties with conflicting values, or ambiguous escapes;
- URL-bearing or sanitizer-sensitive values whose upstream sanitized result cannot be reproduced statically;
- Angular expression syntax or interpolation;
- property/unit combinations without an exact CSS representation;
- values that cannot be encoded and compiler-proven without semantic change.

### Fallback style authority

Responsive `ngStyle` is merged over fallback inline styles at runtime. Tailwind classes cannot override an ordinary inline declaration with the same property without changing priority.

The style family therefore remains unchanged when any unsuffixed literal or bound style authority may control a property emitted by the responsive family. A literal fallback style is parsed property-by-property: non-overlapping properties are compatible, while an overlapping property preserves the family. A bound fallback style is treated as potentially controlling every property.

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

Property names, custom-property case, significant whitespace inside strings, and value semantics are preserved by a dedicated Tailwind arbitrary-value encoder. Compiler-backed tests assert the emitted declarations and media ranges.

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
- decoded entities and whitespace;
- disjoint, duplicate, identical-overlap, and conflicting-overlap families;
- existing literal and bound class/style evidence;
- application classes and plugin-like utilities;
- fallback inline-style overlap;
- display interaction with visibility and layout;
- dynamic, interpolation, orientation, print, custom, and malformed inputs;
- source-order independence and second-run idempotence.

Coverage is measured by directive occurrences, not by declaring an entire project converted or unconverted. Public reports already expose exact unresolved results; documentation will explain how teams can aggregate diagnostic counts across representative repositories. The project does not claim universal conversion of arbitrary runtime behavior.

The byte-exact compatibility fixture produces 63 extended responsive report results. It asserts 39 converted and 24 preserved results, every standard alias for both directives, the complete diagnostic histogram, and a zero-edit second migration. A separate compatibility test asserts source-order independence within multi-state class and style families. Empty breakpoint suffixes remain unchanged without being classified as responsive inputs. Visibility inputs in the fixture are counted separately by the public report contract.

## Compiler-proven output examples

The release suite compiles representative emitted candidates with the default Tailwind CSS v4 compiler and verifies their declarations and exact media ranges. The proven surface includes:

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
