/** Student-owned data. Relative legacy dates are deliberately not promoted to deadlines. */
export class PlanError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "PlanError";
    this.status = status;
  }
}
const fail = (message) => {
  throw new PlanError(message);
};
const object = (v, label) => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    fail(`${label} must be an object.`);
  return v;
};
const text = (v, label, max = 500, fallback = "") => {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "string" || v.length > max)
    fail(`${label} must be text of at most ${max} characters.`);
  return v;
};
const number = (v, label, min = 0, max = 1e6, fallback = 0) => {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    fail(`${label} must be a number between ${min} and ${max}.`);
  return v;
};
const integer = (v, label, max = 1e6, fallback = 0) => {
  const n = number(v, label, 0, max, fallback);
  if (!Number.isInteger(n)) fail(`${label} must be a whole number.`);
  return n;
};
const choice = (v, label, values, fallback) => {
  if (v === undefined || v === null) return fallback;
  if (!values.includes(v)) fail(`${label} must be ${values.join(", ")}.`);
  return v;
};
const list = (v, label, max) => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > max)
    fail(`${label} must be a list of at most ${max} items.`);
  return v;
};
const id = (v, label) => {
  const result = text(v, label, 160);
  if (!result.trim())
    fail(`${label} is required and must stay stable between imports.`);
  return result;
};
const boolean = (v, label, fallback = false) => {
  if (v === undefined) return fallback;
  if (typeof v !== "boolean") fail(`${label} must be true or false.`);
  return v;
};
// Keep omission information through normalize-then-merge without adding fields to
// saved JSON. Defaults make plans renderable; they are not newly extracted facts.
const importedFields = new WeakMap();
function fromSource(result, source) {
  importedFields.set(
    result,
    importedFields.get(source) ?? new Set(Object.keys(source)),
  );
  return result;
}
function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value.id)) fail(`${label} contains duplicate ID ${value.id}.`);
    seen.add(value.id);
  }
  return values;
}
function webUrl(v, label) {
  const value = text(v, label, 2048);
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      fail(`${label} must be an HTTP(S) link without credentials.`);
  } catch {
    fail(`${label} must be an HTTP(S) link without credentials.`);
  }
  return value;
}
function calendarDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === v;
}
export function normalizeDueAt(v, label = "Deadline") {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string")
    fail(
      `${label} must be YYYY-MM-DD or an ISO timestamp with a timezone offset.`,
    );
  if (calendarDate(v)) return v;
  if (
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(
      v,
    ) &&
    calendarDate(v.slice(0, 10)) &&
    Number.isFinite(Date.parse(v))
  )
    return new Date(v).toISOString();
  fail(
    `${label} must be a real YYYY-MM-DD date or ISO timestamp with a timezone offset; relative dates need confirmation.`,
  );
}
function timestamp(v, label) {
  if (!v) return null;
  const value = normalizeDueAt(v, label);
  if (value?.length === 10)
    fail(`${label} needs a timestamp including its timezone.`);
  return value;
}
function timezone(v) {
  const zone = text(v, "Timezone", 100, "UTC");
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
  } catch {
    fail(
      "Timezone must be a recognized IANA timezone, such as America/New_York.",
    );
  }
  return zone;
}
export const SOURCE_PROVIDERS = ['unknown','google-drive','google-classroom','canvas','brightspace','schoology','moodle','blackboard','powerschool','other'];
export const SOURCE_SCOPES = ['course-list','assignments','grades','materials','rubrics','announcements'];
const sameIdentity = (a,b) => {
  const first=a.trim(),second=b.trim();
  return first && second && (first.includes('@') && second.includes('@') ? first.toLowerCase()===second.toLowerCase() : first===second);
};
const coverageKey = record => `${record.courseId ?? ''}:${record.scope}`;
function normalizeSource(value) {
  const s=object(value,'Source');
  const provider=choice(s.provider,'Source provider',SOURCE_PROVIDERS,'unknown');
  const accessMode=choice(s.accessMode,'Source access mode',['none','manual','connector','browser'],s.status==='manual'?'manual':'none');
  const raw=s.connection===undefined?{}:object(s.connection,'Source connection');
  const connection={
    state:choice(raw.state,'Source connection state',['unverified','verified','needs-sign-in','blocked','wrong-account'],'unverified'),
    tool:text(raw.tool,'Source connection tool',300),evidence:text(raw.evidence,'Source connection evidence',2000),
    checkedAt:timestamp(raw.checkedAt,'Source connection check time'),lastVerifiedAt:timestamp(raw.lastVerifiedAt,'Source last verified connection'),
    expectedIdentity:text(raw.expectedIdentity,'Expected source identity',300),observedIdentity:text(raw.observedIdentity,'Observed source identity',300),
    identityStorageApproved:boolean(raw.identityStorageApproved,'Source identity storage approval'),
    lastError:text(raw.lastError,'Source connection error',2000),nextAction:text(raw.nextAction,'Source next action',2000),
  };
  if((connection.expectedIdentity||connection.observedIdentity)&&!connection.identityStorageApproved)fail('Saving source identities requires the existing approved setup/source preview to cover this record. Do not store unapproved account identifiers.');
  if(connection.state==='verified') {
    if(!['connector','browser'].includes(accessMode)||!connection.tool.trim()||!connection.evidence.trim()||!connection.checkedAt)fail('A verified source connection requires its actual browser/connector tool, evidence, and check timestamp.');
    if(!sameIdentity(connection.expectedIdentity,connection.observedIdentity))fail('The exposed source account does not match the intended student identity. Stop and select the correct account.');
    connection.lastVerifiedAt=connection.checkedAt;
  }
  fromSource(connection,raw);
  const coverage=list(s.coverage,'Source coverage',1000).map(value=>{
    const c=object(value,'Source coverage');
    const scope=choice(c.scope,'Source coverage scope',SOURCE_SCOPES,'materials');
    const courseId=c.courseId===null||c.courseId===undefined?null:id(c.courseId,'Coverage course ID');
    if((scope==='course-list')!==(courseId===null))fail('Use a null coverage courseId only for the course-list scope; every other scope needs its course ID.');
    const result={courseId,scope,status:choice(c.status,'Source coverage status',['checked','missing','blocked','unknown'],'unknown'),checkedAt:timestamp(c.checkedAt,'Coverage check time'),evidence:text(c.evidence,'Coverage evidence',2000),itemCount:c.itemCount===undefined||c.itemCount===null?null:integer(c.itemCount,'Coverage item count'),pagesChecked:integer(c.pagesChecked,'Coverage pages checked',10000),paginationComplete:boolean(c.paginationComplete,'Coverage pagination complete'),note:text(c.note,'Coverage note',2000)};
    if(result.status!=='unknown'&&(!result.checkedAt||!result.evidence.trim()))fail('A checked, missing, or blocked source scope needs evidence and its actual check timestamp.');
    if(result.status==='checked'){
      if(!result.pagesChecked||!result.paginationComplete)fail('A scope cannot be marked checked until every available page was read and paginationComplete is true. Record partial or blocked coverage instead.');
      if(provider==='google-drive'&&!['materials','rubrics'].includes(scope))fail('Google Drive access verifies only the materials and rubric documents actually read. It does not establish Google Classroom course lists, assignments, grades, or announcements.');
      if(accessMode==='manual') {if(!s.verified||!s.lastChecked)fail('Manual source coverage requires a verified read and last-checked timestamp.');}
      else if(!connection.lastVerifiedAt)fail('Course coverage cannot be checked before the actual source connection and student account have been verified.');
    }
    return fromSource(result,c);
  });
  if(new Set(coverage.map(coverageKey)).size!==coverage.length)fail('Source coverage contains a duplicate course/scope record.');
  const stateStatus=connection.state==='verified'?'connected':connection.state==='needs-sign-in'?'needs-sign-in':['blocked','wrong-account'].includes(connection.state)?'not-connected':null;
  const result={id:id(s.id,'Source ID'),title:text(s.title,'Source title'),url:webUrl(s.url,'Source link'),type:text(s.type,'Source type',80,'manual'),status:stateStatus??choice(s.status,'Source status',['not-connected','manual','connected','needs-sign-in'],'not-connected'),lastChecked:timestamp(s.lastChecked,'Source last checked'),verified:boolean(s.verified,'Source verification'),verificationNote:text(s.verificationNote,'Source verification note',2000),provider,accessMode,connection,coverage};
  if(connection.state==='verified')result.verified=true;
  if(result.status==='connected'&&(!result.verified||(!result.lastChecked&&connection.state!=='verified')))fail(`Connected source ${result.title||result.id} requires a verified account check and last-checked timestamp.`);
  return fromSource(result,s);
}
export function normalizePlan(raw, expectedProfileId) {
  const r = object(raw, "Plan");
  if (
    r.schemaVersion !== undefined &&
    r.schemaVersion !== 1 &&
    r.schemaVersion !== 2
  )
    fail("This plan version is unsupported.");
  const profileId = id(r.profileId, "Student profile ID");
  if (expectedProfileId && profileId !== expectedProfileId)
    fail("This plan belongs to a different student profile.");
  const courses = unique(
    list(r.courses, "Courses", 100).map((value) => {
      const c = object(value, "Course");
      const resources = unique(
        list(c.resources, "Course resources", 200).map((value) => {
          const s = object(value, "Resource");
          return fromSource(
            {
              id: id(s.id, "Resource ID"),
              title: text(s.title, "Resource title"),
              url: webUrl(s.url, "Resource link"),
              kind: text(s.kind, "Resource kind", 80, "other"),
            },
            s,
          );
        }),
        "Course resources",
      );
      const gradingComponents = unique(
        list(c.gradingComponents, "Grading components", 300).map((value) => {
          const g = object(value, "Grade component");
          if (
            g.score !== null &&
            g.score !== undefined &&
            (g.possible === undefined || g.possible === null)
          )
            fail(
              `Grade component ${g.title || g.id || ""} needs its actual possible points when a score is supplied. Use 100 only for an explicitly reported percentage.`,
            );
          return fromSource(
            {
              id: id(g.id, "Grade component ID"),
              title: text(g.title, "Grade component title"),
              weight: number(g.weight, "Grade weight", 0, 100),
              score:
                g.score === null || g.score === undefined
                  ? null
                  : number(g.score, "Grade score"),
              possible: number(
                g.possible,
                "Possible grade points",
                0.00001,
                1e6,
                100,
              ),
              finalized: boolean(g.finalized, "Grade component finalized"),
            },
            g,
          );
        }),
        "Grading components",
      );
      const total = integer(c.total, "Course total");
      return fromSource(
        {
          id: id(c.id, "Course ID"),
          name: text(c.name, "Course name"),
          instructor: text(c.instructor, "Instructor"),
          officeHours: text(c.officeHours, "Office hours"),
          grade: text(c.grade, "Grade"),
          status: choice(
            c.status,
            "Course status",
            ["On track", "Needs draft", "Needs attention"],
            "On track",
          ),
          next: text(c.next, "Next course item"),
          completed: Math.min(
            integer(c.completed, "Completed course items"),
            total,
          ),
          total,
          goalGrade:
            c.goalGrade === undefined ||
            c.goalGrade === null ||
            c.goalGrade === ""
              ? null
              : number(c.goalGrade, "Goal grade", 0, 100),
          resources,
          gradingComponents,
        },
        c,
      );
    }),
    "Courses",
  );
  const tasks = unique(
    list(r.tasks, "Tasks", 5000).map((value) => {
      const t = object(value, "Task");
      const course = text(t.course, "Task course");
      const matching = courses.filter((c) => c.name === course);
      const courseId = text(
        t.courseId,
        "Task course ID",
        160,
        matching.length === 1 ? matching[0].id : "",
      );
      if (courseId && !courses.some((c) => c.id === courseId))
        fail(
          `Task ${t.title || t.id} refers to an unknown course ID ${courseId}.`,
        );
      const legacyDue =
        typeof t.when === "string" && /^\d{4}-\d{2}-\d{2}/.test(t.when)
          ? t.when
          : null;
      return fromSource(
        {
          id: id(t.id, "Task ID"),
          courseId,
          course: course || courses.find((c) => c.id === courseId)?.name || "",
          title: text(t.title, "Task title"),
          dueAt: normalizeDueAt(t.dueAt === undefined ? legacyDue : t.dueAt),
          when: text(t.when, "Legacy deadline label"),
          minutes: integer(t.minutes, "Estimated minutes", 1440),
          state: choice(t.state, "Task state", ["now", "next", "done"], "next"),
          reason: text(t.reason, "Task reason", 2000),
          sourceUrl: webUrl(t.sourceUrl, "Task source link"),
          rubric: text(t.rubric, "Rubric", 20000),
          notes: text(t.notes, "Task notes", 20000),
          priority: choice(
            t.priority,
            "Task priority",
            ["normal", "high"],
            "normal",
          ),
        },
        t,
      );
    }),
    "Tasks",
  );
  const sources = unique(
    list(r.sources, "Sources", 100).map(normalizeSource),
    "Sources",
  );
  const reminders = unique(
    list(r.reminders, "Reminders", 200).map((value) => {
      const s = object(value, "Reminder");
      const result = {
        id: id(s.id, "Reminder ID"),
        title: text(s.title, "Reminder title"),
        schedule: text(s.schedule, "Reminder schedule", 2000),
        enabled: boolean(s.enabled, "Reminder enabled"),
        status: choice(
          s.status,
          "Reminder status",
          ["plan-only", "scheduled", "paused"],
          "plan-only",
        ),
        provider: choice(
          s.provider,
          "Reminder provider",
          ["chatgpt", "calendar", "none"],
          "none",
        ),
        toolId: s.toolId ? text(s.toolId, "Reminder tool ID", 300) : null,
        verifiedAt: timestamp(s.verifiedAt, "Reminder verification time"),
      };
      if (
        result.status === "scheduled" &&
        (result.provider === "none" ||
          !result.toolId ||
          !result.verifiedAt ||
          !result.enabled)
      )
        fail(
          "A scheduled reminder needs an enabled provider, a confirmed tool ID and verification timestamp.",
        );
      return result;
    }),
    "Reminders",
  );
  const accentColor = text(r.accentColor, "Accent color", 7, "#255f4b");
  if (!/^#[0-9a-fA-F]{6}$/.test(accentColor))
    fail("Accent color must be a six-digit hex color, such as #255f4b.");
  return {
    schemaVersion: 2,
    revision: integer(r.revision, "Plan revision"),
    seedRevision: text(r.seedRevision, "Seed revision", 100),
    profileId,
    name: text(r.name, "Student name"),
    school: text(r.school, "School"),
    theme: choice(r.theme, "Theme", ["light", "dark"], "light"),
    workHours: text(r.workHours, "Work hours", 4000),
    refreshedAt: text(r.refreshedAt, "Refresh time", 500, "Not refreshed yet"),
    timezone: timezone(r.timezone),
    semester: text(r.semester, "Semester"),
    educationLevel: choice(
      r.educationLevel,
      "Education level",
      ["college", "high-school", "other"],
      "other",
    ),
    accentColor,
    courses,
    tasks,
    sources,
    reminders,
  };
}
export function validatePlan(raw, expectedProfileId) {
  if (raw?.schemaVersion !== 2)
    fail(
      "Use the version 2 plan format. Reload the dashboard or normalize an imported plan first.",
    );
  return normalizePlan(raw, expectedProfileId);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Three-way merge: a changed seed updates only fields not edited since its last baseline.
 * Explicit imports add confirmed facts, preserving known facts when extraction is incomplete.
 * Absent records are retained, so a partial extraction cannot delete student work. */
export function mergeImportedPlan(currentRaw, incomingRaw, baselineRaw) {
  const current = normalizePlan(currentRaw);
  let incomingInput=incomingRaw;
  if(!baselineRaw&&Array.isArray(incomingRaw?.sources)){
    incomingInput={...incomingRaw,sources:incomingRaw.sources.map(raw=>{
      const previous=current.sources.find(source=>source.id===raw?.id);if(!previous)return raw;
      const supplied=importedFields.get(raw)??new Set(Object.keys(raw));
      // A JSON export loses the WeakMap's omission metadata. Neutral defaults
      // still are not newly observed facts; clear or revoke them by direct edit.
      const sourceDefaults={provider:'unknown',accessMode:'none',status:'not-connected',type:'manual',verified:false};
      const meaningful=(key,value,defaults)=>value!==null&&value!==undefined&&!(typeof value==='string'&&!value.trim())&&!(Object.hasOwn(defaults,key)&&value===defaults[key]);
      const patch=Object.fromEntries(Object.entries(raw).filter(([key,value])=>supplied.has(key)&&meaningful(key,value,sourceDefaults)));
      let connectionPatch=patch.connection?Object.fromEntries(Object.entries(patch.connection).filter(([key,value])=>(importedFields.get(patch.connection)??new Set(Object.keys(patch.connection))).has(key)&&meaningful(key,value,{state:'unverified',identityStorageApproved:false}))):null;
      const incomingCheck=timestamp(connectionPatch?.checkedAt,'Source connection check time');
      if(incomingCheck&&previous.connection.checkedAt&&incomingCheck<previous.connection.checkedAt){connectionPatch=null;delete patch.connection;}
      if(previous.connection.expectedIdentity&&connectionPatch?.expectedIdentity&&!sameIdentity(previous.connection.expectedIdentity,connectionPatch.expectedIdentity))fail('This source import changes the saved intended account. Review that account change directly before importing source data.');
      if(connectionPatch)patch.connection=connectionPatch;
      const connection=connectionPatch?fromSource({...previous.connection,...connectionPatch},connectionPatch):previous.connection;
      return fromSource({...previous,...patch,connection},patch);
    })};
  }
  const incoming = normalizePlan(incomingInput, current.profileId);
  const baseline = baselineRaw
    ? normalizePlan(baselineRaw, current.profileId)
    : null;
  const mergeObject = (local, remote, base, kind) => {
    const result = { ...local };
    for (const [key, value] of Object.entries(remote)) {
      if (
        key === "id" ||
        (kind === "task" && key === "state" && local.state === "done")
      )
        continue;
      if (
        kind === "task" &&
        ["notes", "rubric"].includes(key) &&
        local[key] &&
        !base
      )
        continue;
      if (
        !baseline &&
        ["course", "task", "resource", "component", "source", "connection", "coverage"].includes(kind)
      ) {
        const supplied = importedFields.get(remote);
        const derived =
          kind === "task" &&
          ((key === "course" && supplied?.has("courseId")) ||
            (key === "courseId" && supplied?.has("course")) ||
            (key === "dueAt" && supplied?.has("when")));
        if(kind==='connection'&&['lastError','nextAction'].includes(key)&&remote.state==='verified'&&supplied?.has('state')){result[key]=value;continue;}
        if (
          (!supplied?.has(key) && !derived) ||
          value === null ||
          (typeof value === "string" && !value.trim())
        )
          continue;
        if(kind==='source'&&key==='lastChecked'&&local.lastChecked&&value<local.lastChecked)continue;
        if(kind==='source'&&key==='connection'){result.connection=mergeObject(local.connection,value,null,'connection');continue;}
        if(kind==='source'&&key==='coverage'){
          const records=new Map(local.coverage.map(record=>[coverageKey(record),record]));
          for(const record of value){
            const recordKey=coverageKey(record),previous=records.get(recordKey);
            // An older exported check cannot undo a later read, failed session,
            // or login-only recovery that still needs its coursework rechecked.
            const accessCheck=local.connection.checkedAt;
            if(record.checkedAt&&((previous?.checkedAt&&record.checkedAt<previous.checkedAt)||(accessCheck&&record.checkedAt<accessCheck)||(accessCheck&&record.checkedAt===accessCheck&&record.status==='checked'&&['needs-sign-in','wrong-account','blocked'].includes(local.connection.state))))continue;
            records.set(recordKey,previous?mergeObject(previous,record,null,'coverage'):record);
          }
          result.coverage=[...records.values()];continue;
        }
        if (
          kind === "task" &&
          key === "minutes" &&
          value === 0 &&
          local.minutes > 0
        )
          continue;
        if (
          kind === "task" &&
          key === "priority" &&
          value === "normal" &&
          local.priority === "high"
        )
          continue;
        if (
          kind === "component" &&
          ["possible", "finalized"].includes(key) &&
          remote.score === null &&
          local.score !== null
        )
          continue;
        if (
          kind === "course" &&
          ["resources", "gradingComponents"].includes(key)
        ) {
          const records = new Map(local[key].map((item) => [item.id, item]));
          for (const item of value)
            records.set(
              item.id,
              records.has(item.id)
                ? mergeObject(
                    records.get(item.id),
                    item,
                    null,
                    key === "resources" ? "resource" : "component",
                  )
                : item,
            );
          result[key] = [...records.values()];
          continue;
        }
      }
      if (!base || (!same(value, base[key]) && same(local[key], base[key])))
        result[key] = value;
    }
    if(kind==='source'&&!baseline&&['needs-sign-in','wrong-account','blocked'].includes(result.connection.state)){
      result.coverage=result.coverage.map(record=>record.status==='checked'?{...record,status:'unknown',note:record.note?'Previous check retained; recheck after the access interruption. '+record.note:'Previous check retained; recheck after the access interruption.'}:record);
      result.lastChecked=local.lastChecked;result.verified=false;
    }
    return result;
  };
  const result = { ...current };
  const collections = {
    courses: "course",
    tasks: "task",
    sources: "source",
    reminders: "reminder",
  };
  for (const key of [
    "name",
    "school",
    "theme",
    "workHours",
    "refreshedAt",
    "timezone",
    "semester",
    "educationLevel",
    "accentColor",
  ]) {
    if (
      (!baseline && !current[key]) ||
      (baseline &&
        !same(incoming[key], baseline[key]) &&
        same(current[key], baseline[key]))
    )
      result[key] = incoming[key];
  }
  for (const [key, kind] of Object.entries(collections)) {
    const existing = new Map(current[key].map((item) => [item.id, item]));
    const base = new Map(
      (baseline?.[key] ?? []).map((item) => [item.id, item]),
    );
    for (const item of incoming[key]) {
      // A record present in the baseline but removed locally is a deliberate deletion.
      if (!existing.has(item.id) && base.has(item.id)) continue;
      existing.set(
        item.id,
        existing.has(item.id)
          ? mergeObject(existing.get(item.id), item, base.get(item.id), kind)
          : item,
      );
    }
    result[key] = [...existing.values()];
  }
  const retainedCourseIds = new Set(result.courses.map((course) => course.id));
  result.tasks = result.tasks.map((task) =>
    task.courseId && !retainedCourseIds.has(task.courseId)
      ? {
          ...task,
          courseId: "",
          reason:
            task.reason ||
            "Confirm the course for this imported assignment; its earlier course was removed locally.",
        }
      : task,
  );
  return normalizePlan(result, current.profileId);
}
/** Record only tool-observed source state. This does not connect or read a service. */
export function recordSourceCheck(planRaw,inputRaw) {
  const input=object(inputRaw,'Source check');const profileId=id(input.profileId,'Source check student profile ID');const plan=normalizePlan(planRaw,profileId);
  const incoming=object(input.source,'Source check record');const sourceId=id(incoming.id,'Source ID');const previous=plan.sources.find(source=>source.id===sourceId);
  if(previous?.connection.expectedIdentity&&incoming.connection?.expectedIdentity&&!sameIdentity(previous.connection.expectedIdentity,incoming.connection.expectedIdentity))fail('This check changes the saved intended account. Review that account change directly before checking the source.');
  const connection={...(previous?.connection??{}),...(incoming.connection??{})};
  const mismatch=connection.expectedIdentity&&connection.observedIdentity&&!sameIdentity(connection.expectedIdentity,connection.observedIdentity);
  const denied=mismatch||['wrong-account','needs-sign-in','blocked'].includes(connection.state);
  if(mismatch){connection.state='wrong-account';connection.lastError='The exposed account does not match the intended student account.';connection.nextAction='Select the intended school account, then verify this source again.';}
  else if(incoming.connection?.state==='verified'){
    if(!incoming.connection.checkedAt||!incoming.connection.tool||!incoming.connection.evidence||!incoming.connection.observedIdentity)fail('A new verified source check needs the actual tool, evidence, time, and freshly exposed account identity.');
    connection.lastError=incoming.connection.lastError??'';connection.nextAction=incoming.connection.nextAction??'';
  }
  const coverage=new Map((previous?.coverage??[]).map(record=>[coverageKey(record),denied&&record.status==='checked'?{...record,status:'unknown',note:record.note?'Previous check retained; recheck after the access interruption. '+record.note:'Previous check retained; recheck after the access interruption.'}:record]));
  if(!denied)for(const record of incoming.coverage??[]){if(record.courseId&&!plan.courses.some(course=>course.id===record.courseId))fail(`Add or confirm course ${record.courseId} in this student plan before recording its source coverage.`);coverage.set(coverageKey(record),record);}
  const source=normalizeSource({...previous,...incoming,connection,coverage:[...coverage.values()],...(denied?{verified:false,lastChecked:previous?.lastChecked??null}:{})});
  if(connection.state==='verified')source.lastChecked=(incoming.coverage??[]).filter(record=>record.status==='checked').map(record=>timestamp(record.checkedAt,'Coverage check time')).filter(Boolean).sort().at(-1)??previous?.lastChecked??null;
  return normalizePlan({...plan,sources:previous?plan.sources.map(item=>item.id===sourceId?source:item):[...plan.sources,source]},profileId);
}
export function expireSourceAccess(planRaw,inputRaw) {
  const input=object(inputRaw,'Source expiry');const profileId=id(input.profileId,'Source expiry student profile ID');const plan=normalizePlan(planRaw,profileId);const sourceId=id(input.sourceId,'Source ID');const source=plan.sources.find(item=>item.id===sourceId);
  if(!source)fail('This student plan has no source with that ID.');
  const checkedAt=timestamp(input.checkedAt,'Source expiry check time');if(!checkedAt)fail('Source expiry needs the actual failed check timestamp.');
  return recordSourceCheck(plan,{profileId,source:{id:sourceId,connection:{state:'needs-sign-in',checkedAt,lastError:text(input.reason,'Source expiry reason',2000,'The source requires sign-in again.'),nextAction:text(input.nextAction,'Source next action',2000,'Sign in to the intended school account, then resume the unfinished source check.')}}});
}
export function sourceCoverageSummary(sourceRaw,courseIds,scopes=SOURCE_SCOPES) {
  const source=normalizeSource(sourceRaw);const connectionVerified=source.connection.state==='verified';
  const manual=source.accessMode==='manual'&&source.verified;const current=connectionVerified||manual;
  const wanted=courseIds??[...new Set(source.coverage.map(record=>record.courseId).filter(Boolean))];
  const coverage=new Map(source.coverage.map(record=>[coverageKey(record),record]));const gaps=[];
  for(const scope of scopes)if(!SOURCE_SCOPES.includes(scope))fail('Unknown requested source coverage scope.');
  const targets=[...(scopes.includes('course-list')?[{courseId:null,scope:'course-list'}]:[]),...wanted.flatMap(courseId=>scopes.filter(scope=>scope!=='course-list').map(scope=>({courseId,scope})))];
  for(const {courseId,scope}of targets){const record=coverage.get(`${courseId??''}:${scope}`);if(!record||record.status!=='checked'||!current)gaps.push(`${courseId??'School'}: ${scope} ${record?.status==='checked'?'needs rechecking':record?.status??'unknown'}${record?.note?' ('+record.note+')':''}`);}
  const checkedCount=current?source.coverage.filter(record=>record.status==='checked').length:0;
  const labels={'unverified':'Connection not verified. Course access is unknown.','needs-sign-in':'Sign-in is needed again. Saved coursework is retained.','wrong-account':'Wrong account. Select the intended school account.','blocked':'Source access is blocked. Saved coursework is retained.'};
  const label=manual?'Manual source; no live school connection.':!connectionVerified?labels[source.connection.state]:source.provider==='google-drive'?'Google Drive materials access was verified. Classroom access is not established.':`${source.provider==='unknown'?'Portal verified; service not identified.':'Source connection was verified.'} ${checkedCount} scope checks recorded${gaps.length?`; ${gaps.length} gaps remain`:'. Course access is limited to the recorded checks.'}`;
  return {label,connectionVerified,checkedCount,gaps,canRefresh:connectionVerified};
}
export function dateInTimezone(now = new Date(), zone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)?.value)
    .join("-");
}
const addDays = (day, n) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000)
    .toISOString()
    .slice(0, 10);
