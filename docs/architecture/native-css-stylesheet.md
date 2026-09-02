# Native CSS Stylesheet Serialization and Ownership

## Purpose

This slice turns in-memory native CSS artifacts into a deterministic stylesheet block and safely composes that block with an existing companion stylesheet. It defines the durable on-disk ownership format before the CLI, template planner, or transaction layer can write CSS files.

The operation is pure: existing stylesheet bytes plus ordered owned rules produce proposed stylesheet bytes. No filesystem path is read or written by this slice.

## Scope

The slice provides validation and deterministic serialization of `OwnedCssRule` values, one versioned codemod-owned block, lexical marker discovery, exact replacement or removal on rerun, byte preservation outside the block, deterministic LF/CRLF handling, and fail-closed errors for malformed ownership.

CLI target selection, path validation, file I/O, template class edits, adapter orchestration, multi-file staging, backup, rollback, interruption handling, Grid, visibility, orientation, and print migration remain outside this slice.

## Ownership format

The generated region is one contiguous block:

```css
/* flex-layout-codemod:start schema=1 */
/* flex-layout-codemod:rule id=<64 lowercase hex characters> */
.flm-<same 64 lowercase hex characters > {
  display: flex;
}
/* flex-layout-codemod:end */
```

The marker grammar is exact and ASCII-only:

- start: `/* flex-layout-codemod:start schema=1 */`;
- rule: `/* flex-layout-codemod:rule id=<id> */`; and
- end: `/* flex-layout-codemod:end */`.

The serializer emits no timestamp, source path, package version, counter, or process-dependent content. Schema `1` identifies this ownership and serialization contract. Only start and end comments delimit ownership; rule comments cannot independently claim handwritten content.

## Components

### Artifact validator

`src/adapter/css/stylesheet/css-artifact.validator.ts` validates every rule before serialization. Normal rules come from `CssArtifactRegistry`, but this boundary must fail closed for manually constructed or corrupted values.

Validation requires:

- `owner` is exactly `flex-layout-codemod`;
- `id` is exactly 64 lowercase hexadecimal characters;
- `className` is exactly `flm-${id}`;
- `family` is a declared `CssSemanticFamily`;
- declarations are nonempty and property names are unique;
- a property matches `^-?[a-z][a-z0-9-]*$`;
- a value is nonempty, trimmed, and contains no NUL, CR, LF, braces, semicolon, or CSS comment delimiter;
- priority is finite and a base rule has priority `0`;
- media contains at least one clause;
- every bound is finite and minimum does not exceed maximum; and
- every clause has at least one feature unless its media type is `print`.

Violations throw `CssStylesheetError` with stable internal codes. They are programming or configuration-boundary failures, not per-directive diagnostics.

### Rule serializer

`src/adapter/css/stylesheet/css-rule.serializer.ts` serializes an already ordered rule list. It does not sort, deduplicate, repair, or reinterpret artifacts.

Base rules retain input order. Adjacent responsive rules are grouped only when both normalized media definition and priority are identical. A later rule never moves across another rule to join an earlier media group. Groups and rules therefore retain exact input order, and `CssArtifactRegistry.rules()` remains the semantic ordering authority.

Each base rule is formatted as:

```css
/* flex-layout-codemod:rule id=<id> */
.<className > {
  <property>: <value>;
}
```

Declarations remain in artifact order. A single newline separates adjacent base rules.

Each responsive group is formatted as:

```css
@media screen and (min-width: 600px) and (max-width: 959.98px) {
  /* flex-layout-codemod:rule id=<id> */
  .<className > {
    <property>: <value>;
  }
}
```

Rules within one media block, base rules, and media blocks are separated by one newline. There is no blank line inside the generated block.

### Media serialization

Media serialization consumes `MediaDefinition`; it never accepts or looks up an alias. One clause becomes the media type followed by each present feature joined with `and`. Feature order is minimum width, maximum width, then orientation. Width values use finite-number `String()` conversion followed by `px`.

Multiple clauses are comma-separated and repeat the media type:

