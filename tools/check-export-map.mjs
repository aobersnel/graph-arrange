#!/usr/bin/env node
// check-export-map - verifies export-map.json matches package.json exports, built dist/ exports, and CONTRACT.md capabilities.
//
// Usage:  node tools/check-export-map.mjs [--root DIR]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function contractRows(contract) {
  const lines = contract.split("\n");
  const start = lines.findIndex((l) => /^\|\s*Capability\s*\|\s*Relation\s*\|/.test(l));
  const rows = [];
  for (let i = start + 2; start >= 0 && lines[i]?.startsWith("|"); i++) {
    rows.push(lines[i].split("|")[1].trim().replaceAll("`", ""));
  }
  return rows;
}

export async function exportMapProblems(root) {
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  const pkg = JSON.parse(read("package.json"));
  const map = JSON.parse(read("export-map.json"));
  const rows = contractRows(read("CONTRACT.md"));
  const rulings = new Set([...read("docs/DECISIONS.md").matchAll(/^## (D\d+) - /gm)].map((m) => m[1]));
  const part = pkg.name.replace(/^@[^/]+\//, "");
  const problems = [];
  if (map.package !== pkg.name) problems.push(`the map names package ${map.package}, not ${pkg.name}`);
  const mapped = Object.keys(map.paths ?? {}).sort();
  const exported = Object.keys(pkg.exports ?? {}).sort();
  if (JSON.stringify(mapped) !== JSON.stringify(exported)) {
    problems.push(`the map's paths ${JSON.stringify(mapped)} are not package.json's exports ${JSON.stringify(exported)}`);
  }
  if (rows.length === 0) problems.push("CONTRACT.md has no capability table");
  const served = new Set();
  for (const [p, entry] of Object.entries(map.paths ?? {})) {
    const kinds = Object.keys(entry);
    if (kinds.length !== 1 || !["exports", "data"].includes(kinds[0])) {
      problems.push(`${p} is neither a module path nor a data path`);
      continue;
    }
    const entries = entry.exports ? Object.entries(entry.exports) : [["(data)", entry.data]];
    for (const [name, e] of entries) {
      if (e?.part !== part) problems.push(`${p} ${name} names part ${e?.part}, not ${part}`);
      if (!Array.isArray(e?.serves) || e.serves.length === 0) problems.push(`${p} ${name} serves nothing`);
      for (const row of e?.serves ?? []) {
        served.add(row);
        if (!rows.includes(row)) problems.push(`${p} ${name} serves ${row}, which is no row of CONTRACT.md`);
      }
    }
    const target = pkg.exports?.[p];
    const file = typeof target === "string" ? target : target?.default;
    if (entry.exports && typeof file === "string") {
      const built = path.join(root, file);
      if (!fs.existsSync(built)) {
        problems.push(`${p} resolves to ${file}, which does not exist; build first`);
        continue;
      }
      const names = Object.keys(await import(pathToFileURL(built).href)).sort();
      const listed = Object.keys(entry.exports).sort();
      if (JSON.stringify(names) !== JSON.stringify(listed)) {
        problems.push(`${p} exports ${JSON.stringify(names)}, but the map names ${JSON.stringify(listed)}`);
      }
    }
  }
  if (typeof map.deferred !== "object" || map.deferred === null) problems.push("deferred is not an object");
  for (const [row, ruling] of Object.entries(map.deferred ?? {})) {
    if (!rulings.has(ruling)) problems.push(`${row} is deferred under ${ruling}, which docs/DECISIONS.md does not hold`);
  }
  for (const row of rows) {
    if (!served.has(row) && !(row in (map.deferred ?? {}))) problems.push(`${row} is neither served nor deferred`);
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf("--root");
  const root = at > -1 ? path.resolve(process.argv[at + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const problems = await exportMapProblems(root);
  for (const p of problems) console.log(`  ${p}`);
  if (problems.length) {
    console.log(`check-export-map: FAIL -- ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log("check-export-map: PASS -- export-map.json names every export, and every contract row is served");
}
