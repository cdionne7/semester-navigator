"use client";
import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import studentSeed from "./student-seed.json";
import {
  normalizePlan,
  mergeImportedPlan,
  tasksForView,
  formatDue,
  getCourseHealth,
  gradeSummary,
  suggestStudyBlocks,
  sourceCoverageSummary,
  type Plan,
  type Task,
  type Course,
} from "../lib/plan-model.mjs";
import {
  calendarExport,
  coachingPrompt,
  safeWebUrl,
  localDueParts,
  dueFromLocal,
} from "../lib/student-tools.mjs";
import { usePlan } from "./use-plan";

const initial = normalizePlan(studentSeed);
const views = {
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  semester: "All work",
} as const;
const sourceScopeLabels = {
  "course-list": "Class list", assignments: "Assignments", grades: "Grades",
  materials: "Class materials", rubrics: "Rubrics", announcements: "Announcements",
};
type Dialog =
  "task" | "course" | "import" | "settings" | "support" | "blocks" | null;
function download(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function field(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog className="modal" ref={ref} aria-label={title} onCancel={close}>
      <div className="modal-heading">
        <h2>{title}</h2>
        <button type="button" onClick={close} aria-label="Close dialog">
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}
function ResourceLink({ url, children }: { url: string; children: ReactNode }) {
  const safe = safeWebUrl(url);
  return safe ? (
    <a href={safe} target="_blank" rel="noreferrer">
      {children} ↗
    </a>
  ) : (
    <span>{children}</span>
  );
}
function checkedTime(value: string | null, timezone: string) {
  if (!value) return "Not checked";
  if (value.length === 10) return value;
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone, dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));
}

