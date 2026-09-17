import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CLOUD_SKILL_TEXT, CLOUD_SKILL_URI, CLOUD_TOOLS, handleCloudMcp, MAX_MCP_BODY_BYTES, MCP_PROTOCOL_VERSIONS } from '../lib/cloud-tools.mjs';
import { normalizePlan, PlanError, recordSourceCheck } from '../lib/plan-model.mjs';

const origin = 'https://semester.example';
const principal = { userId: 'account-one', scopes: ['semester:read', 'semester:write'] };
const intake = { name: 'Casey', school: 'Example School', semester: 'Fall 2026', educationLevel: 'college', timezone: 'America/New_York' };
const fixture = (profileId = 'student-one') => normalizePlan({ ...intake, profileId, revision: 1, courses: [{ id: 'biology', name: 'Biology' }], tasks: [
  { id: 'essay', courseId: 'biology', title: 'Essay', dueAt: '2026-09-25', notes: 'Student outline', minutes: 40 },
  { id: 'unknown', courseId: 'biology', title: 'Unknown deadline', dueAt: null },
] });
function repositoryFixture() {
  const rows = new Map(); const calls = []; let creations = 0;
  const key = (userId, profileId) => `${userId}\0${profileId}`;
  const copy = (value) => value ? structuredClone(value) : null;
  const seed = (userId, plan) => rows.set(key(userId, plan.profileId), { plan: structuredClone(plan), revision: plan.revision });
  seed(principal.userId, fixture()); seed('account-two', fixture('private-other-student'));
  return {
    calls, rows, seed,
    async listPlans(userId) {
      calls.push(['list', userId]);
      return [...rows.entries()].filter(([key]) => key.startsWith(`${userId}\0`)).map(([, { plan }]) => {
        const { profileId, name, school, semester, timezone, revision } = plan;
        return { profileId, name, school, semester, timezone, revision };
      });
    },
    async getPlan(userId, profileId) { calls.push(['get', userId, profileId]); return copy(rows.get(key(userId, profileId))); },
    async createPlan(userId, input) {
      calls.push(['create', userId, input]);
      const plan = normalizePlan({ ...input, profileId: `generated-${++creations}`, revision: 1 });
      seed(userId, plan); return { plan, revision: 1 };
    },
    async savePlan(userId, profileId, input) {
      calls.push(['save', userId, profileId, input]);
      const previous = rows.get(key(userId, profileId));
      if (!previous) throw new PlanError('No saved plan is available for this account and student profile.', 404);
      if (previous.revision !== input.baseRevision) throw new PlanError('Another change was saved first. Read the latest plan.', 409);
      const plan = normalizePlan(input.plan, profileId); plan.revision = input.baseRevision + 1;
      seed(userId, plan); return { plan, revision: plan.revision };
    },
  };
}
function request(message, options = {}) {
  const { headers, ...rest } = options;
  return new Request(`${origin}/api/semester-mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(message), ...rest });
}
const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
async function call(name, args = {}, options = {}) {
  const repository = options.repository ?? repositoryFixture();
  const response = await handleCloudMcp(request(rpc('tools/call', { name, arguments: args, ...options.params }), options.request), { principal, repository, origin, ...options.context });
  return { response, body: await response.json(), repository };
}
const context = (repository = repositoryFixture()) => ({ principal, repository, origin });

test('stateless initialization negotiates supported versions without a session or private data', async () => {
  for (const version of [...MCP_PROTOCOL_VERSIONS, '2099-01-01']) {
    const repository = repositoryFixture();
    const response = await handleCloudMcp(request(rpc('initialize', { protocolVersion: version, capabilities: {}, clientInfo: { name: 'test-client', version: '1.0' } })), { ...context(repository), principal: null });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.result.protocolVersion, MCP_PROTOCOL_VERSIONS.includes(version) ? version : MCP_PROTOCOL_VERSIONS[0]);
    assert.deepEqual(body.result.capabilities.extensions, { 'io.modelcontextprotocol/skills': {} });
    assert.match(body.result.instructions, /profileId separate/);
    assert.equal(response.headers.get('mcp-session-id'), null);
    assert.equal(repository.calls.length, 0);
  }
});

test('ping and initialized notifications work; notifications never execute tools', async () => {
  const repository = repositoryFixture();
  const ping = await handleCloudMcp(request(rpc('ping')), context(repository));
  assert.deepEqual((await ping.json()).result, {});
  const response = await handleCloudMcp(request({ jsonrpc: '2.0', method: 'notifications/initialized' }), context(repository));
  assert.equal(response.status, 202); assert.equal(await response.text(), '');
  const bad = await handleCloudMcp(request({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'create_student_plan', arguments: intake } }), context(repository));
  assert.equal((await bad.json()).error.code, -32600); assert.equal(repository.calls.length, 0);
});

test('catalog exposes OAuth policy, output schemas and accurate side-effect annotations', async () => {
  const response = await handleCloudMcp(request(rpc('tools/list')), { ...context(), principal: null });
  const tools = (await response.json()).result.tools;
  assert.equal(tools.length, 7);
  for (const tool of tools) {
    const write = ['create_student_plan', 'migrate_student_plan', 'update_assignment', 'save_semester_plan'].includes(tool.name);
    assert.equal(tool.annotations.readOnlyHint, !write);
    assert.equal(tool.annotations.openWorldHint, false);
    assert.equal(tool.annotations.idempotentHint, !write);
    assert.equal(tool.annotations.destructiveHint, ['update_assignment', 'save_semester_plan'].includes(tool.name));
    assert.deepEqual(tool.securitySchemes, [{ type: 'oauth2', scopes: write ? ['semester:read', 'semester:write'] : ['semester:read'] }]);
    assert.deepEqual(tool._meta.securitySchemes, tool.securitySchemes);
    assert.equal(tool.outputSchema.type, 'object');
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
});

test('static skill catalog, resource and exact SHA-256 agree without authentication', async () => {
  const ctx = { ...context(), principal: null };
  const listed = await (await handleCloudMcp(request(rpc('skills/list', {})), ctx)).json();
  const skill = listed.result.skills[0];
  assert.equal(skill.uri, CLOUD_SKILL_URI);
  assert.equal(skill.resources[0].digest, `sha256:${createHash('sha256').update(CLOUD_SKILL_TEXT, 'utf8').digest('hex')}`);
  const fetched = await (await handleCloudMcp(request(rpc('skills/get', { uri: CLOUD_SKILL_URI })), ctx)).json();
  assert.deepEqual(fetched.result.skill, skill);
  const resource = await (await handleCloudMcp(request(rpc('resources/read', { uri: CLOUD_SKILL_URI })), ctx)).json();
  assert.deepEqual(resource.result.contents, [{ uri: CLOUD_SKILL_URI, mimeType: 'text/markdown', text: CLOUD_SKILL_TEXT }]);
  assert.match(CLOUD_SKILL_TEXT, /no replay cache or exactly-once guarantee/);
  assert.match(CLOUD_SKILL_TEXT, /needs-sign-in, blocked, or wrong-account/);
  assert.match(CLOUD_SKILL_TEXT, /ChatGPT Work cloud browser/);
  assert.match(CLOUD_SKILL_TEXT, /saved desktop verification does not establish access from the cloud browser/);
  assert.match(CLOUD_SKILL_TEXT, /draft evidence/);
  const listing = await (await handleCloudMcp(request(rpc('resources/list')), ctx)).json();
  assert.equal(listing.result.resources[0].uri, CLOUD_SKILL_URI);
  const missing = await (await handleCloudMcp(request(rpc('resources/read', { uri: 'file:///private/secret' })), ctx)).json();
  assert.equal(missing.error.code, -32002);
});

test('HTTP transport rejects unsupported methods, origins, media types and protocol headers', async () => {
  const examples = [
    [new Request(`${origin}/api/semester-mcp`), 405],
    [request(rpc('ping'), { headers: { Origin: 'https://untrusted.example' } }), 403],
    [request(rpc('ping'), { headers: { Origin: 'null' } }), 403],
    [request(rpc('ping'), { headers: { 'Content-Type': 'text/plain' } }), 415],
    [request(rpc('ping'), { headers: { Accept: 'text/event-stream' } }), 406],
    [request(rpc('ping'), { headers: { 'MCP-Protocol-Version': '1999-01-01' } }), 400],
  ];
  for (const [req, status] of examples) assert.equal((await handleCloudMcp(req, context())).status, status);
  assert.equal((await handleCloudMcp(request(rpc('ping'), { headers: { Origin: origin, 'Content-Type': 'application/json; charset=utf-8' } }), context())).status, 200);
});

test('request bodies are bounded for both declared and actual streamed byte lengths', async () => {
  const declared = await handleCloudMcp(request(rpc('ping'), { headers: { 'Content-Length': String(MAX_MCP_BODY_BYTES + 1) } }), context());
  assert.equal(declared.status, 413);
  const large = new Request(`${origin}/api/semester-mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ value: 'é'.repeat(MAX_MCP_BODY_BYTES) }) });
  assert.equal((await handleCloudMcp(large, context())).status, 413);
});

