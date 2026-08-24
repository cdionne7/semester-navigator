#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { bootstrapStudentSite } from "../lib/student-site-bootstrap.mjs";

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

function yesNo(value, label) {
  if (value === "yes") return true;
  if (value === "no") return false;
  throw new Error(`${label} must be yes or no.`);
}

function optionalYesNo(value, label, defaultValue) {
  if (value === undefined) return defaultValue;
  return yesNo(value, label);
}

function npmCliPath() {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return process.env.npm_execpath;
  }
  const bundled = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(bundled)) return bundled;
  throw new Error("npm is unavailable beside the active Node.js runtime.");
}

function runNpm(root, arguments_) {
  const result = spawnSync(process.execPath, [npmCliPath(), ...arguments_], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm ${arguments_.join(" ")} failed with exit code ${result.status}.`);
  }
}

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const args = parseArguments(process.argv.slice(2));
  const result = await bootstrapStudentSite({
    templateRoot: args["template-root"] ?? scriptRoot,
    instanceKey: args.instance,
    profileId: args["profile-id"],
    displayName: args["display-name"],
    school: args.school,
    semester: args.semester,
    timezone: args.timezone,
    machinePlatform: args["machine-platform"],
    deviceMode: args["device-mode"],
    desktopApp: args["desktop-app"],
    siteBrowser: args["site-browser"],
    studentRoot: args["student-root"],
    browserProfile: args["browser-profile"],
    browserSession: args["browser-session"],
    browserSessionPersistence: args["browser-session-persistence"],
    passkeyStatus: args["passkey-status"],
    siteViewerEmail: args["site-viewer-email"],
    storeSiteViewerEmail: yesNo(args["store-site-viewer-email"], "store-site-viewer-email"),
    automaticUpdates: yesNo(args["automatic-updates"], "automatic-updates"),
    ageEligible: yesNo(args["age-eligible"], "age-eligible"),
    sharedChatgptAccount: yesNo(args["shared-chatgpt-account"], "shared-chatgpt-account"),
  });
  if (optionalYesNo(args.prepare, "prepare", true)) {
    runNpm(result.student_root, ["ci"]);
    runNpm(result.student_root, ["test"]);
    result.prepared = true;
  } else {
    result.prepared = false;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Student Site bootstrap failed: ${error.message}\n`);
  process.exitCode = 1;
}
