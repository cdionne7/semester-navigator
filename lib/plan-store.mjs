import { open, readFile, rename, mkdir, rm, lstat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { lstatSync, readFileSync, unlinkSync } from "node:fs";
import { PlanError, normalizePlan } from "./plan-model.mjs";

export function createFilePlanStore(root, profileId) {
  const directory = join(root, ".semester-navigator");
  const path = join(directory, "plan.json");
  const lockPath = join(directory, "plan.lock");
  function recoverDeadLock() {
    // Startup only: never recover a lock in the save contention loop. Unknown hosts,
    // missing metadata, a reused/live PID, and permission failures all fail closed.
    let details;
    let owner;
    try {
      details = lstatSync(lockPath);
      if (details.isSymbolicLink()) return false;
      owner = JSON.parse(readFileSync(lockPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return false;
      return false;
    }
    if (
      owner.host !== hostname() ||
      !Number.isInteger(owner.pid) ||
      owner.pid <= 0 ||
      typeof owner.token !== "string" ||
      !owner.token ||
      !Number.isFinite(Date.parse(owner.createdAt))
    )
      return false;
    try {
      process.kill(owner.pid, 0);
      return false;
    } catch (error) {
      if (error.code !== "ESRCH") return false;
    }
    try {
      const latest = lstatSync(lockPath);
      const current = JSON.parse(readFileSync(lockPath, "utf8"));
      if (
        latest.ino !== details.ino ||
        latest.dev !== details.dev ||
        current.token !== owner.token
      )
        return false;
      unlinkSync(lockPath);
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }
  async function read() {
    let raw;
    try {
      if ((await lstat(path)).isSymbolicLink())
        throw new PlanError("The plan file must not be a symbolic link.", 500);
      raw = await readFile(path, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      throw new PlanError(
        "The saved plan file is damaged. Keep it for recovery; no changes were saved.",
        500,
      );
    }
    if (
      envelope.schemaVersion !== 1 ||
      envelope.profileId !== profileId ||
      !Number.isInteger(envelope.revision) ||
      envelope.revision < 0
    )
      throw new PlanError(
        "The saved plan does not match this student workspace.",
        500,
      );
    const plan = normalizePlan(envelope.plan, profileId);
    if (plan.revision !== envelope.revision)
      throw new PlanError(
        "The saved plan revision is inconsistent. No changes were saved.",
        500,
      );
    return {
      profileId,
      payload: JSON.stringify(plan),
      revision: envelope.revision,
      seedPayload: envelope.seedBaseline
        ? JSON.stringify(envelope.seedBaseline)
        : null,
    };
  }
  async function lock() {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const handle = await open(lockPath, "wx", 0o600);
        try {
          await handle.writeFile(
            JSON.stringify({
              pid: process.pid,
              host: hostname(),
              token: randomUUID(),
              createdAt: new Date().toISOString(),
            }),
          );
          return handle;
        } catch (error) {
          await handle.close();
          await rm(lockPath, { force: true });
          throw error;
        }
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    throw new PlanError(
      "Another save is still running, or a previous process stopped during a save. Your edits were not saved. Retry; if this continues, ask Semester Navigator to inspect the local plan lock.",
      503,
    );
  }
  return {
    read,
    recoverDeadLock,
    async write(row, baseRevision, isNew) {
      if (row.profileId !== profileId)
        throw new PlanError("The save belongs to another student.", 400);
      await mkdir(directory, { recursive: true });
      const handle = await lock();
      const temporary = join(directory, `.plan-${randomUUID()}.tmp`);
      try {
        const current = await read();
        if (
          isNew
            ? current !== null
            : !current || current.revision !== baseRevision
        )
          return false;
        const plan = normalizePlan(JSON.parse(row.payload), profileId);
        const seedBaseline = row.seedPayload
          ? normalizePlan(JSON.parse(row.seedPayload), profileId)
          : null;
        const file = await open(temporary, "wx", 0o600);
        try {
          await file.writeFile(
            `${JSON.stringify({ schemaVersion: 1, profileId, revision: row.revision, plan, seedBaseline }, null, 2)}\n`,
          );
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temporary, path);
        return true;
      } finally {
        await rm(temporary, { force: true });
        await handle.close();
        await rm(lockPath, { force: true });
      }
    },
  };
}
