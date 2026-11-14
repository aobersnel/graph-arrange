#!/usr/bin/env node
// consumer-test - packs the release tarball, installs it into an empty project with --omit=dev, imports every
// named export in Node, and loads it through a browser import map in headless Chrome.
//
// Usage:  node tools/consumer-test.mjs [--tarball FILE]    (or GRAPH_ARRANGE_TARBALL=FILE)
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { scratchFolder } from "@apnex/clean-runner";
import { dumpDom, findChrome, serveStatic } from "@apnex/headless-chromium";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tarballAt = process.argv.indexOf("--tarball");
const given = tarballAt > -1 ? process.argv[tarballAt + 1] : process.env.GRAPH_ARRANGE_TARBALL || null;
const scratch = scratchFolder("graph-arrange-consumer-");
const fail = (message) => {
  console.log(`consumer-test: FAIL -- ${message}`);
  process.exitCode = 1;
  throw new Error(message);
};
const step = (message) => console.log(`  ${message}`);

async function main() {
  let tarball;
  let shipped;
  if (given) {
    tarball = path.resolve(given);
    if (!fs.existsSync(tarball) || !fs.statSync(tarball).isFile()) fail(`no tarball at ${tarball}`);
    const entries = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
      .split("\n")
      .filter((e) => e && !e.endsWith("/"));
    if (entries.some((e) => !e.startsWith("package/"))) fail(`${tarball} is not an npm package tarball`);
    shipped = entries.map((e) => e.slice("package/".length)).sort();
    step(`took the tarball given, ${path.basename(tarball)}: ${shipped.length} files`);
  } else {
    execFileSync("npm", ["run", "build"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
    const packed = JSON.parse(
      execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", scratch], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
      }),
    );
    tarball = path.join(scratch, packed[0].filename);
    shipped = packed[0].files.map((f) => f.path).sort();
    step(`packed ${packed[0].filename}: ${shipped.length} files`);
  }
  const stray = shipped.filter(
    (f) => !f.startsWith("dist/") && !["CONTRACT.md", "LICENSE", "README.md", "VISION.md", "package.json"].includes(f),
  );
  if (stray.length) fail(`the tarball holds files outside dist and the documents: ${stray.join(", ")}`);
  if (shipped.some((f) => f.endsWith(".d.ts.map"))) fail("the tarball holds a declaration map");

  const project = path.join(scratch, "project");
  fs.mkdirSync(project);
  fs.writeFileSync(
    path.join(project, "package.json"),
    JSON.stringify({ name: "graph-arrange-consumer", version: "0.0.0", private: true, type: "module" }, null, 2),
  );
  execFileSync("npm", ["install", tarball, "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: project,
    stdio: ["ignore", "ignore", "inherit"],
  });
  const installed = path.join(project, "node_modules", "@apnex", "graph-arrange");
  const pkg = JSON.parse(fs.readFileSync(path.join(installed, "package.json"), "utf8"));
  const others = fs.readdirSync(path.join(project, "node_modules")).filter((d) => d !== "@apnex" && !d.startsWith("."));
  if (others.length) fail(`installing brought other packages: ${others.join(", ")}`);
  step(`installed ${pkg.name}@${pkg.version} into an empty project, with nothing else`);

  const map = JSON.parse(fs.readFileSync(path.join(root, "export-map.json"), "utf8"));
  const specifiers = Object.keys(pkg.exports).map((p) => (p === "." ? pkg.name : `${pkg.name}/${p.slice(2)}`));
  const imports = Object.entries(map.paths).map(
    ([p, e], i) =>
      `import { ${Object.keys(e.exports).join(", ")} } from "${p === "." ? pkg.name : `${pkg.name}/${p.slice(2)}`}"; const m${i} = { ${Object.keys(e.exports).join(", ")} };`,
  );
  const nodeCheck = [
    ...imports,
    "const all = Object.assign({}, " + Object.keys(map.paths).map((_, i) => `m${i}`).join(", ") + ");",
    'for (const [name, value] of Object.entries(all)) if (value === undefined) throw new Error(name + " is undefined");',
    "const reg = all.createDefaultLayoutRegistry();",
    'const scene = reg.compute("radial-cluster", { nodes: [{ id: "a", label: "Alpha", groupId: "g1" }, { id: "b", label: "Beta", groupId: "g1" }], groups: [{ id: "g1", label: "G1", memberNodeIds: ["a", "b"] }], links: [{ id: "l1", sourceId: "a", targetId: "b", category: "primary" }] });',
    'if (scene.nodes.length !== 2 || scene.slots.length !== 2 || scene.links.length !== 1) throw new Error("unexpected scene counts");',
    'console.log("node-ok " + Object.keys(all).sort().join(","));',
  ].join("\n");
  fs.writeFileSync(path.join(project, "node-check.mjs"), nodeCheck);
  const { stdout: nodeOut } = await run(process.execPath, ["node-check.mjs"], { cwd: project });
  if (!nodeOut.startsWith("node-ok ")) fail(`Node: ${nodeOut}`);
  step(`Node ${process.version} imported ${nodeOut.trim().slice(8)} by name`);

  const base = `/vendor/${pkg.name}@${pkg.version}/`;
  const entries = {};
  for (const [p, target] of Object.entries(pkg.exports)) {
    const file = typeof target === "string" ? target : target.default;
    const conditions = typeof target === "string" ? [] : Object.keys(target);
    if (conditions.some((c) => c !== "types" && c !== "default") || p.includes("*") || typeof file !== "string" || !file.startsWith("./dist/")) {
      fail(`an exports form the map does not support: ${p}`);
    }
    entries[p === "." ? pkg.name : `${pkg.name}/${p.slice(2)}`] = base + file.slice("./dist/".length);
  }
  if (Object.keys(entries).some((k) => k.endsWith("/"))) fail("a trailing-slash entry in the import map");
  const bindings = Object.entries(map.paths).flatMap(([p, e]) =>
    Object.keys(e.exports).map((name) => ({ name, from: p === "." ? pkg.name : `${pkg.name}/${p.slice(2)}` })),
  );
  const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>graph-arrange consumer</title>
<script type="importmap">${JSON.stringify({ imports: entries })}</script>
<script type="module">
${[...new Set(bindings.map((b) => b.from))]
  .map((from) => `import { ${bindings.filter((b) => b.from === from).map((b) => b.name).join(", ")} } from "${from}";`)
  .join("\n")}
const names = { ${bindings.map((b) => b.name).join(", ")} };
const out = document.getElementById("result");
try {
  const missing = Object.entries(names).filter(([, v]) => v === undefined).map(([k]) => k);
  const reg = createDefaultLayoutRegistry();
  const scene = reg.compute("radial-cluster", {
    nodes: [
      { id: "a", label: "Alpha", groupId: "g1" },
      { id: "b", label: "Beta", groupId: "g1" }
    ],
    groups: [{ id: "g1", label: "Group 1", memberNodeIds: ["a", "b"] }],
    links: [{ id: "l1", sourceId: "a", targetId: "b", category: "primary" }]
  });
  out.textContent = missing.length === 0 && scene.nodes.length === 2 && scene.slots.length === 2 && scene.links.length === 1
    ? "graph-arrange-ok " + Object.keys(names).sort().join(",") + " " + JSON.stringify(scene.nodes[0].point)
    : "graph-arrange-wrong " + missing.join(",");
} catch (e) {
  out.textContent = "graph-arrange-error " + e.message;
}
</script></head><body><pre id="result">graph-arrange-pending</pre></body></html>
`;

  const server = await serveStatic({ pages: { "/": page, "/index.html": page }, folders: { [base]: path.join(installed, "dist") } });
  const requests = server.requests;
  const address = `${server.origin}/`;
  step(`serving the page and ${base} at ${address}`);

  try {
    const chrome = findChrome();
    if (chrome === null) fail("no Chrome: set CHROME, or put google-chrome on PATH");
    const dom = await dumpDom(address, { virtualTimeBudgetMs: 10000, timeoutMs: 90000 });
    const result = dom.match(/<pre id="result">([^<]*)<\/pre>/)?.[1] ?? "";
    const missed = requests.filter((r) => r.status !== 200 && r.path !== "/favicon.ico");
    if (missed.length) fail(`requests not answered 200: ${missed.map((r) => `${r.path} ${r.status}`).join(", ")}`);
    for (const addr of Object.values(entries)) if (!requests.some((r) => r.path === addr)) fail(`Chrome never asked for ${addr}`);
    if (!result.startsWith("graph-arrange-ok ")) fail(`Chrome's page says: ${result || dom.slice(0, 400)}`);
    const { stdout: version } = await run(chrome, ["--version"]);
    step(`${version.trim()} loaded ${specifiers.join(" and ")} through the import map: ${requests.length} requests, every one asked of the page answered 200`);
    step(`the page says: ${result}`);
  } finally {
    await server.close();
  }
  console.log("consumer-test: PASS");
}

try {
  await main();
} catch (e) {
  if (!process.exitCode) {
    console.log(`consumer-test: FAIL -- ${e.message}`);
    process.exitCode = 1;
  }
}
