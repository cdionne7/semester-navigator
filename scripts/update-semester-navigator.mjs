#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  initializeUpdateState,
  rollbackSemesterUpdate,
  UpdateNetworkError,
  updateSemesterNavigator,
} from "../lib/semester-update.mjs";

function parseArguments(values) {
  const args = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`Expected --name value arguments; problem near ${key ?? "end of input"}.`);
    }
    args[key.slice(2)] = value;
  }
  return args;
}

function yesNo(value, label, defaultValue) {
  if (value === undefined) return defaultValue;
  if (value === "yes") return true;
  if (value === "no") return false;
  throw new Error(`${label} must be yes or no.`);
}

function detectMode(root, requestedMode) {
  if (requestedMode) return requestedMode;
  return existsSync(join(root, ".semester-navigator", "profile.json")) ? "student" : "canonical";
}

function npmCliPath() {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return process.env.npm_execpath;
  }
  const bundled = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(bundled)) return bundled;
  throw new Error("npm is unavailable beside the active Node.js runtime.");
}

function runNpm(root, args) {
  const result = spawnSync(process.execPath, [npmCliPath(), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed with exit code ${result.status}.`);
  }
}

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const args = parseArguments(process.argv.slice(2));
  const root = resolve(args.root ?? scriptRoot);
  const mode = detectMode(root, args.mode);
  const initialize = yesNo(args.initialize, "initialize", false);
  const verify = yesNo(args.verify, "verify", true);
  const allowOffline = yesNo(args["allow-offline"], "allow-offline", true);

  if (initialize) {
    const state = await initializeUpdateState({
      root,
      mode,
      templateRoot: args["template-root"] ?? root,
    });
    process.stdout.write(`${JSON.stringify({ status: "initialized", release: state.release }, null, 2)}\n`);
    process.exit(0);
  }

  let update;
  try {
    update = await updateSemesterNavigator({ root, mode });
  } catch (error) {
    if (allowOffline && error instanceof UpdateNetworkError) {
      process.stdout.write(`${JSON.stringify({ status: "offline", message: error.message }, null, 2)}\n`);
      process.exit(0);
    }
    throw error;
  }

  if (verify && update.status === "updated") {
    try {
      runNpm(root, ["ci"]);
      runNpm(root, ["test"]);
    } catch (error) {
      if (update.backup_root) {
        await rollbackSemesterUpdate({ root, backupRoot: update.backup_root });
        try {
          runNpm(root, ["ci"]);
        } catch (restoreError) {
          throw new Error(
            `The update failed verification and source files were rolled back, but dependency restoration also failed: ${restoreError.message}`,
          );
        }
      }
      throw new Error(`The update failed verification and was rolled back: ${error.message}`);
    }
  }

  process.stdout.write(`${JSON.stringify(update, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Semester Navigator update stopped: ${error.message}\n`);
  process.exitCode = 1;
}
