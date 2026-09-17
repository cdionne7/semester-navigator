// Synthetic integration boundary only: the harness injects trusted Sites
// identity headers. These tests do not prove production edge sanitization,
// a real ChatGPT session, connector installation, or school authentication.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { extname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleCloudApp } from '../../lib/cloud-app.mjs';
import { createCloudRepository } from '../../lib/cloud-repository.mjs';

export const CLOUD_ORIGIN = 'https://cloud-fixture.invalid';
export const TEST_IDENTITIES = Object.freeze({
  household: { userId: 'fixture-household-account', email: 'household@example.test' },
  other: { userId: 'fixture-other-account', email: 'other@example.test' },
});
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
};

function d1Adapter(sqlite) {
  return {
    prepare(sql) {
      function bound(values = []) {
        return {
          bind: (...next) => bound(next),
          async first(column) {
            const row = sqlite.prepare(sql).get(...values);
            return row ? column === undefined ? { ...row } : row[column] : null;
          },
          async all() {
            return { results: sqlite.prepare(sql).all(...values).map(row => ({ ...row })), success: true, meta: {} };
          },
          async run() {
            const result = sqlite.prepare(sql).run(...values);
            return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
          },
        };
      }
      return bound();
    },
  };
}

export async function createCloudHarness({ databasePath = ':memory:', publicRoot = resolve(repositoryRoot, 'public') } = {}) {
  const sqlite = new DatabaseSync(databasePath);
  try {
    const migrationRoot = resolve(repositoryRoot, 'drizzle');
    const migrations = (await readdir(migrationRoot)).filter(name => name.endsWith('.sql')).sort();
    for (const name of migrations) sqlite.exec(await readFile(resolve(migrationRoot, name), 'utf8'));
    const DB = d1Adapter(sqlite);
    const assetRequests = [];
    const env = {
      SEMESTER_CLOUD_ORIGIN: CLOUD_ORIGIN,
      DB,
      ASSETS: {
        async fetch(request) {
          const url = new URL(typeof request === 'string' ? request : request.url);
          assetRequests.push(url.pathname);
          const assetPath = resolve(publicRoot, '.' + decodeURIComponent(url.pathname));
          const withinRoot = relative(publicRoot, assetPath);
          if (isAbsolute(withinRoot) || withinRoot.startsWith('..')) return new Response('Not found', { status: 404 });
          try {
            const content = await readFile(assetPath);
            return new Response(request.method === 'HEAD' ? null : content, {
              headers: { 'content-type': mimeTypes[extname(assetPath)] ?? 'application/octet-stream' },
            });
          } catch (error) {
            if (error.code === 'ENOENT' || error.code === 'EISDIR') return new Response('Not found', { status: 404 });
            throw error;
          }
        },
      },
    };
    return {
      sqlite, DB, env, migrations, assetRequests,
      repository: createCloudRepository(DB),
      async request(path, { identity = null, method = 'GET', headers: suppliedHeaders = {}, json, form, body } = {}) {
        const headers = new Headers(suppliedHeaders);
        // Model only the edge's identity boundary, never caller-supplied identity.
        for (const key of [...headers.keys()])
          if (key.startsWith('oai-authenticated-user-')) headers.delete(key);
        if (identity) {
          const user = typeof identity === 'string' ? TEST_IDENTITIES[identity] : identity;
          if (!user) throw new Error('Unknown synthetic hosting identity.');
          headers.set('oai-authenticated-user-id', user.userId);
          headers.set('oai-authenticated-user-email', user.email);
        }
        if (json !== undefined) { headers.set('content-type', 'application/json'); body = JSON.stringify(json); }
        if (form !== undefined) { headers.set('content-type', 'application/x-www-form-urlencoded'); body = new URLSearchParams(form).toString(); }
        return handleCloudApp(new Request(new URL(path, CLOUD_ORIGIN), { method, headers, body }), env);
      },
      close() { sqlite.close(); },
    };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

/** Actual register -> consent -> PKCE code exchange through the cloud route. */
export async function authorizeCloudClient(harness, { identity = 'household', scope = 'semester:read semester:write' } = {}) {
  const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';
  const registration = await harness.request('/oauth/register', { method: 'POST', json: {
    client_name: 'Synthetic acceptance client', redirect_uris: [redirectUri],
    token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'], scope,
  } });
  assert.equal(registration.status, 201);
  const client = await registration.json();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('base64url');
  const resource = CLOUD_ORIGIN + '/api/semester-mcp';
  const query = new URLSearchParams({
    client_id: client.client_id, redirect_uri: redirectUri, resource, response_type: 'code',
    code_challenge_method: 'S256', code_challenge: challenge, scope, state,
  });
  const consent = await harness.request('/oauth/authorize?' + query, { identity });
  assert.equal(consent.status, 200);
  const consentHtml = await consent.text();
  assert.match(consentHtml, /does not connect your school account/);
  const consentToken = consentHtml.match(/name="consent_token" value="([A-Za-z0-9_-]+)"/)?.[1];
  assert.ok(consentToken, 'The actual consent page must supply its single-use token.');
  const approved = await harness.request('/oauth/authorize', {
    identity, method: 'POST', headers: { origin: CLOUD_ORIGIN },
    form: { consent_token: consentToken, decision: 'allow' },
  });
  assert.equal(approved.status, 303);
  const callback = new URL(approved.headers.get('location'));
  assert.equal(callback.origin + callback.pathname, redirectUri);
  assert.equal(callback.searchParams.get('state'), state);
  assert.equal(callback.searchParams.get('iss'), CLOUD_ORIGIN);
  assert.equal(callback.searchParams.get('error'), null);
  const code = callback.searchParams.get('code');
  assert.ok(code);
  const exchange = {
    grant_type: 'authorization_code', client_id: client.client_id,
    redirect_uri: redirectUri, resource, code, code_verifier: verifier,
  };
  const tokenResponse = await harness.request('/oauth/token', { method: 'POST', form: exchange });
  assert.equal(tokenResponse.status, 200);
  const token = await tokenResponse.json();
  assert.equal(token.token_type, 'Bearer');
  assert.equal(token.resource, resource);
  assert.equal(token.scope, scope);
  return { client, token, exchange };
}

let rpcSequence = 0;
export async function cloudRpc(harness, accessToken, method, params = {}, { identity = null, headers = {} } = {}) {
  const response = await harness.request('/api/semester-mcp', {
    identity, method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-11-25',
      ...(accessToken ? { authorization: 'Bearer ' + accessToken } : {}), ...headers,
    },
    json: { jsonrpc: '2.0', id: ++rpcSequence, method, params },
  });
  return { response, body: await response.json() };
}

export async function cloudTool(harness, accessToken, name, args = {}, options) {
  return cloudRpc(harness, accessToken, 'tools/call', { name, arguments: args }, options);
}
