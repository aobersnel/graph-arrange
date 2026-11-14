# Decisions

One ruling per entry, append-only.\
A ruling is never edited; a later one supersedes it and says so.

---

## D1 - The component stands in its own public repository

**Ruled by:** the director, 2026-11-14.\
**Affects:** repository structure, npm package metadata, releases and `CONTRACT.md`.

**Ruling.**\
graph-arrange is extracted as an independent component (`C16`) in `aobersnel/graph-arrange`, published as `@apnex/graph-arrange` release tarballs on GitHub (`0.x` until active component promotion) with zero runtime dependencies and SHA-512 verification.

**Why.**\
Consumers (`cadolphus/disco`, `apnex/drawv2`) share one domain-neutral arrangement engine instead of copying layout code across repositories (`C0`, `P4`).

---

## D2 - Natural graph terminology and fail-loud boundary guarantees

**Ruled by:** the director, 2026-11-14.\
**Affects:** `src/`, `tools/consumer-vocabulary.json`, `CONTRACT.md`.

**Ruling.**\
Keep standard graph-theory terms (`node`, `link`, `group`, `point`, `slot`, `layout`) in `@apnex/graph-arrange` instead of replacing them with artificial circumlocutions, while blocking genuine consumer-domain nouns (`vm`, `vnic`, `wave`, `tier`, `zone`, `pipe`, `waypoint`, `device`, `diagram`, `anchor`, etc.) in `tools/consumer-vocabulary.json`.

**Choices settled at build.**
- `registry.compute(pluginId, ...)` throws an explicit `Error` naming any unknown `pluginId` rather than silently falling back to another layout.
- Every plugin and top-level helper validates structural arguments before computing and throws a `TypeError` on malformed shapes, duplicate node or group IDs, or `pinned: true` without finite `{ x, y }` `point`.
- Both `PositionedNode` and `PositionedGroup` emit canonical `{ point, bounds }` geometry matching `snap-grid` point shapes, normalized without `-0`.
- When `LayoutOptions.snap` is supplied, unpinned node points pass through `snap(point, bounds)` after collision separation and before bounds derivation and link bundling; pinned nodes stay exact.
- Every built scene, link list and bounds object is constructed fresh and deep-frozen without mutating or freezing caller objects.