test('JSON-RPC errors distinguish malformed JSON, invalid request, unknown method and invalid params', async () => {
  const broken = await handleCloudMcp(request(rpc('ping'), { body: '{' }), context());
  assert.equal((await broken.json()).error.code, -32700);
  for (const body of [null, [], [rpc('ping')], { jsonrpc: '1.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', id: null, method: 'ping' }, rpc('ping', [])]) {
    const response = await handleCloudMcp(request(body), context());
    assert.equal((await response.json()).error.code, -32600);
  }
  assert.equal((await (await handleCloudMcp(request(rpc('unknown/method')), context())).json()).error.code, -32601);
  assert.equal((await (await handleCloudMcp(request(rpc('initialize', {})), context())).json()).error.code, -32602);
  assert.equal((await call('unknown_tool')).body.error.code, -32602);
});

test('every private tool requires a verified account and its own granted scope', async () => {
  for (const tool of CLOUD_TOOLS) {
    const repository = repositoryFixture();
    const denied = await call(tool.name, {}, { repository, context: { principal: null } });
    assert.equal(denied.response.status, 401);
    assert.match(denied.response.headers.get('www-authenticate'), /resource_metadata="https:\/\/semester.example\/\.well-known\/oauth-protected-resource"/);
    assert.equal(denied.body.result.isError, true);
    assert.ok(denied.body.result._meta['mcp/www_authenticate']);
    const insufficient = await call(tool.name, {}, { repository, context: { principal: { userId: principal.userId, scopes: [] } } });
    assert.equal(insufficient.response.status, 403);
    assert.match(insufficient.response.headers.get('www-authenticate'), /insufficient_scope/);
    assert.equal(repository.calls.length, 0);
  }
  const read = await call('get_semester_plan', { profileId: 'student-one' }, { context: { principal: { userId: principal.userId, scopes: ['semester:read'] } } });
  assert.equal(read.body.result.structuredContent.plan.profileId, 'student-one');
  const write = await call('update_assignment', { profileId: 'student-one', assignmentId: 'essay', baseRevision: 1, patch: { state: 'done' } }, { context: { principal: { userId: principal.userId, scopes: ['semester:read'] } } });
  assert.equal(write.response.status, 403);
});

