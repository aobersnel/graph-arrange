/**
 * Deterministic Bezier link router and parallel/cluster-level link bundler.
 */

import { deepFreeze, normZero } from "./geometry.js";
import type {
  GraphGroup,
  GraphLink,
  GraphNode,
  LinkBundleOptions,
  PositionedGroup,
  PositionedLink,
  PositionedNode,
} from "./types.js";

interface EndpointCoord {
  readonly x: number;
  readonly y: number;
  readonly groupId: string | null;
}

function summarizeLabels(labels: readonly string[]): string {
  const unique = Array.from(new Set(labels.map((label) => label.trim()).filter((label) => label.length > 0)));
  if (unique.length === 0) {
    return "";
  }
  if (unique.length <= 2) {
    return unique.join(", ");
  }
  return `${unique[0]}, ${unique[1]} +${unique.length - 2}`;
}

function curveBetween(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  curvatureOffset: number,
): { pathD: string; labelX: number; labelY: number } {
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  if (sx === tx && sy === ty) {
    const r = 28;
    const rx = normZero(Math.round(sx));
    const ry = normZero(Math.round(sy));
    const endY = normZero(Math.round(sy + 4));
    return {
      pathD: `M ${rx} ${ry} C ${normZero(Math.round(sx + r))} ${normZero(Math.round(sy - r * 1.4))}, ${normZero(Math.round(sx + r * 1.4))} ${normZero(Math.round(sy + r))}, ${rx} ${endY}`,
      labelX: normZero(Math.round(sx + r)),
      labelY: normZero(Math.round(sy - r * 0.4)),
    };
  }
  const nx = -dy / len;
  const ny = dx / len;
  const cx = (sx + tx) / 2 + nx * curvatureOffset;
  const cy = (sy + ty) / 2 + ny * curvatureOffset;
  const labelX = normZero(Math.round(0.25 * sx + 0.5 * cx + 0.25 * tx));
  const labelY = normZero(Math.round(0.25 * sy + 0.5 * cy + 0.25 * ty));
  return {
    pathD: `M ${normZero(Math.round(sx))} ${normZero(Math.round(sy))} Q ${normZero(Math.round(cx))} ${normZero(Math.round(cy))} ${normZero(Math.round(tx))} ${normZero(Math.round(ty))}`,
    labelX,
    labelY,
  };
}

