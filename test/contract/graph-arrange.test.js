import test from "node:test";
import assert from "node:assert/strict";
import {
  HierarchyHullLayoutPlugin,
  LayeredFlowLayoutPlugin,
  OrbitFlatLayoutPlugin,
  RadialClusterLayoutPlugin,
  buildCompactLabelMap,
  bundleLinks,
  compactSingleLabel,
  computeSceneBounds,
  createDefaultLayoutRegistry,
  createLayoutRegistry,
  resolveBoxCollisions,
} from "../../dist/index.js";

function makeSampleGraph() {
  const groups = Array.from({ length: 4 }, (_, gIdx) => ({
    id: `grp-${gIdx}`,
    label: `cluster-${gIdx}`,
    sublabel: `sub-${gIdx}`,
    role: gIdx === 0 ? "outer" : "cluster",
    parentGroupId: gIdx === 1 ? "grp-0" : null,
    memberNodeIds: [],
    collapsible: true,
    badgeSummary: "12 items | 24 units",
  }));

  const nodes = Array.from({ length: 36 }, (_, idx) => {
    const g = idx % 4;
    const isFleet = idx < 24;
    return {
      id: `n-${idx}`,
      label: isFleet
        ? `shared-region-zone-mixed-fleet-service-${String(idx).padStart(2, "0")}`
        : `gateway-core-${idx}`,
      kind: isFleet ? "kind-a" : "kind-b",
      badge: `8u | ${idx}ms`,
      sublabel: `10.0.${g}.${idx + 10}`,
      accentColor: g % 2 === 0 ? "#4da3ff" : "#2ed573",
      groupId: `grp-${g}`,
      laneIndex: idx % 3,
      ...(idx === 0 ? { priority: 10 } : {}),
    };
  });

  const links = [
    ...Array.from({ length: 6 }, (_, idx) => ({
      id: `l-same-${idx}`,
      sourceId: "n-1",
      targetId: "n-2",
      category: "primary",
      strokeColor: "#00d2d3",
      label: `p:${8000 + idx}`,
    })),
    ...Array.from({ length: 8 }, (_, idx) => ({
      id: `l-cross-${idx}`,
      sourceId: `n-${idx * 2}`,
      targetId: `n-${(idx * 2 + 1) % 36}`,
      category: "secondary",
      strokeColor: "#ffa502",
      dashed: true,
      label: `p:${9000 + (idx % 3)}`,
    })),
  ];

  return { nodes, groups, links };
}

function assertNoNegativeZeroAndFrozen(value, path = "root", seen = new Set()) {
  if (typeof value === "number") {
    assert.equal(Object.is(value, -0), false, `Found -0 at ${path}`);
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  assert.equal(Object.isFrozen(value), true, `Expected frozen value at ${path}`);
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertNoNegativeZeroAndFrozen(value[i], `${path}[${i}]`, seen);
    }
  } else {
    for (const [k, v] of Object.entries(value)) {
      assertNoNegativeZeroAndFrozen(v, `${path}.${k}`, seen);
    }
  }
}

