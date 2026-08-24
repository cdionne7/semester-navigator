#!/usr/bin/env node
import { recordStudentSiteAccess } from "../lib/student-site-state.mjs";

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

try {
  const args = parseArguments(process.argv.slice(2));
  const viewerEmails = args["viewer-emails"]
    ? args["viewer-emails"].split(",").map((value) => value.trim()).filter(Boolean)
    : [];
  const result = await recordStudentSiteAccess({
    studentRoot: args["student-root"],
    profileId: args["profile-id"],
    accessMode: args.access,
    viewerEmails,
    browserProfile: args["browser-profile"],
    verified: yesNo(args.verified, "verified"),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Student Site access recording failed: ${error.message}\n`);
  process.exitCode = 1;
}
