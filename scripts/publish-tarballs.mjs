import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const registry = process.env.NPM_CONFIG_REGISTRY || process.env.npm_config_registry || "https://registry.npmjs.org";

const packages = ["packages/protocol", "packages/sdk"];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    let stdout = "";
    let stderr = "";
    if (options.capture) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const detail = options.capture ? `\n${stdout}${stderr}` : "";
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}${detail}`));
    });
  });
}

async function isPublished(name, version) {
  try {
    await run("npm", ["view", `${name}@${version}`, "version", "--registry", registry], { capture: true });
    return true;
  } catch (error) {
    const text = String(error.message || "");
    if (text.includes("E404") || text.includes("404")) return false;
    throw error;
  }
}

async function publishPackage(packageDir) {
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  if (manifest.private) {
    console.log(`Skipping private package ${manifest.name}`);
    return;
  }

  if (await isPublished(manifest.name, manifest.version)) {
    console.log(`Skipping ${manifest.name}@${manifest.version}; already published.`);
    return;
  }

  const tempDir = await mkdtemp(join(tmpdir(), "open-session-publish-"));
  try {
    await run("pnpm", ["--dir", packageDir, "pack", "--pack-destination", tempDir]);
    const tarballs = (await readdir(tempDir)).filter((file) => file.endsWith(".tgz"));
    if (tarballs.length !== 1) {
      throw new Error(`Expected one tarball for ${manifest.name}, found ${tarballs.length}`);
    }
    const tarball = join(tempDir, tarballs[0]);
    await run("npm", ["publish", tarball, "--access", "public", "--tag", "latest", "--registry", registry]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

for (const packageDir of packages) {
  await publishPackage(packageDir);
}
