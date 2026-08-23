"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import studentSeed from "./student-seed.json";

type Horizon = "today" | "tomorrow" | "week" | "nextWeek" | "semester";
type Theme = "light" | "dark";
type Course = {
  id: string; name: string; instructor: string; officeHours: string; grade: string;
  status: "On track" | "Needs draft" | "Needs attention"; next: string; completed: number; total: number;
};
type Task = { id: string; course: string; title: string; when: string; minutes: number; state: "now" | "next" | "done"; reason: string };
type Plan = { profileId: string; name: string; school: string; theme: Theme; courses: Course[]; tasks: Task[]; workHours: string; refreshedAt: string };

const initial = studentSeed as Plan;

const labels: Record<Horizon, string> = { today: "Today", tomorrow: "Tomorrow", week: "This week", nextWeek: "Next week", semester: "Semester" };
const key = `semester-navigator-v1:${initial.profileId}`;

function statusReason(status: Course["status"]) {
  if (status === "On track") return "On track means the next known item has time left and there is no grade warning.";
  if (status === "Needs draft") return "Needs draft means the first small piece has not been started yet.";
  return "Needs attention means a deadline is close, the grade is lower than the goal, or both.";
}

export default function Home() {
  const [plan, setPlan] = useState<Plan>(initial);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<Horizon>("today");
  const [setupOpen, setSetupOpen] = useState(false);
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [saveStatus, setSaveStatus] = useState<"loading" | "saving" | "site" | "device">("loading");

  useEffect(() => {
    let cancelled = false;
    async function loadPlan() {
      try {
        const response = await fetch("/api/plan", { cache: "no-store" });
        if (!response.ok) throw new Error("Site storage unavailable");
        const payload = await response.json() as { plan?: Plan };
        if (!payload.plan || payload.plan.profileId !== initial.profileId) throw new Error("Profile mismatch");
        if (!cancelled) {
          setPlan(payload.plan);
          setSaveStatus("site");
        }
      } catch {
        const saved = localStorage.getItem(key);
        if (!cancelled && saved) {
          const localPlan = JSON.parse(saved) as Plan;
          if (localPlan.profileId === initial.profileId) setPlan(localPlan);
        }
        if (!cancelled) setSaveStatus("device");
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void loadPlan();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(key, JSON.stringify(plan));
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const response = await fetch("/api/plan", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(plan),
        });
        if (!response.ok) throw new Error("Site storage unavailable");
        if (!cancelled) setSaveStatus("site");
      } catch {
        if (!cancelled) setSaveStatus("device");
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [plan, ready]);
  const update = (next: Partial<Plan>) => setPlan((current) => ({ ...current, ...next }));
  const tasks = useMemo(() => view === "semester" ? plan.tasks : plan.tasks.filter((task) => task.when === labels[view] || (view === "week" && task.when === "Today")), [plan.tasks, view]);
  const done = plan.tasks.filter((task) => task.state === "done").length;
  const needsAttention = plan.courses.filter((course) => course.status !== "On track").length;

  function markDone(id: string) { update({ tasks: plan.tasks.map((task) => task.id === id ? { ...task, state: "done" } : task) }); }
  function applySetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    update({ name: String(form.get("name") || "Student"), school: String(form.get("school") || "My school"), theme: String(form.get("theme")) as Theme });
    setSetupOpen(false); setNotice("Your school look and name are set.");
  }
  function addWorkHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const workHours = String(form.get("workHours") || "");
    update({ workHours }); setCalendarOpen(false); setNotice("Your work hours are saved. Study blocks are a proposal until you add them to your calendar.");
  }
  function refresh() {
    update({ refreshedAt: "Just now" }); setRefreshOpen(false); setNotice("Refresh review complete. No connected sources are set up yet, so nothing was added automatically.");
  }

  return <main className={plan.theme === "dark" ? "app dark" : "app"}>
    <section className="shell">
      <header className="topbar">
        <div><p className="eyebrow">{plan.name.toUpperCase()} · MONDAY, AUGUST 17 · 8:05 AM</p><h1>{plan.name}, your day is simple.</h1></div>
        <button className="primary" onClick={() => setSetupOpen(true)}>Set up Semester Navigator</button>
      </header>
      <div className="schoolbar"><span className="school-pill">{plan.school}</span><span className="quiet">School look set in Semester Navigator</span><button onClick={() => update({ theme: plan.theme === "light" ? "dark" : "light" })}>{plan.theme === "light" ? "Dark theme" : "Light theme"}</button><span className="saved">{saveStatus === "site" ? "Saved to this private Site" : saveStatus === "saving" ? "Saving…" : saveStatus === "device" ? "Saved on this device; private Site storage unavailable" : "Loading your plan…"}</span></div>
      <nav aria-label="Date view">{(Object.keys(labels) as Horizon[]).map((item) => <button key={item} className={view === item ? "tab active" : "tab"} onClick={() => setView(item)}>{labels[item]}</button>)}</nav>
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>Close</button></div>}

      <section className="hero-grid">
        <article className="priority"><p>DO THIS FIRST · 45 MINUTES</p><h2>{view === "semester" ? "Finish the next small thing" : tasks.find((task) => task.state !== "done")?.course || "You are clear"}</h2><span>{tasks.find((task) => task.state !== "done")?.title || "Everything on your current list is done."}</span><small>{tasks.find((task) => task.state !== "done")?.reason}</small></article>
        <article className="card"><p className="eyebrow">SEMESTER HEALTH</p><h2>{needsAttention ? `${needsAttention} courses need a small next step` : "Your courses are on track"}</h2><p>“High leverage” means this work is close to due or can move your grade the most.</p><button onClick={() => setRefreshOpen(true)}>Review updates</button></article>
      </section>

      <section className="metrics" aria-label="semester progress"><div><strong>{done}</strong><span>work items done</span></div><div><strong>{plan.tasks.length - done}</strong><span>known items left</span></div><div><strong>{plan.courses.length}</strong><span>active courses</span></div><div><strong>{plan.refreshedAt}</strong><span>last refresh review</span></div></section>
      <section className="content-grid">
        <article className="card task-card"><p className="eyebrow">{labels[view].toUpperCase()}</p><h2>{view === "semester" ? "Everything we know" : "Your short list"}</h2>{tasks.length ? <ol className="task-list">{tasks.map((task) => <li key={task.id} className={task.state === "done" ? "completed" : ""}><button aria-label={`Mark ${task.title} complete`} onClick={() => markDone(task.id)}>{task.state === "done" ? "✓" : "○"}</button><div><b>{task.course}</b><span>{task.title}</span><small>{task.minutes} min · {task.when}</small></div></li>)}</ol> : <p>No work is known for this view yet. Add it during refresh review.</p>}</article>
        <article className="card"><p className="eyebrow">PLAN YOUR TIME</p><h2>Protect your week first</h2><p>{plan.workHours ? `Work hours: ${plan.workHours}` : "Add your work hours before you make a study plan."}</p><ul><li>Leave time for sleep, meals, travel, and recovery.</li><li>Plan no more than two hard study blocks a day.</li><li>Review the proposed blocks before they go on a calendar.</li></ul><button onClick={() => setCalendarOpen(true)}>Add work hours and plan blocks</button></article>
      </section>

      <section className="course-section"><div className="section-heading"><div><p className="eyebrow">ALL CLASSES</p><h2>See the full picture at all times</h2></div><button onClick={() => setSetupOpen(true)}>Edit student setup</button></div>{plan.courses.map((course) => <article className="course-card" key={course.id}><div className="course-title"><h3>{course.name}</h3><span className={`status ${course.status.replaceAll(" ", "-").toLowerCase()}`} title={statusReason(course.status)}>{course.status} <i aria-hidden>?</i></span></div><dl><div><dt>Professor</dt><dd>{course.instructor}</dd></div><div><dt>Office hours</dt><dd>{course.officeHours}</dd></div><div><dt>Current grade</dt><dd>{course.grade}</dd></div><div><dt>Next known item</dt><dd>{course.next}</dd></div><div><dt>Completed</dt><dd>{course.completed} of {course.total} known items</dd></div></dl><div className="progress"><span style={{ width: `${course.completed / course.total * 100}%` }} /></div><p className="course-explain">{statusReason(course.status)}</p></article>)}</section>
    </section>
    {setupOpen && <dialog open className="modal"><form onSubmit={applySetup}><p className="eyebrow">FIRST-SEMESTER SETUP</p><h2>Make this yours</h2><label>How should I address you?<input name="name" defaultValue={plan.name} required /></label><label>School<input name="school" defaultValue={plan.school} required /></label><fieldset><legend>Choose a look</legend><label><input type="radio" name="theme" value="light" defaultChecked={plan.theme === "light"} /> Light</label><label><input type="radio" name="theme" value="dark" defaultChecked={plan.theme === "dark"} /> Dark</label></fieldset><p className="fine">School colors and an official logo can be added later after the student confirms the school.</p><div className="actions"><button type="button" onClick={() => setSetupOpen(false)}>Cancel</button><button className="primary" type="submit">Save setup</button></div></form></dialog>}
    {refreshOpen && <dialog open className="modal"><section><p className="eyebrow">DAILY REFRESH REVIEW</p><h2>Check what changed</h2><p>Connect a calendar, official school portal, class folder, or authorized class transcript during setup. This first version has no accounts connected, so it cannot pull new work by itself.</p><div className="review"><b>Confirmed</b><span>No new source information.</span><b>Needs confirmation</b><span>Nothing waiting for your review.</span><b>No change</b><span>Your current course list stays the same.</span></div><div className="actions"><button onClick={() => setRefreshOpen(false)}>Cancel</button><button className="primary" onClick={refresh}>Finish review</button></div></section></dialog>}
    {calendarOpen && <dialog open className="modal"><form onSubmit={addWorkHours}><p className="eyebrow">CALENDAR CAPACITY PLAN</p><h2>Start with work hours</h2><label>When do you work this week?<textarea name="workHours" defaultValue={plan.workHours} placeholder="Example: Tue 4–9 PM, Thu 5–9 PM, Sat 10 AM–4 PM" /></label><p className="fine">Next, Semester Navigator will suggest study blocks around these hours. It will not add or change calendar events until the student approves.</p><div className="actions"><button type="button" onClick={() => setCalendarOpen(false)}>Cancel</button><button className="primary" type="submit">Save and suggest blocks</button></div></form></dialog>}
  </main>;
}
