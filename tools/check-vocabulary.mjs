#!/usr/bin/env node
// check-vocabulary - fails when src/ holds a consumer-specific noun or brand name from tools/consumer-vocabulary.json.
//
// Usage:  node tools/check-vocabulary.mjs [DIR_OR_FILE ...]    (default: src)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

export function readVocabulary(file = path.join(here, "consumer-vocabulary.json")) {
  return JSON.parse(fs.readFileSync(file, "utf8")).lists;
}

export function splitWords(text) {
  const words = [];
  for (const run of text.match(/[A-Za-z0-9_-]+/g) ?? []) {
    for (const piece of run.split(/[_-]+/)) {
      if (!piece) continue;
      for (const word of piece.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[A-Za-z])(?=[0-9])|(?<=[0-9])(?=[A-Za-z])/)) {
        if (word) words.push(word.toLowerCase());
      }
    }
  }
  return words;
}

export function candidateWords(text) {
  const out = [];
  for (const run of text.match(/[A-Za-z0-9_-]+/g) ?? []) {
    const whole = run.toLowerCase();
    const joined = whole.replace(/[_-]+/g, "");
    out.push(...new Set([whole, joined, ...splitWords(run)]));
  }
  return out;
}

function matching(candidate, owner) {
  if (owner.has(candidate)) return candidate;
  if (candidate.endsWith("s") && owner.has(candidate.slice(0, -1))) return candidate.slice(0, -1);
  if (candidate.endsWith("es") && owner.has(candidate.slice(0, -2))) return candidate.slice(0, -2);
  return undefined;
}

export function findVocabulary(text, lists) {
  const owner = new Map();
  for (const [consumer, words] of Object.entries(lists)) for (const w of words) owner.set(w.toLowerCase(), consumer);
  const found = [];
  text.split("\n").forEach((line, i) => {
    for (const word of candidateWords(line)) {
      const listed = matching(word, owner);
      if (listed !== undefined) found.push({ line: i + 1, word, listed, consumer: owner.get(listed) });
    }
  });
  return found;
}

function filesUnder(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs
    .readdirSync(target, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((e) => filesUnder(path.join(target, e.name)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const targets = process.argv.slice(2);
  const lists = readVocabulary();
  const files = (targets.length ? targets : [path.join(root, "src")]).flatMap((t) => filesUnder(path.resolve(t)));
  if (files.length === 0) {
    console.log("check-vocabulary: FAIL -- no files found, so nothing was checked");
    process.exit(1);
  }
  let findings = 0;
  for (const file of files) {
    for (const f of findVocabulary(fs.readFileSync(file, "utf8"), lists)) {
      console.log(`  ${path.relative(process.cwd(), file)}:${f.line}  "${f.word}" (${f.consumer}: ${f.listed})`);
      findings++;
    }
  }
  if (findings) {
    console.log(`check-vocabulary: FAIL -- ${findings} word(s) of a consumer's vocabulary in ${files.length} file(s)`);
    process.exit(1);
  }
  console.log(`check-vocabulary: PASS -- ${files.length} file(s), no word of ${Object.keys(lists).join(", ")}'s vocabulary`);
}
