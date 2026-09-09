import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { semesterPlans } from "../../../db/schema";
import {
  createPlanService,
  PlanError,
  type Persistence,
} from "../../../lib/plan-model.mjs";
import studentSeed from "../../student-seed.json";

export const dynamic = "force-dynamic";
const persistence: Persistence = {
  async read(profileId) {
    const [row] = await getDb()
      .select()
      .from(semesterPlans)
      .where(eq(semesterPlans.profileId, profileId))
      .limit(1);
    return row ?? null;
  },
  async write(row, baseRevision, isNew) {
    const db = getDb();
    const values = {
      payload: row.payload,
      revision: row.revision,
      seedPayload: row.seedPayload,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    };
    const changed = isNew
      ? await db
          .insert(semesterPlans)
          .values({ profileId: row.profileId, ...values })
          .onConflictDoNothing()
          .returning({ profileId: semesterPlans.profileId })
      : await db
          .update(semesterPlans)
          .set(values)
          .where(
            and(
              eq(semesterPlans.profileId, row.profileId),
              eq(semesterPlans.revision, baseRevision),
            ),
          )
          .returning({ profileId: semesterPlans.profileId });
    return changed.length === 1;
  },
};
function routeError(error: unknown) {
  if (error instanceof PlanError)
    return Response.json({ error: error.message }, { status: error.status });
  let cause = error;
  let unavailable = false;
  const seen = new Set<unknown>();
  while (cause instanceof Error && !seen.has(cause)) {
    seen.add(cause);
    if (
      /binding `DB` is unavailable|no such table|no such column/i.test(
        cause.message,
      )
    ) {
      unavailable = true;
      break;
    }
    cause = cause.cause;
  }
  return Response.json(
    {
      error: unavailable
        ? "Private Site storage needs provisioning or its latest migration. Your changes have not been saved."
        : "Private Site storage failed. Your changes have not been saved.",
    },
    { status: unavailable ? 503 : 500 },
  );
}
export async function GET() {
  try {
    return Response.json(
      await createPlanService(studentSeed, persistence).load(),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return routeError(error);
  }
}
export async function PUT(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 4_000_000)
      return Response.json(
        { error: "The plan exceeds the 4 MB save limit." },
        { status: 413 },
      );
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      return Response.json(
        { error: "The save request is not valid JSON." },
        { status: 400 },
      );
    }
    return Response.json(
      await createPlanService(studentSeed, persistence).save(input),
    );
  } catch (error) {
    return routeError(error);
  }
}
