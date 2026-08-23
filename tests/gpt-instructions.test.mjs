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
});

test("source discovery and Chrome sign-in are reasoning-led and credential-safe", () => {
  assert.match(gpt, /### Reasoned source discovery and Chrome sign-in/);
  assert.match(gpt, /Support Brightspace, Canvas, Blackboard, Moodle, Google Classroom/);
  assert.match(gpt, /record the evidence, portal URL, confidence, and last-verified date/);
  assert.match(gpt, /Chrome Password Manager may autofill/);
  assert.match(gpt, /never open the password manager, reveal, read, copy, paste, log, or store the password/);
  assert.match(gpt, /If sign-in, Touch ID, MFA, CAPTCHA, a security prompt, or account switching is required/);
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
  assert.match(chatgptTemplate, /must not share a Sites project, URL, storage binding/);
  assert.match(chatgptTemplate, /Stop on a student, path, or account mismatch/);
  assert.match(agentsTemplate, /Before doing any work, read `chatgpt\.md`/);
  assert.match(agentsTemplate, /Never read, search, summarize, copy, move, or change another student/);
  assert.match(agentsTemplate, /Never deploy a student Site from the canonical template project/);
  assert.match(agentsTemplate, /Use Chrome-managed autofill without inspecting the saved password/);
  assert.match(agentsTemplate, /Filesystem permissions and external-service authentication/);
});
