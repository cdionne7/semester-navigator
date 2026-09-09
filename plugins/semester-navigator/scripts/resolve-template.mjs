#!/usr/bin/env node
import { access, lstat, readFile } from "node:fs/promises";
import { constants, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_FILES = [
  "package.json",
  "lib/student-site-bootstrap.mjs",
  "scripts/bootstrap-student-site.mjs",
  "scripts/serve-student.mjs",
  "reference/chatgpt-template.md",
];

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function resolveTemplate({
  pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  allowDevelopment = false,
  requireDashboard = true,
} = {}) {
  const root = resolve(pluginRoot);
  const candidates = [{ root: join(root, "template"), source: "bundled" }];
  if (allowDevelopment) candidates.push({ root: resolve(root, "..", ".."), source: "development" });
  const failures = [];
  for (const candidate of candidates) {
    if (!(await exists(candidate.root))) {
      failures.push(`${candidate.source}: template folder is missing`);
      continue;
    }
    const metadata = await lstat(candidate.root);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      failures.push(`${candidate.source}: template must be a real directory`);
      continue;
    }
    if (await exists(join(candidate.root, ".semester-navigator", "profile.json"))) {
      failures.push(`${candidate.source}: a student workspace cannot be used as the template`);
      continue;
    }
    const missing = [];
    for (const filename of REQUIRED_FILES) {
      if (!(await exists(join(candidate.root, filename)))) missing.push(filename);
    }
    if (missing.length) {
      failures.push(`${candidate.source}: missing ${missing.join(", ")}`);
      continue;
    }
    try {
      JSON.parse(await readFile(join(candidate.root, "package.json"), "utf8"));
    } catch {
      failures.push(`${candidate.source}: package.json is invalid`);
      continue;
    }
    const dashboardReady = await exists(join(candidate.root, "public", "dashboard", "index.html"));
    if (requireDashboard && !dashboardReady) {
      failures.push(`${candidate.source}: prebuilt dashboard is missing`);
      continue;
    }
    return { template_root: candidate.root, source: candidate.source, dashboard_ready: dashboardReady };
  }
  throw new Error(`Semester Navigator release is incomplete. Install the published plugin bundle; keep planning from the supplied course materials meanwhile. ${failures.join("; ")}`);
}

function runningAsCommand() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (runningAsCommand()) {
  const args = process.argv.slice(2);
  if (args.some((argument) => !["--allow-development", "--allow-unbuilt"].includes(argument))) {
    process.stderr.write("Usage: resolve-template.mjs [--allow-development] [--allow-unbuilt]\n");
    process.exitCode = 1;
  } else {
    try {
      const result = await resolveTemplate({
        allowDevelopment: args.includes("--allow-development"),
        requireDashboard: !args.includes("--allow-unbuilt"),
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
