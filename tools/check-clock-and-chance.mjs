#!/usr/bin/env node
// check-clock-and-chance - fails when a built file reads a clock or randomness, holds a timer, or reaches a network.
//
// Usage:  node tools/check-clock-and-chance.mjs [DIR_OR_FILE ...]    (default: dist, its .js files)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { parseModule } from "./check-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CLOCK_AND_CHANCE_NAMES = [
  "Date",
  "performance",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "clearTimeout",
  "clearInterval",
  "clearImmediate",
  "queueMicrotask",
  "requestAnimationFrame",
  "requestIdleCallback",
  "crypto",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "navigator",
  "location",
  "Intl",
  "Temporal",
  "WeakRef",
  "FinalizationRegistry",
];
const HOLDERS = ["Math", "Date", "performance"];
const BANNED_MEMBERS = ["random", "now"];

const literalText = (node) =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined;

const isHolder = (node) => ts.isIdentifier(node) && HOLDERS.includes(node.text);

export function findClockAndChance(source, fileName) {
  const file = parseModule(source, fileName);
  const found = [];
  const lineOf = (node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const visit = (node) => {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const memberName = ts.isPropertyAccessExpression(parent) && parent.name === node;
      if (CLOCK_AND_CHANCE_NAMES.includes(node.text) && !memberName) {
        found.push({ line: lineOf(node), finding: `names ${node.text}` });
      }
      if (node.text === "Math" && !memberName) {
        const directMember =
          ts.isPropertyAccessExpression(parent) && parent.expression === node && ts.isIdentifier(parent.name);
        if (directMember && parent.name.text === "random") {
          found.push({ line: lineOf(node), finding: "reads Math.random" });
        } else if (!directMember) {
          found.push({ line: lineOf(node), finding: "uses Math as a value, not as a direct member access by identifier" });
        }
      }
    }
    if (
      ts.isElementAccessExpression(node) &&
      isHolder(node.expression) &&
      BANNED_MEMBERS.includes(literalText(node.argumentExpression))
    ) {
      found.push({
        line: lineOf(node),
        finding: `reads ${node.expression.text}.${literalText(node.argumentExpression)} by brackets`,
      });
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      isHolder(node.initializer) &&
      (ts.isObjectBindingPattern(node.name) || ts.isArrayBindingPattern(node.name))
    ) {
      found.push({ line: lineOf(node), finding: `destructures from ${node.initializer.text}` });
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      isHolder(node.right) &&
      (ts.isObjectLiteralExpression(node.left) || ts.isArrayLiteralExpression(node.left))
    ) {
      found.push({ line: lineOf(node), finding: `destructures from ${node.right.text}` });
    }
    if (
      ts.isParameter(node) &&
      node.initializer &&
      isHolder(node.initializer) &&
      (ts.isObjectBindingPattern(node.name) || ts.isArrayBindingPattern(node.name))
    ) {
      found.push({ line: lineOf(node), finding: `destructures from ${node.initializer.text}` });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function jsFilesUnder(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return target.endsWith(".js") ? [target] : [];
  return fs
    .readdirSync(target, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((e) => jsFilesUnder(path.join(target, e.name)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const targets = process.argv.slice(2);
  const files = (targets.length ? targets : [path.join(root, "dist")]).flatMap((t) => jsFilesUnder(path.resolve(t)));
  if (files.length === 0) {
    console.log("check-clock-and-chance: FAIL -- no built .js files found; run npm run build first");
    process.exit(1);
  }
  let findings = 0;
  for (const file of files) {
    let uses;
    try {
      uses = findClockAndChance(fs.readFileSync(file, "utf8"), path.basename(file));
    } catch (e) {
      uses = [{ line: 1, finding: e.message }];
    }
    for (const f of uses) {
      console.log(`  ${path.relative(process.cwd(), file)}:${f.line}  ${f.finding}`);
      findings++;
    }
  }
  if (findings) {
    console.log(`check-clock-and-chance: FAIL -- ${findings} clock, timer, chance or network use(s) in ${files.length} built file(s)`);
    process.exit(1);
  }
  console.log(
    `check-clock-and-chance: PASS -- ${files.length} built file(s) read no clock or randomness, hold no timer and reach no network`,
  );
}
