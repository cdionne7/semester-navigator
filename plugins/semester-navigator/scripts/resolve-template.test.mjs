import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { resolveTemplate } from "./resolve-template.mjs";

async function template(root, dashboard = true) {
  const files = {
    "package.json": "{}",
    "lib/student-site-bootstrap.mjs": "",
    "scripts/bootstrap-student-site.mjs": "",
    "scripts/serve-student.mjs": "",
    "reference/chatgpt-template.md": "",
    ...(dashboard ? { "public/dashboard/index.html": "<!doctype html>" } : {}),
  };
  for (const [file, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), content);
  }
}

test("an installed bundle resolves without its original repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "semester-plugin-"));
  try {
    await template(join(root, "template"));
    assert.deepEqual(await resolveTemplate({ pluginRoot: root }), {
      template_root: join(root, "template"), source: "bundled", dashboard_ready: true,
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a missing dashboard fails before student setup", async () => {
  const root = await mkdtemp(join(tmpdir(), "semester-plugin-"));
  try {
    await template(join(root, "template"), false);
    await assert.rejects(resolveTemplate({ pluginRoot: root }), /prebuilt dashboard is missing/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("an existing student's files cannot become a shared template", async () => {
  const root = await mkdtemp(join(tmpdir(), "semester-plugin-"));
  try {
    await template(join(root, "template"));
    await mkdir(join(root, "template", ".semester-navigator"));
    await writeFile(join(root, "template", ".semester-navigator", "profile.json"), "{}");
    await assert.rejects(resolveTemplate({ pluginRoot: root }), /student workspace cannot be used/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("development checkout fallback requires explicit opt-in", async () => {
  const root = await mkdtemp(join(tmpdir(), "semester-plugin-"));
  try {
    await template(root);
    const pluginRoot = join(root, "plugins", "semester-navigator");
    await mkdir(pluginRoot, { recursive: true });
    await assert.rejects(resolveTemplate({ pluginRoot }), /template folder is missing/);
    assert.equal((await resolveTemplate({ pluginRoot, allowDevelopment: true })).source, "development");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CLI invocation through a filesystem alias does not silently skip execution", {skip:process.platform === "win32"}, async () => {
  const root = await mkdtemp(join(tmpdir(), "semester-plugin-cli-"));
  try {
    const alias = join(root, "resolver.mjs");
    await symlink(fileURLToPath(new URL("./resolve-template.mjs", import.meta.url)), alias);
    const result = spawnSync(process.execPath, [alias, "--unknown-option"], {encoding:"utf8"});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: resolve-template/);
  } finally { await rm(root, {recursive:true,force:true}); }
});