test('owner comes only from the verified principal and other tenants remain unavailable', async () => {
  const repository = repositoryFixture();
  const list = await call('list_student_plans', {}, { repository, params: { _meta: { 'openai/subject': 'account-two', userId: 'account-two' } } });
  assert.deepEqual(list.body.result.structuredContent.plans.map((plan) => plan.profileId), ['student-one']);
  for (const name of ['get_semester_plan', 'get_dashboard_link', 'save_semester_plan', 'update_assignment']) {
    const args = { profileId: 'private-other-student', ...(name === 'save_semester_plan' ? { baseRevision: 1, plan: { profileId: 'private-other-student' } } : {}), ...(name === 'update_assignment' ? { baseRevision: 1, assignmentId: 'essay', patch: { state: 'done' } } : {}) };
    const result = await call(name, args, { repository });
    assert.equal(result.body.result.isError, true);
    assert.equal(result.body.result.structuredContent, undefined);
  }
  assert.ok(repository.calls.every((call) => call[1] === principal.userId));
  assert.equal(repository.calls.filter(([operation]) => operation === 'save').length, 0);
  assert.equal((await call('list_student_plans', { userId: 'account-two' }, { repository })).body.error.code, -32602);
});

test('write-only grants cannot expose private plan readback or perform any write tool', async () => {
  const repository=repositoryFixture();
  const cases=[
    ['create_student_plan',intake],
    ['update_assignment',{profileId:'student-one',assignmentId:'essay',baseRevision:1,patch:{state:'done'}}],
    ['save_semester_plan',{profileId:'student-one',baseRevision:1,plan:{profileId:'student-one'}}],
  ];
  for(const [name,args] of cases){
    const denied=await call(name,args,{repository,context:{principal:{userId:principal.userId,scopes:['semester:write']}}});
    assert.equal(denied.response.status,403);
    assert.match(denied.response.headers.get('www-authenticate'),/scope="semester:read semester:write"/);
    assert.equal(denied.body.result.isError,true);
    assert.equal(denied.body.result.structuredContent,undefined);
    assert.doesNotMatch(JSON.stringify(denied.body),/Student outline/);
  }
  assert.equal(repository.calls.length,0);
  const initialized=await handleCloudMcp(request(rpc('initialize',{protocolVersion:MCP_PROTOCOL_VERSIONS[0],capabilities:{},clientInfo:{name:'write-only-client',version:'1'}})),{...context(repository),principal:{userId:principal.userId,scopes:['semester:write']}});
  assert.equal(initialized.status,200);
});

