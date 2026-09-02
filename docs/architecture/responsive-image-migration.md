# Responsive image migration

## Purpose

This milestone adds an opt-in native HTML migration for Angular Flex-Layout responsive image sources. It converts literal `src.<alias>` inputs on `<img>` elements into ordered `<picture>` and `<source media>` markup while retaining the original `<img>` as the fallback.

Responsive images are a structural HTML transformation, not a Tailwind or native CSS target. They therefore use a dedicated planning and rendering pipeline rather than extending class-oriented adapter results. Conversion remains safety-first: the migrator rewrites an image only when browser `<picture>` selection can be proven equivalent to the archived Flex-Layout breakpoint behavior.

Dynamic responsive sources, orientation, print, custom breakpoints, project-defined breakpoint replacements, multi-density `srcset`, art-direction metadata, and interactive review UI remain outside this milestone.

## Opt-in contract

The CLI adds `--responsive-images`. Supplying the flag confirms that the user accepts `<img>` elements being wrapped in `<picture>` and has reviewed the possibility of selector changes such as `parent > img`, `img:first-child`, or rules tied to the original parent element.

The flag enables structural planning but does not weaken individual safety checks. Without it, responsive `src.<alias>` inputs remain unchanged with a diagnostic that identifies `--responsive-images`. The migrator does not inspect CSS, Sass, Less, test selectors, or application JavaScript to infer whether wrapping is harmless.

Responsive-image behavior is independent of `--target tailwind`, `--orientation-breakpoints`, and `--print-with-breakpoints`. The current CLI still requires its existing target because responsive-image output shares the same migration invocation and report.

## Supported source contract

An image is eligible when all of these conditions hold:

- the host is an HTML `<img>` element;
- at least one responsive `src.<alias>` input is present;
- every responsive member is a literal using one of the 13 archived standard viewport aliases;
- every responsive value can be encoded as one safe, descriptor-free `srcset` candidate without changing its decoded URL;
- the fallback is either a literal `src`, a bound `[src]`, or absent;
- the image is not already a descendant of `<picture>`;
- the image has no Angular structural-directive attribute;
- its source ranges describe one complete, unambiguous element that can be replaced atomically; and
- the complete edited template reparses successfully with the Angular compiler.

The supported aliases are `xs`, `sm`, `md`, `lg`, `xl`, `lt-sm`, `lt-md`, `lt-lg`, `lt-xl`, `gt-xs`, `gt-sm`, `gt-md`, and `gt-lg` using the exact definitions and priorities in the shared breakpoint catalog.

All nonresponsive attributes and bindings stay on the fallback `<img>`, including `alt`, `width`, `height`, `loading`, `decoding`, accessibility metadata, event handlers, references, classes, styles, literal `src`, and bound `[src]`. The renderer removes only responsive source attributes whose complete family converts.

## Archived runtime semantics

Angular Flex-Layout registers the standard responsive image inputs as `src.<alias>`. In the browser, the directive writes the value of the highest-priority active alias to the host `src`. When no configured responsive value is active, it restores the base `src` value or the empty string.

On the server with the Flex-Layout server module, responsive selection is represented through generated `content: url(...)` styling while the host `src` is cleared. The native migration intentionally replaces that directive-specific server behavior with ordinary `<picture>` fallback markup. Browsers, crawlers, and SSR output retain the fallback `<img src>` or `[src]`; responsive `<source>` elements carry literal alternatives without requiring Flex-Layout runtime code.

Native `<picture>` evaluates `<source>` elements in document order and uses the first matching media condition. The renderer orders sources by descending archived Flex-Layout priority, then by canonical alias order. Standard aliases have distinct priorities, so overlapping `lt-*`, `gt-*`, and bounded aliases can reproduce runtime precedence without relying on CSS cascade order.

## Architecture

Responsive-image migration has five focused units:

1. The Angular template parser exposes immutable full-element, start-tag, end-tag, structural-template, and ancestry ranges without changing existing attribute analysis.
2. The attribute analyzer recognizes upstream `src.<alias>` and bound `[src.<alias>]` spellings as the internal `imgSrc` directive. Plain `src` and `[src]` remain ordinary fallback attributes and never become standalone migration inputs.
3. A target-independent responsive-image planner groups `imgSrc` occurrences by host element and validates configuration, breakpoints, fallback ownership, structural context, URL safety, and priority.
4. A native picture renderer converts one valid semantic plan into deterministic HTML while retaining the original `<img>` bytes except for responsive-attribute removals.
5. The conversion planner composes structural edits with ordinary attribute/class edits, rejects overlap, applies them in memory, and reparses the complete result before any file write.

The existing breakpoint catalog remains the only source of standard media definitions and priorities. The image pipeline consumes catalog definitions but does not consume Tailwind arbitrary-variant strings or Tailwind compiler descriptors.

## Template source model

`TemplateElement` expands to include:

- the full element source range;
- the opening-tag source range;
- an optional closing-tag source range; and
- ordered ancestor identifiers or sufficient parent links to resolve ancestry.

Structural `TmplAstTemplate` wrappers created by `*` syntax are retained as explicit source evidence so `*ngIf`, `*ngFor`, and custom structural directives cannot disappear during AST normalization. Native block syntax surrounding an image is allowed when the image itself still has one unambiguous source range; structural attributes attached to the image are not.

Void `<img>` forms, explicit closing tags accepted by Angular, and self-closing spellings are characterized separately. Ranges always refer to original source bytes. The parser does not normalize attribute spelling or serialize the Angular AST.

