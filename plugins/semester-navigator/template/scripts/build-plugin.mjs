#!/usr/bin/env node
// Release tooling only. A student runs the committed bundle without a build.
import { readFile, writeFile, readdir, mkdir, rm, cp } from "node:fs/promises";
import { resolve, join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const plugin = "plugins/semester-navigator";
const bundle = join(root, plugin, "template");
async function files(directory) {
  const found = [];
  for (const item of await readdir(join(root, directory), {
    withFileTypes: true,
  })) {
    if (item.name === ".DS_Store") continue;
    const path = directory + "/" + item.name;
    if (item.isSymbolicLink())
      throw new Error("Release cannot contain symbolic links: " + path);
    if (item.isDirectory()) found.push(...(await files(path)));
    else found.push(path);
  }
  return found.sort();
}
const topFiles = [
  ".gitignore",
  "AGENTS.md",
  "README.md",
  "cloudflare-env.d.ts",
  "drizzle.config.ts",
  "eslint.config.mjs",
  "next-env.d.ts",
  "next.config.ts",
  "package.json",
  "package-lock.json",
  "playwright.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
  "vite.config.ts",
  "vite.dashboard.config.ts",
];
const directories = [
  ".github",
  ".agents",
  "app",
  "build",
  "dashboard",
  "db",
  "drizzle",
  "lib",
  "public",
  "reference",
  "scripts",
  "tests",
  "worker",
  plugin + "/skills",
  plugin + "/scripts",
  plugin + "/.codex-plugin",
];
let canonical = [...topFiles];
for (const directory of directories)
  canonical.push(...(await files(directory)));
canonical.push(".openai/hosting.example.json");
canonical = [...new Set(canonical)].sort();
if (!canonical.includes("public/dashboard/index.html"))
  throw new Error("Run npm run build:dashboard first.");
const student = canonical.filter(
  (path) =>
    /^(app|build|dashboard|db|drizzle|lib|public|worker)\//.test(path) &&
    path !== "app/student-seed.json",
);
student.push(
  ...[
    ".gitignore",
    "cloudflare-env.d.ts",
    "drizzle.config.ts",
    "eslint.config.mjs",
    "next-env.d.ts",
    "next.config.ts",
    "package-lock.json",
    "postcss.config.mjs",
    "tsconfig.json",
    "vite.config.ts",
    "vite.dashboard.config.ts",
  ],
);
student.push(
  ...canonical.filter((path) =>
    /^scripts\/(bootstrap-student-site|migrate-student|record-student-site(-access)?|serve-student|setup-windows|run-semester|update-semester-navigator)\./.test(
      path,
    ),
  ),
);
student.push(
  ...canonical.filter((path) =>
    /^tests\/(plan-(model|route|http)|student-tools)\.test\.mjs$/.test(path),
  ),
);
student.push(".openai/hosting.example.json");
student.push(
  "reference/agents-template.md",
  "reference/chatgpt-template.md",
  "reference/update-manifest.json",
);
student.push(
  { source: "reference/agents-template.md", destination: "AGENTS.md" },
  {
    source: "package.json",
    destination: "package.json",
    transform: "student-package",
  },
);
for (const path of canonical.filter((path) =>
  path.startsWith(plugin + "/skills/semester-navigator/"),
))
  student.push({
    source: path,
    destination:
      ".semester-navigator/playbook/" +
      path.slice((plugin + "/skills/semester-navigator/").length),
  });
const manifest = {
  schema_version: 1,
  release: "2026.09.10.1",
  repository: "https://github.com/cdionne7/semester-navigator",
  canonical_files: canonical,
  student_files: student,
};
await writeFile(
  join(root, "reference/update-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
await rm(bundle, { recursive: true, force: true });
await mkdir(bundle, { recursive: true });
const templateFiles = canonical.filter(
  (path) =>
    !path.startsWith(".agents/") &&
    !path.startsWith(plugin + "/scripts/") &&
    !path.startsWith(plugin + "/.codex-plugin/"),
);
for (const path of templateFiles) {
  await mkdir(dirname(join(bundle, path)), { recursive: true });
  await cp(join(root, path), join(bundle, path));
}
const entries = [...(await files(plugin)), ...(await files(".agents"))];
// Small deterministic ZIP writer. No archive utility is needed on a build machine.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const local = [],
  central = [];
let offset = 0;
for (const path of entries.sort()) {
  const name = Buffer.from("semester-navigator/" + path),
    data = await readFile(join(root, path)),
    compressed = deflateRawSync(data),
    crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(33, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  local.push(header, name, compressed);
  const directory = Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50);
  directory.writeUInt16LE(20, 4);
  header.copy(directory, 6, 4, 28);
  directory.writeUInt32LE(offset, 42);
  central.push(directory, name);
  offset += header.length + name.length + compressed.length;
}
const centralBytes = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralBytes.length, 12);
end.writeUInt32LE(offset, 16);
const archive = Buffer.concat([...local, centralBytes, end]);
const version = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
).version;
const artifact = join(
  root,
  "artifacts",
  `semester-navigator-plugin-v${version}.zip`,
);
await mkdir(dirname(artifact), { recursive: true });
await writeFile(artifact, archive);
await writeFile(
  artifact + ".sha256",
  createHash("sha256").update(archive).digest("hex") +
    "  " +
    relative(dirname(artifact), artifact) +
    "\n",
);
console.log(
  JSON.stringify({
    template: bundle,
    templateFiles: templateFiles.length,
    archive: artifact,
    bytes: archive.length,
  }),
);
