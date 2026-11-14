#!/usr/bin/env node
// compare-built - compares built dist/ files between two packed tarballs byte for byte.
//
// Usage:  node tools/compare-built.mjs PACKED.tgz BASE.tgz
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function repeatedBuild(version, file = path.join(here, "repeated-build.json")) {
  const releases = JSON.parse(fs.readFileSync(file, "utf8")).releases;
  return Object.hasOwn(releases, version) ? releases[version] : null;
}

function builtFiles(tarball) {
  return execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
    .split("\n")
    .filter((entry) => entry.startsWith("package/dist/") && !entry.endsWith("/"))
    .map((entry) => entry.slice("package/dist/".length))
    .sort();
}

export function compareBuilt(packed, base) {
  const problems = [];
  const ours = builtFiles(packed);
  const theirs = builtFiles(base);
  for (const file of ours) if (!theirs.includes(file)) problems.push(`dist/${file} is in ${path.basename(packed)} alone`);
  for (const file of theirs) if (!ours.includes(file)) problems.push(`dist/${file} is in ${path.basename(base)} alone`);
  if (ours.length === 0) problems.push(`${path.basename(packed)} holds no built file`);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "graph-arrange-compare-"));
  try {
    const unpack = (tarball, into) => {
      fs.mkdirSync(into);
      execFileSync("tar", ["-xzf", tarball, "-C", into]);
      return path.join(into, "package", "dist");
    };
    const a = unpack(packed, path.join(scratch, "packed"));
    const b = unpack(base, path.join(scratch, "base"));
    const both = ours.filter((file) => theirs.includes(file));
    for (const file of both) {
      if (!fs.readFileSync(path.join(a, file)).equals(fs.readFileSync(path.join(b, file)))) {
        problems.push(`dist/${file} differs`);
      }
    }
    return { problems, compared: both.length };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [packed, base] = process.argv.slice(2);
  if (!packed || !base) {
    console.log("compare-built: FAIL -- usage: node tools/compare-built.mjs PACKED.tgz BASE.tgz");
    process.exit(1);
  }
  const { problems, compared } = compareBuilt(path.resolve(packed), path.resolve(base));
  for (const p of problems) console.log(`  ${p}`);
  if (problems.length) {
    console.log(`compare-built: FAIL -- ${problems.length} difference(s) between ${path.basename(packed)} and ${path.basename(base)}`);
    process.exit(1);
  }
  console.log(
    `compare-built: PASS -- ${compared} built file(s) of ${path.basename(packed)} are byte-identical to ${path.basename(base)}'s, and neither holds another`,
  );
}
