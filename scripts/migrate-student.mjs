#!/usr/bin/env node
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateLegacyStudent } from "../lib/student-migration.mjs";

try {
  const args = {};
  const values = process.argv.slice(2);
  const allowed = new Set([
    "root",
    "template-root",
    "plan-file",
    "use-seed",
    "legacy-data-reviewed",
    "apply",
  ]);
  for (let i = 0; i < values.length; i += 2) {
    const name = values[i]?.replace(/^--/, "");
    if (
      !values[i]?.startsWith("--") ||
      !allowed.has(name) ||
      values[i + 1] === undefined
    )
      throw new Error(
        "Use --root <student folder> [--plan-file <reviewed JSON>] [--use-seed yes] --legacy-data-reviewed yes --apply yes. Omit --apply for a read-only check.",
      );
    args[name] = values[i + 1];
  }
  const flag = (name) => {
    if (args[name] === undefined || args[name] === "no") return false;
    if (args[name] === "yes") return true;
    throw new Error("--" + name + " must be yes or no.");
  };
  if (!args.root)
    throw new Error("--root must name the existing student workspace.");
  const result = await migrateLegacyStudent({
    studentRoot: args.root,
    templateRoot:
      args["template-root"] ??
      resolve(dirname(fileURLToPath(import.meta.url)), ".."),
    planFile: args["plan-file"],
    useSeed: flag("use-seed"),
    legacyDataReviewed: flag("legacy-data-reviewed"),
    apply: flag("apply"),
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Semester Navigator migration stopped: " + error.message);
  process.exitCode = 1;
}
