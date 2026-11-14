/**
 * Radial and clustered constellation layout plugin.
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
  resolveBoxCollisions,
  type CollisionBox,
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

interface LocalOrbitNode {
  readonly node: GraphNode;
  readonly groupId: string;
  readonly dx: number;
  readonly dy: number;
  readonly width: number;
  readonly height: number;
}

interface LocalOrbitSlot {
  readonly dx: number;
  readonly dy: number;
  readonly ring: number;
  readonly slot: number;
}

interface LocalClusterLayout {
  readonly group: GraphGroup;
  readonly collapsed: boolean;
  readonly radius: number;
  cx: number;
  cy: number;
  readonly localNodes: readonly LocalOrbitNode[];
  readonly localSlots: readonly LocalOrbitSlot[];
  readonly hiddenChildCount: number;
}

function packLocalNodesInOrbit(
  groupId: string,
  nodes: readonly GraphNode[],
  nodeW: number,
  nodeH: number,
  ringGap: number,
): {
  localNodes: readonly LocalOrbitNode[];
  localSlots: readonly LocalOrbitSlot[];
  radius: number;
} {
  if (nodes.length === 0) {
    return { localNodes: [], localSlots: [], radius: 74 };
  }
  if (nodes.length === 1) {
    const n = nodes[0];
    if (n === undefined) {
      return { localNodes: [], localSlots: [], radius: 74 };
    }
    const w = n.width ?? nodeW;
    const h = n.height ?? nodeH;
    const r = Math.ceil(Math.hypot(w / 2, h / 2) + 44);
    return {
      localNodes: [{ node: n, groupId, dx: -w / 2, dy: -h / 2 + 8, width: w, height: h }],
      localSlots: [{ dx: 0, dy: 8, ring: 0, slot: 0 }],
      radius: Math.max(96, r),
    };
  }

  const boxes: CollisionBox[] = [];
  const placed: GraphNode[] = [];
  const localSlots: LocalOrbitSlot[] = [];
  const sorted = [...nodes].sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  const minArcSpacing = Math.max(nodeW + 16, nodeH + 28);
  let cursor = 0;
  let ringIdx = 0;

  while (cursor < sorted.length) {
    const ringRadius = 104 + ringIdx * ringGap;
    const capacity = Math.max(3, Math.floor((2 * Math.PI * ringRadius) / minArcSpacing));
    const count = Math.min(capacity, sorted.length - cursor);
    const angleOffset = (ringIdx * Math.PI) / 5;
    for (let i = 0; i < count; i++) {
      const n = sorted[cursor++];
      if (n === undefined) {
        break;
      }
      const w = n.width ?? nodeW;
      const h = n.height ?? nodeH;
      const angle = angleOffset + (2 * Math.PI * i) / count - Math.PI / 2;
      const cx = Math.cos(angle) * ringRadius;
      const cy = Math.sin(angle) * ringRadius + 10;
      boxes.push({ x: cx - w / 2, y: cy - h / 2, width: w, height: h });
      placed.push(n);
      localSlots.push({ dx: cx, dy: cy, ring: ringIdx, slot: i });
    }
    ringIdx++;
  }

  resolveBoxCollisions(boxes, 20, 60);

  let maxExtent = 96;
  const localNodes: LocalOrbitNode[] = [];
  for (let idx = 0; idx < placed.length; idx++) {
    const node = placed[idx];
    const b = boxes[idx];
    if (node === undefined || b === undefined) {
      continue;
    }
    const cornerDist = Math.max(
      Math.hypot(b.x, b.y),
      Math.hypot(b.x + b.width, b.y),
      Math.hypot(b.x, b.y + b.height),
      Math.hypot(b.x + b.width, b.y + b.height),
    );
    maxExtent = Math.max(maxExtent, cornerDist);
    localNodes.push({
      node,
      groupId,
      dx: b.x,
      dy: b.y,
      width: b.width,
      height: b.height,
    });
  }

  return {
    localNodes,
    localSlots,
    radius: Math.ceil(maxExtent + 44),
  };
}

function packClusterCircles(clusters: LocalClusterLayout[], gap: number): void {
  if (clusters.length === 0) {
    return;
  }
  if (clusters.length === 1) {
    const only = clusters[0];
    if (only !== undefined) {
      only.cx = 0;
      only.cy = 0;
    }
    return;
  }

  const totalDiameters = clusters.reduce((acc, c) => acc + c.radius * 2 + gap, 0);
  const orbitRadius = Math.max(240, totalDiameters / (2 * Math.PI));
  let angleCursor = -Math.PI / 2;
  for (const cluster of clusters) {
    const slice = totalDiameters > 0 ? ((cluster.radius * 2 + gap) / totalDiameters) * (2 * Math.PI) : 0;
    const midAngle = angleCursor + slice / 2;
    cluster.cx = Math.cos(midAngle) * orbitRadius;
    cluster.cy = Math.sin(midAngle) * orbitRadius;
    angleCursor += slice;
  }

  for (let iter = 0; iter < 180; iter++) {
    if (iter < 95) {
      for (const c of clusters) {
        c.cx *= 0.988;
        c.cy *= 0.988;
      }
    }
    for (let i = 0; i < clusters.length; i++) {
      const a = clusters[i];
      if (a === undefined) continue;
      for (let j = i + 1; j < clusters.length; j++) {
        const b = clusters[j];
        if (b === undefined) continue;
        let dx = b.cx - a.cx;
        let dy = b.cy - a.cy;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.001) {
          dx = 1;
          dy = 0.5;
          dist = Math.hypot(dx, dy);
        }
        const minDist = a.radius + b.radius + gap;
        if (dist < minDist) {
          const push = (minDist - dist) * 0.55;
          const ux = dx / dist;
          const uy = dy / dist;
          a.cx -= ux * push;
          a.cy -= uy * push;
          b.cx += ux * push;
          b.cy += uy * push;
        }
      }
    }
  }
}

export const RadialClusterLayoutPlugin: LayoutPlugin = {
  id: "radial-cluster",
  label: "Radial Clusters",
  description:
    "Arranges clusters in a circular constellation with concentric member orbits, slots, and bundled cross-cluster splines.",
  compute(graph: GraphInput, options: LayoutOptions = {}): PositionedScene {
    assertValidGraphInput(graph);
    assertValidLayoutOptions(options);

    const nodeW = options.nodeWidth ?? 172;
    const nodeH = options.nodeHeight ?? 62;
    const ringGap = options.ringGap ?? 96;
    const clusterGap = options.clusterGap ?? 78;
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
    const groupMap = new Map(allowedGroups.map((g) => [g.id, g]));

    const bucketByGroup = new Map<string, GraphNode[]>();
    const ungrouped: GraphNode[] = [];
    for (const node of graph.nodes) {
      if (node.groupId && groupMap.has(node.groupId)) {
        const list = bucketByGroup.get(node.groupId) ?? [];
        list.push(node);
        bucketByGroup.set(node.groupId, list);
      } else {
        ungrouped.push(node);
      }
    }

    const activeGroups: GraphGroup[] = allowedGroups.filter(
      (g) => (bucketByGroup.get(g.id)?.length ?? 0) > 0 || g.memberNodeIds.length > 0,
    );

    if (ungrouped.length > 0) {
      activeGroups.push({
        id: "__ungrouped_cluster__",
        label: "Ungrouped",
        sublabel: `${ungrouped.length} items`,
        role: "ungrouped",
        memberNodeIds: ungrouped.map((n) => n.id),
        collapsed: false,
        collapsible: true,
        badgeSummary: `${ungrouped.length} items`,
      });
      bucketByGroup.set("__ungrouped_cluster__", ungrouped);
    }

    activeGroups.sort(
      (a, b) =>
        (bucketByGroup.get(b.id)?.length ?? 0) - (bucketByGroup.get(a.id)?.length ?? 0) ||
        a.label.localeCompare(b.label) ||
        a.id.localeCompare(b.id),
    );

    const pinnedByCluster: { readonly node: GraphNode; readonly groupId: string }[] = [];
    const clusterLayouts: LocalClusterLayout[] = activeGroups.map((group) => {
      const members = bucketByGroup.get(group.id) ?? [];
      const isCollapsed = collapsedSet.has(group.id) || group.collapsed === true;
      if (isCollapsed) {
        return {
          group,
          collapsed: true,
          radius: 74,
          cx: 0,
          cy: 0,
          localNodes: [],
          localSlots: [],
          hiddenChildCount: members.length,
        };
      }
      const unpinnedMembers: GraphNode[] = [];
      for (const m of members) {
        if (m.pinned === true && m.point !== undefined) {
          pinnedByCluster.push({ node: m, groupId: group.id });
        } else {
          unpinnedMembers.push(m);
        }
      }
      const { localNodes, localSlots, radius } = packLocalNodesInOrbit(
        group.id,
        unpinnedMembers,
        nodeW,
        nodeH,
        ringGap,
      );
      return {
        group,
        collapsed: false,
        radius,
        cx: 0,
        cy: 0,
        localNodes,
        localSlots,
        hiddenChildCount: 0,
      };
    });

    packClusterCircles(clusterLayouts, clusterGap);

    const positionedGroups: PositionedGroup[] = [];
    const slots: LayoutSlot[] = [];
    const placements: {
      readonly node: GraphNode;
      readonly groupId: string;
      readonly box: CollisionBox;
    }[] = [];

    for (const c of clusterLayouts) {
      const cx = normZero(Math.round(c.cx));
      const cy = normZero(Math.round(c.cy));
      const r = normZero(c.radius);
      positionedGroups.push({
        group: cloneGroup(c.group),
        shape: "circle",
        point: { x: cx, y: cy },
        bounds: {
          x: normZero(cx - r),
          y: normZero(cy - r),
          width: normZero(r * 2),
          height: normZero(r * 2),
        },
        radius: r,
        collapsed: c.collapsed,
        hiddenChildCount: c.hiddenChildCount,
      });

      for (const s of c.localSlots) {
        slots.push(
          makeSlot(Math.round(cx + s.dx), Math.round(cy + s.dy), {
            groupId: c.group.id,
            ring: s.ring,
            slot: s.slot,
          }),
        );
      }

      for (const local of c.localNodes) {
        const x = normZero(Math.round(cx + local.dx));
        const y = normZero(Math.round(cy + local.dy));
        placements.push({
          node: local.node,
          groupId: local.groupId,
          box: { x, y, width: local.width, height: local.height, fixed: false },
        });
      }
    }

    for (const pinned of pinnedByCluster) {
      const pt = pinned.node.point;
      if (pt === undefined) continue;
      const w = pinned.node.width ?? nodeW;
      const h = pinned.node.height ?? nodeH;
      placements.push({
        node: pinned.node,
        groupId: pinned.groupId,
        box: {
          x: normZero(pt.x - w / 2),
          y: normZero(pt.y - h / 2),
          width: w,
          height: h,
          fixed: true,
        },
      });
    }

    if (pinnedByCluster.length > 0 && placements.length > 1) {
      resolveBoxCollisions(
        placements.map((p) => p.box),
        18,
        40,
      );
    }

    const positionedNodes: PositionedNode[] = placements.map((p) => {
      const displayLabel = p.node.shortLabel ?? compactLabels.get(p.node.id) ?? p.node.label;
      return finalizeNodePlacement(
        {
          node: p.node,
          cx: p.box.x + p.box.width / 2,
          cy: p.box.y + p.box.height / 2,
          width: p.box.width,
          height: p.box.height,
        },
        displayLabel,
        options.snap,
        p.groupId,
      );
    });

    const positionedLinks = bundleLinksWithContext(
      graph.links,
      positionedNodes,
      positionedGroups,
      {
        bundleParallel: options.bundleLinks ?? true,
        bundleCrossCluster: options.bundleCrossCluster ?? true,
        selectedLinkId: options.selectedLinkId ?? null,
      },
      { allGroups: graph.groups, allNodes: graph.nodes },
    );

    return deepFreeze({
      layoutId: "radial-cluster",
      nodes: positionedNodes,
      groups: positionedGroups,
      links: positionedLinks,
      slots,
      bounds: computeSceneBounds(positionedNodes, positionedGroups, options.padding ?? 72),
    });
  },
};
