---
id: C16
category: component
title: graph-arrange - arrange nodes, groups and links into deterministic 2D coordinates
status: draft
hydrate-when: Two or more parts of your system are about to compute graph placement, cluster packing, collision separation, sibling label compaction or link bundling independently
sovereignty: internal
supersedes: []
related: [C0, C11, C14, P4, A3]
---

# C16 - graph-arrange

Sovereignty is `internal`, so a fit gap here routes upstream rather than spawning consumer-local forks.\
The contract of record for `@apnex/graph-arrange` `0.1.0`; decisions are held in `docs/DECISIONS.md`.

---

## Duty

Arrange an application's nodes, nested groups and directed links into deterministic, non-overlapping 2D placement points, offered attachment slots, compact display labels, group envelopes and bundled link curves according to a named layout plugin.

That is the whole duty.\
It does not render SVG or canvas elements, manage input gestures, own an application domain model, hold mutable state between calls or replace an external snapping lattice.

---

## Contract

**Capabilities.**\
Every capability is implemented cleanly with zero external runtime dependencies.

| Capability | Relation | Requires | What a consumer can depend on | Trait |
|---|---|---|---|---|
| `layout-plugin-registry` | provides | none | `createLayoutRegistry` and `createDefaultLayoutRegistry` register, list and execute named layout plugins, throwing an explicit `Error` when `pluginId` is unknown. | none |
| `radial-cluster-arrangement` | provides | none | `RadialClusterLayoutPlugin` packs non-overlapping circular group orbits and concentric node rings while emitting radial `slots` and routing cross-cluster links. | none |
| `orbital-constellation-arrangement` | provides | none | `OrbitFlatLayoutPlugin` places unpinned nodes along a priority-sorted Fibonacci spiral with collision separation and orbital `slots`. | none |
| `containment-hull-arrangement` | provides | none | `HierarchyHullLayoutPlugin` arranges arbitrarily nested collapsible rectangular groups into balanced columns plus an ungrouped dock and cell `slots`. | none |
| `layered-lane-arrangement` | provides | none | `LayeredFlowLayoutPlugin` places unpinned nodes across ordered topological lanes with column wrapping, lane hulls and lane `slots`. | none |
| `box-collision-separation` | provides | none | `resolveBoxCollisions` separates axis-aligned overlapping boxes deterministically while holding `fixed` boxes stationary. | none |
| `scene-bounds-measurement` | provides | none | `computeSceneBounds` computes the enclosing scene rectangle with configurable padding or a safe empty default. | none |
| `bundled-link-routing` | provides | none | `bundleLinks` computes Bezier paths, midpoints, summarized labels and collapsed ancestor endpoints for parallel and cross-group links. | none |
| `sibling-label-compaction` | provides | none | `buildCompactLabelMap` and `compactSingleLabel` strip shared multi-sibling prefixes and shorten long labels while preserving distinguishing tails. | none |

**Errors and invariants.**
- **Validation (`GA1`):** Every public entry point validates structural types before computing and throws a `TypeError` on malformed inputs, duplicate node or group IDs, non-positive sizes, malformed options or `pinned: true` without a finite `point`.
- **Fail-loud unknown plugin (`GA2`):** `registry.compute(pluginId, graph, options)` throws an explicit `Error` naming `pluginId` rather than substituting another layout.
- **Canonical point and bounds (`GA3`):** Every `PositionedNode` and `PositionedGroup` emits `{ point: { x, y }, bounds: { x, y, width, height } }`, matching `snap-grid`'s point shape with no `-0` values.
- **Pinned preservation (`GA4`):** A node with `pinned: true` and finite `point` retains its exact coordinates without movement during collision separation or `snap` calls.
- **Injected snap seam (`GA5`):** When `LayoutOptions.snap` is supplied, unpinned node points pass through `snap(point, bounds)` before final bounds derivation and link routing.
- **Attachment slots (`GA6`):** Every layout populates `PositionedScene.slots` with `{ point, groupId?, ring?, slot? }` entries for offered coordinates.
- **Immutability and determinism (`GA7`):** Output scenes, bundled link lists and scene bounds are freshly constructed and deep-frozen without mutating or freezing caller arguments; identical inputs yield identical outputs.
- **Runtime purity (`GA8`):** Built files contain only JavaScript standard built-ins, make zero network, clock, timer or randomness calls, use relative imports only and exclude all consumer-specific domain nouns.

---

## Reference

- Repository: `https://github.com/aobersnel/graph-arrange` (`@apnex/graph-arrange`), MIT license.
- Package exports: `.` (`dist/index.js`, types `dist/index.d.ts`).
- Gate checks: `npm test` under `@apnex/clean-runner`, `check-vocabulary`, `check-runtime`, `check-clock-and-chance`, `check-export-map`, `check-style` and `consumer-test`.

---

## Fit criteria

- **Reach for `@apnex/graph-arrange` when:** You have nodes, hierarchical groups and links needing deterministic 2D coordinates, non-overlapping clusters, bundled links or compact sibling labels.
- **Wrong tool when:**
  - You need an empty snapping lattice (`square`, hex or polar geometry independent of nodes) -- use `@apnex/snap-grid` (`C11`).
  - You need SVG serialization or spatial hit-testing -- use `@apnex/vector-scene` (`C14`).
  - You need pointer capture or input state -- use `@apnex/input-capture` (`C13`) and `@apnex/input-binding` (`C12`).

---

## Adjustment policy

Consumers map their domain records (`GraphNode`, `GraphGroup`, `GraphLink`) at their adapter boundary (`P4`) without leaking domain nouns into `@apnex/graph-arrange`.\
Custom one-off arrangements are registered on `createLayoutRegistry()` via `register(plugin)`, while strategies shared by two or more consumers graduate into this component.

---

## Edges

- **Contains:** `types`, `geometry`, `label-compaction`, `link-bundler`, `registry`, `plugins/radial-cluster`, `plugins/orbit-flat`, `plugins/hierarchy-hull`, `plugins/layered-flow`.
- **Consumes:** None (`0` dependencies).
- **Consumed-by:** `cadolphus/disco` (`disco-web` topology canvas), `apnex/drawv2` (planned layout consumer).
