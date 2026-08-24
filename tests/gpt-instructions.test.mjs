import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const gpt = await readFile("reference/semester-navigator-gpt.md", "utf8");
const chatgptTemplate = await readFile("reference/chatgpt-template.md", "utf8");
const agentsTemplate = await readFile("reference/agents-template.md", "utf8");
const siteTemplate = JSON.parse(await readFile("reference/site-template.json", "utf8"));
const familyInstances = JSON.parse(await readFile("reference/family-gpt-instances.json", "utf8"));

test("shared-account setup creates a durable student workspace package", () => {
  assert.match(gpt, /### Student Workspace Package/);
  assert.match(gpt, /`chatgpt\.md`/);
  assert.match(gpt, /`AGENTS\.md`/);
  assert.match(gpt, /`\.semester-navigator\/profile\.json`/);
  assert.match(gpt, /`\.semester-navigator\/site\.json`/);
  assert.match(gpt, /shared ChatGPT login is one OpenAI identity/);
  assert.match(gpt, /Use the confirmed `profile_id`/);
  assert.match(gpt, /Never claim that files or folders were created unless a tool result confirms it/);
  assert.match(gpt, /leave setup marked incomplete until the student confirms they saved them/);
});

test("each student gets one isolated private Site", () => {
  assert.match(gpt, /serves exactly one student and owns exactly one private student Site/);
  assert.match(gpt, /Create exactly one private Site per confirmed `profile_id`/);
  assert.match(gpt, /must never share a Sites project, deployment URL, D1 database/);
  assert.match(gpt, /Do not add a student selector or a combined family dashboard/);
  assert.match(gpt, /never copy the canonical `\.openai\/hosting\.json`/);
  assert.match(gpt, /update that existing Site\. Do not create a duplicate Site/);
  assert.equal(siteTemplate.status, "not_created");
  assert.equal(siteTemplate.project_id, null);
  assert.equal(siteTemplate.access_mode, "owner-only");
  assert.equal(siteTemplate.storage, "dedicated-d1");
  assert.deepEqual(familyInstances.instances.map((instance) => instance.instance_key), ["son", "daughter"]);
  assert.ok(familyInstances.instances.every((instance) => instance.bound_profile_id === null));
  assert.ok(familyInstances.instances.every((instance) => instance.site_project_id === null));
  assert.equal(familyInstances.requirements.one_student_per_gpt, true);
  assert.equal(familyInstances.requirements.separate_sites_projects, true);
  assert.equal(familyInstances.requirements.separate_durable_storage, true);
  assert.equal(familyInstances.requirements.separate_browser_profiles, true);
  assert.equal(familyInstances.requirements.private_student_data_never_public, true);
  assert.equal(familyInstances.requirements.automatic_safe_updates, true);
});

test("machine readiness and browser sign-in are guided and credential-safe", () => {
  assert.match(gpt, /### Guided machine, desktop, and Site-browser readiness/);
  assert.match(gpt, /recommend it and ask permission to open the official OpenAI Windows-app page/);
  assert.match(gpt, /desktop app and your web browser keep separate sign-ins/);
  assert.match(gpt, /keeps the ChatGPT session after a full browser restart/);
  assert.match(gpt, /recommend Windows Hello or the device's built-in passkey flow/);
  assert.match(gpt, /### Reasoned source discovery and browser sign-in/);
  assert.match(gpt, /Support Brightspace, Canvas, Blackboard, Moodle, Google Classroom/);
  assert.match(gpt, /record the evidence, portal URL, confidence, and last-verified date/);
  assert.match(gpt, /browser password manager may autofill/);
  assert.match(gpt, /never open the password manager, reveal, read, copy, paste, log, or store the password/);
  assert.match(gpt, /If sign-in, Windows Hello, Touch ID, a passkey, MFA, CAPTCHA, a security prompt, or account switching is required/);
  assert.match(gpt, /Validate counts, duplicate courses, missing due dates, time zone/);
});

test("setup stops on student, path, and connected-account mismatches", () => {
  assert.match(gpt, /Check that the current local root matches the approved root/);
  assert.match(gpt, /Compare it with the expected account/);
  assert.match(gpt, /If identity, path, or account verification fails/);
  assert.match(gpt, /Never request or store passwords/);
  assert.match(gpt, /environment file is configuration, not permission enforcement/);
});

test("generated templates preserve the same boundaries", () => {
  assert.match(chatgptTemplate, /## Workspace boundary/);
  assert.match(chatgptTemplate, /## Expected accounts/);
  assert.match(chatgptTemplate, /## Connected sources/);
  assert.match(chatgptTemplate, /## Student Site/);
  assert.match(chatgptTemplate, /## Computer and ChatGPT access/);
  assert.match(chatgptTemplate, /## Template updates/);
  assert.match(chatgptTemplate, /must not share a Sites project, URL, storage binding/);
  assert.match(chatgptTemplate, /Stop on a student, path, or account mismatch/);
  assert.match(agentsTemplate, /Before doing any work, read `chatgpt\.md`/);
  assert.match(agentsTemplate, /Never read, search, summarize, copy, move, or change another student/);
  assert.match(agentsTemplate, /Never deploy a student Site from the canonical template project/);
  assert.match(agentsTemplate, /Use browser-managed autofill without inspecting the saved password/);
  assert.match(agentsTemplate, /Filesystem permissions and external-service authentication/);
  assert.match(agentsTemplate, /Use available tools to do technical\s+work/i);
  assert.match(agentsTemplate, /owner-only or selected-user access/);
  assert.match(agentsTemplate, /never public access/);
  assert.match(agentsTemplate, /recovery backup/);
  assert.match(agentsTemplate, /Ask permission to update that exact existing Site/);
  assert.match(agentsTemplate, /Never create a replacement Site for an update/);
  assert.equal(siteTemplate.schema_version, 2);
  assert.equal(siteTemplate.audience.mode, "owner-only");
});

test("automatic updates preserve student state and roll back failed releases", () => {
  assert.match(gpt, /### Automatic template updates/);
  assert.match(gpt, /never manage or replace `chatgpt\.md`/);
  assert.match(gpt, /`\.openai\/hosting\.json`/);
  assert.match(gpt, /Back up\s+changed template files/);
  assert.match(gpt, /restore the backup automatically when verification fails/);
  assert.match(gpt, /last verified local\s+release/);
  assert.match(gpt, /Pulling files does not by itself change an already deployed Site/);
  assert.match(gpt, /update the same project rather than creating another one/);
});
