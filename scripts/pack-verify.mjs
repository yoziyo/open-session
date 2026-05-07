import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const workspacePackages = [
  { name: "@open-session/protocol", dir: "packages/protocol" },
  { name: "@open-session/sdk", dir: "packages/sdk" },
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

const packDir = mkdtempSync(join(tmpdir(), "open-session-pack-"));
const smokeDir = mkdtempSync(join(tmpdir(), "open-session-smoke-"));
const tarballs = new Map();

try {
  run("pnpm", ["--filter", "@open-session/protocol", "build"]);
  run("pnpm", ["--filter", "@open-session/sdk", "build"]);

  for (const workspacePackage of workspacePackages) {
    const sourceManifest = JSON.parse(readFileSync(join(root, workspacePackage.dir, "package.json"), "utf8"));
    if (
      !Array.isArray(sourceManifest.files) ||
      !sourceManifest.files.some((entry) => entry.startsWith("dist/")) ||
      !sourceManifest.files.includes("LICENSE")
    ) {
      throw new Error(`${workspacePackage.name} source manifest must whitelist dist artifacts and LICENSE`);
    }
    for (const field of ["license", "author", "description", "homepage"]) {
      if (!sourceManifest[field]) throw new Error(`${workspacePackage.name} source manifest is missing ${field}`);
    }
    if (sourceManifest.license !== "MIT") {
      throw new Error(`${workspacePackage.name} source manifest must declare MIT license`);
    }
    if (sourceManifest.repository?.type !== "git" || !sourceManifest.repository.url || sourceManifest.repository.directory !== workspacePackage.dir) {
      throw new Error(`${workspacePackage.name} source manifest must declare repository metadata with package directory`);
    }
    if (!sourceManifest.bugs?.url) {
      throw new Error(`${workspacePackage.name} source manifest is missing bugs.url`);
    }
    if (sourceManifest.sideEffects !== false) {
      throw new Error(`${workspacePackage.name} source manifest must declare sideEffects false`);
    }
    if (!sourceManifest.scripts?.prepack || !sourceManifest.scripts?.prepublishOnly) {
      throw new Error(`${workspacePackage.name} source manifest must define prepack and prepublishOnly`);
    }

    const output = run("pnpm", ["--dir", workspacePackage.dir, "pack", "--pack-destination", packDir]);
    const tarball = output
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.endsWith(".tgz"));
    if (!tarball) throw new Error(`Could not find tarball path for ${workspacePackage.name}: ${output}`);
    tarballs.set(workspacePackage.name, tarball);

    const listing = run("tar", ["-tf", tarball]);
    if (!listing.includes("package/dist/index.js")) {
      throw new Error(`${workspacePackage.name} tarball is missing dist/index.js`);
    }
    if (!listing.includes("package/dist/index.d.ts")) {
      throw new Error(`${workspacePackage.name} tarball is missing dist/index.d.ts`);
    }
    if (!listing.includes("package/README.md")) {
      throw new Error(`${workspacePackage.name} tarball is missing README.md`);
    }
    if (!listing.includes("package/LICENSE")) {
      throw new Error(`${workspacePackage.name} tarball is missing LICENSE`);
    }
    if (listing.includes("package/src/")) {
      throw new Error(`${workspacePackage.name} tarball unexpectedly includes src files`);
    }
    if (listing.includes(".tsbuildinfo")) {
      throw new Error(`${workspacePackage.name} tarball unexpectedly includes TypeScript build info`);
    }
    if (workspacePackage.name === "@open-session/sdk" && !listing.includes("package/dist/flush-worker.js")) {
      throw new Error(`${workspacePackage.name} tarball is missing dist/flush-worker.js`);
    }

    const manifestJson = run("tar", ["-xOf", tarball, "package/package.json"]);
    const manifest = JSON.parse(manifestJson);
    const defaultExport = manifest.exports?.["."]?.default ?? manifest.exports?.["."]?.import;
    const typeExport = manifest.exports?.["."]?.types;
    const workerExport = manifest.exports?.["./flush-worker"]?.default;
    for (const field of ["license", "author", "description", "homepage"]) {
      if (!manifest[field]) throw new Error(`${workspacePackage.name} packed manifest is missing ${field}`);
    }
    if (manifest.license !== "MIT") {
      throw new Error(`${workspacePackage.name} packed manifest must declare MIT license`);
    }
    if (manifest.repository?.type !== "git" || !manifest.repository.url || manifest.repository.directory !== workspacePackage.dir) {
      throw new Error(`${workspacePackage.name} packed manifest must declare repository metadata with package directory`);
    }
    if (!manifest.bugs?.url) {
      throw new Error(`${workspacePackage.name} packed manifest is missing bugs.url`);
    }
    if (!Array.isArray(manifest.files) || !manifest.files.some((entry) => entry.startsWith("dist/")) || !manifest.files.includes("LICENSE")) {
      throw new Error(`${workspacePackage.name} packed manifest must whitelist dist artifacts and LICENSE`);
    }
    if (manifest.sideEffects !== false) {
      throw new Error(`${workspacePackage.name} packed manifest must declare sideEffects false`);
    }
    if (manifest.main !== "dist/index.js" || manifest.types !== "dist/index.d.ts") {
      throw new Error(`${workspacePackage.name} package manifest does not point to dist output`);
    }
    if (defaultExport !== "./dist/index.js" || typeExport !== "./dist/index.d.ts") {
      throw new Error(`${workspacePackage.name} exports do not point to dist output`);
    }
    if (workspacePackage.name === "@open-session/sdk" && workerExport !== "./dist/flush-worker.js") {
      throw new Error(`${workspacePackage.name} worker export does not point to dist output`);
    }
  }

  const protocolTarball = tarballs.get("@open-session/protocol");
  const sdkTarball = tarballs.get("@open-session/sdk");
  if (!protocolTarball || !sdkTarball) throw new Error("Could not locate tarballs for clean install smoke test");

  run("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", protocolTarball, sdkTarball], {
    cwd: smokeDir,
    env: { ...process.env, npm_config_registry: "https://registry.npmjs.org/" },
  });
  run(
    "node",
    [
      "--input-type=module",
      "--eval",
      [
        `import { COMPACT_SESSION_FORMAT } from "@open-session/protocol";`,
        `import { initOpenSession, decodeReplayPayload, OPEN_SESSION_SDK_VERSION } from "@open-session/sdk";`,
        `if (COMPACT_SESSION_FORMAT !== "compact-session-v1") throw new Error("protocol import failed");`,
        `if (typeof initOpenSession !== "function") throw new Error("sdk init import failed");`,
        `if (typeof decodeReplayPayload !== "function") throw new Error("sdk decode import failed");`,
        `if (typeof OPEN_SESSION_SDK_VERSION !== "string") throw new Error("sdk version import failed");`,
      ].join("\n"),
    ],
    { cwd: smokeDir },
  );

  console.log(`Pack verification passed for ${workspacePackages.map((item) => item.name).join(", ")}`);
} finally {
  rmSync(packDir, { recursive: true, force: true });
  rmSync(smokeDir, { recursive: true, force: true });
}
