#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { bootstrapStudentSite, prepareStudentSite, resumeStudentSite, validateIntake } from "../lib/student-site-bootstrap.mjs";

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

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const args = parseArguments(process.argv.slice(2));
  const intake = args["intake-file"] ? validateIntake(JSON.parse(await readFile(resolve(args["intake-file"]), "utf8"))) : undefined;
  const resume = optionalYesNo(args.resume, "resume", false);
  const operation = resume ? resumeStudentSite : bootstrapStudentSite;
  const result = await operation({
    intake,
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
    browserIntegration: optionalYesNo(args["browser-integration"], "browser-integration", false),
    studentRoot: args["student-root"],
    browserProfile: args["browser-profile"],
    browserSession: args["browser-session"],
    browserSessionPersistence: args["browser-session-persistence"],
    passkeyStatus: args["passkey-status"],
    siteViewerEmail: args["site-viewer-email"],
    storeSiteViewerEmail: optionalYesNo(args["store-site-viewer-email"], "store-site-viewer-email", false),
    automaticUpdates: optionalYesNo(args["automatic-updates"], "automatic-updates", false),
    ageEligible: optionalYesNo(args["age-eligible"], "age-eligible", false),
    sharedChatgptAccount: optionalYesNo(args["shared-chatgpt-account"], "shared-chatgpt-account", false),
  });
  if (optionalYesNo(args.prepare, "prepare", false)) {
    await prepareStudentSite({ studentRoot: result.student_root, profileId: result.profile_id });
    result.prepared = true;
    result.setup_status = "prepared";
  } else {
    result.prepared = false;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Student Site bootstrap failed: ${error.message}\n`);
  process.exitCode = 1;
}
