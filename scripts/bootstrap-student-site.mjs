#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
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
    studentRoot: args["student-root"],
    browserProfile: args["browser-profile"],
    ageEligible: yesNo(args["age-eligible"], "age-eligible"),
    sharedChatgptAccount: yesNo(args["shared-chatgpt-account"], "shared-chatgpt-account"),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Student Site bootstrap failed: ${error.message}\n`);
  process.exitCode = 1;
}
