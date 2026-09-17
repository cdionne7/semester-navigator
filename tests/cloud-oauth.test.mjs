import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createOAuthService, OAUTH_SCOPES, OAUTH_ABUSE_LIMITS } from '../lib/cloud-oauth.mjs';

const ORIGIN = 'https://semester.example';
const CALLBACK = 'https://chatgpt.com/connector_platform_oauth_redirect';
const CALLBACK_ID = 'https://chatgpt.com/connector/oauth/callback_123';
const VERIFIER = 'a'.repeat(43);
const hash = value => createHash('sha256').update(value).digest('base64url');
const request = (path, options) => new Request(`${ORIGIN}${path}`, options);
const post = (path, fields, headers = {}) => request(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(fields) });
const bearer = (token, path = '/api/semester-mcp') => request(path, { method: 'POST', headers: { authorization: `Bearer ${token}` } });

function fixture(options = {}) {
  let time = 1_800_000_000;
  const records = new Map();
  const limits = new Map();
  const store = {
    async put(record) { records.set(`${record.kind}:${record.key}`, structuredClone(record)); },
    async get(kind, key) { return structuredClone(records.get(`${kind}:${key}`) ?? null); },
    async consume(kind, key, expectedValue) {
      const id = `${kind}:${key}`;
      if (records.get(id)?.value !== expectedValue) return false;
      records.delete(id); return true;
    },
    async delete(kind, key) { records.delete(`${kind}:${key}`); },
    async takeLimit(input) {
      const prior = limits.get(input.key);
      if (prior && prior.count >= input.limit) return false;
      limits.set(input.key, { count: (prior?.count ?? 0) + 1, expiresAt: input.expiresAt }); return true;
    },
    async cleanupExpired(now, limit) {
      for (const table of [records, limits]) {
        let deleted = 0;
        for (const [key, value] of table) if (value.expiresAt !== null && value.expiresAt <= now && deleted < limit) { table.delete(key); deleted++; }
      }
    },
  };
  const settings = { origin: ORIGIN, store, clock: () => time, random: randomBytes, ...options };
  const service = createOAuthService(settings);
  return { service, store, records, limits, settings, advance(seconds) { time += seconds; } };
}
async function register(f, overrides = {}) {
  return f.service.register(request('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: [CALLBACK, CALLBACK_ID], token_endpoint_auth_method: 'none', ...overrides }) }));
}
async function client(f, overrides = {}) {
  const response = await register(f, overrides); assert.equal(response.status, 201);
  return response.json();
}
function authRequest(registered, overrides = {}) {
  const params = new URLSearchParams({ client_id: registered.client_id, redirect_uri: CALLBACK, response_type: 'code', resource: `${ORIGIN}/api/semester-mcp`, scope: OAUTH_SCOPES.join(' '), code_challenge_method: 'S256', code_challenge: hash(VERIFIER), state: 'client-request-state', ...overrides });
  return request(`/oauth/authorize?${params}`);
}
async function consent(f, registered, overrides = {}, userId = 'trusted-student') {
  const response = await f.service.authorize(authRequest(registered, overrides), { userId });
  assert.equal(response.status, 200);
  const html = await response.text();
  const nonce = /name="consent_token" value="([A-Za-z0-9_-]+)"/.exec(html)?.[1];
  assert.ok(nonce); return { nonce, html, response };
}
function decision(nonce, decision = 'allow', origin = ORIGIN, fields = {}) {
  return post('/oauth/authorize', { consent_token: nonce, decision, ...fields }, origin === null ? {} : { origin });
}
async function code(f, registered, overrides = {}, userId = 'trusted-student') {
  const pending = await consent(f, registered, overrides, userId);
  const response = await f.service.authorize(decision(pending.nonce), { userId });
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.searchParams.get('iss'), ORIGIN);
  assert.equal(location.searchParams.get('state'), overrides.state ?? 'client-request-state');
  const value = location.searchParams.get('code'); assert.ok(value);
  return { ...pending, value, response };
}
function exchange(registered, authorizationCode, overrides = {}) {
  return post('/oauth/token', { client_id: registered.client_id, grant_type: 'authorization_code', code: authorizationCode, redirect_uri: CALLBACK, resource: `${ORIGIN}/api/semester-mcp`, code_verifier: VERIFIER, ...overrides });
}
function refresh(registered, token, overrides = {}) {
  return post('/oauth/token', { client_id: registered.client_id, grant_type: 'refresh_token', refresh_token: token, resource: `${ORIGIN}/api/semester-mcp`, ...overrides });
}
async function tokenSet(f, overrides = {}) {
  const registered = await client(f);
  const authorization = await code(f, registered, overrides);
  const response = await f.service.token(exchange(registered, authorization.value)); assert.equal(response.status, 200);
  return { registered, authorization, tokens: await response.json(), response };
}
async function oauthError(response, expected, status = 400) {
  assert.equal(response.status, status);
  assert.equal((await response.json()).error, expected);
}

test('discovery fixes issuer, protected resource, PKCE, DCR, scopes and public-client methods', async () => {
  const f = fixture();
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/api/semester-mcp']) {
    const metadata = await (await f.service.resourceMetadata(request(path))).json();
    assert.equal(metadata.resource, `${ORIGIN}/api/semester-mcp`); assert.deepEqual(metadata.authorization_servers, [ORIGIN]);
    assert.deepEqual(metadata.scopes_supported, OAUTH_SCOPES); assert.deepEqual(metadata.bearer_methods_supported, ['header']);
  }
  const metadata = await (await f.service.authorizationMetadata(request('/.well-known/oauth-authorization-server'))).json();
  assert.equal(metadata.issuer, ORIGIN); assert.equal(metadata.authorization_response_iss_parameter_supported, true);
  assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']); assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ['none']);
  assert.equal(metadata.registration_endpoint, `${ORIGIN}/oauth/register`); assert.equal(metadata.client_id_metadata_document_supported, undefined);
  assert.equal(metadata.userinfo_endpoint, undefined);
});

