/**
 * Multi-level containment hierarchy layout plugin.
 */

import {
  assertValidGraphInput,
  assertValidLayoutOptions,
  cloneGroup,
  computeSceneBounds,
  deepFreeze,
  finalizeNodePlacement,
  makeSlot,
  normZero,
} from "../geometry.js";
import { buildCompactLabelMap } from "../label-compaction.js";
import { bundleLinksWithContext } from "../link-bundler.js";
import type {
  GraphGroup,
  GraphInput,
  GraphNode,
  LayoutOptions,
  LayoutPlugin,
  LayoutSlot,
  PositionedGroup,
  PositionedNode,
  PositionedScene,
} from "../types.js";

interface SubtreeBox {
  readonly width: number;
  readonly height: number;
  readonly emit: (originX: number, originY: number) => void;
}

export const HierarchyHullLayoutPlugin: LayoutPlugin = {
  id: "hierarchy-hull",
  label: "Hierarchy Hulls",
  description:
    "Containment hulls wrapping multi-level nested groups with collapsible boxes at every depth.",
  compute(graph: GraphInput, options: LayoutOptions = {}): PositionedScene {
    assertValidGraphInput(graph);
    assertValidLayoutOptions(options);

    const nodeW = options.nodeWidth ?? 172;
    const nodeH = options.nodeHeight ?? 62;
    const maxLabelChars = options.maxLabelChars ?? 22;
    const collapsedSet = options.collapseGroups ?? new Set<string>();
    const roleFilter = options.clusterRoleFilter !== undefined ? new Set(options.clusterRoleFilter) : undefined;
    const compactLabels = buildCompactLabelMap(
      graph.nodes.map((n) => ({ id: n.id, label: n.label })),
      maxLabelChars,
    );

    const allowedGroups =
      roleFilter === undefined
        ? graph.groups
        : graph.groups.filter((g) => g.role !== undefined && roleFilter.has(g.role));
    const groupById = new Map(allowedGroups.map((g) => [g.id, g]));
    const childGroups = new Map<string, GraphGroup[]>();
    const topGroups: GraphGroup[] = [];
    const directNodesByGroup = new Map<string, GraphNode[]>();
    const orphanNodes: GraphNode[] = [];

    for (const g of allowedGroups) {
      if (g.parentGroupId && groupById.has(g.parentGroupId) && g.parentGroupId !== g.id) {
        const list = childGroups.get(g.parentGroupId) ?? [];
        list.push(g);
        childGroups.set(g.parentGroupId, list);
      } else {
        topGroups.push(g);
      }
    }

    for (const node of graph.nodes) {
      if (node.groupId && groupById.has(node.groupId)) {
        const list = directNodesByGroup.get(node.groupId) ?? [];
        list.push(node);
        directNodesByGroup.set(node.groupId, list);
      } else {
        orphanNodes.push(node);
      }
    }

    const positionedNodes: PositionedNode[] = [];
    const positionedGroups: PositionedGroup[] = [];
    const slots: LayoutSlot[] = [];

    const countHiddenNodes = (groupId: string, seen = new Set<string>()): number => {
      if (seen.has(groupId)) return 0;
      seen.add(groupId);
      let count = directNodesByGroup.get(groupId)?.length ?? 0;
      for (const child of childGroups.get(groupId) ?? []) {
        count += countHiddenNodes(child.id, seen);
      }
      return count;
    };

    const emitNode = (node: GraphNode, cx: number, cy: number, width: number, height: number): void => {
      const displayLabel = node.shortLabel ?? compactLabels.get(node.id) ?? node.label;
      positionedNodes.push(
        finalizeNodePlacement(
          { node, cx, cy, width, height },
          displayLabel,
          options.snap,
        ),
      );
    };

    const layoutGroupSubtree = (group: GraphGroup, visiting = new Set<string>()): SubtreeBox => {
      const isCollapsed = collapsedSet.has(group.id) || group.collapsed === true;
      const headerH = 44;
      const pad = 16;
      const gap = 14;

      if (isCollapsed || visiting.has(group.id)) {
        const width = 264;
        const height = 74;
        const hiddenCount = countHiddenNodes(group.id);
        return {
          width,
          height,
          emit: (ox, oy) => {
            const gx = normZero(Math.round(ox));
            const gy = normZero(Math.round(oy));
            positionedGroups.push({
              group: cloneGroup(group),
              shape: "rect",
              point: {
                x: normZero(Math.round(gx + width / 2)),
                y: normZero(Math.round(gy + height / 2)),
              },
              bounds: { x: gx, y: gy, width, height },
              collapsed: true,
              hiddenChildCount: hiddenCount,
            });
          },
        };
      }

      const nextVisiting = new Set(visiting);
      nextVisiting.add(group.id);

      const children = [...(childGroups.get(group.id) ?? [])].sort((a, b) =>
        a.label.localeCompare(b.label) || a.id.localeCompare(b.id),
      );
      const members = directNodesByGroup.get(group.id) ?? [];
      const pinnedLeafNodes: GraphNode[] = [];
      const unpinnedLeafNodes: GraphNode[] = [];
      for (const m of members) {
        if (m.pinned === true && m.point !== undefined) {
          pinnedLeafNodes.push(m);
        } else {
          unpinnedLeafNodes.push(m);
        }
      }
      const leafNodes = [...unpinnedLeafNodes].sort(
        (a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id),
      );

      const childBoxes = children.map((ch) => layoutGroupSubtree(ch, nextVisiting));
      const colsForLeaves = leafNodes.length <= 1 ? 1 : Math.min(3, Math.ceil(Math.sqrt(leafNodes.length)));
      const leafRows = Math.ceil(leafNodes.length / colsForLeaves);
      const leafGridW = leafNodes.length === 0 ? 0 : colsForLeaves * nodeW + (colsForLeaves - 1) * gap;
      const leafGridH = leafNodes.length === 0 ? 0 : leafRows * nodeH + (leafRows - 1) * gap;

      const colsForChildren = childBoxes.length <= 1 ? 1 : Math.min(2, childBoxes.length);
      const childRowHeights: number[] = [];
      const childColWidths: number[] = Array.from({ length: colsForChildren }, () => 0);

      for (let idx = 0; idx < childBoxes.length; idx++) {
        const box = childBoxes[idx];
        if (box === undefined) continue;
        const r = Math.floor(idx / colsForChildren);
        const c = idx % colsForChildren;
        childRowHeights[r] = Math.max(childRowHeights[r] ?? 0, box.height);
        childColWidths[c] = Math.max(childColWidths[c] ?? 0, box.width);
      }

      const childrenGridW =
        childBoxes.length === 0
          ? 0
          : childColWidths.reduce((s, w) => s + w, 0) + Math.max(0, colsForChildren - 1) * gap;
      const childrenGridH =
        childBoxes.length === 0
          ? 0
          : childRowHeights.reduce((s, h) => s + h, 0) + Math.max(0, childRowHeights.length - 1) * gap;

      const innerW = Math.max(240, leafGridW, childrenGridW);
      const totalH =
        headerH +
        pad +
        (childrenGridH > 0 ? childrenGridH : 0) +
        (childrenGridH > 0 && leafGridH > 0 ? gap : 0) +
        (leafGridH > 0 ? leafGridH : 0) +
        (childrenGridH === 0 && leafGridH === 0 ? 34 : pad);
      const totalW = innerW + pad * 2;

      return {
        width: totalW,
        height: totalH,
        emit: (ox, oy) => {
          const gx = normZero(Math.round(ox));
          const gy = normZero(Math.round(oy));
          const gw = normZero(Math.round(totalW));
          const gh = normZero(Math.round(totalH));
          positionedGroups.push({
            group: cloneGroup(group),
            shape: "rect",
            point: {
              x: normZero(Math.round(gx + gw / 2)),
              y: normZero(Math.round(gy + gh / 2)),
            },
            bounds: { x: gx, y: gy, width: gw, height: gh },
            collapsed: false,
            hiddenChildCount: 0,
          });

          let cursorY = oy + headerH + 6;
          if (childBoxes.length > 0) {
            let rowY = cursorY;
            for (let r = 0; r < childRowHeights.length; r++) {
              let colX = ox + pad;
              for (let c = 0; c < colsForChildren; c++) {
                const idx = r * colsForChildren + c;
                if (idx >= childBoxes.length) break;
                const childBox = childBoxes[idx];
                if (childBox !== undefined) {
                  childBox.emit(colX, rowY);
                }
                colX += (childColWidths[c] ?? 0) + gap;
              }
              rowY += (childRowHeights[r] ?? 0) + gap;
            }
            cursorY += childrenGridH + gap;
          }

          for (let idx = 0; idx < leafNodes.length; idx++) {
            const node = leafNodes[idx];
            if (node === undefined) continue;
            const r = Math.floor(idx / colsForLeaves);
            const c = idx % colsForLeaves;
            const nx = Math.round(ox + pad + c * (nodeW + gap));
            const ny = Math.round(cursorY + r * (nodeH + gap));
            const w = node.width ?? nodeW;
            const h = node.height ?? nodeH;
            const cx = Math.round(nx + w / 2);
            const cy = Math.round(ny + h / 2);
            slots.push(makeSlot(cx, cy, { groupId: group.id, ring: r, slot: idx }));
            emitNode(node, cx, cy, w, h);
          }

          for (const pinned of pinnedLeafNodes) {
            const pt = pinned.point;
            if (pt === undefined) continue;
            emitNode(pinned, pt.x, pt.y, pinned.width ?? nodeW, pinned.height ?? nodeH);
          }
        },
      };
    };

    topGroups.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
    const topBoxes = topGroups.map((g) => layoutGroupSubtree(g));

    const cols = topBoxes.length <= 1 ? 1 : Math.min(3, Math.ceil(Math.sqrt(topBoxes.length)));
    const colHeights = Array.from({ length: cols }, () => 36);
    const colWidths = Array.from({ length: cols }, () => 280);
    const assignedCol: number[] = [];

    for (const box of topBoxes) {
      let shortest = 0;
      for (let c = 1; c < cols; c++) {
        if ((colHeights[c] ?? 0) < (colHeights[shortest] ?? 0)) {
          shortest = c;
        }
      }
      assignedCol.push(shortest);
      colWidths[shortest] = Math.max(colWidths[shortest] ?? 0, box.width);
      colHeights[shortest] = (colHeights[shortest] ?? 0) + box.height + 28;
    }

    const colOffsetsX: number[] = [];
    let xCursor = 36;
    for (let c = 0; c < cols; c++) {
      colOffsetsX.push(xCursor);
      xCursor += (colWidths[c] ?? 280) + 34;
    }

    const colCursorsY = Array.from({ length: cols }, () => 36);
    for (let idx = 0; idx < topBoxes.length; idx++) {
      const box = topBoxes[idx];
      const col = assignedCol[idx] ?? 0;
      if (box === undefined) continue;
      box.emit(colOffsetsX[col] ?? 36, colCursorsY[col] ?? 36);
      colCursorsY[col] = (colCursorsY[col] ?? 36) + box.height + 28;
    }

    if (orphanNodes.length > 0) {
      const dockX = xCursor + 12;
      const dockY = 36;
      const unpinnedOrphans: GraphNode[] = [];
      for (const n of orphanNodes) {
        if (n.pinned === true && n.point !== undefined) {
          emitNode(n, n.point.x, n.point.y, n.width ?? nodeW, n.height ?? nodeH);
        } else {
          unpinnedOrphans.push(n);
        }
      }
      const orphanCols = unpinnedOrphans.length > 8 ? 2 : 1;
      for (let idx = 0; idx < unpinnedOrphans.length; idx++) {
        const node = unpinnedOrphans[idx];
        if (node === undefined) continue;
        const col = idx % orphanCols;
        const row = Math.floor(idx / orphanCols);
        const w = node.width ?? nodeW;
        const h = node.height ?? nodeH;
        const nx = Math.round(dockX + col * (nodeW + 16));
        const ny = Math.round(dockY + row * (nodeH + 16));
        const cx = Math.round(nx + w / 2);
        const cy = Math.round(ny + h / 2);
        slots.push(makeSlot(cx, cy, { ring: 0, slot: idx }));
        emitNode(node, cx, cy, w, h);
      }
    }

    const positionedLinks = bundleLinksWithContext(
      graph.links,
      positionedNodes,
      positionedGroups,
      {
        bundleParallel: options.bundleLinks ?? true,
        bundleCrossCluster: false,
        selectedLinkId: options.selectedLinkId ?? null,
      },
      { allGroups: graph.groups, allNodes: graph.nodes },
    );

    return deepFreeze({
      layoutId: "hierarchy-hull",
      nodes: positionedNodes,
      groups: positionedGroups,
      links: positionedLinks,
      slots,
      bounds: computeSceneBounds(positionedNodes, positionedGroups, options.padding ?? 48),
    });
  },
};