test("all four built-in plugins produce zero node/circle overlaps, canonical points, slots, and bundled links", () => {
  const registry = createDefaultLayoutRegistry();
  const graph = makeSampleGraph();
  const ids = registry.list().map((p) => p.id);
  assert.deepEqual(ids, ["radial-cluster", "orbit-flat", "hierarchy-hull", "layered-flow"]);

  for (const pluginId of ids) {
    const scene = registry.compute(pluginId, graph);
    assert.equal(scene.layoutId, pluginId);
    assert.equal(scene.nodes.length, 36);
    assert.ok(scene.slots.length >= 36, `${pluginId} should emit offered placement slots`);
    assertNoNegativeZeroAndFrozen(scene);

    for (let i = 0; i < scene.nodes.length; i++) {
      const a = scene.nodes[i];
      assert.equal(a.point.x, a.bounds.x + a.bounds.width / 2);
      assert.equal(a.point.y, a.bounds.y + a.bounds.height / 2);
      for (let j = i + 1; j < scene.nodes.length; j++) {
        const b = scene.nodes[j];
        const overlapX = a.bounds.x < b.bounds.x + b.bounds.width && a.bounds.x + a.bounds.width > b.bounds.x;
        const overlapY = a.bounds.y < b.bounds.y + b.bounds.height && a.bounds.y + a.bounds.height > b.bounds.y;
        assert.equal(overlapX && overlapY, false, `${pluginId} overlapped ${a.node.id} and ${b.node.id}`);
      }
    }

    for (const g of scene.groups) {
      assert.equal(g.point.x, Math.round(g.bounds.x + g.bounds.width / 2));
      assert.equal(g.point.y, Math.round(g.bounds.y + g.bounds.height / 2));
    }

    if (pluginId === "radial-cluster") {
      assert.equal(scene.groups.length, 4);
      for (let i = 0; i < scene.groups.length; i++) {
        const ga = scene.groups[i];
        assert.equal(ga.shape, "circle");
        assert.equal(typeof ga.radius, "number");
        for (let j = i + 1; j < scene.groups.length; j++) {
          const gb = scene.groups[j];
          const dist = Math.hypot(ga.point.x - gb.point.x, ga.point.y - gb.point.y);
          assert.ok(dist >= (ga.radius ?? 0) + (gb.radius ?? 0) - 1, "radial cluster circles overlap");
        }
      }
    }

    const bundledPrimary = scene.links.find((l) => l.count === 6);
    assert.ok(bundledPrimary, `${pluginId} should bundle the 6 parallel links`);
    assert.equal(bundledPrimary.bundled, true);
    assert.equal(bundledPrimary.linkIds.length, 6);
    assert.ok(bundledPrimary.label.includes("(6)"), `expected '(6)' in '${bundledPrimary.label}'`);
  }
});

test("deterministic output, untouched callers, and no -0 on zero-centered inputs", () => {
  const registry = createDefaultLayoutRegistry();
  const graph = {
    nodes: [
      { id: "a", label: "Node A", groupId: "g1" },
      { id: "b", label: "Node B", groupId: "g1" },
      { id: "p", label: "Pinned", point: { x: -0, y: -0.2 }, pinned: true },
    ],
    groups: [{ id: "g1", label: "Group 1", memberNodeIds: ["a", "b"] }],
    links: [{ id: "l1", sourceId: "a", targetId: "p", category: "primary" }],
  };

  const s1 = registry.compute("radial-cluster", graph);
  const s2 = registry.compute("radial-cluster", graph);
  assert.deepEqual(s1, s2);
  assertNoNegativeZeroAndFrozen(s1);
  assert.equal(Object.isFrozen(graph), false);
  assert.equal(Object.isFrozen(graph.nodes[0]), false);
  assert.equal(Object.is(graph.nodes[2].point.x, -0), true);
});

