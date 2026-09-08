import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";

// A portable runtime must remain usable in a fresh shell and in npm lifecycle
// children. Do not change the user's persistent PATH.
export function runtimeEnvironment(environment = process.env, executable = process.execPath) {
  const result = { ...environment };
  const pathKeys = Object.keys(result).filter((key) => /^path$/i.test(key));
  const key = pathKeys[0] ?? (process.platform === "win32" ? "Path" : "PATH");
  const paths = pathKeys.flatMap((name) => (result[name] ?? "").split(delimiter));
  for (const name of pathKeys) delete result[name];
  result[key] = [...new Set([dirname(executable), ...paths].filter(Boolean))].join(delimiter);
  return result;
}

export function npmCliPath() {
  const candidates = [
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  for (const bundled of candidates) if (existsSync(bundled)) return bundled;
  const adjacent = join(dirname(process.execPath), "npm");
  if (existsSync(adjacent)) {
    const resolved = realpathSync(adjacent);
    if (resolved.endsWith("npm-cli.js")) return resolved;
  }
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) return process.env.npm_execpath;
  throw new Error("npm is unavailable beside the active Node.js runtime. Use scripts/run-semester.ps1 with the project-local runtime.");
}

export function runNpm(root, arguments_) {
  const result = spawnSync(process.execPath, [npmCliPath(), ...arguments_], {
    cwd: root,
    env: runtimeEnvironment(),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${arguments_.join(" ")} failed with exit code ${result.status}.`);
}

export function runNode(root, arguments_) {
  const result = spawnSync(process.execPath, arguments_, { cwd: root, env: runtimeEnvironment(), stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Student verification failed with exit code ${result.status}.`);
}
