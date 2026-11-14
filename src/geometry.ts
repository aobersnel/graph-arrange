import type {
  GraphGroup,
  GraphInput,
  GraphLink,
  GraphNode,
  LayoutOptions,
  LayoutSlot,
  Point2D,
  PositionedGroup,
  PositionedNode,
  Rect2D,
  SnapFn,
} from "./types.js";

export interface CollisionBox {
  x: number;
  y: number;
  width: number;
  height: number;
  fixed?: boolean;
}

export interface RawNodePlacement {
  readonly node: GraphNode;
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
}

/** Normalizes signed zero to positive zero. */
export function normZero(value: number): number {
  return value === 0 ? 0 : value;
}

/** Validates that a value is a non-null plain-like object with finite x and y numbers. */
export function isFinitePoint(value: unknown): value is Point2D {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as { x?: unknown; y?: unknown };
  return (
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y)
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertPositiveFinite(value: unknown, field: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive finite number`);
  }
}

function assertNonNegativeFinite(value: unknown, field: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative finite number`);
  }
}

function cloneDataAttrs(attrs: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  if (!isPlainRecord(attrs)) {
    throw new TypeError("dataAttrs must be a plain record of string values");
  }
  const copy: Record<string, string> = {};
  for (const key of Object.keys(attrs)) {
    const val = attrs[key];
    if (typeof val !== "string") {
      throw new TypeError(`dataAttrs["${key}"] must be a string`);
    }
    copy[key] = val;
  }
  return copy;
}

/** Validates a caller-supplied graph input, throwing TypeError on malformed shapes or IDs. */
export function assertValidGraphInput(graph: GraphInput): void {
  if (typeof graph !== "object" || graph === null || Array.isArray(graph)) {
    throw new TypeError("graph must be a non-null object");
  }
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.groups) || !Array.isArray(graph.links)) {
    throw new TypeError("graph must contain nodes, groups, and links arrays");
  }

  const nodeIds = new Set<string>();
  for (let i = 0; i < graph.nodes.length; i++) {
    const node = graph.nodes[i];
    if (typeof node !== "object" || node === null || Array.isArray(node)) {
      throw new TypeError(`graph.nodes[${i}] must be a non-null object`);
    }
    if (typeof node.id !== "string" || node.id.length === 0) {
      throw new TypeError(`graph.nodes[${i}].id must be a non-empty string`);
    }
    if (nodeIds.has(node.id)) {
      throw new TypeError(`duplicate graph node id "${node.id}"`);
    }
    nodeIds.add(node.id);
    if (typeof node.label !== "string") {
      throw new TypeError(`graph.nodes[${i}].label must be a string`);
    }
    if (node.width !== undefined) {
      assertPositiveFinite(node.width, `graph.nodes[${i}].width`);
    }
    if (node.height !== undefined) {
      assertPositiveFinite(node.height, `graph.nodes[${i}].height`);
    }
    if (node.laneIndex !== undefined && (typeof node.laneIndex !== "number" || !Number.isFinite(node.laneIndex))) {
      throw new TypeError(`graph.nodes[${i}].laneIndex must be a finite number`);
    }
    if (node.priority !== undefined && (typeof node.priority !== "number" || !Number.isFinite(node.priority))) {
      throw new TypeError(`graph.nodes[${i}].priority must be a finite number`);
    }
    if (node.weight !== undefined && (typeof node.weight !== "number" || !Number.isFinite(node.weight))) {
      throw new TypeError(`graph.nodes[${i}].weight must be a finite number`);
    }
    if (node.pinned !== undefined && typeof node.pinned !== "boolean") {
      throw new TypeError(`graph.nodes[${i}].pinned must be a boolean`);
    }
    if (node.point !== undefined && !isFinitePoint(node.point)) {
      throw new TypeError(`graph.nodes[${i}].point must have finite numeric x and y`);
    }
    if (node.pinned === true && !isFinitePoint(node.point)) {
      throw new TypeError(`graph.nodes[${i}] "${node.id}" has pinned: true without a finite point`);
    }
    if (node.dataAttrs !== undefined) {
      cloneDataAttrs(node.dataAttrs);
    }
  }

  const groupIds = new Set<string>();
  for (let i = 0; i < graph.groups.length; i++) {
    const group = graph.groups[i];
    if (typeof group !== "object" || group === null || Array.isArray(group)) {
      throw new TypeError(`graph.groups[${i}] must be a non-null object`);
    }
    if (typeof group.id !== "string" || group.id.length === 0) {
      throw new TypeError(`graph.groups[${i}].id must be a non-empty string`);
    }
    if (groupIds.has(group.id)) {
      throw new TypeError(`duplicate graph group id "${group.id}"`);
    }
    groupIds.add(group.id);
    if (typeof group.label !== "string") {
      throw new TypeError(`graph.groups[${i}].label must be a string`);
    }
    if (!Array.isArray(group.memberNodeIds)) {
      throw new TypeError(`graph.groups[${i}].memberNodeIds must be an array`);
    }
    for (let j = 0; j < group.memberNodeIds.length; j++) {
      if (typeof group.memberNodeIds[j] !== "string") {
        throw new TypeError(`graph.groups[${i}].memberNodeIds[${j}] must be a string`);
      }
    }
    if (group.memberGroupIds !== undefined && !Array.isArray(group.memberGroupIds)) {
      throw new TypeError(`graph.groups[${i}].memberGroupIds must be an array`);
    }
    if (group.dataAttrs !== undefined) {
      cloneDataAttrs(group.dataAttrs);
    }
  }

  for (let i = 0; i < graph.links.length; i++) {
    const link = graph.links[i];
    if (typeof link !== "object" || link === null || Array.isArray(link)) {
      throw new TypeError(`graph.links[${i}] must be a non-null object`);
    }
    if (typeof link.id !== "string" || link.id.length === 0) {
      throw new TypeError(`graph.links[${i}].id must be a non-empty string`);
    }
    if (typeof link.sourceId !== "string" || typeof link.targetId !== "string") {
      throw new TypeError(`graph.links[${i}] sourceId and targetId must be strings`);
    }
    if (typeof link.category !== "string") {
      throw new TypeError(`graph.links[${i}].category must be a string`);
    }
    if (link.dataAttrs !== undefined) {
      cloneDataAttrs(link.dataAttrs);
    }
  }
}