function dueDate(task, zone) {
  return !task.dueAt
    ? null
    : task.dueAt.length === 10
      ? task.dueAt
      : dateInTimezone(new Date(task.dueAt), zone);
}
function overdue(task, plan, now) {
  if (!task.dueAt || task.state === "done") return false;
  return task.dueAt.length === 10
    ? task.dueAt < dateInTimezone(now, plan.timezone)
    : Date.parse(task.dueAt) < +new Date(now);
}
export function tasksForView(planRaw, view, now = new Date()) {
  const plan = normalizePlan(planRaw);
  const today = dateInTimezone(now, plan.timezone);
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const nextMonday = addDays(today, 7 - weekday);
  return plan.tasks
    .filter((task) => {
      const day = dueDate(task, plan.timezone);
      if (view === "semester") return true;
      if (view === "unknown") return !day;
      if (view === "overdue") return overdue(task, plan, now);
      if (!day) return false;
      if (view === "today") return day === today || overdue(task, plan, now);
      if (view === "tomorrow") return day === addDays(today, 1);
      if (view === "week")
        return (
          (day >= today && day < addDays(today, 7)) || overdue(task, plan, now)
        );
      if (view === "nextWeek")
        return day >= nextMonday && day < addDays(nextMonday, 7);
      return false;
    })
    .sort(
      (a, b) =>
        (a.state === "done") - (b.state === "done") ||
        (dueDate(a, plan.timezone) || "9999").localeCompare(
          dueDate(b, plan.timezone) || "9999",
        ) ||
        (a.dueAt && b.dueAt && a.dueAt.length > 10 && b.dueAt.length > 10
          ? Date.parse(a.dueAt) - Date.parse(b.dueAt)
          : 0) ||
        (a.priority === "high" ? -1 : 0) - (b.priority === "high" ? -1 : 0) ||
        a.id.localeCompare(b.id),
    );
}
export function formatDue(taskOrDueAt, zone = "UTC", now = new Date()) {
  const dueAt =
    typeof taskOrDueAt === "object" && taskOrDueAt
      ? taskOrDueAt.dueAt
      : taskOrDueAt;
  if (!dueAt) return "Deadline needs confirmation";
  const value = normalizeDueAt(dueAt);
  const day =
    value.length === 10 ? value : dateInTimezone(new Date(value), zone);
  const today = dateInTimezone(now, zone);
  const label =
    day === today
      ? "Today"
      : day === addDays(today, 1)
        ? "Tomorrow"
        : new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${day}T12:00:00Z`));
  return value.length === 10
    ? `${label} · time not provided`
    : `${label} · ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone, timeZoneName: "short" }).format(new Date(value))}`;
}
export function getCourseHealth(planRaw, courseId, now = new Date()) {
  const plan = normalizePlan(planRaw);
  const course = plan.courses.find((c) => c.id === courseId);
  const tasks = plan.tasks.filter(
    (t) =>
      t.courseId === courseId || (!t.courseId && t.course === course?.name),
  );
  const completed = tasks.filter((t) => t.state === "done").length;
  const late = tasks.filter((t) => overdue(t, plan, now)).length;
  const unknownDeadlines = tasks.filter(
    (t) => !t.dueAt && t.state !== "done",
  ).length;
  const missing = !tasks.length || unknownDeadlines > 0;
  const grades = course ? gradeSummary(course) : null;
  const reportedMatch = course?.grade?.trim().match(/^(\d+(?:\.\d+)?)\s*%$/);
  const reported =
    reportedMatch && Number(reportedMatch[1]) <= 100
      ? Number(reportedMatch[1])
      : null;
  const gradeValue = reported ?? grades?.current ?? null;
  const gradeRisk =
    gradeValue !== null &&
    grades?.goal !== null &&
    grades?.goal !== undefined &&
    gradeValue < grades.goal;
  return {
    status:
      late || gradeRisk
        ? "Needs attention"
        : missing
          ? "Missing information"
          : "On track",
    reason: late
      ? `${late} unfinished item${late === 1 ? " is" : "s are"} overdue.`
      : gradeRisk
        ? `The ${reported !== null ? "reported" : "calculated"} grade is below the chosen goal.`
        : !tasks.length
          ? "No assignments have been added yet."
          : unknownDeadlines
            ? `${unknownDeadlines} deadline${unknownDeadlines === 1 ? " needs" : "s need"} confirmation.`
            : "No known overdue work or calculated grade warning.",
    completed,
    total: tasks.length,
    overdue: late,
    unknownDeadlines,
  };
}
export function gradeSummary(course) {
  const parts = course.gradingComponents ?? [];
  const goal = course.goalGrade ?? null;
  const warnings = [];
  if (!parts.length)
    return {
      current: null,
      goal,
      remainingWeight: null,
      neededOnRemaining: null,
      warnings: ["Add grading weights and earned scores to calculate a grade."],
    };
  const total = parts.reduce((sum, p) => sum + p.weight, 0);
  const graded = parts.filter((p) => p.score !== null && p.score !== undefined);
  const gradedWeight = graded.reduce((sum, p) => sum + p.weight, 0);
  if (total > 100.000001)
    return {
      current: null,
      goal,
      remainingWeight: null,
      neededOnRemaining: null,
      warnings: ["Grading weights exceed 100%. Check the syllabus."],
    };
  if (Math.abs(total - 100) > 0.000001)
    warnings.push(
      `Only ${total}% of the grading weights are entered; the final-grade projection is unavailable.`,
    );
  const currentPoints = graded.reduce(
    (sum, p) => sum + (p.weight * p.score) / p.possible,
    0,
  );
  const current =
    gradedWeight > 0 ? (100 * currentPoints) / gradedWeight : null;
  const finalized = graded.filter((p) => p.finalized === true);
  const provisional = graded.filter((p) => p.finalized !== true);
  const finalizedWeight = finalized.reduce((sum, p) => sum + p.weight, 0);
  const finalizedPoints = finalized.reduce(
    (sum, p) => sum + (p.weight * p.score) / p.possible,
    0,
  );
  const remainingWeight = 100 - finalizedWeight;
  if (provisional.length)
    warnings.push(
      "Some entered scores are provisional averages for unfinished work. Their full category weights have not been earned, so a required score on remaining work cannot be projected yet.",
    );
  const neededOnRemaining =
    goal !== null &&
    provisional.length === 0 &&
    Math.abs(total - 100) < 0.000001 &&
    remainingWeight > 0
      ? (100 * (goal - finalizedPoints)) / remainingWeight
      : null;
  if (neededOnRemaining !== null && neededOnRemaining > 100)
    warnings.push(
      "This goal needs more than 100% on remaining work under the entered grading rules.",
    );
  return { current, goal, remainingWeight, neededOnRemaining, warnings };
}
export function suggestStudyBlocks(planRaw, now = new Date()) {
  const plan = normalizePlan(planRaw);
  const today = dateInTimezone(now, plan.timezone);
  const blocks = [];
  const unscheduled = [];
  let slot = 0;
  for (const task of tasksForView(plan, "semester", now).filter(
    (t) => t.state !== "done",
  )) {
    if (!task.minutes) {
      unscheduled.push({
        taskId: task.id,
        title: task.title,
        reason: "Add an effort estimate before planning study time.",
      });
      continue;
    }
    let remaining = task.minutes;
    while (remaining > 0 && slot < 14) {
      const date = addDays(today, Math.floor(slot / 2));
      const deadline = dueDate(task, plan.timezone);
      if (deadline && deadline < date) break;
      const minutes = Math.min(45, remaining);
      blocks.push({
        taskId: task.id,
        title: task.title,
        date,
        start: null,
        end: null,
        minutes,
        reason:
          "Untimed proposal. Choose a free slot after checking classes, work, sleep, meals and travel.",
      });
      remaining -= minutes;
      slot++;
    }
    if (remaining > 0)
      unscheduled.push({
        taskId: task.id,
        title: task.title,
        reason: `${remaining} minutes could not fit into two proposed study blocks per day before the known deadline; revise the plan.`,
      });
  }
  return {
    blocks,
    unscheduled,
    limitations: [
      "No calendar availability was checked. These are untimed proposals, not scheduled events.",
      ...(plan.workHours
        ? [
            "Saved work hours are unstructured text; check them before choosing a time.",
          ]
        : []),
    ],
  };
}
export function seedFingerprint(raw) {
  const data = { ...normalizePlan(raw) };
  delete data.revision;
  delete data.seedRevision;
  let hash = 2166136261;
  for (const character of JSON.stringify(data)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `seed-${(hash >>> 0).toString(16)}`;
}
/** Persistence adapter must perform compare-and-swap atomically; false means a conflict. */
export function createPlanService(seedRaw, persistence) {
  const seed = normalizePlan(seedRaw);
  seed.revision = 0;
  seed.seedRevision = seedFingerprint(seed);
  async function load() {
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await persistence.read(seed.profileId);
      if (!row) return { plan: normalizePlan(seed), revision: 0 };
      let plan = normalizePlan(JSON.parse(row.payload), seed.profileId);
      plan.revision = row.revision;
      if (plan.seedRevision === seed.seedRevision && plan.schemaVersion === 2)
        return { plan, revision: row.revision };
      const baseline = row.seedPayload ? JSON.parse(row.seedPayload) : null;
      plan = mergeImportedPlan(plan, seed, baseline);
      plan.seedRevision = seed.seedRevision;
      plan.revision = row.revision + 1;
      const saved = await persistence.write(
        {
          profileId: seed.profileId,
          payload: JSON.stringify(plan),
          revision: plan.revision,
          seedPayload: JSON.stringify(seed),
        },
        row.revision,
        false,
      );
      if (saved) return { plan, revision: plan.revision };
    }
    throw new PlanError(
      "Your plan changed while it was loading. Reload and try again.",
      409,
    );
  }
  async function save(input) {
    object(input, "Save request");
    if (!Object.hasOwn(input, "baseRevision"))
      throw new PlanError(
        "This dashboard version cannot safely save changes. Reload before trying again.",
        409,
      );
    const base = integer(input.baseRevision, "Base revision");
    const incoming = validatePlan(input.plan, seed.profileId);
    const current = await load();
    if (
      current.revision !== base ||
      incoming.revision !== base ||
      incoming.seedRevision !== current.plan.seedRevision
    )
      throw new PlanError(
        "Your plan changed in another tab, device, or source import. Reload the latest plan before saving these changes.",
        409,
      );
    const plan = {
      ...incoming,
      revision: base + 1,
      seedRevision: seed.seedRevision,
    };
    const saved = await persistence.write(
      {
        profileId: seed.profileId,
        payload: JSON.stringify(plan),
        revision: plan.revision,
        seedPayload: JSON.stringify(seed),
      },
      base,
      base === 0,
    );
    if (!saved)
      throw new PlanError(
        "Another change was saved first. Reload the latest plan before saving these changes.",
        409,
      );
    return { plan, revision: plan.revision };
  }
  return { load, save };
}