test('readback includes stable student id, revision, unknown date, source limits and account-protected dashboard URL', async () => {
  const { body } = await call('get_semester_plan', { profileId: 'student-one' });
  const readback = body.result.structuredContent;
  assert.equal(readback.profileId, 'student-one'); assert.equal(readback.revision, 1);
  assert.equal(readback.plan.tasks[1].dueAt, null);
  assert.equal(readback.automaticSourceRefresh, false);
  assert.equal(readback.dashboardUrl, 'https://semester.example/cloud?profileId=student-one');
  const link = await call('get_dashboard_link', { profileId: 'student-one' });
  assert.equal(link.body.result.structuredContent.dashboardUrl, readback.dashboardUrl);
  assert.equal(link.body.result.structuredContent.plan, undefined);
});

test('initial save validates intake and lets the repository allocate the stable profile id', async () => {
  const repository = repositoryFixture();
  const { body } = await call('create_student_plan', intake, { repository });
  assert.equal(body.result.structuredContent.profileId, 'generated-1');
  assert.equal(body.result.structuredContent.plan.name, intake.name);
  assert.deepEqual(body.result.structuredContent.plan.tasks, []);
  assert.deepEqual(repository.calls[0], ['create', principal.userId, intake]);
  for (const input of [{ ...intake, profileId: 'chosen-by-model' }, { ...intake, owner: 'account-two' }, { ...intake, timezone: 'unknown/timezone' }, { ...intake, name: ' ' }]) {
    const bad = await call('create_student_plan', input, { repository });
    assert.ok(bad.body.error || bad.body.result.isError);
  }
  assert.equal(repository.calls.filter(([op]) => op === 'create').length, 1);
});

test('bounded assignment patch preserves unsupplied fields and returns the saved assignment', async () => {
  const repository = repositoryFixture();
  const { body } = await call('update_assignment', { profileId: 'student-one', assignmentId: 'essay', baseRevision: 1, patch: { state: 'done', notes: 'Revised outline' } }, { repository });
  const data = body.result.structuredContent;
  assert.equal(data.revision, 2); assert.equal(data.plan.revision, 2);
  assert.equal(data.assignment.state, 'done'); assert.equal(data.assignment.notes, 'Revised outline');
  assert.equal(data.assignment.dueAt, '2026-09-25'); assert.equal(data.assignment.minutes, 40);
  assert.equal(data.plan.tasks[1].dueAt, null);
  const saved = await repository.getPlan(principal.userId, 'student-one');
  assert.deepEqual(data.plan, saved.plan);
});