If the Angular compiler cannot provide an unambiguous replaceable range for the encountered spelling, the image remains unchanged. The migrator never searches for a closing delimiter heuristically after parsing.

## Image semantic plan

One immutable plan represents the whole image family:

- host element identity and replacement range;
- ordered responsive sources containing alias, exact media definition, priority, decoded URL, and original attribute range;
- fallback kind: literal, bound, or absent;
- retained `<img>` source slices;
- indentation and line-ending evidence; and
- all diagnostics needed if the family is rejected.

The planner validates the family before producing any source edit. One invalid, dynamic, custom, optional, duplicate, or unsafe responsive member preserves every `src.<alias>` member on that image. A base `[src]` binding is allowed because it remains on the same fallback `<img>` and is not copied or reinterpreted.

## URL and attribute safety

Each responsive value becomes a descriptor-free `srcset` value. The encoder must prove that parsing the generated attribute yields the same single URL string as the original Angular literal.

The renderer uses double-quoted generated attributes and encodes at least `&`, `"`, carriage return, line feed, and other syntax-significant characters according to HTML rules. Values containing interpolation, ambiguous unescaped whitespace, a candidate descriptor, or syntax that would be interpreted as multiple `srcset` candidates remain unchanged. Data URLs and character references convert only when executable parser tests prove one-candidate equivalence; otherwise they are preserved.

Empty responsive values follow the archived directive fallback behavior and do not name an alternative image. Because an empty `<source srcset>` does not reproduce that behavior, a family containing an empty responsive value remains unchanged.

## Rendering and formatting

The renderer emits one `<source media="..." srcset="...">` per responsive member, ordered by priority. Media attributes contain exact standard queries suitable for native HTML, for example `screen and (min-width: 600px) and (max-width: 959.98px)`.

The original `<img>` spelling is retained byte-for-byte after removing the converted responsive attributes and their adjacent attribute whitespace. The renderer does not reorder retained attributes, normalize quotes, rewrite the fallback `src`, or change unrelated bindings.

For a single-line input, deterministic output is compact:

```html
<picture
  ><source media="screen and (max-width: 599.98px)" srcset="mobile.png" />
  <img src="default.png"
/></picture>
```

For multiline input, generated children follow the image's existing indentation unit and line-ending style. The closing `</picture>` aligns with the original `<img>` indentation. Formatting is source-derived and idempotent; no external formatter is invoked.

## Edit composition and validation

Responsive-image replacement is one structural `SourceEdit` for the full `<img>` range. Existing class-based conversions on the same image are planned first and incorporated into the retained `<img>` slice before wrapping, rather than emitted as overlapping edits. If this composition cannot be represented without overlapping or reordered source ranges, all conversions coupled to that image remain unchanged with `context-unverified`.

Edits on descendants cannot exist because `<img>` is void. Edits on ancestors or siblings remain independent when ranges are disjoint. The source editor continues to reject all overlapping edit plans as an internal invariant.

After every file plan is applied in memory, the complete result is parsed again with the Angular compiler. A reparse failure discards the file's planned writes and returns stable diagnostics; it never writes a partially valid template. A second migration run finds no responsive source attributes and produces zero edits.

## Diagnostics and reporting

Responsive-image failures use the existing structured result and source-location contract. Reasons distinguish at least:

- feature not enabled;
- dynamic responsive source;
- unsupported orientation, print, custom, or empty alias;
- unsafe or ambiguous `srcset` value;
- non-`img` host;
- existing `<picture>` ancestry;
- Angular structural-directive context;
- incomplete or conflicting source family;
- overlapping structural/class edit ownership; and
- generated-template reparse failure.

The JSON report records each converted and preserved responsive-image occurrence with its file and source location. Documentation instructs users to review files containing converted `imgSrc` results for selector assumptions introduced by `<picture>` wrapping. This milestone does not add an image-specific interactive checklist, file navigator, or post-run review screen; those belong to the adaptive CLI milestone.

## Verification

Implementation follows test-driven development and includes:

- characterization tests derived from the archived directive for fallback, active alias, overlap priority, and missing base source behavior;
- parser range tests for void, self-closing, explicitly closed, multiline, nested, and control-flow images;
- all 13 standard aliases with exact native media conditions and priority order;
- literal, bound, and absent fallback coverage;
- preservation tests for responsive bindings, interpolation, orientation, print, custom and empty aliases, duplicate ownership, structural directives, and existing `<picture>` ancestry;
- URL and attribute encoding differentials using the Angular parser and an HTML `srcset` parser or browser;
- composition tests for existing class/style conversions and nonresponsive image attributes;
- CRLF, indentation, unrelated-byte preservation, deterministic output, and idempotence fixtures;
- browser selection tests at representative viewport widths for bounded and overlapping aliases;
- SSR-oriented markup tests proving the fallback `<img>` remains present without Flex-Layout runtime behavior;
- JSON location, terminal diagnostic, strict exit, and packaged CLI tests;
- compatibility inventory and public fixture totals; and
- full repository verification, audit, package inspection, clean-status checks, and forbidden-control-file scans.

Completeness means every supported and preserved responsive-image form has an executable expectation. It does not claim that project selectors are safe; `--responsive-images` is the explicit acknowledgement boundary.

## Documentation and release

The compatibility inventory changes responsive-image `imgSrc` from Planned to Limited and documents its opt-in, literal, standard-breakpoint, structural, URL, and fallback boundaries. The README includes one migration example, the selector-risk acknowledgement, and report-based review guidance.

The pull request includes a Changeset because it adds user-visible CLI behavior and template transformations. It does not add a runtime dependency or publish a package.