```css
@media screen and (max-width: 599.98px) and (orientation: portrait), screen and (max-width: 959.98px) and (orientation: landscape) {
```

The acceptance surface remains the 13 standard screen aliases. Serializing the existing media model does not enable orientation or print CLI conversion.

### Owned block serializer

`src/adapter/css/stylesheet/owned-css-block.serializer.ts` wraps serialized rules with schema markers. It accepts an explicit newline restricted to `\n` or `\r\n`.

For one or more rules, output is `<start marker>`, newline, serialized rules, newline, and `<end marker>`. The block has no leading or trailing newline. An empty rule list serializes to `''`, allowing removal without claiming adjacent handwritten whitespace.

### CSS comment scanner

`src/adapter/css/stylesheet/css-comment.scanner.ts` performs the minimum lexical scan needed to identify real CSS comments while ignoring marker-like text inside quoted strings. It recognizes single- and double-quoted strings, backslash escapes, CSS comments, and ordinary code points, and returns comment contents with exact source offsets.

Unterminated strings and comments are stylesheet parse failures. The scanner does not parse selectors, declarations, nesting, or at-rules.

### Ownership parser

`src/adapter/css/stylesheet/owned-css-block.parser.ts` returns:

```ts
type OwnedCssBlockParseResult =
  | { readonly status: 'absent' }
  | { readonly status: 'found'; readonly range: CssSourceRange; readonly newline: '\n' | '\r\n' }
  | { readonly status: 'invalid'; readonly code: CssStylesheetErrorCode; readonly reason: string };

interface CssSourceRange {
  readonly start: number;
  readonly end: number;
}
```

It examines only scanner comment tokens. Marker-looking text inside strings or unrelated comments is ignored unless the complete trimmed comment content begins with `flex-layout-codemod:`.

The parser rejects unsupported schemas, unknown marker kinds, duplicate starts or ends, end-before-start, missing matches, nested regions, rule markers outside the region, malformed rule IDs, and a rule metadata ID that does not match its exact following `.flm-<id>` selector.

For a found block, `range` starts at the slash of the start comment and ends after the slash of the end comment. Adjacent handwritten whitespace remains outside the range. The newline is the first terminator inside the block; a marker-only single-line block uses the document newline preference.

### Stylesheet merger

`src/adapter/css/stylesheet/owned-stylesheet.merger.ts` exposes:

```ts
interface OwnedStylesheetMergeResult {
  readonly changed: boolean;
  readonly output: string;
}

export function mergeOwnedStylesheet(existing: string, rules: readonly OwnedCssRule[]): OwnedStylesheetMergeResult;
```

The application planner uses the reference-aware overload for an invocation-wide scan of selected template outputs:

```ts
interface OwnedCssReferences {
  readonly classNames: ReadonlySet<string>;
  readonly complete: boolean;
}

export function mergeOwnedStylesheet(
  existing: string,
  rules: readonly OwnedCssRule[],
  references: OwnedCssReferences,
): OwnedStylesheetMergeResult;
```

`classNames` contains exact `flm-<64 lowercase hex>` class tokens from every proposed output, or from the existing selected destination when that template is unchanged. Literal `class` values contribute only whole whitespace-separated tokens; Angular class-binding metadata makes both `[class.flm-<id>]` and `bind-class.flm-<id>` named static authorities. A complete scan proves an omitted owned rule is stale and removes it. Interpolation, whole-value `[class]`/`[className]`, `bind-className`, `ngClass`, a parse failure, or an unavailable selected destination makes the scan incomplete, so the merger retains matching existing owned rules instead of treating absence as proof of staleness. An exact generated-looking token or named class authority without either an incoming rule or a matching valid owned rule fails closed with `ownership-rule-mismatch`; boundary-adjacent handwritten `flm-*` names cannot claim ownership.