test('creation intentionally has no request replay guarantee; clients must list after an uncertain response', async () => {
  const repository = repositoryFixture();
  const first = await call('create_student_plan', intake, { repository });
  const repeated = await call('create_student_plan', intake, { repository });
  assert.notEqual(first.body.result.structuredContent.profileId, repeated.body.result.structuredContent.profileId);
  assert.equal(CLOUD_TOOLS.find((tool) => tool.name === 'create_student_plan').annotations.idempotentHint, false);
});

test('assignment edits reject unsupported fields, empty patches, invalid values and missing revisions', async () => {
  const repository = repositoryFixture();
  const args = { profileId: 'student-one', assignmentId: 'essay', baseRevision: 1, patch: { state: 'done' } };
  for (const input of [
    { ...args, baseRevision: undefined }, { ...args, baseRevision: -1 }, { ...args, baseRevision: 1.5 },
    { ...args, patch: {} }, { ...args, patch: { id: 'different' } }, { ...args, patch: { courseId: 'other' } },
    { ...args, patch: { state: 'finished' } }, { ...args, patch: { notes: 'x'.repeat(20001) } },
    { ...args, patch: { minutes: 1.5 } }, { ...args, patch: { title: null } },
  ]) assert.equal((await call('update_assignment', input, { repository })).body.error.code, -32602);
  for (const patch of [{ dueAt: 'Tomorrow' }, { dueAt: '2026-02-30' }, { sourceUrl: 'javascript:alert(1)' }]) assert.equal((await call('update_assignment', { ...args, patch }, { repository })).body.result.isError, true);
  assert.equal(repository.calls.filter(([op]) => op === 'save').length, 0);
});

test('explicit deadline clearing keeps unknown dates null and never fabricates time', async () => {
  const repository = repositoryFixture();
  const base = { profileId: 'student-one', assignmentId: 'essay' };
  const cleared = await call('update_assignment', { ...base, baseRevision: 1, patch: { dueAt: null } }, { repository });
  assert.equal(cleared.body.result.structuredContent.assignment.dueAt, null);
  const dated = await call('update_assignment', { ...base, baseRevision: 2, patch: { dueAt: '2026-10-01' } }, { repository });
  assert.equal(dated.body.result.structuredContent.assignment.dueAt, '2026-10-01');
});

test('imports retain omitted records, completion and student notes while adding observed facts', async () => {
  const repository = repositoryFixture();
  const local = fixture(); local.tasks[0].state = 'done'; repository.seed(principal.userId, local);
  const imported = { profileId: 'student-one', tasks: [{ id: 'essay', title: 'Updated school title', notes: 'Overwrite local work', dueAt: null, state: 'next' }, { id: 'new-task', title: 'New source assignment', when: 'Friday' }] };
  const { body } = await call('save_semester_plan', { profileId: 'student-one', baseRevision: 1, plan: imported }, { repository });
  const plan = body.result.structuredContent.plan;
  assert.equal(plan.tasks.length, 3);
  assert.equal(plan.tasks[0].title, 'Updated school title'); assert.equal(plan.tasks[0].notes, 'Student outline');
  assert.equal(plan.tasks[0].state, 'done'); assert.equal(plan.tasks[0].dueAt, '2026-09-25');
  assert.equal(plan.tasks[2].dueAt, null); assert.equal(plan.courses.length, 1);
});

test('imports cannot switch students or terms, inject an owner or perform blind full overwrites', async () => {
  const repository = repositoryFixture();
  const args = { profileId: 'student-one', baseRevision: 1, plan: { profileId: 'student-one' } };
  for (const input of [{ ...args, plan: { profileId: 'different-student' } }, { ...args, plan: { profileId: 'student-one', semester: 'Spring 2027' } }]) assert.equal((await call('save_semester_plan', input, { repository })).body.result.isError, true);
  for (const input of [{ ...args, baseRevision: undefined }, { ...args, plan: { ...args.plan, owner: 'account-two' } }, { ...args, mode: 'replace' }]) assert.equal((await call('save_semester_plan', input, { repository })).body.error.code, -32602);
  assert.equal(repository.calls.filter(([op]) => op === 'save').length, 0);
});

