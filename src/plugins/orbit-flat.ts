/**
 * Flat / single-kind orbital constellation layout plugin.
 */

import {
  assertValidGraphInput,
  assertValidLayoutOptions,
  computeSceneBounds,
  deepFreeze,
  finalizeNodePlacement,
  makeSlot,
  normZero,
  resolveBoxCollisions,
  type CollisionBox,
} from "../geometry.js";
import { buildCompactLabelMap } from "../label-compaction.js";
import { bundleLinks } from "../link-bundler.js";
import type {
  GraphInput,
  GraphNode,
  LayoutOptions,
  LayoutPlugin,
  LayoutSlot,
  PositionedNode,
  PositionedScene,
} from "../types.js";

export const OrbitFlatLayoutPlugin: LayoutPlugin = {
  id: "orbit-flat",
  label: "Flat Orbit",
  description:
    "Places items on a hub-centered Fibonacci orbital spiral without enclosing hulls so isolated cohorts are directly scannable.",
  compute(graph: GraphInput, options: LayoutOptions = {}): PositionedScene {
    assertValidGraphInput(graph);
    assertValidLayoutOptions(options);

    const nodeW = options.nodeWidth ?? 172;
    const nodeH = options.nodeHeight ?? 62;
    const maxLabelChars = options.maxLabelChars ?? 22;
    const compactLabels = buildCompactLabelMap(
      graph.nodes.map((n) => ({ id: n.id, label: n.label })),
      maxLabelChars,
    );

    const degree = new Map<string, number>();
    for (const link of graph.links) {
      degree.set(link.sourceId, (degree.get(link.sourceId) ?? 0) + 1);
      degree.set(link.targetId, (degree.get(link.targetId) ?? 0) + 1);
    }

    const pinned: GraphNode[] = [];
    const unpinned: GraphNode[] = [];
    for (const node of graph.nodes) {
      if (node.pinned === true && node.point !== undefined) {
        pinned.push(node);
      } else {
        unpinned.push(node);
      }
    }

    const sorted = [...unpinned].sort(
      (a, b) =>
        (b.priority ?? degree.get(b.id) ?? 0) - (a.priority ?? degree.get(a.id) ?? 0) ||
        (a.groupId ?? "").localeCompare(b.groupId ?? "") ||
        a.label.localeCompare(b.label) ||
        a.id.localeCompare(b.id),
    );

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const step = Math.max(nodeW, nodeH) * 0.92;
    const boxes: CollisionBox[] = [];
    const orderedNodes: GraphNode[] = [];
    const slots: LayoutSlot[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const n = sorted[i];
      if (n === undefined) continue;
      const w = n.width ?? nodeW;
      const h = n.height ?? nodeH;
      let cx = 0;
      let cy = 0;
      if (i > 0) {
        const r = step * Math.sqrt(i + 0.6);
        const theta = i * goldenAngle;
        cx = Math.cos(theta) * r * 1.18;
        cy = Math.sin(theta) * r * 0.92;
      }
      slots.push(makeSlot(Math.round(cx), Math.round(cy), { ring: i === 0 ? 0 : 1, slot: i }));
      boxes.push({ x: cx - w / 2, y: cy - h / 2, width: w, height: h, fixed: false });
      orderedNodes.push(n);
    }

    for (const p of pinned) {
      const pt = p.point;
      if (pt === undefined) continue;
      const w = p.width ?? nodeW;
      const h = p.height ?? nodeH;
      boxes.push({
        x: normZero(pt.x - w / 2),
        y: normZero(pt.y - h / 2),
        width: w,
        height: h,
        fixed: true,
      });
      orderedNodes.push(p);
    }

    resolveBoxCollisions(boxes, 22, 85);

    const positionedNodes: PositionedNode[] = [];
    for (let idx = 0; idx < orderedNodes.length; idx++) {
      const node = orderedNodes[idx];
      const b = boxes[idx];
      if (node === undefined || b === undefined) continue;
      const displayLabel = node.shortLabel ?? compactLabels.get(node.id) ?? node.label;
      positionedNodes.push(
        finalizeNodePlacement(
          {
            node,
            cx: Math.round(b.x) + b.width / 2,
            cy: Math.round(b.y) + b.height / 2,
            width: b.width,
            height: b.height,
          },
          displayLabel,
          options.snap,
        ),
      );
    }

    const positionedLinks = bundleLinks(graph.links, positionedNodes, [], {
      bundleParallel: options.bundleLinks ?? true,
      bundleCrossCluster: false,
      selectedLinkId: options.selectedLinkId ?? null,
    });

    return deepFreeze({
      layoutId: "orbit-flat",
      nodes: positionedNodes,
      groups: [],
      links: positionedLinks,
      slots,
      bounds: computeSceneBounds(positionedNodes, [], options.padding ?? 72),
    });
  },
};