test('canonical origin requires exact HTTPS origin without a path, credentials or normalization', () => {
  for (const origin of ['http://localhost:1234', `${ORIGIN}/`, `${ORIGIN}/prefix`, 'https://name:secret@semester.example', 'https://SEMESTER.example', `${ORIGIN}:443`]) {
    assert.throws(() => createOAuthService({ origin, store: fixture().store }), /canonical HTTPS/);
  }
  assert.throws(() => createOAuthService({ origin: ORIGIN, store: {} }), /atomic store/);
});

test('DCR allows only exact supported ChatGPT redirects and never returns a client secret', async () => {
  const f = fixture(); const registered = await client(f);
  assert.deepEqual(registered.redirect_uris, [CALLBACK, CALLBACK_ID]);
  assert.equal(registered.token_endpoint_auth_method, 'none'); assert.equal(registered.client_secret, undefined);
  await code(f, registered);
  f.advance(90 * 24 * 60 * 60);
  assert.equal((await f.service.authorize(authRequest(registered), { userId: 'trusted-student' })).status, 200, 'approved clients do not expire');
  for (const uri of ['https://evil.example/callback', `${CALLBACK}?next=evil`, `${CALLBACK}#fragment`, `${CALLBACK}/`, 'https://chatgpt.com:443/connector_platform_oauth_redirect', 'https://chatgpt.com.evil.example/connector/oauth/id', 'https://chatgpt.com@evil.example/connector/oauth/id', 'http://127.0.0.1:8080/callback', 'https://chatgpt.com/connector/oauth/', 'https://chatgpt.com/connector/oauth/a/b', 'https://chatgpt.com/connector/oauth/%2e%2e']) {
    await oauthError(await register(f, { redirect_uris: [uri] }), 'invalid_redirect_uri');
  }
});