test('a stale revision and a repeated successful write do not save another revision', async () => {
  const repository = repositoryFixture();
  const args = { profileId: 'student-one', assignmentId: 'essay', baseRevision: 1, patch: { state: 'done' } };
  assert.equal((await call('update_assignment', args, { repository })).body.result.structuredContent.revision, 2);
  const retry = await call('update_assignment', args, { repository });
  assert.equal(retry.body.result.isError, true);
  assert.equal(retry.body.result._meta['semester/error'], 'revision_conflict');
  assert.match(retry.body.result.content[0].text, /reconcile/);
  assert.equal(repository.calls.filter(([op]) => op === 'save').length, 1);
  assert.equal((await repository.getPlan(principal.userId, 'student-one')).revision, 2);
});

test('atomic repository conflict protects the gap between read and write', async () => {
  const repository = repositoryFixture(); const originalSave = repository.savePlan;
  repository.savePlan = async (...args) => {
    const concurrent = fixture(); concurrent.revision = 2; concurrent.tasks[0].notes = 'Other tab won'; repository.seed(principal.userId, concurrent);
    return originalSave(...args);
  };
  const result = await call('update_assignment', { profileId: 'student-one', assignmentId: 'essay', baseRevision: 1, patch: { notes: 'Losing change' } }, { repository });
  assert.equal(result.body.result.isError, true);
  assert.equal(result.body.result._meta['semester/error'], 'revision_conflict');
  assert.equal((await repository.getPlan(principal.userId, 'student-one')).plan.tasks[0].notes, 'Other tab won');
});

test('source expiry import retains last successful check and coursework while surfacing the required next action', async () => {
  const repository = repositoryFixture();
  const checkedAt = '2026-09-17T12:00:00Z';
  const connected = recordSourceCheck(fixture(), { profileId: 'student-one', source: { id: 'lms', title: 'School LMS', provider: 'canvas', accessMode: 'connector', connection: { state: 'verified', executionContext: 'cloud', tool: 'School connector', evidence: 'Account panel and course page read.', checkedAt, expectedIdentity: 'approved-student-id', observedIdentity: 'approved-student-id', identityStorageApproved: true }, coverage: [{ courseId: 'biology', scope: 'assignments', status: 'checked', checkedAt, evidence: 'Read both assignment pages.', pagesChecked: 2, paginationComplete: true, itemCount: 2 }] } });
  repository.seed(principal.userId, connected);
  const source = { id: 'lms', connection: { state: 'needs-sign-in', checkedAt: '2026-09-18T12:00:00Z', lastError: 'School session expired.', nextAction: 'Sign in to the intended school account, then recheck assignments.' } };
  const { body } = await call('save_semester_plan', { profileId: 'student-one', baseRevision: 1, plan: { profileId: 'student-one', sources: [source] } }, { repository });
  const data = body.result.structuredContent;
  assert.equal(data.plan.tasks.length, 2); assert.equal(data.plan.sources[0].connection.state, 'needs-sign-in');
  assert.equal(data.plan.sources[0].lastChecked, '2026-09-17T12:00:00.000Z');
  assert.equal(data.plan.sources[0].coverage[0].status, 'unknown');
  assert.match(data.sourceStatus[0].nextAction, /Sign in/); assert.match(data.sourceStatus[0].label, /Saved coursework is retained/);
  assert.equal(data.sourceStatus[0].executionContext, 'cloud');
  assert.equal(data.automaticSourceRefresh, false);
});

test('a source access failure requires its actual observation time before the plan can be saved', async () => {
  const repository = repositoryFixture();
  const plan = { profileId: 'student-one', sources: [{ id: 'lms', connection: { state: 'needs-sign-in', nextAction: 'Sign in again.' } }] };
  const { body } = await call('save_semester_plan', { profileId: 'student-one', baseRevision: 1, plan }, { repository });
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /actual check timestamp/);
  assert.equal(repository.calls.filter(([op]) => op === 'save').length, 0);
});

