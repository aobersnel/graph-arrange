# graph-arrange - Vision

**North star.**\
Given nodes, groups and links, compute deterministic, non-overlapping 2D placement points, attachment slots, group envelopes and bundled link curves from one pure library -- independent of renderer, storage or grid policy.

---

## Why it exists

Topology visualizers and drawing tools otherwise each reinvent cluster packing, collision separation, sibling label compaction and parallel-link bundling, or couple layout math directly into SVG or canvas code.\
graph-arrange isolates graph arrangement as pure data-in, frozen-coordinates-out computation.

---

## What it is

An embeddable, zero-dependency TypeScript library providing:
- An extensible `LayoutPlugin` registry with four built-in strategies (`radial-cluster`, `orbit-flat`, `hierarchy-hull`, `layered-flow`).
- Canonical `point: { x, y }` and `bounds: { x, y, width, height }` outputs per placed node and group.
- Emitted `slots` coordinates exposing each layout's generated placement positions.
- Pinned-node preservation (`pinned: true` with finite `point`) and an optional injected `snap` hook.
- Deterministic Bezier parallel and cross-cluster link routing (`bundleLinks`) plus suffix-preserving sibling label compaction (`buildCompactLabelMap`).

---

## What it is not

- Not a canvas, SVG or DOM renderer: visual projection belongs to `vector-scene` (`C14`).
- Not a coordinate lattice: empty snap lattices belong to `snap-grid` (`C11`), which can be injected into `graph-arrange` via `LayoutOptions.snap`.
- Not an input or gesture engine: pointer capture and key bindings belong to `input-capture` (`C13`) and `input-binding` (`C12`).
- Not an application domain model or persistence store: entity semantics and selection state stay in the consumer.

---

## What success means

- **Determinism and separation:** Identical inputs produce identical deep-frozen scenes, and unpinned nodes do not overlap within collision-separating layouts.
- **Composable points:** Placed nodes, groups and `slots` expose `{ x, y }` coordinates matching `snap-grid`'s point form, preserving pinned positions and honoring optional `snap`.
- **Domain neutrality:** Zero consumer-specific nouns and zero runtime, clock, network or DOM globals in built files.
- **Shared adoption:** Multiple consumers adopt released tarballs unchanged without maintaining forks or parallel layout engines.