export default function Home({
  initialPlan = initial,
}: { initialPlan?: Plan } = {}) {
  const store = usePlan(initialPlan);
  const { plan, edit, canEdit } = store;
  const [view, setView] = useState<keyof typeof views>("today");
  const [showDone, setShowDone] = useState(false);
  const [courseFilter, setCourseFilter] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [notice, setNotice] = useState("");
  const [removed, setRemoved] = useState<{
    course?: Course;
    tasks: Task[];
  } | null>(null);
  const [formError, setFormError] = useState("");
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<Plan | null>(null);
  const [prompt, setPrompt] = useState("");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const close = () => {
    setDialog(null);
    setFormError("");
    setImportPreview(null);
  };
  const open = (next: Dialog) => {
    setFormError("");
    setDialog(next);
  };
  const change = (fn: (value: Plan) => Plan) => {
    try {
      edit(fn);
      return true;
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Please check these details.",
      );
      return false;
    }
  };
  const active = plan.tasks.filter((task) => task.state !== "done");
  const unknown = active.filter((task) => !task.dueAt);
  const displayed = tasksForView(plan, view, now).filter(
    (task) =>
      (!courseFilter || task.courseId === courseFilter) &&
      (showDone || task.state !== "done"),
  );
  const nextTask = tasksForView(plan, "semester", now).find(
    (task) => task.state !== "done" && task.dueAt,
  );
  const health = plan.courses.map((course) => ({
    course,
    health: getCourseHealth(plan, course.id, now),
  }));
  const attention = health.filter(
    (item) => item.health.status === "Needs attention",
  ).length;
  const sourceSummaries = plan.sources.map((source) => ({
    source,
    summary: sourceCoverageSummary(source, plan.courses.map((course) => course.id)),
  }));
  const requiredSchoolChecks = [
    { courseId: null, scope: "course-list" },
    ...plan.courses.flatMap((course) =>
      ["assignments", "grades", "materials", "rubrics", "announcements"].map((scope) => ({ courseId: course.id, scope }))),
  ];
  const hasUncheckedSchoolInformation = requiredSchoolChecks.some((required) =>
    !sourceSummaries.some(({ source, summary }) => summary.connectionVerified &&
      source.coverage.some((check) => check.courseId === required.courseId && check.scope === required.scope && check.status === "checked")));
  const saveLabels = {
    loading: "Loading saved plan",
    saved: "All changes saved",
    saving: "Saving changes",
    pending: "Changes waiting to save",
    conflict: "Another saved version needs review",
    unavailable: "Saved plan unavailable",
  };
  const exportPlan = () =>
    download("semester-navigator-backup.json", JSON.stringify(plan, null, 2));
  const requestHelp = (mode: string, task?: Task, course?: Course) => {
    setPrompt(coachingPrompt(plan, mode, task?.id, course?.id));
    open("support");
  };
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice(
        "Request copied. Paste it into your Semester Navigator chat.",
      );
    } catch {
      setNotice(
        "Select and copy the request into your Semester Navigator chat.",
      );
    }
  };
  const addTask = () => {
    setSelectedTask(null);
    open("task");
  };
  const addCourse = () => {
    setSelectedCourse(null);
    open("course");
  };

  function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const courseId = field(form, "courseId");
    const course = plan.courses.find((item) => item.id === courseId);
    if (!course) {
      setFormError("Add or choose a class first.");
      return;
    }
    const date = field(form, "date"),
      time = field(form, "time");
    let dueAt;
    try {
      dueAt =
        selectedTask && date === dueParts.date && time === dueParts.time
          ? selectedTask.dueAt
          : dueFromLocal(date, time, plan.timezone);
    } catch (error) {
      setFormError((error as Error).message);
      return;
    }
    const task = {
      ...selectedTask,
      id: selectedTask?.id || crypto.randomUUID(),
      courseId,
      course: course.name,
      title: field(form, "title"),
      dueAt,
      minutes: Number(field(form, "minutes")),
      state: selectedTask?.state || "next",
      reason: field(form, "reason"),
      sourceUrl: field(form, "sourceUrl"),
      rubric: field(form, "rubric"),
      notes: field(form, "notes"),
      priority: field(form, "priority") || "normal",
    } as Task;
    if (
      change((value) => ({
        ...value,
        tasks: selectedTask
          ? value.tasks.map((item) => (item.id === task.id ? task : item))
          : [...value.tasks, task],
      }))
    ) {
      close();
      setNotice(
        "Assignment updated. Unknown deadlines stay on your list until confirmed.",
      );
    }
  }
  function saveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const course = {
      ...selectedCourse,
      id: selectedCourse?.id || crypto.randomUUID(),
      name: field(form, "name"),
      instructor: field(form, "instructor"),
      officeHours: field(form, "officeHours"),
      grade: field(form, "grade"),
      goalGrade: field(form, "goalGrade")
        ? Number(field(form, "goalGrade"))
        : null,
      resources: selectedCourse?.resources || [],
      gradingComponents: selectedCourse?.gradingComponents || [],
    } as Course;
    const url = field(form, "resourceUrl");
    if (url) {
      if (!safeWebUrl(url)) {
        setFormError("Use a complete https:// or http:// link.");
        return;
      }
      course.resources = [
        ...course.resources,
        {
          id: crypto.randomUUID(),
          title: field(form, "resourceTitle") || "Class resource",
          url,
          kind: "course",
        },
      ];
    }
    if (
      change((value) => ({
        ...value,
        courses: selectedCourse
          ? value.courses.map((item) => (item.id === course.id ? course : item))
          : [...value.courses, course],
        tasks: value.tasks.map((task) =>
          task.courseId === course.id ? { ...task, course: course.name } : task,
        ),
      }))
    ) {
      close();
      setNotice("Class updated.");
    }
  }
  function previewImport() {
    try {
      const imported = normalizePlan(JSON.parse(importText), plan.profileId);
      setImportPreview(mergeImportedPlan(plan, imported));
      setFormError("");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "This file could not be read.",
      );
      setImportPreview(null);
    }
  }
  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      change((value) => ({
        ...value,
        theme: field(form, "theme") as Plan["theme"],
        accentColor: field(form, "accentColor"),
        workHours: field(form, "workHours"),
      }))
    )
      close();
  }
  function removeSelected() {
    const course = dialog === "course" ? selectedCourse : null;
    const tasks = course
      ? plan.tasks.filter((task) => task.courseId === course.id)
      : selectedTask
        ? [selectedTask]
        : [];
    const label = course
      ? course.name + " and its " + tasks.length + " assignments"
      : selectedTask?.title;
    if (!label || !window.confirm("Remove " + label + " from this plan?"))
      return;
    if (
      change((value) => ({
        ...value,
        courses: course
          ? value.courses.filter((item) => item.id !== course.id)
          : value.courses,
        tasks: value.tasks.filter(
          (item) => !tasks.some((task) => task.id === item.id),
        ),
      }))
    ) {
      setRemoved({ course: course || undefined, tasks });
      close();
      setNotice("Removed from your plan. You can undo this removal.");
    }
  }
  function undoRemoval() {
    if (!removed) return;
    if (
      change((value) => ({
        ...value,
        courses:
          removed.course &&
          !value.courses.some((c) => c.id === removed.course?.id)
            ? [...value.courses, removed.course]
            : value.courses,
        tasks: [
          ...value.tasks,
          ...removed.tasks.filter(
            (task) => !value.tasks.some((item) => item.id === task.id),
          ),
        ],
      }))
    ) {
      setRemoved(null);
      setNotice("Removal undone.");
    }
  }
  const dueParts = localDueParts(selectedTask?.dueAt || null, plan.timezone);

  return (
    <main
      className={"app " + (plan.theme === "dark" ? "dark" : "")}
      style={{ "--accent": plan.accentColor } as CSSProperties}
    >
      <a className="skip-link" href="#assignments">
        Skip to assignments
      </a>
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">SEMESTER NAVIGATOR</p>
            <h1>{plan.name}&apos;s semester</h1>
            <p className="subhead">
              {plan.school || "School not added"} ·{" "}
              {plan.semester || "Term not added"}
            </p>
          </div>
          <div className="actions">
            <button onClick={exportPlan}>Export backup</button>
            <button onClick={() => open("settings")} disabled={!canEdit}>
              Preferences
            </button>
          </div>
        </header>
        <div className="contextbar">
          <span>
            {new Intl.DateTimeFormat("en", {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: plan.timezone,
            }).format(now)}{" "}
            · {plan.timezone}
          </span>
          <span className={"save-status " + store.status} role="status">
            {saveLabels[store.status]}
          </span>
        </div>
        {store.error && (
          <section className="notice error" role="alert">
            <p>{store.error}</p>
            <div className="actions">
              <button onClick={exportPlan}>Export my copy</button>
              {store.status === "pending" && (
                <button onClick={() => void store.retry()}>
                  Save pending changes
                </button>
              )}
              <button
                onClick={() => {
                  if (
                    store.status !== "conflict" ||
                    window.confirm(
                      "Export your copy first to keep unsaved changes. Load the latest saved plan now?",
                    )
                  )
                    void store.reload(store.status === "conflict");
                }}
              >
                Load latest saved plan
              </button>
            </div>
          </section>
        )}
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            {removed && (
              <button disabled={!canEdit} onClick={undoRemoval}>
                Undo removal
              </button>
            )}
            <button onClick={() => setNotice("")}>Dismiss</button>
          </div>
        )}
        {!plan.courses.length && (
          <section className="welcome card">
            <p className="eyebrow">CONNECT YOUR SCHOOL</p>
            <h2>Your semester starts here.</h2>
            <p>
              Ask Semester Navigator to guide you through connecting the school
              accounts where you check classes, assignments and grades.
            </p>
            <div className="actions">
              <button
                className="primary"
                onClick={() => requestHelp("connect")}
              >
                Help me connect my school
              </button>
              <button disabled={!canEdit} onClick={addCourse}>
                Add my first class
              </button>
              <button onClick={() => requestHelp("import")}>
                Help me import a syllabus
              </button>
              <button disabled={!canEdit} onClick={() => open("import")}>
                Import prepared plan
              </button>
            </div>
          </section>
        )}
        <section className="hero-grid" aria-label="Your next action">
          <article className="priority">
            <p className="eyebrow">
              {nextTask
                ? "START HERE · " +
                  (nextTask.minutes
                    ? nextTask.minutes + " MIN"
                    : "ESTIMATE NEEDED")
                : "START HERE"}
            </p>
            <h2>
              {nextTask?.title ||
                (unknown.length
                  ? "Confirm your missing deadlines"
                  : !plan.courses.length
                    ? "Add one class and its next assignment"
                    : !plan.tasks.length
                      ? "Add your next assignment"
                      : "Your known work is complete")}
            </h2>
            <p>
              {nextTask
                ? nextTask.course +
                  " · " +
                  formatDue(nextTask, plan.timezone, now)
                : "This view includes only the work you have added. Check your class sources for anything missing."}
            </p>
            {nextTask?.reason && <p>{nextTask.reason}</p>}
            {nextTask && (
              <button
                onClick={() => {
                  setSelectedTask(nextTask);
                  open("task");
                }}
                disabled={!canEdit}
              >
                Open assignment
              </button>
            )}
          </article>
          <article className="card summary">
            <p className="eyebrow">CLASS STATUS</p>
            <h2>
              {!plan.courses.length
                ? "No classes checked yet"
                : attention
                  ? attention +
                    (attention === 1
                      ? " class needs attention"
                      : " classes need attention")
                  : health.some(
                        (item) => item.health.status === "Missing information",
                      )
                    ? "Some class information is missing"
                    : "Known work is on track"}
            </h2>
            <p>
              {unknown.length
                ? unknown.length +
                  " unfinished assignments need a confirmed due date."
                : "Class status uses saved deadlines and reported grades."}
            </p>
            <p className="fine">
              {!sourceSummaries.length
                ? "Your school sources have not been connected yet."
                : hasUncheckedSchoolInformation
                  ? "Some school information still needs checking. See Sources below."
                  : "Source checks are saved snapshots. Check for changes in ChatGPT."}
            </p>
            <button onClick={() => requestHelp(plan.sources.length ? "refresh" : "connect")}>
              Review class updates in ChatGPT
            </button>
          </article>
        </section>
        <section className="metrics" aria-label="Semester totals">
          {[
            [active.length, "assignments left"],
            [unknown.length, "unknown deadlines"],
            [plan.tasks.length - active.length, "completed"],
            [plan.courses.length, "classes"],
          ].map(([count, label]) => (
            <div key={label}>
              <strong>{count}</strong>
              <span>{label}</span>
            </div>
          ))}
        </section>
        <section className="card assignments" id="assignments">
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR WORKLOAD</p>
              <h2>Assignments</h2>
            </div>
            <div className="actions">
              <button onClick={() => open("import")} disabled={!canEdit}>
                Import plan
              </button>
              <button
                className="primary"
                disabled={!canEdit || !plan.courses.length}
                onClick={addTask}
              >
                Add assignment
              </button>
            </div>
          </div>
          <div className="filters">
            <nav aria-label="Date view">
              {Object.entries(views).map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={view === key}
                  className={view === key ? "tab active" : "tab"}
                  onClick={() => setView(key as keyof typeof views)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <label>
              Class
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
              >
                <option value="">All classes</option>
                {plan.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showDone}
                onChange={(e) => setShowDone(e.target.checked)}
              />{" "}
              Include completed
            </label>
          </div>
          {!displayed.length ? (
            <p className="empty">
              No {showDone ? "" : "unfinished "}assignments in this view.
              {unknown.length
                ? " Open All work to see assignments with unknown deadlines."
                : " Check your class sources for anything missing."}
            </p>
          ) : (
            <ul className="task-list">
              {displayed.map((task) => (
                <li
                  key={task.id}
                  className={task.state === "done" ? "completed" : ""}
                >
                  <button
                    className="complete-button"
                    disabled={!canEdit}
                    aria-label={
                      (task.state === "done" ? "Reopen " : "Complete ") +
                      task.title
                    }
                    onClick={() =>
                      change((value) => ({
                        ...value,
                        tasks: value.tasks.map((item) =>
                          item.id === task.id
                            ? {
                                ...item,
                                state: item.state === "done" ? "next" : "done",
                              }
                            : item,
                        ),
                      }))
                    }
                  >
                    {task.state === "done" ? "✓" : "○"}
                  </button>
                  <div className="task-main">
                    <span className="task-course">{task.course}</span>
                    <h3>{task.title}</h3>
                    <p className={!task.dueAt ? "unknown" : ""}>
                      {formatDue(task, plan.timezone, now)} ·{" "}
                      {task.minutes ? task.minutes + " min" : "Estimate needed"}
                      {task.priority === "high" ? " · High priority" : ""}
                    </p>
                    {task.reason && <p className="fine">{task.reason}</p>}
                    <div className="task-actions">
                      <button
                        disabled={!canEdit}
                        onClick={() => {
                          setSelectedTask(task);
                          open("task");
                        }}
                      >
                        Edit
                      </button>
                      <button onClick={() => requestHelp("rubric", task)}>
                        Check my rubric
                      </button>
                      <button onClick={() => requestHelp("study", task)}>
                        Help me think
                      </button>
                      {task.sourceUrl && (
                        <ResourceLink url={task.sourceUrl}>
                          Assignment source
                        </ResourceLink>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="course-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">THE FULL PICTURE</p>
              <h2>Your classes</h2>
            </div>
            <button disabled={!canEdit} onClick={addCourse}>
              Add class
            </button>
          </div>
          <div className="course-grid">
            {health.map(({ course, health: item }) => {
              const grade = gradeSummary(course);
              return (
                <article className="course-card card" key={course.id}>
                  <div className="course-title">
                    <h3>{course.name}</h3>
                    <span
                      className={
                        "badge " +
                        (item.status === "Needs attention"
                          ? "attention"
                          : item.status === "Missing information"
                            ? "missing"
                            : "on-track")
                      }
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="fine">
                    {course.instructor || "Instructor not added"}
                    {course.officeHours ? " · " + course.officeHours : ""}
                  </p>
                  <dl>
                    <div>
                      <dt>Reported grade</dt>
                      <dd>{course.grade || "Not provided"}</dd>
                    </div>
                    <div>
                      <dt>Known work</dt>
                      <dd>
                        {item.completed} / {item.total} completed
                      </dd>
                    </div>
                  </dl>
                  <progress
                    value={item.completed}
                    max={Math.max(item.total, 1)}
                    aria-label={course.name + " assignment completion"}
                  />
                  <p className="fine">{item.reason}</p>
                  {grade.current !== null && (
                    <p>
                      Calculated from supplied scores:{" "}
                      <strong>{grade.current.toFixed(1)}%</strong>
                    </p>
                  )}
                  {grade.goal !== null && (
                    <p className="fine">
                      Goal: {grade.goal}%
                      {grade.neededOnRemaining !== null
                        ? " · Needed on remaining weighted work: " +
                          grade.neededOnRemaining.toFixed(1) +
                          "%"
                        : ""}
                    </p>
                  )}
                  {grade.warnings.map((warning) => (
                    <p className="fine" key={warning}>
                      {warning}
                    </p>
                  ))}
                  {!!course.resources.length && (
                    <ul className="resources">
                      {course.resources.map((resource) => (
                        <li key={resource.id}>
                          <ResourceLink url={resource.url}>
                            {resource.title}
                          </ResourceLink>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="actions">
                    <button
                      disabled={!canEdit}
                      onClick={() => {
                        setSelectedCourse(course);
                        open("course");
                      }}
                    >
                      Edit class
                    </button>
                    <button
                      onClick={() => requestHelp("research", undefined, course)}
                    >
                      Find resources
                    </button>
                    <button
                      onClick={() => requestHelp("study", undefined, course)}
                    >
                      Practice
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        <section className="content-grid">
          <article className="card">
            <p className="eyebrow">PLAN A REALISTIC WEEK</p>
            <h2>Make room to work</h2>
            <p>
              {plan.workHours
                ? "Your availability notes: " + plan.workHours
                : "Add work hours, activities and other commitments in Preferences."}
            </p>
            <p className="fine">
              Break larger assignments into short sessions. Calendar times need
              your availability checked first.
            </p>
            <div className="actions">
              <button onClick={() => open("blocks")}>
                Suggest study sessions
              </button>
              <button onClick={() => requestHelp("plan")}>
                Check my available time
              </button>
            </div>
          </article>
          <article className="card">
            <p className="eyebrow">REMINDERS</p>
            <h2>Remember what is coming</h2>
            <p>
              {plan.reminders.some(
                (item) => item.status === "scheduled" && item.enabled,
              )
                ? "Verified reminders are listed below."
                : "No verified reminders are active yet."}
            </p>
            {plan.reminders.map((item) => (
              <p key={item.id}>
                {item.title} · {item.schedule} · {item.status}
              </p>
            ))}
            <div className="actions">
              <button onClick={() => requestHelp("reminders")}>
                Set up reminders in ChatGPT
              </button>
              <button
                onClick={() => {
                  download(
                    "semester-deadlines.ics",
                    calendarExport(plan),
                    "text/calendar",
                  );
                  setNotice(
                    "Calendar file downloaded. Import it into your calendar, then verify its events and alerts. This download has not enabled reminders.",
                  );
                }}
              >
                Export deadlines to calendar
              </button>
            </div>
          </article>
        </section>
        <details className="card source-details">
          <summary>Sources and what has been checked</summary>
          <p className="fine">ChatGPT checks your approved school accounts when you ask. Opening this dashboard does not refresh them. Different sources can cover different parts of your schoolwork.</p>
          <div className="actions">
            <button onClick={() => requestHelp("connect")}>Connect or repair school access</button>
            <button onClick={() => requestHelp("refresh")}>Check school sources in ChatGPT</button>
          </div>
          {plan.sources.length ? (
            <ul className="source-list">
              {sourceSummaries.map(({ source, summary }) => (
                <li key={source.id}>
                  <h3><ResourceLink url={source.url}>{source.title}</ResourceLink></h3>
                  <p>{summary.label}</p>
                  <p className="fine">Last successful read: {checkedTime(source.lastChecked, plan.timezone)}</p>
                  {source.connection.expectedIdentity && <p className="fine">School account: {source.connection.expectedIdentity}</p>}
                  {source.verificationNote && <p className="fine">{source.verificationNote}</p>}
                  {source.connection.nextAction && <p><strong>Next step:</strong> {source.connection.nextAction}</p>}
                  {!!source.coverage.length && !summary.connectionVerified && <p className="fine">Saved coverage below is historical. Ask ChatGPT to verify access again.</p>}
                  {!!source.coverage.length && <ul className="coverage-list" aria-label={source.title + " coverage"}>
                    {source.coverage.map((check, index) => <li key={index}>
                      <strong>{check.courseId ? plan.courses.find((course) => course.id === check.courseId)?.name || check.courseId : "Class list"}</strong>
                      {check.courseId ? " · " + sourceScopeLabels[check.scope] : ""}: {check.status === "unknown" ? "not checked" : check.status}
                      {check.itemCount !== null ? " (" + check.itemCount + " items)" : ""}
                      {check.checkedAt ? " · " + checkedTime(check.checkedAt, plan.timezone) : ""}
                      {check.note ? ". " + check.note : ""}
                    </li>)}
                  </ul>}
                  {!!summary.gaps.length && <details><summary>Not checked by this source ({summary.gaps.length})</summary><ul>{summary.gaps.map((gap) => <li key={gap}>{plan.courses.reduce((label, course) => label.replace(course.id + ":", course.name + ":"), gap)}</li>)}</ul></details>}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              No sources recorded. Ask ChatGPT to help connect your school. You
              can also add work manually or import a prepared plan.
            </p>
          )}
        </details>
        <footer>
          Keep a backup. Verify changed deadlines and grades against your class
          sources.
        </footer>
      </div>
      {dialog && (
        <Modal
          title={
            {
              task: selectedTask ? "Edit assignment" : "Add assignment",
              course: selectedCourse ? "Edit class" : "Add class",
              import: "Import your semester",
              settings: "Preferences",
              support: "Continue in ChatGPT",
              blocks: "Suggested study sessions",
            }[dialog]
          }
          close={close}
        >
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          {dialog === "task" && (
            <form onSubmit={saveTask}>
              <label>
                Assignment title
                <input
                  name="title"
                  defaultValue={selectedTask?.title}
                  required
                  maxLength={500}
                />
              </label>
              <label>
                Class
                <select
                  name="courseId"
                  defaultValue={
                    selectedTask?.courseId ||
                    courseFilter ||
                    plan.courses[0]?.id
                  }
                  required
                >
                  {plan.courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Due date
                  <input name="date" type="date" defaultValue={dueParts.date} />
                </label>
                <label>
                  Due time (optional)
                  <input name="time" type="time" defaultValue={dueParts.time} />
                </label>
              </div>
              <p className="fine">
                Leave unknown dates or times blank. Times use {plan.timezone}.
              </p>
              <div className="form-grid">
                <label>
                  Estimated minutes
                  <input
                    name="minutes"
                    type="number"
                    min="1"
                    max="1440"
                    defaultValue={
                      selectedTask ? selectedTask.minutes || "" : 30
                    }
                  />
                </label>
                <label>
                  Priority
                  <select
                    name="priority"
                    defaultValue={selectedTask?.priority || "normal"}
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>
              <label>
                Next small step
                <input name="reason" defaultValue={selectedTask?.reason} />
              </label>
              <label>
                Assignment link
                <input
                  name="sourceUrl"
                  type="url"
                  defaultValue={selectedTask?.sourceUrl}
                />
              </label>
              <label>
                Rubric or requirements
                <textarea
                  name="rubric"
                  defaultValue={selectedTask?.rubric}
                  placeholder="Paste the actual assignment criteria here."
                />
              </label>
              <label>
                Your notes
                <textarea name="notes" defaultValue={selectedTask?.notes} />
              </label>
              <div className="actions">
                <button type="button" onClick={close}>
                  Cancel
                </button>
                <button className="primary" type="submit">
                  Save assignment
                </button>
                {selectedTask && (
                  <button type="button" onClick={removeSelected}>
                    Remove assignment
                  </button>
                )}
              </div>
            </form>
          )}
          {dialog === "course" && (
            <form onSubmit={saveCourse}>
              <label>
                Class name
                <input
                  name="name"
                  defaultValue={selectedCourse?.name}
                  required
                />
              </label>
              <label>
                Instructor
                <input
                  name="instructor"
                  defaultValue={selectedCourse?.instructor}
                />
              </label>
              <label>
                Office hours or help times
                <input
                  name="officeHours"
                  defaultValue={selectedCourse?.officeHours}
                />
              </label>
              <div className="form-grid">
                <label>
                  Reported grade
                  <input
                    name="grade"
                    defaultValue={selectedCourse?.grade}
                    placeholder="Unknown, B+, 87%, or 14/20"
                  />
                </label>
                <label>
                  Goal percentage (optional)
                  <input
                    name="goalGrade"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    defaultValue={selectedCourse?.goalGrade ?? ""}
                  />
                </label>
              </div>
              <label>
                Resource title
                <input
                  name="resourceTitle"
                  placeholder="Course portal, tutoring, textbook..."
                />
              </label>
              <label>
                Resource link
                <input name="resourceUrl" type="url" />
              </label>
              <p className="fine">
                Weighted grade calculations are available when Semester
                Navigator imports your actual grading policy and scores.
              </p>
              <div className="actions">
                <button type="button" onClick={close}>
                  Cancel
                </button>
                <button className="primary" type="submit">
                  Save class
                </button>
                {selectedCourse && (
                  <button type="button" onClick={removeSelected}>
                    Remove class
                  </button>
                )}
              </div>
            </form>
          )}
          {dialog === "import" && (
            <section>
              <p>
                Upload the prepared plan from your Semester Navigator chat.
                Review it before saving. Existing completed assignments stay
                complete.
              </p>
              <label>
                Prepared plan file
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2000000) {
                      setFormError("Use a plan smaller than 2 MB.");
                      return;
                    }
                    setImportText(await file.text());
                    setImportPreview(null);
                  }}
                />
              </label>
              <details>
                <summary>Or paste the prepared plan</summary>
                <label>
                  Plan JSON
                  <textarea
                    value={importText}
                    onChange={(e) => {
                      setImportText(e.target.value);
                      setImportPreview(null);
                    }}
                    rows={8}
                  />
                </label>
              </details>
              <button onClick={previewImport}>Preview import</button>
              {importPreview && (
                <div className="import-preview">
                  <h3>After this import</h3>
                  <p>
                    {importPreview.courses.length} classes ·{" "}
                    {importPreview.tasks.length} assignments ·{" "}
                    {importPreview.tasks.filter((task) => !task.dueAt).length}{" "}
                    unknown deadlines
                  </p>
                  <ul>
                    {importPreview.tasks.slice(0, 8).map((task) => (
                      <li key={task.id}>
                        {task.course}: {task.title} ·{" "}
                        {formatDue(task, plan.timezone)} ·{" "}
                        {task.state === "done" ? "Completed" : "Open"}
                      </li>
                    ))}
                  </ul>
                  <button
                    className="primary"
                    onClick={() => {
                      if (change(() => importPreview)) {
                        close();
                        setImportText("");
                        setNotice(
                          "Import added. Your existing completed work was preserved.",
                        );
                      }
                    }}
                  >
                    Confirm import
                  </button>
                </div>
              )}
              <p className="fine">
                Need an import file? Choose Review class updates in ChatGPT from
                the dashboard.
              </p>
            </section>
          )}
          {dialog === "settings" && (
            <form onSubmit={saveSettings}>
              <p>
                {plan.name} · {plan.school} · {plan.semester} · {plan.timezone}
              </p>
              <p className="fine">
                This workspace belongs to this student. Confirm a term or
                identity change with Semester Navigator.
              </p>
              <div className="form-grid">
                <label>
                  Theme
                  <select name="theme" defaultValue={plan.theme}>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
                <label>
                  School accent
                  <input
                    name="accentColor"
                    type="color"
                    defaultValue={plan.accentColor}
                  />
                </label>
              </div>
              <label>
                Work hours and availability notes
                <textarea
                  name="workHours"
                  defaultValue={plan.workHours}
                  placeholder="Tuesday 4–9 PM work; practice after school Wednesday."
                />
              </label>
              <div className="actions">
                <button type="button" onClick={close}>
                  Cancel
                </button>
                <button className="primary" type="submit">
                  Save preferences
                </button>
              </div>
            </form>
          )}
          {dialog === "support" && (
            <section>
              <p>
                Copy this request into your Semester Navigator chat in ChatGPT
                desktop. ChatGPT will guide the next step using your approved
                school connections. This dashboard does not send the request
                automatically.
              </p>
              <label>
                Request for Semester Navigator
                <textarea
                  className="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={12}
                />
              </label>
              <div className="actions">
                <button className="primary" onClick={() => void copyPrompt()}>
                  Copy request
                </button>
                <ResourceLink url="https://chatgpt.com/">
                  Open ChatGPT
                </ResourceLink>
              </div>
            </section>
          )}
          {dialog === "blocks" &&
            (() => {
              const proposal = suggestStudyBlocks(plan, now);
              return (
                <section>
                  <p>
                    These are proposed work sessions, not scheduled calendar
                    events.
                  </p>
                  {proposal.blocks.length ? (
                    <ol>
                      {proposal.blocks.map((block, index) => (
                        <li key={block.taskId + index}>
                          <strong>{block.title}</strong>
                          <p>
                            {block.date} · {block.minutes} minutes
                          </p>
                          <p className="fine">{block.reason}</p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>
                      Add unfinished assignments to get a study-session
                      proposal.
                    </p>
                  )}
                  {proposal.unscheduled.map((item) => (
                    <p key={item.taskId}>
                      {item.title}: {item.reason}
                    </p>
                  ))}
                  {proposal.limitations.map((item) => (
                    <p className="fine" key={item}>
                      {item}
                    </p>
                  ))}
                  <button onClick={() => requestHelp("plan")}>
                    Choose times with ChatGPT
                  </button>
                </section>
              );
            })()}
        </Modal>
      )}
    </main>
  );
}
