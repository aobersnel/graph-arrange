/**
 * Public entry point for @apnex/graph-arrange.
 */

import { HierarchyHullLayoutPlugin } from "./plugins/hierarchy-hull.js";
import { LayeredFlowLayoutPlugin } from "./plugins/layered-flow.js";
import { OrbitFlatLayoutPlugin } from "./plugins/orbit-flat.js";
import { RadialClusterLayoutPlugin } from "./plugins/radial-cluster.js";
import { createLayoutRegistry } from "./registry.js";
import type { LayoutRegistry } from "./types.js";

export type {
  GraphGroup,
  GraphInput,
  GraphLink,
  GraphNode,
  LayoutOptions,
  LayoutPlugin,
  LayoutRegistry,
  LayoutSlot,
  LinkBundleOptions,
  Point2D,
  PositionedGroup,
  PositionedLink,
  PositionedNode,
  PositionedScene,
  Rect2D,
  SnapFn,
} from "./types.js";

export {
  computeSceneBounds,
  resolveBoxCollisions,
  type CollisionBox,
} from "./geometry.js";

export {
  buildCompactLabelMap,
  compactSingleLabel,
  type LabelEntry,
} from "./label-compaction.js";

export { bundleLinks } from "./link-bundler.js";
export { createLayoutRegistry } from "./registry.js";
export { RadialClusterLayoutPlugin } from "./plugins/radial-cluster.js";
export { OrbitFlatLayoutPlugin } from "./plugins/orbit-flat.js";
export { HierarchyHullLayoutPlugin } from "./plugins/hierarchy-hull.js";
export { LayeredFlowLayoutPlugin } from "./plugins/layered-flow.js";

/** Creates the default registry pre-populated with all built-in graph layouts. */
export function createDefaultLayoutRegistry(): LayoutRegistry {
  return createLayoutRegistry([
    RadialClusterLayoutPlugin,
    OrbitFlatLayoutPlugin,
    HierarchyHullLayoutPlugin,
    LayeredFlowLayoutPlugin,
  ]);
}