function cloneOptionalAttrs(
  attrs: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> | undefined {
  if (attrs === undefined) {
    return undefined;
  }
  const copy: Record<string, string> = {};
  for (const key of Object.keys(attrs)) {
    const val = attrs[key];
    if (val !== undefined) {
      copy[key] = val;
    }
  }
  return copy;
}

export interface HiddenHierarchyContext {
  readonly allGroups: readonly GraphGroup[];
  readonly allNodes: readonly GraphNode[];
}

/**
 * Routes and optionally bundles links onto positioned node and collapsed-group centers.
 */
export function bundleLinks(
  rawLinks: readonly GraphLink[],
  nodes: readonly PositionedNode[],
  groups: readonly PositionedGroup[],
  options: LinkBundleOptions = {},
): readonly PositionedLink[] {
  return bundleLinksWithContext(rawLinks, nodes, groups, options);
}

/**
 * Internal link bundler that also resolves collapsed descendants omitted from positionedGroups.
 */
export function bundleLinksWithContext(
  rawLinks: readonly GraphLink[],
  nodes: readonly PositionedNode[],
  groups: readonly PositionedGroup[],
  options: LinkBundleOptions = {},
  hierarchy?: HiddenHierarchyContext,
): readonly PositionedLink[] {
  if (!Array.isArray(rawLinks) || !Array.isArray(nodes) || !Array.isArray(groups)) {
    throw new TypeError("bundleLinks requires rawLinks, nodes, and groups arrays");
  }
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("bundleLinks options must be an object when provided");
  }

  const coords = new Map<string, EndpointCoord>();
  for (const n of nodes) {
    coords.set(n.node.id, {
      x: n.point.x,
      y: n.point.y,
      groupId: n.node.groupId ?? null,
    });
  }

  const childGroupIdsByParent = new Map<string, string[]>();
  const rawGroupById = new Map<string, GraphGroup>();
  const addChildGroupEdge = (parentId: string, childId: string): void => {
    const list = childGroupIdsByParent.get(parentId) ?? [];
    if (!list.includes(childId)) {
      list.push(childId);
      childGroupIdsByParent.set(parentId, list);
    }
  };

  for (const g of groups) {
    rawGroupById.set(g.group.id, g.group);
    if (g.group.parentGroupId) {
      addChildGroupEdge(g.group.parentGroupId, g.group.id);
    }
  }
  if (hierarchy !== undefined) {
    for (const g of hierarchy.allGroups) {
      if (!rawGroupById.has(g.id)) {
        rawGroupById.set(g.id, g);
      }
      if (g.parentGroupId) {
        addChildGroupEdge(g.parentGroupId, g.id);
      }
    }
  }

  const directNodesByGroupId = new Map<string, string[]>();
  if (hierarchy !== undefined) {
    for (const n of hierarchy.allNodes) {
      if (n.groupId) {
        const list = directNodesByGroupId.get(n.groupId) ?? [];
        list.push(n.id);
        directNodesByGroupId.set(n.groupId, list);
      }
    }
  }

  const assignCollapsedDescendants = (
    groupId: string,
    gx: number,
    gy: number,
    rootGroupId: string,
    seen = new Set<string>(),
  ): void => {
    if (seen.has(groupId)) {
      return;
    }
    seen.add(groupId);
    const rawGroup = rawGroupById.get(groupId);
    if (rawGroup !== undefined) {
      for (const memberId of rawGroup.memberNodeIds) {
        if (!coords.has(memberId)) {
          coords.set(memberId, { x: gx, y: gy, groupId: rootGroupId });
        }
      }
      for (const memberGroupId of rawGroup.memberGroupIds ?? []) {
        if (!coords.has(memberGroupId)) {
          coords.set(memberGroupId, { x: gx, y: gy, groupId: rootGroupId });
        }
        assignCollapsedDescendants(memberGroupId, gx, gy, rootGroupId, seen);
      }
    }
    for (const memberId of directNodesByGroupId.get(groupId) ?? []) {
      if (!coords.has(memberId)) {
        coords.set(memberId, { x: gx, y: gy, groupId: rootGroupId });
      }
    }
    for (const childId of childGroupIdsByParent.get(groupId) ?? []) {
      if (!coords.has(childId)) {
        coords.set(childId, { x: gx, y: gy, groupId: rootGroupId });
      }
      assignCollapsedDescendants(childId, gx, gy, rootGroupId, seen);
    }
  };

  for (const g of groups) {
    const gx = g.point.x;
    const gy = g.point.y;
    if (!coords.has(g.group.id)) {
      coords.set(g.group.id, { x: gx, y: gy, groupId: g.group.id });
    }
    if (g.collapsed) {
      assignCollapsedDescendants(g.group.id, gx, gy, g.group.id);
    }
  }

  const visibleLinks = rawLinks.filter((link) => coords.has(link.sourceId) && coords.has(link.targetId));
  if (visibleLinks.length === 0) {
    return [];
  }

  const bundleParallel = options.bundleParallel ?? true;
  const bundleCrossCluster = options.bundleCrossCluster ?? false;

  const buckets = new Map<string, GraphLink[]>();
  for (const link of visibleLinks) {
    const src = coords.get(link.sourceId);
    const dst = coords.get(link.targetId);
    if (src === undefined || dst === undefined) {
      continue;
    }
    const srcGroup = src.groupId;
    const dstGroup = dst.groupId;
    const canClusterBundle =
      bundleCrossCluster &&
      srcGroup !== null &&
      dstGroup !== null &&
      srcGroup !== dstGroup &&
      srcGroup !== link.sourceId &&
      dstGroup !== link.targetId &&
      link.id !== options.selectedLinkId;

    const key = canClusterBundle
      ? `cluster:${link.category}:${srcGroup}->${dstGroup}`
      : bundleParallel && link.id !== options.selectedLinkId
        ? `pair:${link.category}:${link.sourceId}->${link.targetId}`
        : `single:${link.id}`;

    const list = buckets.get(key) ?? [];
    list.push(link);
    buckets.set(key, list);
  }

  const pairSpreadCounts = new Map<string, number>();
  const out: PositionedLink[] = [];
  const sortedEntries = Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b));

  for (const [bucketKey, list] of sortedEntries) {
    const rep = list[0];
    if (rep === undefined) {
      continue;
    }
    const repSrc = coords.get(rep.sourceId);
    const repDst = coords.get(rep.targetId);
    if (repSrc === undefined || repDst === undefined) {
      continue;
    }
    const isClusterBundle = bucketKey.startsWith("cluster:") && list.length > 1;
    const srcCoord =
      isClusterBundle && repSrc.groupId !== null
        ? (coords.get(repSrc.groupId) ?? repSrc)
        : repSrc;
    const dstCoord =
      isClusterBundle && repDst.groupId !== null
        ? (coords.get(repDst.groupId) ?? repDst)
        : repDst;

    const aId = srcCoord.x <= dstCoord.x ? rep.sourceId : rep.targetId;
    const bId = srcCoord.x <= dstCoord.x ? rep.targetId : rep.sourceId;
    const pairKey = isClusterBundle
      ? `${srcCoord.groupId ?? aId}::${dstCoord.groupId ?? bId}`
      : `${aId}::${bId}`;
    const idxInPair = pairSpreadCounts.get(pairKey) ?? 0;
    pairSpreadCounts.set(pairKey, idxInPair + 1);

    const dist = Math.hypot(dstCoord.x - srcCoord.x, dstCoord.y - srcCoord.y);
    const baseArc = Math.min(48, Math.max(12, dist * 0.1));
    const offset =
      idxInPair === 0
        ? list.length > 1
          ? baseArc
          : rep.category === "secondary"
            ? baseArc
            : -baseArc * 0.45
        : (idxInPair % 2 === 1 ? -1 : 1) * (baseArc + idxInPair * 16);

    const { pathD, labelX, labelY } = curveBetween(
      srcCoord.x,
      srcCoord.y,
      dstCoord.x,
      dstCoord.y,
      offset,
    );

    const rawLabels = list.map((link) => link.label ?? "");
    const summarized = summarizeLabels(rawLabels);
    const label =
      list.length > 1
        ? summarized.length > 0
          ? `${summarized} (${list.length})`
          : `${list.length} links`
        : summarized;

    const outItem: {
      id: string;
      sourceId: string;
      targetId: string;
      linkIds: readonly string[];
      count: number;
      category: string;
      strokeColor?: string;
      dashed: boolean;
      pathD: string;
      label: string;
      labelPoint: { readonly x: number; readonly y: number };
      bundled: boolean;
      dataAttrs?: Readonly<Record<string, string>>;
    } = {
      id: list.length === 1 ? rep.id : bucketKey,
      sourceId: rep.sourceId,
      targetId: rep.targetId,
      linkIds: list.map((link) => link.id),
      count: list.length,
      category: rep.category,
      dashed: list.every((link) => link.dashed === true),
      pathD,
      label,
      labelPoint: { x: labelX, y: labelY },
      bundled: list.length > 1,
    };
    if (rep.strokeColor !== undefined) {
      outItem.strokeColor = rep.strokeColor;
    }
    const copiedAttrs = cloneOptionalAttrs(rep.dataAttrs);
    if (copiedAttrs !== undefined) {
      outItem.dataAttrs = copiedAttrs;
    }
    out.push(outItem);
  }

  return deepFreeze(out);
}
