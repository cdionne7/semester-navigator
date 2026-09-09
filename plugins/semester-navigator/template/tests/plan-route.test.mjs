import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as model from "../lib/plan-model.mjs";
const source = await readFile(
  new URL("../app/api/plan/route.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const seed = {
  profileId: "route-fixture",
  name: "Review",
  school: "Example",
  courses: [],
  tasks: [],
};
function harness(initialSeed = seed) {
  let row = null;
  let unavailable = false;
  let failure = null;
  const eq = (column, value) => ({ column, value });
  const and = (...conditions) => conditions;
  const matches = (condition) =>
    Array.isArray(condition)
      ? condition.every(matches)
      : row?.[condition.column] === condition.value;
  const db = {
    select: () => ({
      from: () => ({
        where: (condition) => ({
          limit: async () =>
            row && matches(condition) ? [structuredClone(row)] : [],
        }),
      }),
    }),
    insert: () => ({
      values: (values) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (row) return [];
            row = structuredClone(values);
            return [{ profileId: row.profileId }];
          },
        }),
      }),
    }),
    update: () => ({
      set: (values) => ({
        where: (condition) => ({
          returning: async () => {
            if (!matches(condition)) return [];
            row = { ...row, ...structuredClone(values) };
            return [{ profileId: row.profileId }];
          },
        }),
      }),
    }),
  };
  const load = (nextSeed) => {
    const exports = {};
    vm.runInNewContext(compiled, {
      exports,
      Response,
      Error,
      require: (name) =>
        name === "drizzle-orm"
          ? { eq, and, sql: () => "" }
          : name === "../../../db"
            ? {
                getDb: () => {
                  if (failure) throw failure;
                  if (unavailable)
                    throw new Error(
                      "Cloudflare D1 binding `DB` is unavailable",
                    );
                  return db;
                },
              }
            : name === "../../../db/schema"
              ? {
                  semesterPlans: {
                    profileId: "profileId",
                    revision: "revision",
                  },
                }
              : name === "../../../lib/plan-model.mjs"
                ? model
                : name === "../../student-seed.json"
                  ? { default: nextSeed }
                  : null,
    });
    return exports;
  };
  return {
    route: load(initialSeed),
    redeploy: load,
    setUnavailable: (value) => (unavailable = value),
    setFailure: (value) => (failure = value),
    peek: () => row,
  };
}
const request = (input) =>
  new Request("https://fixture.invalid/api/plan", {
    method: "PUT",
    body: JSON.stringify(input),
  });
test("actual hosted route performs CAS and changed-seed imports through its DB adapter", async () => {
  const fixture = harness();
  let route = fixture.route;
  const first = await (await route.GET()).json();
  assert.equal(first.revision, 0);
  let response = await route.PUT(
    request({ plan: first.plan, baseRevision: 0 }),
  );
  assert.equal(response.status, 200);
  assert.equal(
    (await route.PUT(request({ plan: first.plan, baseRevision: 0 }))).status,
    409,
  );
  route = fixture.redeploy({
    ...seed,
    tasks: [
      { id: "new-work", title: "New source assignment", dueAt: "2026-09-10" },
    ],
  });
  const imported = await (await route.GET()).json();
  assert.equal(imported.plan.tasks.length, 1);
  assert.equal(imported.revision, 2);
  assert.equal(fixture.peek().revision, 2);
  imported.plan.tasks[0].state = "done";
  response = await route.PUT(request({ plan: imported.plan, baseRevision: 2 }));
  assert.equal(response.status, 200);
  assert.equal((await route.PUT(request(imported.plan))).status, 409);
  fixture.setUnavailable(true);
  assert.equal((await route.GET()).status, 503);
  assert.equal(
    (await route.PUT(request({ plan: imported.plan, baseRevision: 2 }))).status,
    503,
  );
});
test("actual hosted route gives actionable malformed-input and profile errors", async () => {
  const { route } = harness();
  assert.equal(
    (
      await route.PUT(
        new Request("https://fixture.invalid/api/plan", {
          method: "PUT",
          body: "{no",
        }),
      )
    ).status,
    400,
  );
  const first = await (await route.GET()).json();
  first.plan.profileId = "wrong-student";
  const response = await route.PUT(
    request({ plan: first.plan, baseRevision: 0 }),
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /different student/);
});
test("wrapped D1 migration errors remain actionable without exposing query details", async () => {
  const fixture = harness();
  const first = await (await fixture.route.GET()).json();
  for (const detail of [
    "no such table: semester_plans",
    "no such column: revision",
  ]) {
    fixture.setFailure(
      new Error("Failed query containing private assignment details", {
        cause: new Error("D1_ERROR: " + detail),
      }),
    );
    for (const response of [
      await fixture.route.GET(),
      await fixture.route.PUT(request({ plan: first.plan, baseRevision: 0 })),
    ]) {
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.match(body.error, /provisioning or its latest migration/);
      assert.doesNotMatch(
        body.error,
        /private assignment|semester_plans|revision/,
      );
    }
  }
  const cyclic = new Error("Other database failure");
  cyclic.cause = cyclic;
  fixture.setFailure(cyclic);
  assert.equal((await fixture.route.GET()).status, 500);
});
