# graph-arrange

Arrange nodes, nested groups and links into deterministic 2D coordinates, attachment slots, group bounds, compact labels and bundled link curves.

---

## Install

graph-arrange is distributed as a tarball attached to a GitHub release built by its own CI.\
Consumers pin that release file in `package.json` so `package-lock.json` locks its integrity hash.

Choose a release from the Releases page and add it to your `package.json`:
```json
"dependencies": {
  "@apnex/graph-arrange": "https://github.com/aobersnel/graph-arrange/releases/download/v<version>/apnex-graph-arrange-<version>.tgz"
}
```

Then install to record the lockfile integrity hash:
```bash
npm install
```

In browsers, map the package bare specifier in an import map to the copied `dist/index.js` entry:
```html
<script type="importmap">{ "imports": { "@apnex/graph-arrange": "/vendor/graph-arrange/dist/index.js" } }</script>
```

---

## Use

Create the default registry, pass nodes, groups and links, and inspect placed `point`, `bounds`, `slots`, `groups` and `links`:
```js
import { createDefaultLayoutRegistry } from "@apnex/graph-arrange";

const registry = createDefaultLayoutRegistry();
const scene = registry.compute(
  "radial-cluster",
  {
    nodes: [
      { id: "a", label: "Alpha", groupId: "g1" },
      { id: "b", label: "Beta", groupId: "g1" },
    ],
    groups: [
      { id: "g1", label: "Cluster One", memberNodeIds: ["a", "b"] },
    ],
    links: [
      { id: "l1", sourceId: "a", targetId: "b", category: "primary" },
    ],
  },
  { bundleLinks: true },
);
```

Four built-in plugins ship in `createDefaultLayoutRegistry()`:
- `radial-cluster`: circular cluster packing with concentric member rings and bundled cross-cluster splines.
- `orbit-flat`: Fibonacci spiral hub ordering with collision separation and no enclosing group hulls.
- `hierarchy-hull`: nested rectangular containment groups in balanced masonry columns plus an ungrouped dock.
- `layered-flow`: left-to-right ordered topological lane columns with column wrapping.

Caller options support:
- `pinned: true` with finite `point: { x, y }` on any input node to keep that node's exact center across layouts and separation passes.
- `snap: (point, bounds) => Point2D` in `LayoutOptions` to quantize unpinned node coordinates onto an external lattice such as `@apnex/snap-grid` before bounds and link routing.
- Unknown `pluginId` values throw an explicit `Error` naming the unknown plugin instead of falling back silently.
