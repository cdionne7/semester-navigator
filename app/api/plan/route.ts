import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { semesterPlans } from "../../../db/schema";
import studentSeed from "../../student-seed.json";

type CourseStatus = "On track" | "Needs draft" | "Needs attention";
type TaskState = "now" | "next" | "done";
type Theme = "light" | "dark";

type StoredPlan = {
  profileId: string;
  name: string;
  school: string;
  theme: Theme;
  workHours: string;
  refreshedAt: string;
  courses: Array<{
    id: string;
    name: string;
    instructor: string;
    officeHours: string;
    grade: string;
    status: CourseStatus;
    next: string;
    completed: number;
    total: number;
  }>;
  tasks: Array<{
    id: string;
    course: string;
    title: string;
    when: string;
    minutes: number;
    state: TaskState;
    reason: string;
  }>;
};

const textFields = ["name", "school", "workHours", "refreshedAt"] as const;
const courseTextFields = ["id", "name", "instructor", "officeHours", "grade", "next"] as const;
const taskTextFields = ["id", "course", "title", "when", "reason"] as const;
const allowedStatuses = new Set<CourseStatus>(["On track", "Needs draft", "Needs attention"]);
const allowedStates = new Set<TaskState>(["now", "next", "done"]);

function isLimitedText(value: unknown, maximum = 500) {
  return typeof value === "string" && value.length <= maximum;
}

function isNonnegativeInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0;
}

function validatePlan(value: unknown): value is StoredPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Record<string, unknown>;
  if (plan.profileId !== studentSeed.profileId) return false;
  if (!textFields.every((field) => isLimitedText(plan[field]))) return false;
  if (plan.theme !== "light" && plan.theme !== "dark") return false;
  if (!Array.isArray(plan.courses) || plan.courses.length > 100) return false;
  if (!Array.isArray(plan.tasks) || plan.tasks.length > 5_000) return false;

  const coursesAreValid = plan.courses.every((value) => {
    if (!value || typeof value !== "object") return false;
    const course = value as Record<string, unknown>;
    return courseTextFields.every((field) => isLimitedText(course[field])) &&
      allowedStatuses.has(course.status as CourseStatus) &&
      isNonnegativeInteger(course.completed) &&
      isNonnegativeInteger(course.total) &&
      Number(course.completed) <= Number(course.total);
  });
  if (!coursesAreValid) return false;

  return plan.tasks.every((value) => {
    if (!value || typeof value !== "object") return false;
    const task = value as Record<string, unknown>;
    return taskTextFields.every((field) => isLimitedText(task[field])) &&
      allowedStates.has(task.state as TaskState) &&
      isNonnegativeInteger(task.minutes) &&
      Number(task.minutes) <= 24 * 60;
  });
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected storage error";
  const unavailable = message.includes("binding `DB` is unavailable") || message.includes("no such table");
  return Response.json(
    { error: unavailable ? "Private Site storage is not provisioned yet." : "Private Site storage failed." },
    { status: unavailable ? 503 : 500 },
  );
}

export async function GET() {
  try {
    const db = getDb();
    const [row] = await db
      .select({ payload: semesterPlans.payload })
      .from(semesterPlans)
      .where(eq(semesterPlans.profileId, studentSeed.profileId))
      .limit(1);
    if (!row) return Response.json({ plan: studentSeed });
    const plan = JSON.parse(row.payload) as unknown;
    if (!validatePlan(plan)) {
      return Response.json({ error: "Stored plan failed profile validation." }, { status: 500 });
    }
    return Response.json({ plan });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const plan = (await request.json()) as unknown;
    if (!validatePlan(plan)) {
      return Response.json({ error: "Plan is invalid or belongs to a different student profile." }, { status: 400 });
    }
    const db = getDb();
    await db
      .insert(semesterPlans)
      .values({ profileId: studentSeed.profileId, payload: JSON.stringify(plan) })
      .onConflictDoUpdate({
        target: semesterPlans.profileId,
        set: { payload: JSON.stringify(plan), updatedAt: sql`CURRENT_TIMESTAMP` },
      });
    return Response.json({ saved: true, profileId: studentSeed.profileId });
  } catch (error) {
    return routeError(error);
  }
}