test("pinned nodes stay stationary across layouts, separate colliding unpinned neighbors, and ignore snap", () => {
  const registry = createDefaultLayoutRegistry();
  const pinnedPoint = { x: 13, y: 17 };
  const graph = {
    nodes: [
      { id: "pin1", label: "Pinned 1", point: pinnedPoint, pinned: true },
      { id: "u1", label: "Unpinned 1" },
      { id: "u2", label: "Unpinned 2" },
    ],
    groups: [],
    links: [{ id: "l1", sourceId: "pin1", targetId: "u1", category: "primary" }],
  };
  const snapCalls = [];
  const snap = (pt) => {
    snapCalls.push(pt);
    return {
      x: Math.round(pt.x / 60) * 60 + 30,
      y: Math.round(pt.y / 60) * 60 + 30,
    };
  };

  for (const id of ["radial-cluster", "orbit-flat", "hierarchy-hull", "layered-flow"]) {
    snapCalls.length = 0;
    const scene = registry.compute(id, graph, { snap });
    const pin = scene.nodes.find((n) => n.node.id === "pin1");
    assert.ok(pin);
    assert.deepEqual(pin.point, { x: 13, y: 17 });
    assert.equal(pin.bounds.x, 13 - 172 / 2);
    assert.equal(pin.bounds.y, 17 - 62 / 2);
    assert.equal(snapCalls.length, 2, `${id} should snap only the 2 unpinned nodes`);
    for (const u of scene.nodes.filter((n) => n.node.id !== "pin1")) {
      assert.equal(Math.abs((u.point.x - 30) % 60), 0);
      assert.equal(Math.abs((u.point.y - 30) % 60), 0);
    }
  }

  // Explicitly test resolveBoxCollisions keeping fixed boxes motionless
  const boxes = [
    { x: 0, y: 0, width: 100, height: 50, fixed: true },
    { x: 10, y: 10, width: 100, height: 50, fixed: false },
  ];
  resolveBoxCollisions(boxes, 20, 40);
  assert.deepEqual({ x: boxes[0].x, y: boxes[0].y }, { x: 0, y: 0 });
  const separated =
    boxes[1].x + boxes[1].width + 20 <= boxes[0].x ||
    boxes[1].x >= boxes[0].x + boxes[0].width + 20 ||
    boxes[1].y + boxes[1].height + 20 <= boxes[0].y ||
    boxes[1].y >= boxes[0].y + boxes[0].height + 20;
  assert.equal(separated, true);
});

test("sibling label compaction preserves unique tails for long shared prefixes", () => {
  const entries = [
    { id: "0", label: "prod-australia-southeast-worker-00" },
    { id: "1", label: "prod-australia-southeast-worker-01" },
    { id: "2", label: "prod-australia-southeast-worker-02" },
    { id: "3", label: "short" },
  ];
  const compacted = buildCompactLabelMap(entries, 20);
  assert.equal(compacted.get("3"), "short");
  const longVals = [compacted.get("0"), compacted.get("1"), compacted.get("2")];
  assert.equal(new Set(longVals).size, 3);
  for (const val of longVals) {
    assert.ok(val && val.length <= 20);
  }
  assert.equal(compactSingleLabel("short", 20), "short");
  assert.equal(compactSingleLabel("abcdefghi", 6), "abcdef");
});

test("collapsed nested groups aggregate descendant links onto ancestor group point", () => {
  const registry = createDefaultLayoutRegistry();
  const graph = {
    nodes: [
      { id: "child-a", label: "Child A", groupId: "g-child" },
      { id: "leaf-b", label: "Leaf B", groupId: "g-other" },
    ],
    groups: [
      { id: "g-root", label: "Root", role: "outer", memberNodeIds: [] },
      { id: "g-child", label: "Child", role: "cluster", parentGroupId: "g-root", memberNodeIds: ["child-a"] },
      { id: "g-other", label: "Other", role: "cluster", memberNodeIds: ["leaf-b"] },
    ],
    links: [{ id: "l-1", sourceId: "child-a", targetId: "leaf-b", category: "primary", label: "rpc" }],
  };

  const scene = registry.compute("hierarchy-hull", graph, {
    collapseGroups: new Set(["g-root"]),
  });
  const rootGroup = scene.groups.find((g) => g.group.id === "g-root");
  const leafB = scene.nodes.find((n) => n.node.id === "leaf-b");
  assert.ok(rootGroup);
  assert.equal(rootGroup.collapsed, true);
  assert.equal(rootGroup.hiddenChildCount, 1);
  assert.equal(scene.nodes.some((n) => n.node.id === "child-a"), false);
  assert.ok(leafB);
  assert.equal(scene.links.length, 1);
  assert.ok(scene.links[0].pathD.startsWith(`M ${rootGroup.point.x} ${rootGroup.point.y} `));
  assert.ok(scene.links[0].pathD.endsWith(` ${leafB.point.x} ${leafB.point.y}`));
});

