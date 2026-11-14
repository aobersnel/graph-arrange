import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ALLOWED_GLOBALS, findRuntimeUses, freeGlobalReferences, parseModule } from "../../tools/check-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("runtime gate ALLOWED_GLOBALS matches exact free globals used by dist/*.js", () => {
  const distDir = path.join(root, "dist");
  const jsFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) jsFiles.push(full);
    }
  };
  walk(distDir);
  assert.ok(jsFiles.length > 0);

  const usedGlobals = new Set();
  for (const file of jsFiles) {
    const src = fs.readFileSync(file, "utf8");
    assert.deepEqual(findRuntimeUses(src, path.basename(file)), [], `${file} has forbidden runtime uses`);
    const parsed = parseModule(src, path.basename(file));
    for (const ref of freeGlobalReferences(parsed)) {
      usedGlobals.add(ref.name);
    }
  }

  assert.deepEqual([...usedGlobals].sort(), [...ALLOWED_GLOBALS].sort());
});
