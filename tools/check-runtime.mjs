#!/usr/bin/env node
// check-runtime - fails when a built file imports a bare specifier or a `node:` module, holds a dynamic
// `import(`, names `process`, `require`, `Buffer`, `window`, `document`, `self`, `global`, `globalThis`,
// `eval` or `Function`, calls or constructs through `constructor`, or uses any global outside ALLOWED_GLOBALS.
//
// Usage:  node tools/check-runtime.mjs [DIR_OR_FILE ...]    (default: dist, its .js files)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RUNTIME_NAMES = [
  "process",
  "require",
  "Buffer",
  "window",
  "document",
  "self",
  "global",
  "globalThis",
  "eval",
  "Function",
];

/** The globals the build names, every one a JavaScript built-in it needs. */
export const ALLOWED_GLOBALS = Object.freeze([
  "Array",
  "Error",
  "Map",
  "Math",
  "Number",
  "Object",
  "Set",
  "TypeError",
  "undefined",
]);

const isConstructorProperty = (callee) =>
  (ts.isPropertyAccessExpression(callee) && callee.name.text === "constructor") ||
  (ts.isElementAccessExpression(callee) &&
    (ts.isStringLiteral(callee.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(callee.argumentExpression)) &&
    callee.argumentExpression.text === "constructor");

export function parseModule(source, fileName = "built.js") {
  const file = ts.createSourceFile(
    fileName,
    source,
    { languageVersion: ts.ScriptTarget.Latest, impliedNodeFormat: ts.ModuleKind.ESNext },
    true,
    ts.ScriptKind.JS,
  );
  const diagnostics = file.parseDiagnostics ?? [];
  if (diagnostics.length) {
    const first = diagnostics[0];
    const line = file.getLineAndCharacterOfPosition(first.start ?? 0).line + 1;
    throw new Error(
      `check-runtime: TypeScript could not parse the file: line ${line}: ${ts.flattenDiagnosticMessageText(first.messageText, " ")}`,
    );
  }
  return file;
}

function isReference(node) {
  const parent = node.parent;
  if ((ts.isPropertyAccessExpression(parent) || ts.isQualifiedName(parent)) && parent.name === node) return false;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isGetAccessor(parent) ||
      ts.isSetAccessor(parent)) &&
    parent.name === node
  ) {
    return false;
  }
  if (ts.isBindingElement(parent) && parent.propertyName === node) return false;
  if (
    ts.isImportSpecifier(parent) ||
    ts.isExportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isNamespaceExport(parent)
  ) {
    return false;
  }
  if (ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent) || ts.isMetaProperty(parent)) {
    return false;
  }
  return true;
}

export function freeGlobalReferences(file) {
  const host = {
    getSourceFile: (name) => (name === file.fileName ? file : undefined),
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile() {},
    getCurrentDirectory: () => "/",
    getDirectories: () => [],
    fileExists: (name) => name === file.fileName,
    readFile: (name) => (name === file.fileName ? file.text : undefined),
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
  };
  const program = ts.createProgram(
    [file.fileName],
    { allowJs: true, noLib: true, noResolve: true, types: [], target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
    host,
  );
  const checker = program.getTypeChecker();
  const found = [];
  const visit = (node) => {
    if (ts.isIdentifier(node) && isReference(node)) {
      const symbol =
        ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
          ? checker.getShorthandAssignmentValueSymbol(node.parent)
          : checker.getSymbolAtLocation(node);
      if (!(symbol?.declarations ?? []).some((declaration) => declaration.getSourceFile() === file)) {
        found.push({ name: node.text, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

export function findRuntimeUses(source, fileName) {
  const file = parseModule(source, fileName);
  const found = [];
  const lineOf = (node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        found.push({ line: lineOf(node), finding: `imports "${specifier}", which is not a relative file` });
      }
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      found.push({ line: lineOf(node), finding: "holds a dynamic import(" });
    }
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && isConstructorProperty(node.expression)) {
      found.push({ line: lineOf(node), finding: "calls through a property named constructor, which reaches Function" });
    }
    if (ts.isIdentifier(node) && RUNTIME_NAMES.includes(node.text)) {
      const member = ts.isPropertyAccessExpression(node.parent) && node.parent.name === node;
      if (!member) found.push({ line: lineOf(node), finding: `names ${node.text}` });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  for (const { name, line } of freeGlobalReferences(file)) {
    if (ALLOWED_GLOBALS.includes(name) || found.some((f) => f.line === line && f.finding === `names ${name}`)) continue;
    found.push({ line, finding: `names the global ${name}, which is none of the built-ins the build uses` });
  }
  return found.sort((a, b) => a.line - b.line);
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
    console.log("check-runtime: FAIL -- no built .js files found; run npm run build first");
    process.exit(1);
  }
  let findings = 0;
  for (const file of files) {
    let uses;
    try {
      uses = findRuntimeUses(fs.readFileSync(file, "utf8"), path.basename(file));
    } catch (e) {
      uses = [{ line: 1, finding: e.message }];
    }
    for (const f of uses) {
      console.log(`  ${path.relative(process.cwd(), file)}:${f.line}  ${f.finding}`);
      findings++;
    }
  }
  if (findings) {
    console.log(`check-runtime: FAIL -- ${findings} runtime-specific use(s) in ${files.length} built file(s)`);
    process.exit(1);
  }
  console.log(
    `check-runtime: PASS -- ${files.length} built file(s) import only relative files, name no runtime's globals and no global but the built-ins the build uses, and reach no Function`,
  );
}