When retained and incoming rules are combined, the merger identifies authoritative incoming IDs before resolving retained serialized media. It canonicalizes the resulting union: base rules come first, then responsive rules ordered by the breakpoint registry priority and stable rule ID. Incoming `OwnedCssRule` contexts stay structured and are never resolved through retained CSS text; only genuinely retained serialized media is resolved by the application planner and unknown retained media fails closed. This keeps a responsive rule effective over an equal-specificity base rule in an incremental run. It preserves the schema-1 marker grammar and class identity exactly; only the content ordering inside a changed owned block is canonicalized.

The merger parses ownership first. Invalid ownership throws `CssStylesheetError`; it never edits ambiguous input.

Newline preference is deterministic:

1. retain the newline found inside an existing valid block;
2. otherwise use the first terminator in the stylesheet; and
3. default to LF when no terminator exists.

Behavior is exact:

- absent block plus rules: append the serialized block directly at end of input;
- found block plus rules: replace exactly the parsed range;
- found block plus no rules: remove exactly the parsed range;
- absent block plus no rules: return input unchanged.

The merger inserts no separator outside the owned block. If handwritten CSS lacks a trailing newline, the start marker immediately follows its final token; CSS comments are valid token separators and this preserves every existing byte. A later CLI may recommend a conventional stylesheet ending but cannot rewrite one implicitly.

`changed` is `output !== existing`. Repeating a merge with the same ordered rules is byte-idempotent.

## Error model

`CssStylesheetError` carries one stable internal code:

- `invalid-artifact`;
- `invalid-css-lexeme`;
- `unterminated-css-token`;
- `unknown-ownership-marker`;
- `unsupported-ownership-schema`;
- `malformed-ownership-block`; or
- `ownership-rule-mismatch`.

The reason is concise and contains no absolute path. A later application boundary adds path context and maps failures into configuration or internal-invariant reporting. This slice does not alter public `DiagnosticCode`.

## Data flow

```text
CssArtifactRegistry.rules()
           |
           v
  validate and serialize rules
           |
           v
    versioned owned block
           |
           +--------------------+
                                |
existing CSS -> comment scan -> ownership parse
                                |
                                v
                     exact range replacement
                                |
                                v
                      proposed CSS in memory
```

## Testing

Behavior changes follow TDD. Verification includes:

- exact base-rule and declaration formatting;
- exact min-only, max-only, bounded, multi-clause, orientation, and print media-model formatting;
- grouping only identical media-plus-priority contexts;
- preservation of registry rule order;
- artifact validation and injection-resistant rejection;
- LF and CRLF block output;
- empty, handwritten-only, owned-only, prefix, suffix, and surrounding handwritten content;
- exact preservation outside the owned range;
- marker-looking strings, unrelated comments, escaped quotes, and comment delimiters inside strings;
- every malformed, duplicate, nested, unknown, unsupported, unterminated, and mismatched-marker case;
- append, replace, remove, unchanged, rule-set shrink/growth, reference-aware stale removal/retention, mixed base-responsive precedence, and idempotent merge behavior;
- architecture tests preventing filesystem, CLI, template, planner, or Tailwind dependencies; and
- the complete repository verification command.

Property-based testing is unnecessary for this bounded grammar; table-driven lexical fixtures and mutation cases provide clearer evidence.

No Changeset or compatibility-inventory update is added because no user-facing target can reach this code.

## Implementation sequence

1. Establish stable stylesheet errors and artifact validation.
2. Serialize rules, media groups, and complete owned blocks.
3. Scan CSS comments and parse ownership ranges.
4. Merge blocks with exact byte preservation and newline/idempotence contracts.
5. Add architecture, corruption, and end-to-end registry-to-stylesheet verification.

Each step is independently reviewable. Existing Tailwind and native artifact-generation behavior remains unchanged.

## Completion criteria

The slice is complete when ordered `OwnedCssRule` values serialize deterministically; a valid block can be appended, replaced, or removed without changing surrounding bytes; malformed ownership fails closed with stable codes; repeated merges are byte-identical; and no CLI, template, or filesystem path exposes the unfinished CSS target.

The following slice can integrate native CSS planning with template class edits and transactional application using this pure merge operation.
