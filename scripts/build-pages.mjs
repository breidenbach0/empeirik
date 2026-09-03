#!/usr/bin/env node
/*
 * Assemble the public GitHub Pages artifact without publishing repository-only
 * source, tests, or local QA evidence.
 */
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "_site");
const PUBLIC_PATHS = ["index.html", "src", "circuitjs", "assets"];

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });

for (const publicPath of PUBLIC_PATHS) {
  const source = resolve(ROOT, publicPath);
  const destination = resolve(OUTPUT, publicPath);
  const sourceStat = await stat(source);
  await cp(source, destination, { recursive: sourceStat.isDirectory() });
}

await writeFile(resolve(OUTPUT, ".nojekyll"), "");

async function contentVersion(relativePath) {
  const contents = await readFile(resolve(OUTPUT, relativePath));
  return createHash("sha256").update(contents).digest("hex").slice(0, 12);
}

async function replaceRequired(relativePath, replacements) {
  const outputPath = resolve(OUTPUT, relativePath);
  let contents = await readFile(outputPath, "utf8");

  for (const [from, to] of replacements) {
    if (!contents.includes(from)) {
      throw new Error(`${relativePath} is missing the cache-version target: ${from}`);
    }
    contents = contents.replaceAll(from, to);
  }

  await writeFile(outputPath, contents);
}

// GitHub Pages may retain HTML and JavaScript for different lengths of time.
// Content-derived query versions keep every release internally coherent: an
// old page keeps loading its old scripts, while new HTML requests new scripts.
const circuitLoaderVersion = await contentVersion("circuitjs/circuitjs1/circuitjs1.nocache.js");
const circuitCompressionVersion = await contentVersion("circuitjs/lz-string.min.js");
const circuitFontCssVersion = await contentVersion("circuitjs/font/fontello.css");
await replaceRequired("circuitjs/circuitjs.html", [
  ['href="font/fontello.css"', `href="font/fontello.css?v=${circuitFontCssVersion}"`],
  ['src="lz-string.min.js"', `src="lz-string.min.js?v=${circuitCompressionVersion}"`],
  ['src="circuitjs1/circuitjs1.nocache.js"', `src="circuitjs1/circuitjs1.nocache.js?v=${circuitLoaderVersion}"`]
]);

const circuitThemeVersion = await contentVersion("src/circuitjs-theme.css");
const circuitShellVersion = await contentVersion("circuitjs/circuitjs.html");
await replaceRequired("src/main.js", [
  [
    'new URL("src/circuitjs-theme.css", root.document.baseURI).href',
    `new URL("src/circuitjs-theme.css?v=${circuitThemeVersion}", root.document.baseURI).href`
  ],
  [
    'circuitjs/circuitjs.html?startCircuit=blank.txt',
    `circuitjs/circuitjs.html?startCircuit=blank.txt&v=${circuitShellVersion}`
  ]
]);

const indexAssets = [
  ["assets/empeirik-logo.png", "href"],
  ["src/styles.css", "href"],
  ["src/circuit-adapter.js", "src"],
  ["src/workspace.js", "src"],
  ["src/webmcp.js", "src"],
  ["src/ui.js", "src"],
  ["src/main.js", "src"]
];
const indexReplacements = [];
for (const [relativePath, attribute] of indexAssets) {
  const version = await contentVersion(relativePath);
  indexReplacements.push([
    `${attribute}="${relativePath}"`,
    `${attribute}="${relativePath}?v=${version}"`
  ]);
}
await replaceRequired("index.html", indexReplacements);

for (const required of [
  "index.html",
  "src/main.js",
  "assets/empeirik-logo.png",
  "circuitjs/circuitjs.html",
  "circuitjs/circuitjs1/circuitjs1.nocache.js"
]) {
  await stat(resolve(OUTPUT, required));
}

const publishedIndex = await readFile(resolve(OUTPUT, "index.html"), "utf8");
for (const [relativePath, attribute] of indexAssets) {
  const versionedReference = new RegExp(`${attribute}="${relativePath.replaceAll(".", "\\.")}\\?v=[a-f0-9]{12}"`);
  if (!versionedReference.test(publishedIndex)) {
    throw new Error(`Pages artifact has an unversioned asset: ${relativePath}`);
  }
}

const publishedMain = await readFile(resolve(OUTPUT, "src/main.js"), "utf8");
if (!/circuitjs-theme\.css\?v=[a-f0-9]{12}/.test(publishedMain)
    || !/circuitjs\.html\?startCircuit=blank\.txt&v=[a-f0-9]{12}/.test(publishedMain)) {
  throw new Error("Pages artifact does not version the embedded CircuitJS1 shell and theme");
}

const publishedCircuitShell = await readFile(resolve(OUTPUT, "circuitjs/circuitjs.html"), "utf8");
if (!/circuitjs1\.nocache\.js\?v=[a-f0-9]{12}/.test(publishedCircuitShell)) {
  throw new Error("Pages artifact does not version the CircuitJS1 selection script");
}

console.log(`GitHub Pages artifact ready: ${OUTPUT}`);
console.log(`Published paths: ${PUBLIC_PATHS.join(", ")}`);
console.log("Cache-coherent asset versions: verified");
