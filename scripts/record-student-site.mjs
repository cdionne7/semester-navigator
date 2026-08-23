#!/usr/bin/env node
import { recordStudentSite } from "../lib/student-site-state.mjs";

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

try {
  const args = parseArguments(process.argv.slice(2));
  const result = await recordStudentSite({
    studentRoot: args["student-root"],
    profileId: args["profile-id"],
    projectId: args["project-id"],
    url: args.url,
    accessMode: args.access,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Student Site recording failed: ${error.message}\n`);
  process.exitCode = 1;
}
