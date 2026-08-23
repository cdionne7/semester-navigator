import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Semester Navigator has the required operating surfaces", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const text of ["How should I address you?", "Today", "Tomorrow", "This week", "Next week", "Semester", "DAILY REFRESH REVIEW", "CALENDAR CAPACITY PLAN", "Saved on this device", "Professor", "Office hours"]) assert.match(page, new RegExp(text));
  assert.match(page, /localStorage/);
  assert.match(page, /fetch\("\/api\/plan"/);
  assert.match(page, /Saved to this private Site/);
  assert.match(page, /will not add or change calendar events until the student approves/);
});
