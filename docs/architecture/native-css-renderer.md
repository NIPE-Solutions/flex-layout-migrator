# Native CSS Flex Renderer Foundation

## Purpose

This slice proves the first real consumer of the target-neutral Flex semantic core by rendering verified Flex semantics as deterministic native CSS. It establishes the in-memory contract for generated class names, declarations, media rules, ownership, deduplication, and ordering before the CLI or filesystem can select the CSS target.

The slice does not expose `--target css` and does not write a stylesheet. A later slice will compose these in-memory artifacts with template edits and transactional multi-file output.

## Scope

The renderer covers the semantic families already owned by `src/flex`:

- `fxLayout`;
- `fxLayoutAlign`;
- `fxLayoutGap`;
- `fxFlex` with `fxGrow` and `fxShrink`;
- `fxFlexAlign`;
- `fxFlexFill` and `fxFill`;
- `fxFlexOffset`; and
- `fxFlexOrder`.

It renders base declarations and verified standard viewport aliases. The shared `BreakpointCatalog` remains the only source of breakpoint media definitions and priority.

Grid, visibility, responsive class/style, responsive images, orientation and print opt-in behavior, Tailwind conflict analysis, CLI target selection, stylesheet discovery or merging, source edits, file writes, backups, rollback, and interruption cleanup are outside this slice.

## Design constraints

1. `src/flex` remains target-neutral and cannot import the CSS renderer or contain generated selector syntax.
2. The CSS renderer accepts successful semantic values. It cannot parse raw Flex-Layout attribute strings or recreate semantic diagnostics.
3. Rendering is pure and deterministic. Equal semantic inputs and breakpoint context produce equal artifacts regardless of discovery order or process state.
4. Class identifiers are derived from canonical semantic content, not source paths, element positions, counters, or directive spelling.
5. Generated rules contain structured ownership metadata. The in-memory renderer does not parse or mutate an existing stylesheet.
6. Declaration and rule ordering are explicit contracts, not incidental object or map iteration behavior.
7. CSS output must preserve the same verified behavior as the Tailwind target; it cannot broaden conversion support merely because arbitrary CSS is available.

## Components

### Native CSS artifact model

Modules under `src/adapter/css/` define immutable rendering artifacts:

```ts
interface CssDeclaration {
  readonly property: string;
  readonly value: string;
}

interface CssMediaCondition {
  readonly type: 'screen' | 'print';
  readonly clauses: readonly CssMediaClause[];
}

interface OwnedCssRule {
  readonly owner: 'flex-layout-codemod';
  readonly id: string;
  readonly className: string;
  readonly declarations: readonly CssDeclaration[];
  readonly media?: CssMediaCondition;
  readonly priority: number;
}

interface CssRenderArtifact {
  readonly className: string;
  readonly rule: OwnedCssRule;
}
```

The concrete model may use narrower property and value types where that improves correctness. It must not use an untyped declaration object whose ordering depends on property insertion.

An owned rule represents semantic content, not serialized stylesheet text. Serialization and ownership headers belong to the later stylesheet-output slice.

### Canonical identity and class names

Each rule receives a canonical identity assembled from:

- a schema/version tag;
- its semantic family;
- declarations in the family-defined order; and
- the normalized media definition, when present.

The canonical identity is serialized with an unambiguous length-delimited or JSON representation. A stable SHA-256 digest of that identity forms the identifier. The generated class uses a reserved project prefix and the digest, for example `flm-<digest>`. It contains only CSS-identifier-safe ASCII.

The complete lowercase hexadecimal digest is both the rule identifier and the class suffix: `flm-` followed by all 64 SHA-256 characters. The registry still rejects different canonical identities that receive the same digest. Tests inject the digest function so this fail-closed behavior can be proven rather than assumed.

Equivalent semantics share one class and rule. Source filename, element ID, source offset, base-versus-alias directive spelling, and encounter order never affect identity.

### Flex family renderers

One focused renderer per semantic family maps domain values to ordered CSS declarations:

- layout: `display`, `box-sizing`, `flex-direction`, and explicit wrapping behavior;
- layout alignment: `justify-content`, `align-items`, `align-content`, the active layout declarations carried by the semantic value, and the verified stretch maximum;
- gap: `gap`;
- flex item: `flex` shorthand when valid, otherwise ordered `flex-grow`, `flex-shrink`, and `flex-basis`, followed by the axis-dependent minimum and maximum, then `box-sizing`;
- self alignment: `align-self`;
- fill: margin, width, height, minimum width, and minimum height;
- offset: logical `margin-inline-start` or `margin-block-start`;
- order: `order`, with an absent semantic order producing no artifact.