/** Validates caller-supplied layout options, throwing TypeError on malformed fields. */
export function assertValidLayoutOptions(options: LayoutOptions | undefined): void {
  if (options === undefined) {
    return;
  }
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("options must be an object when provided");
  }
  if (options.nodeWidth !== undefined) {
    assertPositiveFinite(options.nodeWidth, "options.nodeWidth");
  }
  if (options.nodeHeight !== undefined) {
    assertPositiveFinite(options.nodeHeight, "options.nodeHeight");
  }
  if (options.padding !== undefined) {
    assertNonNegativeFinite(options.padding, "options.padding");
  }
  if (options.ringGap !== undefined) {
    assertNonNegativeFinite(options.ringGap, "options.ringGap");
  }
  if (options.clusterGap !== undefined) {
    assertNonNegativeFinite(options.clusterGap, "options.clusterGap");
  }
  if (options.maxLabelChars !== undefined) {
    assertPositiveFinite(options.maxLabelChars, "options.maxLabelChars");
  }
  if (options.snap !== undefined && typeof options.snap !== "function") {
    throw new TypeError("options.snap must be a function");
  }
  if (options.collapseGroups !== undefined && !(options.collapseGroups instanceof Set)) {
    throw new TypeError("options.collapseGroups must be a Set<string>");
  }
  if (options.clusterRoleFilter !== undefined && !Array.isArray(options.clusterRoleFilter)) {
    throw new TypeError("options.clusterRoleFilter must be an array");
  }
  if (options.laneOrder !== undefined && !Array.isArray(options.laneOrder)) {
    throw new TypeError("options.laneOrder must be an array");
  }
  if (options.laneLabels !== undefined && !(options.laneLabels instanceof Map)) {
    throw new TypeError("options.laneLabels must be a Map<number, string>");
  }
}

