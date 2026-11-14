/**
 * Layered topological flow layout plugin.
 */

import {
  assertValidGraphInput,
  assertValidLayoutOptions,
  computeSceneBounds,
  deepFreeze,
  finalizeNodePlacement,
  makeSlot,
  normZero,
} from "../geometry.js";
import { buildCompactLabelMap } from "../label-compaction.js";
import { bundleLinks } from "../link-bundler.js";
import type {
  GraphInput,
  GraphNode,
  LayoutOptions,
  LayoutPlugin,
  LayoutSlot,
  PositionedGroup,
  PositionedNode,
  PositionedScene,
} from "../types.js";

function orderLanes(presentLanes: readonly number[], explicitOrder: readonly number[] | undefined): number[] {
  const numericSorted = [...presentLanes].sort((a, b) => a - b);
  if (explicitOrder === undefined || explicitOrder.length === 0) {
    return numericSorted;
  }
  const presentSet = new Set(numericSorted);
  const seen = new Set<number>();
  const ordered: number[] = [];
  for (const lane of explicitOrder) {
    if (presentSet.has(lane) && !seen.has(lane)) {
      seen.add(lane);
      ordered.push(lane);
    }
  }
  for (const lane of numericSorted) {
    if (!seen.has(lane)) {
      ordered.push(lane);
    }
  }
  return ordered;
}

export const LayeredFlowLayoutPlugin: LayoutPlugin = {
  id: "layered-flow",
  label: "Layered Lanes",
  description:
    "Places items across ordered left-to-right topological lanes with column wrapping and bundled fan-in links.",
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

    const byLane = new Map<number, GraphNode[]>();
    const pinnedNodes: GraphNode[] = [];
    for (const node of graph.nodes) {
      if (node.pinned === true && node.point !== undefined) {
        pinnedNodes.push(node);
        continue;
      }
      const lane = node.laneIndex ?? 0;
      const list = byLane.get(lane) ?? [];
      list.push(node);
      byLane.set(lane, list);
    }

    const sortedLanes = orderLanes(Array.from(byLane.keys()), options.laneOrder);
    const positionedNodes: PositionedNode[] = [];
    const positionedGroups: PositionedGroup[] = [];
    const slots: LayoutSlot[] = [];

    let laneX = 48;
    const hGap = 18;
    const vGap = 16;
    const laneGap = 72;

    for (const lane of sortedLanes) {
      const nodes = [...(byLane.get(lane) ?? [])].sort(
        (a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id),
      );
      if (nodes.length === 0) continue;
      const maxPerSubCol = 8;
      const subCols = Math.max(1, Math.ceil(nodes.length / maxPerSubCol));
      const rows = Math.ceil(nodes.length / subCols);
      const laneWidth = subCols * nodeW + (subCols - 1) * hGap;
      const laneHeight = rows * nodeH + (rows - 1) * vGap;
      const laneGroupId = `__lane_${lane}__`;

      for (let idx = 0; idx < nodes.length; idx++) {
        const node = nodes[idx];
        if (node === undefined) continue;
        const subCol = Math.floor(idx / rows);
        const row = idx % rows;
        const w = node.width ?? nodeW;
        const h = node.height ?? nodeH;
        const nx = Math.round(laneX + subCol * (nodeW + hGap));
        const ny = Math.round(64 + row * (nodeH + vGap));
        const cx = Math.round(nx + w / 2);
        const cy = Math.round(ny + h / 2);
        slots.push(makeSlot(cx, cy, { groupId: laneGroupId, ring: lane, slot: idx }));
        const displayLabel = node.shortLabel ?? compactLabels.get(node.id) ?? node.label;
        positionedNodes.push(
          finalizeNodePlacement(
            { node, cx, cy, width: w, height: h },
            displayLabel,
            options.snap,
          ),
        );
      }

      const gx = normZero(Math.round(laneX - 16));
      const gy = 30;
      const gw = normZero(Math.round(laneWidth + 32));
      const gh = normZero(Math.round(laneHeight + 48));
      const laneTitle = options.laneLabels?.get(lane) ?? `Lane ${lane + 1}`;
      positionedGroups.push({
        group: {
          id: laneGroupId,
          label: laneTitle,
          sublabel: `${nodes.length} items`,
          role: "lane",
          memberNodeIds: nodes.map((n) => n.id),
          collapsible: false,
          badgeSummary: `${nodes.length} items`,
        },
        shape: "rect",
        point: {
          x: normZero(Math.round(gx + gw / 2)),
          y: normZero(Math.round(gy + gh / 2)),
        },
        bounds: { x: gx, y: gy, width: gw, height: gh },
        collapsed: false,
        hiddenChildCount: 0,
      });

      laneX += laneWidth + laneGap;
    }

    for (const pinned of pinnedNodes) {
      const pt = pinned.point;
      if (pt === undefined) continue;
      const displayLabel = pinned.shortLabel ?? compactLabels.get(pinned.id) ?? pinned.label;
      positionedNodes.push(
        finalizeNodePlacement(
          {
            node: pinned,
            cx: pt.x,
            cy: pt.y,
            width: pinned.width ?? nodeW,
            height: pinned.height ?? nodeH,
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
      layoutId: "layered-flow",
      nodes: positionedNodes,
      groups: positionedGroups,
      links: positionedLinks,
      slots,
      bounds: computeSceneBounds(positionedNodes, positionedGroups, options.padding ?? 48),
    });
  },
};