These mappings consume only semantic fields. Target-specific choices such as shorthand eligibility remain local to the CSS renderer.

Family renderers do not allocate class names independently. They return an ordered declaration plan to the shared artifact registry, which canonicalizes, identifies, and deduplicates it.

### Responsive media rendering

Base semantics have no media condition and priority `0`. A responsive artifact accepts a verified `BreakpointDefinition` supplied from `BreakpointCatalog` and copies its normalized `media` and `priority` into the owned-rule model.

Each media clause is serialized as a conjunction of its present features:

- `min` becomes `(min-width: <value>px)`;
- `max` becomes `(max-width: <value>px)`;
- orientation becomes `(orientation: portrait|landscape)`.

Multiple clauses represent comma-separated alternatives. Media feature order is minimum width, maximum width, then orientation. The renderer does not maintain its own alias table or infer breakpoint values from alias names.

Only the 13 standard viewport definitions are exercised in this slice. The model is capable of representing configured definitions, but orientation and print conversion stay outside the acceptance surface until their target behavior and ordering are specified.

### Registry, deduplication, and ordering

A plan-local registry accepts declaration plans and returns their generated class names. It owns three invariants:

1. the same canonical identity always returns the same class;
2. different canonical identities cannot silently share a class; and
3. each unique rule appears once in final output.

Final rule order is stable:

1. base rules before media rules;
2. media rules by descending breakpoint priority, matching the existing responsive planners;
3. canonical rule identifier in code-unit order as the total-order tie-breaker.

No caller may depend on encounter order.

## Data flow

```text
decoded literal + verified layout context
                    |
                    v
          Flex semantic planner
             /             \
      semantic value     existing diagnostic
             |
             v
       CSS family renderer
             |
             v
 ordered declaration plan + optional verified breakpoint
             |
             v
   canonical artifact registry
             |
             +----> generated template class name
             |
             +----> deduplicated owned CSS rule
```

This slice begins at the semantic value and ends at in-memory artifacts. Existing Tailwind adapter orchestration and source editing remain unchanged.

## Errors and invariants

Semantic failures never reach the renderer; callers pass them through unchanged. Rendering a well-typed semantic value should not produce a user-facing diagnostic.

Internal invariant failures throw typed errors for:

- a class collision between different canonical identities;
- a malformed or non-finite media bound supplied outside catalog construction;
- a non-finite rule priority or a nonzero priority without a media condition;
- duplicate declarations for one property within a family plan; or
- an unsupported semantic discriminant caused by an implementation mismatch.

These errors indicate programming faults, not unsupported source input. The future adapter boundary will map unexpected invariant failures into the existing internal-error policy.

## Testing

Tests follow TDD and include:

- one focused mapping suite per Flex semantic family;
- exact declaration order and exact values for every successful semantic variant;
- shared flex-item `boxSizing` semantics rendered as final `box-sizing: border-box` CSS and the existing final Tailwind `box-border` utility;
- absence of output for semantic no-ops such as zero-equivalent `fxFlexOrder`;
- deterministic identity across repeated renders and different encounter orders;
- deduplication of equivalent semantic artifacts;
- injected digest collisions that fail closed;
- base and all 13 standard viewport aliases sourced through `BreakpointCatalog`;
- exact normalized media clauses and deterministic rule order;
- semantic parity assertions showing Tailwind and CSS renderers consume the same planner result rather than separate raw-value interpretations;
- architecture tests preventing imports from `adapter/css` into `src/flex`, raw directive parsing inside the CSS renderer, and duplicated breakpoint tables; and
- the complete repository verification command.

Existing Tailwind compatibility fixtures must remain byte-for-byte unchanged. Because this slice has no user-visible CLI behavior, it adds no Changeset and does not alter the compatibility inventory.

## Implementation sequence

1. Establish the typed CSS artifact model and canonical identity registry.
2. Add pure base renderers for layout, alignment, and gap semantics.
3. Add flex-item and independent directive renderers.
4. Add verified breakpoint media artifacts and stable global ordering.
5. Add cross-target semantic parity and architecture enforcement.
6. Remove any duplication exposed by the second renderer, then run full verification.

Each step is independently reviewable and preserves the Tailwind path.

## Completion criteria

The slice is complete when every existing Flex semantic family can produce deterministic, deduplicated native-CSS artifacts in memory; base and all standard viewport media definitions come only from `BreakpointCatalog`; identity collision and ordering behavior are executable contracts; the Tailwind migration output remains unchanged; and no CLI or filesystem path exposes the unfinished CSS target.

The next slice may then build stylesheet serialization, owned-rule merging, template integration, and transactional multi-file application on top of this stable artifact contract.