/** Produces a fresh normalized copy of a GraphNode so caller inputs remain untouched. */
export function cloneNode(node: GraphNode, overrideGroupId?: string): GraphNode {
  const out: {
    id: string;
    label: string;
    shortLabel?: string;
    kind?: string;
    badge?: string;
    sublabel?: string;
    accentColor?: string;
    highlighted?: boolean;
    dimmed?: boolean;
    width?: number;
    height?: number;
    groupId?: string | null;
    parentGroupId?: string | null;
    laneIndex?: number;
    priority?: number;
    weight?: number;
    point?: Point2D;
    pinned?: boolean;
    dataAttrs?: Readonly<Record<string, string>>;
  } = {
    id: node.id,
    label: node.label,
  };
  if (node.shortLabel !== undefined) out.shortLabel = node.shortLabel;
  if (node.kind !== undefined) out.kind = node.kind;
  if (node.badge !== undefined) out.badge = node.badge;
  if (node.sublabel !== undefined) out.sublabel = node.sublabel;
  if (node.accentColor !== undefined) out.accentColor = node.accentColor;
  if (node.highlighted !== undefined) out.highlighted = node.highlighted;
  if (node.dimmed !== undefined) out.dimmed = node.dimmed;
  if (node.width !== undefined) out.width = normZero(node.width);
  if (node.height !== undefined) out.height = normZero(node.height);
  if (overrideGroupId !== undefined) {
    out.groupId = overrideGroupId;
  } else if (node.groupId !== undefined) {
    out.groupId = node.groupId;
  }
  if (node.parentGroupId !== undefined) out.parentGroupId = node.parentGroupId;
  if (node.laneIndex !== undefined) out.laneIndex = normZero(node.laneIndex);
  if (node.priority !== undefined) out.priority = normZero(node.priority);
  if (node.weight !== undefined) out.weight = normZero(node.weight);
  if (node.point !== undefined) {
    out.point = { x: normZero(node.point.x), y: normZero(node.point.y) };
  }
  if (node.pinned !== undefined) out.pinned = node.pinned;
  if (node.dataAttrs !== undefined) out.dataAttrs = cloneDataAttrs(node.dataAttrs);
  return out;
}

/** Produces a fresh copy of a GraphGroup so caller inputs remain untouched. */
export function cloneGroup(group: GraphGroup): GraphGroup {
  const out: {
    id: string;
    label: string;
    sublabel?: string;
    role?: string;
    depth?: number;
    parentGroupId?: string | null;
    memberNodeIds: readonly string[];
    memberGroupIds?: readonly string[];
    collapsed?: boolean;
    collapsible?: boolean;
    badgeSummary?: string;
    accentColor?: string;
    dataAttrs?: Readonly<Record<string, string>>;
  } = {
    id: group.id,
    label: group.label,
    memberNodeIds: [...group.memberNodeIds],
  };
  if (group.sublabel !== undefined) out.sublabel = group.sublabel;
  if (group.role !== undefined) out.role = group.role;
  if (group.depth !== undefined) out.depth = normZero(group.depth);
  if (group.parentGroupId !== undefined) out.parentGroupId = group.parentGroupId;
  if (group.memberGroupIds !== undefined) out.memberGroupIds = [...group.memberGroupIds];
  if (group.collapsed !== undefined) out.collapsed = group.collapsed;
  if (group.collapsible !== undefined) out.collapsible = group.collapsible;
  if (group.badgeSummary !== undefined) out.badgeSummary = group.badgeSummary;
  if (group.accentColor !== undefined) out.accentColor = group.accentColor;
  if (group.dataAttrs !== undefined) out.dataAttrs = cloneDataAttrs(group.dataAttrs);
  return out;
}

