import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const targetDir = process.argv[2];
if (!targetDir) {
  throw new Error("Usage: node scripts/fix-dist-extensions.mjs <dist-dir>");
}

const root = resolve(process.cwd(), targetDir);
const targetExtensions = new Set([".js", ".d.ts"]);

function hasExplicitExtension(specifier) {
  const lastSegment = specifier.split("/").pop() ?? "";
  return /\.[A-Za-z0-9]+$/u.test(lastSegment);
}

function rewriteSpecifier(specifier) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return specifier;
  if (specifier.endsWith("/") || hasExplicitExtension(specifier)) return specifier;
  return `${specifier}.js`;
}

function rewriteSource(source) {
  return source
    .replace(/(\bfrom\s*["'])(\.\.?\/[^"']+)(["'])/gu, (_match, prefix, specifier, suffix) => `${prefix}${rewriteSpecifier(specifier)}${suffix}`)
    .replace(
      /(\bimport\s*\(\s*["'])(\.\.?\/[^"']+)(["']\s*\))/gu,
      (_match, prefix, specifier, suffix) => `${prefix}${rewriteSpecifier(specifier)}${suffix}`,
    );
}

function visit(dir) {
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      visit(path);
      continue;
    }
    const ext = path.endsWith(".d.ts") ? ".d.ts" : path.slice(path.lastIndexOf("."));
    if (!targetExtensions.has(ext)) continue;
    const source = readFileSync(path, "utf8");
    const rewritten = rewriteSource(source);
    if (rewritten !== source) writeFileSync(path, rewritten);
  }
}

visit(root);
