#!/usr/bin/env node
import { createServer } from "node:http";
import {
  readFile,
  realpath,
  lstat,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, join, relative, extname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPlanService,
  normalizePlan,
  PlanError,
} from "../lib/plan-model.mjs";
import { createFilePlanStore } from "../lib/plan-store.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
async function inspectRoot(requestedRoot) {
  const root = await realpath(resolve(requestedRoot));
  let profile;
  try {
    profile = JSON.parse(
      await readFile(join(root, ".semester-navigator", "profile.json"), "utf8"),
    );
  } catch {
    throw new Error(
      "Open a generated student workspace first. The canonical template cannot run as a student dashboard.",
    );
  }
  if (
    !profile.profile_id ||
    !profile.display_name ||
    !profile.approved_local_root ||
    !isAbsolute(profile.approved_local_root) ||
    (await realpath(profile.approved_local_root)) !== root
  )
    throw new Error("The student profile does not match this workspace root.");
  const stateRoot = join(root, ".semester-navigator");
  if ((await lstat(stateRoot)).isSymbolicLink())
    throw new Error(
      "The student state directory must stay inside this workspace.",
    );
  const dashboard = await realpath(join(root, "public", "dashboard"));
  if (relative(root, dashboard).startsWith(".."))
    throw new Error(
      "The dashboard assets must stay inside the student workspace.",
    );
  await readFile(join(dashboard, "index.html"));
  const readSeed = async () => {
    const seed = normalizePlan(
      JSON.parse(
        await readFile(join(root, "app", "student-seed.json"), "utf8"),
      ),
      profile.profile_id,
    );
    for (const [field, profileField] of [["name", "display_name"], ["school", "school"], ["semester", "semester"]]) {
      if (profile[profileField] && seed[field] !== profile[profileField])
        throw new Error(
          `The dashboard seed ${field} does not match this student workspace. Review the source import before continuing.`,
        );
    }
    return seed;
  };
  await readSeed();
  let checkpointQueue = Promise.resolve();
  function recordCheckpoint(stage) {
    checkpointQueue = checkpointQueue
      .catch(() => {})
      .then(async () => {
        const profilePath = join(stateRoot, "profile.json");
        const current = JSON.parse(await readFile(profilePath, "utf8"));
        if (
          current.profile_id !== profile.profile_id ||
          (await realpath(current.approved_local_root)) !== root
        )
          throw new Error("Workspace changed before checkpoint recording.");
        const now = new Date().toISOString();
        const setup = {
          ...current.setup,
          failed_stage: null,
          last_error: null,
          updated_at: now,
        };
        if (stage === "dashboard") {
          setup.dashboard_started_at = now;
          setup.status = setup.first_plan_saved_at
            ? "active"
            : "dashboard_ready";
          if (!setup.first_plan_saved_at)
            setup.last_completed_stage = "dashboard";
        } else {
          setup.status = "active";
          setup.last_completed_stage = "plan_saved";
          setup.first_plan_saved_at ??= now;
          setup.last_plan_saved_at = now;
        }
        const temporary = join(stateRoot, `.profile-${randomUUID()}.tmp`);
        try {
          await writeFile(
            temporary,
            `${JSON.stringify({ ...current, setup }, null, 2)}\n`,
            { mode: 0o600 },
          );
          await rename(temporary, profilePath);
        } finally {
          await rm(temporary, { force: true });
        }
      });
    return checkpointQueue.then(
      () => true,
      () => {
        console.error(
          "Semester Navigator could not record its setup checkpoint. The saved plan was not changed by that checkpoint failure.",
        );
        return false;
      },
    );
  }
  return { root, profile, dashboard, readSeed, recordCheckpoint };
}
export async function startStudentServer({
  root: requestedRoot,
  port = 4317,
  check = false,
}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error(
      "Port must be a whole number from 1 to 65535 (or 0 for an automatically selected local port).",
    );
  const state = await inspectRoot(requestedRoot);
  const persistence = createFilePlanStore(state.root, state.profile.profile_id);
  if (check) {
    await persistence.read(state.profile.profile_id);
    return {
      ready: true,
      root: state.root,
      profileId: state.profile.profile_id,
    };
  }
  let actualPort = port;
  const server = createServer(async (request, response) => {
    const send = (status, data) => {
      response.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(JSON.stringify(data));
    };
    try {
      const allowedHost = `127.0.0.1:${actualPort}`;
      if (request.headers.host !== allowedHost)
        return send(403, {
          error: "Open this dashboard using its exact 127.0.0.1 address.",
        });
      if (
        request.headers.origin &&
        request.headers.origin !== `http://${allowedHost}`
      )
        return send(403, {
          error: "This request did not come from the student dashboard.",
        });
      const url = new URL(request.url, `http://${allowedHost}`);
      if (url.pathname === "/api/profile") {
        if (request.method !== "GET")
          return send(405, { error: "Use GET for the workspace identity." });
        const seed = await state.readSeed();
        // Runtime identity for the shared prebuilt SPA, independent of stored-plan availability.
        const plan = normalizePlan(
          {
            ...seed,
            revision: 0,
            seedRevision: "",
            courses: [],
            tasks: [],
            sources: [],
            reminders: [],
          },
          state.profile.profile_id,
        );
        return send(200, { plan });
      }
      if (url.pathname === "/api/plan") {
        const service = createPlanService(await state.readSeed(), persistence);
        if (request.method === "GET") return send(200, await service.load());
        if (request.method !== "PUT")
          return send(405, { error: "Use GET or PUT for the plan." });
        if (
          !request.headers["content-type"]
            ?.toLowerCase()
            .startsWith("application/json")
        )
          return send(415, { error: "Plan saves require application/json." });
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 4_000_000)
            return send(413, {
              error: "The plan exceeds the 4 MB save limit.",
            });
          chunks.push(chunk);
        }
        let input;
        try {
          input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          return send(400, { error: "The save request is not valid JSON." });
        }
        const saved = await service.save(input);
        await state.recordCheckpoint("plan_saved");
        return send(200, saved);
      }
      if (request.method !== "GET" && request.method !== "HEAD")
        return send(405, { error: "Unsupported request method." });
      let requestedPath;
      try {
        requestedPath = decodeURIComponent(url.pathname);
      } catch {
        return send(400, { error: "Invalid asset path." });
      }
      const candidate = resolve(
        state.dashboard,
        `.${requestedPath === "/" ? "/index.html" : requestedPath}`,
      );
      if (relative(state.dashboard, candidate).startsWith(".."))
        return send(404, { error: "Asset not found." });
      let asset;
      try {
        asset = await realpath(candidate);
        if (relative(state.dashboard, asset).startsWith(".."))
          return send(404, { error: "Asset not found." });
      } catch {
        return send(404, { error: "Asset not found." });
      }
      const content = await readFile(asset);
      response.writeHead(200, {
        "content-type": MIME[extname(asset)] || "application/octet-stream",
        "cache-control":
          extname(asset) === ".html" ? "no-store" : "public, max-age=3600",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch (error) {
      send(error instanceof PlanError ? error.status : 500, {
        error:
          error instanceof PlanError
            ? error.message
            : "The local dashboard could not read or save this student workspace. Your changes were not saved.",
      });
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolvePromise);
  });
  actualPort = server.address().port;
  // The listening port prevents two ordinary launches from recovering the same lock.
  try {
    persistence.recoverDeadLock();
    await state.recordCheckpoint("dashboard");
  } catch (error) {
    server.close();
    throw error;
  }
  return {
    server,
    url: `http://127.0.0.1:${actualPort}`,
    root: state.root,
    profileId: state.profile.profile_id,
  };
}
async function main() {
  const args = {};
  const values = process.argv.slice(2);
  for (let index = 0; index < values.length; index++) {
    const key = values[index];
    if (key === "--check") {
      args.check = true;
      continue;
    }
    if (!["--root", "--port"].includes(key) || !values[index + 1])
      throw new Error(
        "Use --root <student workspace> [--port 4317] [--check].",
      );
    args[key.slice(2)] = values[++index];
  }
  const result = await startStudentServer({
    root: args.root || resolve(fileURLToPath(new URL("..", import.meta.url))),
    port: args.port === undefined ? 4317 : Number(args.port),
    check: args.check,
  });
  if (args.check) console.log(JSON.stringify(result));
  else {
    console.log(
      JSON.stringify({
        ready: true,
        url: result.url,
        profileId: result.profileId,
      }),
    );
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () => result.server.close(() => process.exit(0)));
  }
}
// Resolve both paths so Windows short names and directory aliases still count
// as direct execution, while importing this module only exposes the server API.
if (
  process.argv[1] &&
  (await realpath(resolve(process.argv[1])).catch(() => "")) ===
    (await realpath(fileURLToPath(import.meta.url)))
)
  main().catch((error) => {
    console.error(`Semester Navigator could not start: ${error.message}`);
    process.exitCode = 1;
  });