/** Produces a fresh copy of a GraphLink so caller inputs remain untouched. */
export function cloneLink(link: GraphLink): GraphLink {
  const out: {
    id: string;
    sourceId: string;
    targetId: string;
    category: string;
    strokeColor?: string;
    dashed?: boolean;
    label?: string;
    weight?: number;
    dataAttrs?: Readonly<Record<string, string>>;
  } = {
    id: link.id,
    sourceId: link.sourceId,
    targetId: link.targetId,
    category: link.category,
  };
  if (link.strokeColor !== undefined) out.strokeColor = link.strokeColor;
  if (link.dashed !== undefined) out.dashed = link.dashed;
  if (link.label !== undefined) out.label = link.label;
  if (link.weight !== undefined) out.weight = normZero(link.weight);
  if (link.dataAttrs !== undefined) out.dataAttrs = cloneDataAttrs(link.dataAttrs);
  return out;
}

function applySnapPoint(point: Point2D, bounds: Rect2D, snap: SnapFn): Point2D {
  const snapped = snap(
    { x: normZero(point.x), y: normZero(point.y) },
    {
      x: normZero(bounds.x),
      y: normZero(bounds.y),
      width: normZero(bounds.width),
      height: normZero(bounds.height),
    },
  );
  if (!isFinitePoint(snapped)) {
    throw new TypeError("options.snap must return a finite { x, y } point");
  }
  return { x: normZero(snapped.x), y: normZero(snapped.y) };
}

/** Finalizes node coordinates, preserving pinned points and applying optional snap. */
export function finalizeNodePlacement(
  raw: RawNodePlacement,
  displayLabel: string,
  snap: SnapFn | undefined,
  overrideGroupId?: string,
): PositionedNode {
  const width = normZero(raw.width);
  const height = normZero(raw.height);
  const cloned = cloneNode(raw.node, overrideGroupId);

  if (cloned.pinned === true && cloned.point !== undefined) {
    const point: Point2D = {
      x: normZero(cloned.point.x),
      y: normZero(cloned.point.y),
    };
    const bounds: Rect2D = {
      x: normZero(point.x - width / 2),
      y: normZero(point.y - height / 2),
      width,
      height,
    };
    return { node: cloned, point, bounds, displayLabel };
  }

  const basePoint: Point2D = {
    x: normZero(Math.round(raw.cx)),
    y: normZero(Math.round(raw.cy)),
  };
  const baseBounds: Rect2D = {
    x: normZero(Math.round(basePoint.x - width / 2)),
    y: normZero(Math.round(basePoint.y - height / 2)),
    width,
    height,
  };

  if (snap !== undefined) {
    const snappedPoint = applySnapPoint(basePoint, baseBounds, snap);
    const snappedBounds: Rect2D = {
      x: normZero(snappedPoint.x - width / 2),
      y: normZero(snappedPoint.y - height / 2),
      width,
      height,
    };
    return {
      node: cloned,
      point: snappedPoint,
      bounds: snappedBounds,
      displayLabel,
    };
  }

  return {
    node: cloned,
    point: basePoint,
    bounds: baseBounds,
    displayLabel,
  };
}

/** Normalizes and constructs a LayoutSlot without -0 or undefined optional fields. */
export function makeSlot(
  x: number,
  y: number,
  meta?: { groupId?: string; ring?: number; slot?: number },
): LayoutSlot {
  const slotOut: {
    point: Point2D;
    groupId?: string;
    ring?: number;
    slot?: number;
  } = {
    point: { x: normZero(x), y: normZero(y) },
  };
  if (meta?.groupId !== undefined) slotOut.groupId = meta.groupId;
  if (meta?.ring !== undefined) slotOut.ring = normZero(meta.ring);
  if (meta?.slot !== undefined) slotOut.slot = normZero(meta.slot);
  return slotOut;
}