test('repository failure or mismatched readback never returns private data or claims a save succeeded', async () => {
  const repository = repositoryFixture();
  repository.getPlan = async () => { throw new Error('secret-token database debugging details'); };
  const failed = await call('get_semester_plan', { profileId: 'student-one' }, { repository });
  assert.equal(failed.body.result.isError, true);
  assert.doesNotMatch(JSON.stringify(failed.body), /secret-token/);
  repository.getPlan = async () => ({ plan: fixture('private-other-student'), revision: 1 });
  const mismatched = await call('get_semester_plan', { profileId: 'student-one' }, { repository });
  assert.equal(mismatched.body.result.isError, true); assert.equal(mismatched.body.result.structuredContent, undefined);
});

test('partial coverage imports reuse the verified connection before validating and persist the new scope', async () => {
  const repository=repositoryFixture();
  const connected=recordSourceCheck(fixture(),{profileId:'student-one',source:{id:'lms',provider:'canvas',accessMode:'connector',connection:{state:'verified',executionContext:'cloud',tool:'School connector',evidence:'Account panel and class list read.',checkedAt:'2026-09-17T12:00:00Z',expectedIdentity:'approved-student-id',observedIdentity:'approved-student-id',identityStorageApproved:true}}});
  repository.seed(principal.userId,connected);
  const source={id:'lms',coverage:[{courseId:'biology',scope:'assignments',status:'checked',checkedAt:'2026-09-17T12:05:00Z',evidence:'Read all assignment pages.',pagesChecked:2,paginationComplete:true,itemCount:2}]};
  const saved=await call('save_semester_plan',{profileId:'student-one',baseRevision:1,plan:{profileId:'student-one',sources:[source]}},{repository});
  assert.equal(saved.body.result.isError,undefined);
  const data=saved.body.result.structuredContent;
  assert.equal(data.revision,2);assert.deepEqual(data.plan.sources[0].connection,connected.sources[0].connection);
  assert.equal(data.plan.sources[0].coverage[0].status,'checked');assert.equal(data.plan.sources[0].coverage[0].itemCount,2);
  const read=await call('get_semester_plan',{profileId:'student-one'},{repository});
  assert.deepEqual(read.body.result.structuredContent.plan.sources,data.plan.sources);
});

test('reminder imports and readback retain execution provenance without upgrading legacy scheduled records', async () => {
  const repository=repositoryFixture();
  const legacy={id:'legacy',title:'Start homework',schedule:'Weekdays at 4 PM',enabled:true,status:'scheduled',provider:'chatgpt',toolId:'verified-legacy-tool',verifiedAt:'2026-09-17T12:00:00Z'};
  const plan={profileId:'student-one',reminders:[legacy,{...legacy,id:'desktop',executionContext:'desktop'},{...legacy,id:'cloud',executionContext:'cloud'}]};
  const saved=await call('save_semester_plan',{profileId:'student-one',baseRevision:1,plan},{repository});
  assert.equal(saved.body.result.isError,undefined);
  assert.deepEqual(saved.body.result.structuredContent.plan.reminders.map(reminder=>reminder.executionContext),['unknown','desktop','cloud']);
  assert.ok(saved.body.result.structuredContent.plan.reminders.every(reminder=>reminder.status==='scheduled'));
  const read=await call('get_semester_plan',{profileId:'student-one'},{repository});
  assert.deepEqual(read.body.result.structuredContent.plan.reminders,saved.body.result.structuredContent.plan.reminders);
  const schema=CLOUD_TOOLS.find(tool=>tool.name==='save_semester_plan').inputSchema.properties.plan.properties.reminders.items.properties.executionContext;
  assert.deepEqual(schema.enum,['unknown','desktop','cloud']);
  const invalid=await call('save_semester_plan',{profileId:'student-one',baseRevision:2,plan:{profileId:'student-one',reminders:[{...legacy,executionContext:'phone'}]}},{repository});
  assert.equal(invalid.body.error.code,-32602);
  const missingProof=await call('save_semester_plan',{profileId:'student-one',baseRevision:2,plan:{profileId:'student-one',reminders:[{...legacy,executionContext:'cloud',toolId:null}]}},{repository});
  assert.equal(missingProof.body.result.isError,true);
  assert.match(CLOUD_SKILL_TEXT,/verified cloud-capable scheduling tool/);
  assert.match(CLOUD_SKILL_TEXT,/read back its provider record/);
  assert.match(CLOUD_SKILL_TEXT,/Cloud reminder not verified/);
});
