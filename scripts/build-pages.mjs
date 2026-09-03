#!/usr/bin/env node
/*
 * Assemble the public GitHub Pages artifact without publishing repository-only
 * source, tests, or local QA evidence.
 */
import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "_site");
const PUBLIC_PATHS = ["index.html", "src", "circuitjs"];

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });

for (const publicPath of PUBLIC_PATHS) {
  const source = resolve(ROOT, publicPath);
  const destination = resolve(OUTPUT, publicPath);
  const sourceStat = await stat(source);
  await cp(source, destination, { recursive: sourceStat.isDirectory() });
}

await writeFile(resolve(OUTPUT, ".nojekyll"), "");

for (const required of [
  "index.html",
  "src/main.js",
  "circuitjs/circuitjs.html",
  "circuitjs/circuitjs1/circuitjs1.nocache.js"
]) {
  await stat(resolve(OUTPUT, required));
}

console.log(`GitHub Pages artifact ready: ${OUTPUT}`);
console.log(`Published paths: ${PUBLIC_PATHS.join(", ")}`);