test("laneOrder, laneLabels, clusterRoleFilter, and custom registry plugins work cleanly", () => {
  const registry = createDefaultLayoutRegistry();
  const custom = {
    id: "custom-line",
    label: "Custom Line",
    description: "Line test plugin",
    compute(graph) {
      return {
        layoutId: "custom-line",
        nodes: graph.nodes.map((node, i) => ({
          node: { id: node.id, label: node.label },
          point: { x: i * 100, y: 0 },
          bounds: { x: i * 100 - 50, y: -20, width: 100, height: 40 },
          displayLabel: node.label,
        })),
        groups: [],
        links: [],
        slots: [],
        bounds: { x: -50, y: -20, width: 320, height: 240 },
      };
    },
  };
  registry.register(custom);
  assert.ok(registry.get("custom-line"));

  const laneScene = registry.compute(
    "layered-flow",
    {
      nodes: [
        { id: "a", label: "Alpha", laneIndex: 0 },
        { id: "b", label: "Beta", laneIndex: 2 },
      ],
      groups: [],
      links: [],
    },
    { laneOrder: [2, 0], laneLabels: new Map([[2, "Ingress"], [0, "Egress"]]) },
  );
  const b = laneScene.nodes.find((n) => n.node.id === "b");
  const a = laneScene.nodes.find((n) => n.node.id === "a");
  assert.ok(a && b && b.point.x < a.point.x);
  assert.equal(laneScene.groups[0].group.label, "Ingress");
  assert.equal(laneScene.groups[1].group.label, "Egress");

  const filteredRadial = registry.compute(
    "radial-cluster",
    makeSampleGraph(),
    { clusterRoleFilter: ["outer"] },
  );
  assert.equal(
    filteredRadial.groups.some((g) => g.group.id === "grp-0"),
    true,
  );
  assert.equal(
    filteredRadial.groups.some((g) => g.group.id === "__ungrouped_cluster__"),
    true,
  );
  assert.equal(
    filteredRadial.groups.some((g) => g.group.id === "grp-2"),
    false,
  );
});

test("fail-loud Error on unknown pluginId and TypeError on malformed arguments", () => {
  const registry = createDefaultLayoutRegistry();
  const validGraph = { nodes: [{ id: "a", label: "A" }], groups: [], links: [] };

  assert.throws(
    () => registry.compute("does-not-exist", validGraph),
    /Unknown layout plugin "does-not-exist"/,
  );
  assert.throws(() => registry.compute("", validGraph), TypeError);
  assert.throws(() => registry.compute("radial-cluster", null), TypeError);
  assert.throws(
    () =>
      RadialClusterLayoutPlugin.compute({
        nodes: [
          { id: "dup", label: "One" },
          { id: "dup", label: "Two" },
        ],
        groups: [],
        links: [],
      }),
    TypeError,
  );
  assert.throws(
    () =>
      OrbitFlatLayoutPlugin.compute({
        nodes: [{ id: "p", label: "Bad Pin", pinned: true }],
        groups: [],
        links: [],
      }),
    TypeError,
  );
  assert.throws(
    () =>
      HierarchyHullLayoutPlugin.compute(validGraph, {
        snap: () => ({ x: Number.NaN, y: 0 }),
      }),
    TypeError,
  );
  assert.throws(() => LayeredFlowLayoutPlugin.compute(validGraph, { padding: -5 }), TypeError);
  assert.throws(() => resolveBoxCollisions([], -1, 10), TypeError);
  assert.throws(() => computeSceneBounds([], [], -1), TypeError);
  assert.throws(() => bundleLinks([], null, []), TypeError);
  assert.throws(() => createLayoutRegistry([{ id: "" }]), TypeError);
  assertNoNegativeZeroAndFrozen(computeSceneBounds([], []));
});