test('DCR rejects unsupported grants, scopes, authentication and malformed metadata', async () => {
  const f = fixture();
  for (const overrides of [{ token_endpoint_auth_method: 'client_secret_basic' }, { client_secret: '' }, { grant_types: ['client_credentials'] }, { grant_types: ['authorization_code', 'authorization_code'] }, { response_types: ['token'] }, { client_name: {} }]) {
    await oauthError(await register(f, overrides), 'invalid_client_metadata');
  }
  await oauthError(await register(f, { scope: 'semester:read admin' }), 'invalid_scope');
  await oauthError(await register(f, { redirect_uris: [CALLBACK, CALLBACK] }), 'invalid_redirect_uri');
  await oauthError(await f.service.register(request('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })), 'invalid_client_metadata');
});

test('authorization requires trusted session identity and explicit one-time consent', async () => {
  const f = fixture(); const registered = await client(f);
  await oauthError(await f.service.authorize(authRequest(registered, { userId: 'forged', email: 'student@school.example' })), 'login_required', 401);
  const pending = await consent(f, registered);
  assert.equal([...f.records.values()].some(record => record.kind === 'code'), false);
  assert.match(pending.html, /Read your saved semester plan/); assert.match(pending.html, /Update your saved semester plan/);
  assert.match(pending.response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  await oauthError(await f.service.authorize(decision(pending.nonce), { userId: 'other-student' }), 'invalid_request');
  await oauthError(await f.service.authorize(decision(pending.nonce, 'allow', 'https://evil.example'), { userId: 'trusted-student' }), 'invalid_request', 403);
  await oauthError(await f.service.authorize(decision(pending.nonce, 'allow', null), { userId: 'trusted-student' }), 'invalid_request', 403);
  await oauthError(await f.service.authorize(decision(pending.nonce, 'yes'), { userId: 'trusted-student' }), 'invalid_request');
  const approved = await f.service.authorize(decision(pending.nonce, 'allow', ORIGIN, { userId: 'forged', scope: 'admin', redirect_uri: 'https://evil.example' }), { userId: 'trusted-student' });
  assert.equal(approved.status, 303); assert.ok(approved.headers.get('location').startsWith(CALLBACK));
  await oauthError(await f.service.authorize(decision(pending.nonce), { userId: 'trusted-student' }), 'invalid_request');
  const record = [...f.records.values()].find(record => record.kind === 'code');
  assert.equal(JSON.parse(record.value).userId, 'trusted-student'); assert.deepEqual(JSON.parse(record.value).scopes, OAUTH_SCOPES);
});

test('consent denial and valid-client authorization errors preserve issuer and state', async () => {
  const f = fixture(); const registered = await client(f);
  const pending = await consent(f, registered);
  const denied = await f.service.authorize(decision(pending.nonce, 'deny'), { userId: 'trusted-student' });
  const location = new URL(denied.headers.get('location'));
  assert.equal(location.searchParams.get('error'), 'access_denied'); assert.equal(location.searchParams.get('iss'), ORIGIN);
  assert.equal(location.searchParams.get('state'), 'client-request-state'); assert.equal(location.searchParams.has('code'), false);
  assert.equal([...f.records.values()].some(record => record.kind === 'code'), false);
  for (const [overrides, expected] of [[{ scope: 'admin' }, 'invalid_scope'], [{ response_type: 'token' }, 'unsupported_response_type'], [{ resource: 'https://evil.example/api/semester-mcp' }, 'invalid_target'], [{ resource: '' }, 'invalid_target'], [{ code_challenge_method: 'plain' }, 'invalid_request'], [{ code_challenge: 'short' }, 'invalid_request'], [{ prompt: 'none' }, 'interaction_required']]) {
    const response = await f.service.authorize(authRequest(registered, overrides), { userId: 'trusted-student' });
    assert.equal(response.status, 303);
    const target = new URL(response.headers.get('location'));
    assert.equal(target.searchParams.get('error'), expected); assert.equal(target.searchParams.get('iss'), ORIGIN); assert.equal(target.searchParams.get('state'), 'client-request-state');
  }
  const unsafe = await f.service.authorize(authRequest(registered, { redirect_uri: 'https://evil.example' }), { userId: 'trusted-student' });
  assert.equal(unsafe.status, 400); assert.equal(unsafe.headers.has('location'), false); assert.equal((await unsafe.json()).iss, ORIGIN);
});

test('HTML escapes registered names and authorization never reflects raw request parameters', async () => {
  const f = fixture(); const registered = await client(f, { client_name: '<script>alert("hi")</script>' });
  const { html } = await consent(f, registered, { state: '<private-state>', email: 'private-email@school.example' });
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>|private-state|private-email/);
});

test('authorization binds exact registered redirect, client, resource and scope ceiling', async () => {
  const f = fixture(); const registered = await client(f, { scope: 'semester:read' });
  const overScope = await f.service.authorize(authRequest(registered), { userId: 'trusted-student' });
  assert.equal(new URL(overScope.headers.get('location')).searchParams.get('error'), 'invalid_scope');
  const authorization = await code(f, registered, { scope: 'semester:read', redirect_uri: CALLBACK_ID });
  await oauthError(await f.service.token(exchange(registered, authorization.value)), 'invalid_grant');
  const success = await f.service.token(exchange(registered, authorization.value, { redirect_uri: CALLBACK_ID }));
  assert.equal(success.status, 200); assert.equal((await success.json()).scope, 'semester:read');
});

test('valid code exchange authenticates only the trusted student and stores no raw credentials', async () => {
  const f = fixture(); const { registered, tokens, authorization, response } = await tokenSet(f);
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(tokens.resource, `${ORIGIN}/api/semester-mcp`);
  assert.equal(tokens.expires_in, 900); assert.equal(tokens.token_type, 'Bearer');
  const identity = await f.service.authenticate(bearer(tokens.access_token), ['semester:write']);
  assert.deepEqual(identity, { ok: true, userId: 'trusted-student', clientId: registered.client_id, scopes: [...OAUTH_SCOPES] });
  const storage = JSON.stringify([...f.records.values()]);
  for (const credential of [tokens.access_token, tokens.refresh_token, authorization.value, authorization.nonce, VERIFIER]) assert.equal(storage.includes(credential), false, 'raw credential leaked to durable storage');
});

test('wrong PKCE verifier, redirect, resource or client cannot redeem or consume a code', async () => {
  const f = fixture(); const registered = await client(f); const other = await client(f); const authorization = await code(f, registered);
  for (const [overrides, expected] of [[{ code_verifier: 'b'.repeat(43) }, 'invalid_grant'], [{ code_verifier: 'a'.repeat(42) }, 'invalid_grant'], [{ redirect_uri: CALLBACK_ID }, 'invalid_grant'], [{ resource: `${ORIGIN}/other` }, 'invalid_target'], [{ resource: '' }, 'invalid_target'], [{ client_id: other.client_id }, 'invalid_grant'], [{ scope: 'semester:write' }, 'invalid_request']]) {
    await oauthError(await f.service.token(exchange(registered, authorization.value, overrides)), expected);
  }
  assert.equal((await f.service.token(exchange(registered, authorization.value))).status, 200);
});

test('authorization code replay revokes its issued token family and reveals no credential', async () => {
  const f = fixture(); const { registered, tokens, authorization } = await tokenSet(f);
  const replay = await f.service.token(exchange(registered, authorization.value));
  const text = await replay.text(); assert.equal(replay.status, 400); assert.equal(text, '{"error":"invalid_grant"}');
  assert.equal((await f.service.authenticate(bearer(tokens.access_token))).ok, false);
  await oauthError(await f.service.token(refresh(registered, tokens.refresh_token)), 'invalid_grant');
});

test('concurrent code exchange cannot issue two valid families or resurrect a replayed family', async () => {
  const f = fixture(); const registered = await client(f); const authorization = await code(f, registered);
  const results = await Promise.all([f.service.token(exchange(registered, authorization.value)), f.service.token(exchange(registered, authorization.value))]);
  assert.ok(results.filter(response => response.status === 200).length <= 1); assert.ok(results.some(response => response.status === 400));
  for (const response of results.filter(response => response.status === 200)) assert.equal((await f.service.authenticate(bearer((await response.json()).access_token))).ok, false);
});

test('expired consent and codes cannot issue tokens', async () => {
  const f = fixture(); const registered = await client(f); const pending = await consent(f, registered);
  f.advance(300);
  await oauthError(await f.service.authorize(decision(pending.nonce), { userId: 'trusted-student' }), 'invalid_request');
  const authorization = await code(f, registered); f.advance(120);
  await oauthError(await f.service.token(exchange(registered, authorization.value)), 'invalid_grant');
});

test('access tokens expire independently while refresh rotates without extending absolute family lifetime', async () => {
  const f = fixture(); const { registered, tokens } = await tokenSet(f);
  f.advance(900); const expired = await f.service.authenticate(bearer(tokens.access_token));
  assert.equal(expired.ok, false); assert.equal(expired.response.status, 401);
  const rotatedResponse = await f.service.token(refresh(registered, tokens.refresh_token)); assert.equal(rotatedResponse.status, 200);
  const rotated = await rotatedResponse.json(); assert.notEqual(rotated.refresh_token, tokens.refresh_token); assert.notEqual(rotated.access_token, tokens.access_token);
  assert.equal((await f.service.authenticate(bearer(rotated.access_token))).ok, true);
  f.advance(30 * 24 * 60 * 60 - 900);
  await oauthError(await f.service.token(refresh(registered, rotated.refresh_token)), 'invalid_grant');
});

test('refresh downscopes and rejects later privilege escalation without consuming the token', async () => {
  const f = fixture(); const { registered, tokens } = await tokenSet(f);
  const limited = await (await f.service.token(refresh(registered, tokens.refresh_token, { scope: 'semester:read' }))).json();
  const denied = await f.service.authenticate(bearer(limited.access_token), ['semester:write']);
  assert.equal(denied.ok, false); assert.equal(denied.response.status, 403); assert.match(denied.challenge, /insufficient_scope/);
  await oauthError(await f.service.token(refresh(registered, limited.refresh_token, { scope: OAUTH_SCOPES.join(' ') })), 'invalid_scope');
  await oauthError(await f.service.token(refresh(registered, limited.refresh_token, { scope: 'admin' })), 'invalid_scope');
  assert.equal((await f.service.token(refresh(registered, limited.refresh_token))).status, 200);
});

test('refresh replay revokes both previous and rotated access tokens', async () => {
  const f = fixture(); const { registered, tokens } = await tokenSet(f);
  const rotated = await (await f.service.token(refresh(registered, tokens.refresh_token))).json();
  await oauthError(await f.service.token(refresh(registered, tokens.refresh_token)), 'invalid_grant');
  for (const access of [tokens.access_token, rotated.access_token]) assert.equal((await f.service.authenticate(bearer(access))).ok, false);
  await oauthError(await f.service.token(refresh(registered, rotated.refresh_token)), 'invalid_grant');
});

test('concurrent refresh cannot preserve a usable family after replay detection', async () => {
  const f = fixture(); const { registered, tokens } = await tokenSet(f);
  const results = await Promise.all([f.service.token(refresh(registered, tokens.refresh_token)), f.service.token(refresh(registered, tokens.refresh_token))]);
  assert.ok(results.filter(response => response.status === 200).length <= 1); assert.ok(results.some(response => response.status === 400));
  assert.equal((await f.service.authenticate(bearer(tokens.access_token))).ok, false);
});

test('cross-client use and revocation cannot invalidate another client family', async () => {
  const f = fixture(); const { registered, tokens } = await tokenSet(f); const other = await client(f);
  await oauthError(await f.service.token(refresh(other, tokens.refresh_token)), 'invalid_grant');
  assert.equal((await f.service.revoke(post('/oauth/revoke', { client_id: other.client_id, token: tokens.access_token }))).status, 200);
  assert.equal((await f.service.authenticate(bearer(tokens.access_token))).ok, true);
  const rotated = await (await f.service.token(refresh(registered, tokens.refresh_token))).json();
  await oauthError(await f.service.token(refresh(other, tokens.refresh_token)), 'invalid_grant');
  assert.equal((await f.service.authenticate(bearer(rotated.access_token))).ok, true);
});

test('revoking any live or spent family token invalidates access and refresh descendants', async () => {
  for (const tokenKind of ['access_token', 'refresh_token', 'spent_refresh']) {
    const f = fixture(); const { registered, tokens } = await tokenSet(f);
    const rotated = await (await f.service.token(refresh(registered, tokens.refresh_token))).json();
    const value = tokenKind === 'spent_refresh' ? tokens.refresh_token : rotated[tokenKind];
    assert.equal((await f.service.revoke(post('/oauth/revoke', { client_id: registered.client_id, token: value }))).status, 200);
    assert.equal((await f.service.authenticate(bearer(tokens.access_token))).ok, false);
    assert.equal((await f.service.authenticate(bearer(rotated.access_token))).ok, false);
    await oauthError(await f.service.token(refresh(registered, rotated.refresh_token)), 'invalid_grant');
    assert.equal((await f.service.revoke(post('/oauth/revoke', { client_id: registered.client_id, token: value }))).status, 200);
  }
});

test('revocation is idempotent for unknown tokens and rejects wrong resource and authentication', async () => {
  const f = fixture(); const registered = await client(f);
  assert.equal((await f.service.revoke(post('/oauth/revoke', { client_id: registered.client_id, token: 'unknown-token' }))).status, 200);
  await oauthError(await f.service.revoke(post('/oauth/revoke', { client_id: registered.client_id, token: 'unknown', resource: 'https://other.example/api/semester-mcp' })), 'invalid_target');
  await oauthError(await f.service.revoke(post('/oauth/revoke', { client_id: registered.client_id, token: 'unknown', client_secret: 'secret' })), 'invalid_client');
});

test('resource requests enforce header bearer, issuer, resource, expiry and scopes with metadata challenge', async () => {
  const f = fixture(); const { tokens } = await tokenSet(f, { scope: 'semester:read' });
  for (const req of [request('/api/semester-mcp'), request(`/api/semester-mcp?access_token=${tokens.access_token}`), bearer(tokens.refresh_token), bearer(tokens.access_token, '/other'), new Request('https://other.example/api/semester-mcp', { headers: { authorization: `Bearer ${tokens.access_token}` } })]) {
    const result = await f.service.authenticate(req); assert.equal(result.ok, false); assert.equal(result.response.status, 401);
    assert.ok(result.response.headers.get('www-authenticate').includes('/.well-known/oauth-protected-resource/api/semester-mcp'));
    assert.equal(JSON.stringify({ challenge: result.challenge, body: await result.response.text() }).includes(tokens.access_token), false);
  }
  assert.equal((await f.service.authenticate(bearer(tokens.access_token))).ok, true);
  const access = f.records.get(`access:${hash(tokens.access_token)}`);
  const original = JSON.parse(access.value);
  for (const changed of [{ ...original, issuer: 'https://other.example' }, { ...original, resource: 'https://other.example/api/semester-mcp' }, { ...original, userId: 'other-student' }]) {
    access.value = JSON.stringify(changed); assert.equal((await f.service.authenticate(bearer(tokens.access_token))).ok, false);
  }
});

test('MCP initialization can validate a write-only token without implying a read grant', async () => {
  const f = fixture(); const { tokens } = await tokenSet(f, { scope: 'semester:write' });
  assert.equal((await f.service.authenticate(bearer(tokens.access_token), [])).ok, true);
  const reading = await f.service.authenticate(bearer(tokens.access_token), ['semester:read']);
  assert.equal(reading.ok, false); assert.equal(reading.response.status, 403);
  assert.match(reading.challenge, /scope="semester:read"/);
  assert.doesNotMatch(f.service.challenge([]), /scope=""/);
});

test('public token exchange rejects unsupported authentication and grants', async () => {
  const f = fixture(); const registered = await client(f); const authorization = await code(f, registered);
  for (const overrides of [{ client_secret: 'secret' }, { client_assertion: 'secret' }]) await oauthError(await f.service.token(exchange(registered, authorization.value, overrides)), 'invalid_client');
  const basic = exchange(registered, authorization.value); basic.headers.set('authorization', 'Basic secret');
  await oauthError(await f.service.token(basic), 'invalid_client');
  await oauthError(await f.service.token(exchange(registered, authorization.value, { grant_type: 'client_credentials' })), 'unsupported_grant_type');
  assert.equal((await f.service.token(exchange(registered, authorization.value))).status, 200);
});

test('authorization-only registered clients receive no refresh token', async () => {
  const f = fixture(); const registered = await client(f, { grant_types: ['authorization_code'] });
  const authorization = await code(f, registered);
  const tokens = await (await f.service.token(exchange(registered, authorization.value))).json();
  assert.ok(tokens.access_token); assert.equal(tokens.refresh_token, undefined);
  await oauthError(await f.service.token(refresh(registered, randomBytes(32).toString('base64url'))), 'unsupported_grant_type');
});

test('all endpoints enforce methods and canonical request origin', async () => {
  const f = fixture();
  for (const [method, path, invalid] of [['resourceMetadata', '/.well-known/oauth-protected-resource', 'POST'], ['authorizationMetadata', '/.well-known/oauth-authorization-server', 'POST'], ['register', '/oauth/register', 'GET'], ['token', '/oauth/token', 'GET'], ['revoke', '/oauth/revoke', 'GET'], ['authorize', '/oauth/authorize', 'PUT']]) {
    const response = await f.service[method](request(path, { method: invalid })); assert.equal(response.status, 405); assert.ok(response.headers.has('allow'));
    const foreign = await f.service[method](new Request(`https://evil.example${path}`, { method: invalid === 'GET' ? 'POST' : 'GET' })); assert.equal(foreign.status, 400);
  }
});

test('ambiguous duplicate parameters, inappropriate media and oversized bodies fail closed', async () => {
  const f = fixture(); const registered = await client(f);
  const duplicate = authRequest(registered); const url = `${duplicate.url}&client_id=${registered.client_id}`;
  await oauthError(await f.service.authorize(new Request(url), { userId: 'trusted-student' }), 'invalid_request');
  await oauthError(await f.service.token(request('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `client_id=${registered.client_id}&client_id=${registered.client_id}` })), 'invalid_request');
  await oauthError(await f.service.register(request('/oauth/register', { method: 'POST', body: '{}' })), 'invalid_request', 415);
  await oauthError(await f.service.register(request('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: [CALLBACK], ignored: 'x'.repeat(17_000) }) })), 'invalid_request', 413);
});

test('storage faults never leak credentials or private exception content', async () => {
  const f = fixture(); const registered = await client(f); const secretText = 'private-database-token-123';
  f.store.get = async () => { throw new Error(secretText); };
  const auth = await f.service.authorize(authRequest(registered), { userId: 'trusted-student' }); assert.equal(auth.status, 503); assert.doesNotMatch(await auth.text(), /private-database-token/);
  const token = await f.service.token(exchange(registered, randomBytes(32).toString('base64url'))); assert.equal(token.status, 503); assert.equal(await token.text(), '{"error":"server_error"}');
  const resource = await f.service.authenticate(bearer(randomBytes(32).toString('base64url'))); assert.equal(resource.ok, false); assert.equal(resource.response.status, 503); assert.doesNotMatch(await resource.response.text(), /private-database-token/);
});

test('anonymous registration attempts use a durable shared fallback and ignore spoofed network headers', async () => {
  const f = fixture({ abuseLimits: { registrationAttemptsPerNetwork: 2 } });
  for (const ip of ['198.51.100.1', '198.51.100.2']) {
    const req = request('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, 'x-forwarded-for': ip }, body: JSON.stringify({ redirect_uris: [CALLBACK] }) });
    assert.equal((await f.service.register(req)).status, 201);
  }
  const response = await register(f); assert.equal(response.headers.get('retry-after'), '600');
  await oauthError(response, 'temporarily_unavailable', 429);
  const restarted = { service: createOAuthService(f.settings) };
  await oauthError(await register(restarted), 'temporarily_unavailable', 429);
  assert.equal([...f.records.values()].filter(record => record.kind === 'client').length, 2);
  assert.doesNotMatch(JSON.stringify([...f.limits]), /198\.51\.100/);
});

test('failed registration metadata consumes attempt budget and windows reset without expiring clients', async () => {
  const f = fixture({ abuseLimits: { registrationAttemptsPerNetwork: 2 } });
  const registered = await client(f);
  await oauthError(await register(f, { redirect_uris: ['https://evil.example'] }), 'invalid_redirect_uri');
  await oauthError(await register(f), 'temporarily_unavailable', 429);
  f.advance(600);
  assert.equal((await register(f)).status, 201);
  assert.equal((await f.service.authorize(authRequest(registered), { userId: 'trusted-student' })).status, 200);
});

test('atomic attempt windows bound concurrent pending registrations and recover after expiry', async () => {
  const f = fixture({ abuseLimits: { registrationAttemptsPerNetwork: 3, pendingClientTtlSeconds: 600 } });
  const responses = await Promise.all(Array.from({ length: 12 }, () => register(f)));
  assert.equal(responses.filter(response => response.status === 201).length, 3);
  assert.equal(responses.filter(response => response.status === 429).length, 9);
  assert.equal([...f.records.values()].filter(record => record.kind === 'client').length, 3);
  assert.ok([...f.records.values()].filter(record => record.kind === 'client').every(record => record.expiresAt !== null));
  f.advance(600);
  assert.equal((await register(f)).status, 201);
  assert.equal([...f.records.values()].filter(record => record.kind === 'client').length, 1);
});

test('trusted network budgets are hashed, independently bounded, and still share a global cap', async () => {
  const f = fixture({ trustedNetworkId: '198.51.100.10', abuseLimits: { registrationAttemptsPerNetwork: 1, registrationAttemptsGlobal: 3 } });
  await client(f);
  await oauthError(await register(f), 'temporarily_unavailable', 429);
  const other = { service: createOAuthService({ ...f.settings, trustedNetworkId: '2001:db8::2' }) };
  await client(other);
  const third = { service: createOAuthService({ ...f.settings, trustedNetworkId: '198.51.100.20' }) };
  await oauthError(await register(third), 'temporarily_unavailable', 429);
  assert.equal([...f.records.values()].filter(record => record.kind === 'client').length, 2);
  assert.doesNotMatch(JSON.stringify([...f.limits]), /198\.51|2001:db8/);
});

test('token attempts are limited before validation and a throttled code remains redeemable', async () => {
  const f = fixture({ abuseLimits: { tokenAttemptsPerNetwork: 2 } });
  const registered = await client(f); const authorization = await code(f, registered);
  for (let i = 0; i < 2; i++) await oauthError(await f.service.token(exchange(registered, authorization.value, { code_verifier: 'b'.repeat(43) })), 'invalid_grant');
  const limited = await f.service.token(exchange(registered, authorization.value));
  assert.equal(limited.headers.get('retry-after'), '60');
  await oauthError(limited, 'temporarily_unavailable', 429);
  assert.ok(f.records.has(`code:${hash(authorization.value)}`));
  f.advance(60);
  assert.equal((await f.service.token(exchange(registered, authorization.value))).status, 200);
});

test('concurrent token attempts cannot overshoot the atomic bound and replay checks resume after reset', async () => {
  const f = fixture({ abuseLimits: { tokenAttemptsPerNetwork: 2 } });
  const { registered, tokens } = await tokenSet(f);
  const requests = await Promise.all(Array.from({ length: 8 }, () => f.service.token(refresh(registered, tokens.refresh_token))));
  assert.equal(requests.filter(response => response.status === 200).length, 1);
  assert.equal(requests.filter(response => response.status === 429).length, 7);
  const rotated = await requests.find(response => response.status === 200).json();
  assert.equal((await f.service.authenticate(bearer(rotated.access_token))).ok, true);
  f.advance(60);
  await oauthError(await f.service.token(refresh(registered, tokens.refresh_token)), 'invalid_grant');
  assert.equal((await f.service.authenticate(bearer(rotated.access_token))).ok, false);
});

test('accepted registrations reclaim bounded expired batches while preserving live and approved clients', async () => {
  const f = fixture({ abuseLimits: { cleanupBatchSize: 2 } });
  const clock = f.settings.clock;
  const registered = await client(f); await code(f, registered);
  for (let i = 0; i < 5; i++) await f.store.put({ kind: 'client', key: `expired-${i}`, value: '{}', expiresAt: clock() - 1 });
  await f.store.put({ kind: 'access', key: 'still-active', value: '{}', expiresAt: clock() + 1000 });
  await client(f);
  assert.equal([...f.records.values()].filter(record => record.key.startsWith('expired-')).length, 3, 'one bounded allocation cleanup batch');
  await client(f);
  assert.equal([...f.records.values()].filter(record => record.key.startsWith('expired-')).length, 1, 'burst allocations also reclaim expired records');
  assert.ok(f.records.has('access:still-active')); assert.ok(f.records.has(`client:${registered.client_id}`));
  assert.equal(f.records.get(`client:${registered.client_id}`).expiresAt, null);
});

test('pending registrations expire and historical exhausted allocation counters cannot block new clients', async () => {
  const f = fixture(); const registered = await client(f);
  assert.equal(f.records.get(`client:${registered.client_id}`).expiresAt, f.settings.clock() + OAUTH_ABUSE_LIMITS.pendingClientTtlSeconds);
  f.limits.set('clients:network:shared-fallback', { count: 500, expiresAt: null });
  f.limits.set('clients:global', { count: 10_000, expiresAt: null });
  f.advance(OAUTH_ABUSE_LIMITS.pendingClientTtlSeconds);
  await oauthError(await f.service.authorize(authRequest(registered), { userId: 'trusted-student' }), 'invalid_client');
  const restarted = { service: createOAuthService(f.settings) };
  assert.equal((await register(restarted)).status, 201);
  assert.equal(f.records.has(`client:${registered.client_id}`), false);
  assert.equal([...f.records.values()].filter(record => record.kind === 'client').length, 1);
});

test('repeated anonymous registration bursts reclaim pending storage without a lifetime quota', async () => {
  const f = fixture({ abuseLimits: { registrationAttemptsPerNetwork: 3, pendingClientTtlSeconds: 1200, cleanupBatchSize: 1 } });
  for (let window = 0; window < 8; window++) {
    if (window) f.advance(600);
    for (let attempt = 0; attempt < 3; attempt++) assert.equal((await register(f)).status, 201);
    const clients = [...f.records.values()].filter(record => record.kind === 'client');
    assert.ok(clients.length <= 6, 'only two windows of pending registrations remain despite burst arrivals');
    assert.ok(clients.every(record => record.expiresAt > f.settings.clock()));
  }
  assert.equal([...f.limits.keys()].some(key => key.startsWith('clients:')), false);
});

test('unauthenticated, denied, expired and replayed consent cannot promote pending registrations', async () => {
  const f = fixture(); const registered = await client(f);
  const expiry = f.records.get(`client:${registered.client_id}`).expiresAt;
  await oauthError(await f.service.authorize(authRequest(registered)), 'login_required', 401);
  const denied = await consent(f, registered);
  const response = await f.service.authorize(decision(denied.nonce, 'deny'), { userId: 'trusted-student' });
  assert.equal(new URL(response.headers.get('location')).searchParams.get('error'), 'access_denied');
  await oauthError(await f.service.authorize(decision(denied.nonce), { userId: 'trusted-student' }), 'invalid_request');
  const expired = await consent(f, registered); f.advance(300);
  await oauthError(await f.service.authorize(decision(expired.nonce), { userId: 'trusted-student' }), 'invalid_request');
  assert.equal(f.records.get(`client:${registered.client_id}`).expiresAt, expiry);
  assert.equal([...f.records.values()].some(record => record.kind === 'code' || record.kind === 'family'), false);
});

test('registration expiring during consent cannot be resurrected by approval', async () => {
  const f = fixture({ abuseLimits: { pendingClientTtlSeconds: 60 } });
  const registered = await client(f); const pending = await consent(f, registered);
  f.advance(60);
  const response = await f.service.authorize(decision(pending.nonce), { userId: 'trusted-student' });
  assert.equal(new URL(response.headers.get('location')).searchParams.get('error'), 'invalid_client');
  assert.notEqual(f.records.get(`client:${registered.client_id}`).expiresAt, null);
  assert.equal([...f.records.values()].some(record => record.kind === 'code' || record.kind === 'family'), false);
});

test('approved and legacy permanent clients survive pending TTL without breaking refresh grants', async () => {
  const f = fixture(); const { registered, tokens } = await tokenSet(f);
  assert.equal(f.records.get(`client:${registered.client_id}`).expiresAt, null);
  const legacy = await client(f);
  const legacyRecord = f.records.get(`client:${legacy.client_id}`); legacyRecord.expiresAt = null;
  f.advance(OAUTH_ABUSE_LIMITS.pendingClientTtlSeconds + 1);
  await client(f); // Exercise cleanup while both durable clients are present.
  const rotated = await f.service.token(refresh(registered, tokens.refresh_token));
  assert.equal(rotated.status, 200);
  assert.equal((await f.service.authenticate(bearer((await rotated.json()).access_token))).ok, true);
  assert.equal((await f.service.authorize(authRequest(legacy), { userId: 'trusted-student' })).status, 200);
  assert.equal(f.records.get(`client:${legacy.client_id}`).expiresAt, null);
});

test('concurrent consent promotes only the approved client and replay cannot issue another code', async () => {
  const f = fixture(); const registered = await client(f); const unapproved = await client(f);
  const pending = await consent(f, registered);
  const responses = await Promise.all(Array.from({ length: 2 }, () => f.service.authorize(decision(pending.nonce), { userId: 'trusted-student' })));
  assert.equal(responses.filter(response => response.status === 303).length, 1);
  assert.equal(responses.filter(response => response.status === 400).length, 1);
  assert.equal(f.records.get(`client:${registered.client_id}`).expiresAt, null);
  assert.notEqual(f.records.get(`client:${unapproved.client_id}`).expiresAt, null);
  assert.equal([...f.records.values()].filter(record => record.kind === 'code').length, 1);
});

test('failed promotion issues no code or family and consumed consent cannot be retried', async () => {
  const f = fixture(); const registered = await client(f); const pending = await consent(f, registered);
  const put = f.store.put;
  f.store.put = async record => { if (record.kind === 'client' && record.expiresAt === null) throw new Error('private-promotion-error'); await put(record); };
  const response = await f.service.authorize(decision(pending.nonce), { userId: 'trusted-student' });
  assert.equal(new URL(response.headers.get('location')).searchParams.get('error'), 'server_error');
  assert.doesNotMatch(response.headers.get('location'), /private-promotion-error/);
  assert.notEqual(f.records.get(`client:${registered.client_id}`).expiresAt, null);
  assert.equal([...f.records.values()].some(record => record.kind === 'code' || record.kind === 'family'), false);
  f.store.put = put;
  await oauthError(await f.service.authorize(decision(pending.nonce), { userId: 'trusted-student' }), 'invalid_request');
});

test('code write failure cannot issue a grant and a consented client can retry with fresh consent', async () => {
  const f = fixture(); const registered = await client(f); const unapproved = await client(f);
  const pending = await consent(f, registered); const put = f.store.put;
  f.store.put = async record => { if (record.kind === 'code') throw new Error('private-code-write-error'); await put(record); };
  const response = await f.service.authorize(decision(pending.nonce), { userId: 'trusted-student' });
  const location = new URL(response.headers.get('location'));
  assert.equal(location.searchParams.get('error'), 'server_error'); assert.equal(location.searchParams.has('code'), false);
  assert.doesNotMatch(location.href, /private-code-write-error/);
  assert.equal([...f.records.values()].some(record => ['code', 'access', 'refresh'].includes(record.kind)), false);
  assert.equal(f.records.get(`client:${registered.client_id}`).expiresAt, null, 'authenticated consent already approved this client');
  assert.notEqual(f.records.get(`client:${unapproved.client_id}`).expiresAt, null, 'unapproved registrations stay temporary');
  f.store.put = put;
  await oauthError(await f.service.authorize(decision(pending.nonce), { userId: 'trusted-student' }), 'invalid_request');
  const fresh = await code(f, registered);
  assert.equal((await f.service.token(exchange(registered, fresh.value))).status, 200);
});

test('limiter failures fail closed without leaking infrastructure details or allocating clients', async () => {
  const f = fixture();
  f.store.takeLimit = async () => { throw new Error('database-password-must-not-leak'); };
  const response = await register(f); assert.equal(response.status, 503); assert.equal(await response.text(), '{"error":"server_error"}');
  assert.equal(f.records.size, 0);
  assert.equal((await f.service.resourceMetadata(request('/.well-known/oauth-protected-resource'))).status, 200);
  assert.throws(() => createOAuthService({ ...f.settings, abuseLimits: { tokenAttemptsGlobal: Infinity } }), /abuse limits/);
});