/** Resolves axis-aligned box overlaps deterministically while respecting fixed boxes. */
export function resolveBoxCollisions(
  boxes: CollisionBox[],
  gap = 18,
  iterations = 40,
): void {
  if (!Array.isArray(boxes)) {
    throw new TypeError("resolveBoxCollisions boxes must be an array");
  }
  assertNonNegativeFinite(gap, "resolveBoxCollisions gap");
  assertNonNegativeFinite(iterations, "resolveBoxCollisions iterations");
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (
      b === undefined ||
      typeof b !== "object" ||
      b === null ||
      typeof b.x !== "number" ||
      !Number.isFinite(b.x) ||
      typeof b.y !== "number" ||
      !Number.isFinite(b.y) ||
      typeof b.width !== "number" ||
      !Number.isFinite(b.width) ||
      b.width < 0 ||
      typeof b.height !== "number" ||
      !Number.isFinite(b.height) ||
      b.height < 0
    ) {
      throw new TypeError(`resolveBoxCollisions boxes[${i}] is malformed`);
    }
  }
  if (boxes.length < 2) {
    return;
  }

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i];
      if (!a) continue;
      const acx = a.x + a.width / 2;
      const acy = a.y + a.height / 2;
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j];
        if (!b) continue;
        if (a.fixed === true && b.fixed === true) {
          continue;
        }
        const bcx = b.x + b.width / 2;
        const bcy = b.y + b.height / 2;
        const needX = (a.width + b.width) / 2 + gap;
        const needY = (a.height + b.height) / 2 + gap;
        const dx = bcx - acx;
        const dy = bcy - acy;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (absX < needX && absY < needY) {
          moved = true;
          const overlapX = needX - absX;
          const overlapY = needY - absY;
          if (overlapX < overlapY) {
            const sign = dx === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dx);
            if (a.fixed === true) {
              b.x = normZero(b.x + sign * (overlapX + 1));
            } else if (b.fixed === true) {
              a.x = normZero(a.x - sign * (overlapX + 1));
            } else {
              const push = overlapX / 2 + 0.5;
              a.x = normZero(a.x - sign * push);
              b.x = normZero(b.x + sign * push);
            }
          } else {
            const sign = dy === 0 ? (j % 2 === 0 ? 1 : -1) : Math.sign(dy);
            if (a.fixed === true) {
              b.y = normZero(b.y + sign * (overlapY + 1));
            } else if (b.fixed === true) {
              a.y = normZero(a.y - sign * (overlapY + 1));
            } else {
              const push = overlapY / 2 + 0.5;
              a.y = normZero(a.y - sign * push);
              b.y = normZero(b.y + sign * push);
            }
          }
        }
      }
    }
    if (!moved) {
      break;
    }
  }
}

/** Computes an enclosing rectangle over positioned nodes and groups with margin padding. */
export function computeSceneBounds(
  nodes: readonly PositionedNode[],
  groups: readonly PositionedGroup[],
  padding = 48,
): Rect2D {
  if (!Array.isArray(nodes) || !Array.isArray(groups)) {
    throw new TypeError("computeSceneBounds requires nodes and groups arrays");
  }
  assertNonNegativeFinite(padding, "computeSceneBounds padding");
  if (nodes.length === 0 && groups.length === 0) {
    return Object.freeze({ x: 0, y: 0, width: 960, height: 600 });
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const n of nodes) {
    minX = Math.min(minX, n.bounds.x);
    minY = Math.min(minY, n.bounds.y);
    maxX = Math.max(maxX, n.bounds.x + n.bounds.width);
    maxY = Math.max(maxY, n.bounds.y + n.bounds.height);
  }
  for (const g of groups) {
    minX = Math.min(minX, g.bounds.x);
    minY = Math.min(minY, g.bounds.y);
    maxX = Math.max(maxX, g.bounds.x + g.bounds.width);
    maxY = Math.max(maxY, g.bounds.y + g.bounds.height);
  }
  return Object.freeze({
    x: normZero(Math.round(minX - padding)),
    y: normZero(Math.round(minY - padding)),
    width: normZero(Math.max(320, Math.round(maxX - minX + padding * 2))),
    height: normZero(Math.max(240, Math.round(maxY - minY + padding * 2))),
  });
}

/** Recursively freezes an output object tree without mutating anything outside fresh objects. */
export function deepFreeze<T>(value: T, seen = new Set<unknown>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return value;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item, seen);
    }
  } else {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key], seen);
    }
  }
  return Object.freeze(value);
}
