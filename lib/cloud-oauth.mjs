// MCP authorization only. Browser identity must come from the host's verified
// session, never an OAuth parameter, email, cookie decoded here, or tool input.
export const OAUTH_SCOPES = Object.freeze(['semester:read', 'semester:write']);
export const OAUTH_ABUSE_LIMITS = Object.freeze({
  registrationWindowSeconds: 600, registrationAttemptsPerNetwork: 30, registrationAttemptsGlobal: 300,
  pendingClientTtlSeconds: 24 * 60 * 60,
  tokenWindowSeconds: 60, tokenAttemptsPerNetwork: 300, tokenAttemptsGlobal: 3_000,
  cleanupBatchSize: 100,
});
const CODE_TTL = 120;
const CONSENT_TTL = 300;
const ACCESS_TTL = 900;
const FAMILY_TTL = 30 * 24 * 60 * 60;
const BODY_LIMIT = 16_384;
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const encoder = new TextEncoder();

class OAuthError extends Error {
  constructor(code, status = 400, retryAfter) { super(code); this.code = code; this.status = status; this.retryAfter = retryAfter; }
}
function fail(code, status) { throw new OAuthError(code, status); }
function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
async function digest(value) { return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', pragma: 'no-cache', ...extra } });
}
function errorResponse(error, extra = {}) {
  return json({ error: error instanceof OAuthError ? error.code : 'server_error' }, error instanceof OAuthError ? error.status : 503, { ...(error instanceof OAuthError && error.retryAfter ? { 'retry-after': String(error.retryAfter) } : {}), ...extra });
}
function escapeHtml(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function scopes(value, defaults = ['semester:read']) {
  if (value === undefined || value === null) return [...defaults];
  if (typeof value !== 'string' || value.length > 200 || !value || value.trim() !== value) fail('invalid_scope');
  const result = value.split(' ');
  if (result.some(scope => !OAUTH_SCOPES.includes(scope)) || new Set(result).size !== result.length) fail('invalid_scope');
  return OAUTH_SCOPES.filter(scope => result.includes(scope));
}
function singleParams(params) {
  for (const key of params.keys()) if (params.getAll(key).length !== 1) fail('invalid_request');
  return params;
}
async function body(request, contentType) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== contentType) fail('invalid_request', 415);
  if (Number(request.headers.get('content-length')) > BODY_LIMIT) fail('invalid_request', 413);
  const reader = request.body?.getReader();
  if (!reader) fail('invalid_request');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BODY_LIMIT) { await reader.cancel(); fail('invalid_request', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
async function form(request) { return singleParams(new URLSearchParams(await body(request, 'application/x-www-form-urlencoded'))); }
function approvedRedirect(value) {
  if (typeof value !== 'string') return false;
  return value === 'https://chatgpt.com/connector_platform_oauth_redirect'
    || /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,200}$/.test(value);
}

/**
 * Store values are serialized strings so consume can atomically DELETE WHERE
 * kind = ? AND key = ? AND value = ?. Tokens are opaque; only hashes persist.
 * clock returns Unix seconds. random(size) must produce cryptographic bytes.
 */
export function createOAuthService({ origin, store, clock = () => Math.floor(Date.now() / 1000), random = size => crypto.getRandomValues(new Uint8Array(size)), trustedNetworkId, abuseLimits = {} }) {
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.protocol !== 'https:' || parsedOrigin.origin !== origin || parsedOrigin.username || parsedOrigin.password) throw new Error('OAuth requires an exact canonical HTTPS origin.');
  for (const name of ['put', 'get', 'consume', 'delete', 'takeLimit', 'cleanupExpired']) if (typeof store?.[name] !== 'function') throw new Error('OAuth requires a durable atomic store.');
  const limits = { ...OAUTH_ABUSE_LIMITS, ...abuseLimits };
  if (Object.keys(limits).some(key => !Object.hasOwn(OAUTH_ABUSE_LIMITS, key) || !Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > 10_000_000)) throw new Error('Invalid authorization abuse limits.');
  // The host may supply a network identifier ONLY after verifying its trusted
  // edge provenance. Untrusted request headers never select or bypass a bucket.
  const network = typeof trustedNetworkId === 'string' && trustedNetworkId.trim() && trustedNetworkId.length <= 200
    ? digest(`${origin}\u0000${trustedNetworkId}`) : Promise.resolve('shared-fallback');
  const resource = `${origin}/api/semester-mcp`;
  const metadataUrl = `${origin}/.well-known/oauth-protected-resource/api/semester-mcp`;
  const now = () => Math.floor(clock());
  async function take(key, limit, expiresAt, retryAfter) {
    if (!await store.takeLimit({ key, limit, expiresAt })) throw new OAuthError('temporarily_unavailable', 429, retryAfter);
  }
  async function limitAttempts(type) {
    const seconds = type === 'registration' ? limits.registrationWindowSeconds : limits.tokenWindowSeconds;
    const start = Math.floor(now() / seconds) * seconds;
    const end = start + seconds;
    const retryAfter = Math.max(1, end - now());
    await take(`${type}:global:${start}`, limits[`${type}AttemptsGlobal`], end, retryAfter);
    await take(`${type}:network:${await network}:${start}`, limits[`${type}AttemptsPerNetwork`], end, retryAfter);
    const cleanupWindow = Math.floor(now() / 60) * 60;
    if (await store.takeLimit({ key: `cleanup:${cleanupWindow}`, limit: 1, expiresAt: cleanupWindow + 60 })) {
      await store.cleanupExpired(now(), limits.cleanupBatchSize);
    }
  }
  const secret = () => {
    const bytes = random(32);
    if (!(bytes instanceof Uint8Array) || bytes.length !== 32) throw new Error('Invalid secure random source.');
    return base64url(bytes);
  };
  async function put(kind, key, value, expiresAt) { await store.put({ kind, key, value: JSON.stringify(value), expiresAt }); }
  async function get(kind, key) {
    const record = await store.get(kind, key);
    if (!record || (record.expiresAt !== null && record.expiresAt <= now())) return null;
    const value = JSON.parse(record.value);
    if (!object(value)) throw new Error('Invalid authorization record.');
    return { ...record, data: value };
  }
  function checkRequest(request, methods) {
    if (new URL(request.url).origin !== origin) fail('invalid_request');
    if (!methods.includes(request.method)) fail('invalid_request', 405);
  }
  function requireResource(params) { if (params.get('resource') !== resource) fail('invalid_target'); }
  async function client(clientId) {
    if (typeof clientId !== 'string' || !SECRET.test(clientId)) fail('invalid_client');
    const record = await get('client', clientId);
    if (!record) fail('invalid_client');
    return record.data;
  }
  function authorizationRedirect(target, values, state) {
    const location = new URL(target);
    for (const [key, value] of Object.entries({ ...values, iss: origin })) location.searchParams.set(key, value);
    if (state) location.searchParams.set('state', state);
    return new Response(null, { status: 303, headers: { location: location.href, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
  }
  function challenge(requiredScopes = ['semester:read'], error = 'invalid_token') {
    const checked = requiredScopes.length ? scopes(requiredScopes.join(' ')) : [];
    const code = error === 'insufficient_scope' ? 'insufficient_scope' : 'invalid_token';
    return `Bearer resource_metadata="${metadataUrl}", ${checked.length ? `scope="${checked.join(' ')}", ` : ''}error="${code}", error_description="Connect Semester Navigator to continue"`;
  }
  function endpoint(methods, handler, auth = false) {
    return async request => {
      try { checkRequest(request, methods); return await handler(request); }
      catch (error) { return errorResponse(error, { ...(error?.status === 405 ? { allow: methods.join(', ') } : {}), ...(auth ? { 'x-oauth-issuer': origin } : {}) }); }
    };
  }
  const resourceMetadata = endpoint(['GET'], async () => json({ resource, authorization_servers: [origin], scopes_supported: [...OAUTH_SCOPES], bearer_methods_supported: ['header'] }));
  const authorizationMetadata = endpoint(['GET'], async () => json({
    issuer: origin, authorization_endpoint: `${origin}/oauth/authorize`, token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`, revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ['code'], response_modes_supported: ['query'], grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'], revocation_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'], scopes_supported: [...OAUTH_SCOPES], authorization_response_iss_parameter_supported: true,
  }));
  const register = endpoint(['POST'], async request => {
    await limitAttempts('registration');
    let input;
    try { input = JSON.parse(await body(request, 'application/json')); } catch (error) { if (error instanceof OAuthError) throw error; fail('invalid_client_metadata'); }
    if (!object(input) || !Array.isArray(input.redirect_uris) || input.redirect_uris.length < 1 || input.redirect_uris.length > 3
      || input.redirect_uris.some(uri => !approvedRedirect(uri)) || new Set(input.redirect_uris).size !== input.redirect_uris.length) fail('invalid_redirect_uri');
    if (input.token_endpoint_auth_method !== undefined && input.token_endpoint_auth_method !== 'none') fail('invalid_client_metadata');
    if (Object.hasOwn(input, 'client_secret')) fail('invalid_client_metadata');
    const grants = input.grant_types ?? ['authorization_code', 'refresh_token'];
    if (!Array.isArray(grants) || !grants.includes('authorization_code') || grants.some(grant => !['authorization_code', 'refresh_token'].includes(grant)) || new Set(grants).size !== grants.length) fail('invalid_client_metadata');
    if (input.response_types !== undefined && (!Array.isArray(input.response_types) || input.response_types.length !== 1 || input.response_types[0] !== 'code')) fail('invalid_client_metadata');
    if (input.client_name !== undefined && (typeof input.client_name !== 'string' || input.client_name.length > 100)) fail('invalid_client_metadata');
    const registered = {
      client_id: secret(), client_id_issued_at: now(), client_name: input.client_name || 'ChatGPT', redirect_uris: input.redirect_uris,
      grant_types: grants, response_types: ['code'], token_endpoint_auth_method: 'none', scope: scopes(input.scope, OAUTH_SCOPES).join(' '),
    };
    // Anonymous registrations are pending, not permanent allocations. Each
    // accepted registration pays for one bounded cleanup batch so expired
    // pending records can be reclaimed even when requests arrive in bursts.
    // Attempt windows bound allocation; no permanent shared quota can be
    // exhausted by callers who never complete authenticated consent.
    await store.cleanupExpired(now(), limits.cleanupBatchSize);
    await put('client', registered.client_id, registered, now() + limits.pendingClientTtlSeconds);
    return json(registered, 201);
  });

  async function authorize(request, { userId } = {}) {
    let redirectUri; let state;
    try {
      checkRequest(request, ['GET', 'POST']);
      if (typeof userId !== 'string' || !userId || userId.length > 500) fail('login_required', 401);
      if (request.method === 'GET') {
        const params = singleParams(new URL(request.url).searchParams);
        const registered = await client(params.get('client_id'));
        if (!registered.redirect_uris.includes(params.get('redirect_uri'))) fail('invalid_request');
        redirectUri = params.get('redirect_uri');
        state = params.get('state');
        if (state !== null && state.length > 1024) { state = null; fail('invalid_request'); }
        requireResource(params);
        if (params.get('response_type') !== 'code') fail('unsupported_response_type');
        if (params.has('response_mode') && params.get('response_mode') !== 'query') fail('invalid_request');
        if (params.get('code_challenge_method') !== 'S256' || !SECRET.test(params.get('code_challenge') || '')) fail('invalid_request');
        const requestedScopes = scopes(params.get('scope'));
        if (requestedScopes.some(scope => !registered.scope.split(' ').includes(scope))) fail('invalid_scope');
        if (params.get('prompt') === 'none') fail('interaction_required');
        const consent = secret();
        await put('consent', await digest(consent), { userId, clientId: registered.client_id, redirectUri, state, scopes: requestedScopes, resource, challenge: params.get('code_challenge') }, now() + CONSENT_TTL);
        const descriptions = { 'semester:read': 'Read your saved semester plan.', 'semester:write': 'Update your saved semester plan when you ask.' };
        const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Semester Navigator</title><body><main><h1>Connect Semester Navigator</h1><p>${escapeHtml(registered.client_name)} is requesting permission to:</p><ul>${requestedScopes.map(scope => `<li>${descriptions[scope]}</li>`).join('')}</ul><p>This grants access to your Semester Navigator plan. It does not connect your school account.</p><form method="post" action="/oauth/authorize"><input type="hidden" name="consent_token" value="${consent}"><button type="submit" name="decision" value="allow">Allow access</button><button type="submit" name="decision" value="deny">Cancel</button></form></main></body></html>`;
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' } });
      }
      if (request.headers.get('origin') !== origin) fail('invalid_request', 403);
      const params = await form(request);
      const consentToken = params.get('consent_token');
      if (!SECRET.test(consentToken || '') || !['allow', 'deny'].includes(params.get('decision'))) fail('invalid_request');
      const record = await get('consent', await digest(consentToken));
      if (!record || record.data.userId !== userId) fail('invalid_request');
      if (!await store.consume('consent', record.key, record.value)) fail('invalid_request');
      const authorization = record.data;
      redirectUri = authorization.redirectUri; state = authorization.state;
      if (params.get('decision') === 'deny') fail('access_denied');
      // Recheck durable client registration before the authorization is issued.
      const registered = await client(authorization.clientId);
      if (!registered.redirect_uris.includes(redirectUri)) fail('invalid_request');
      // Only a valid, consumed, user-bound Allow decision makes this exact
      // registration durable. Existing null-expiry clients remain valid;
      // grants and refresh tokens must not lose their registered client when
      // the anonymous registration TTL passes. Concurrent approvals write the
      // same immutable metadata, so promotion needs no additional store API.
      await put('client', registered.client_id, registered, null);
      const code = secret(); const familyId = secret(); const expiresAt = now() + FAMILY_TTL;
      await put('family', familyId, { userId, clientId: authorization.clientId, resource, scopes: authorization.scopes }, expiresAt);
      await put('code', await digest(code), { ...authorization, familyId }, now() + CODE_TTL);
      return authorizationRedirect(redirectUri, { code }, state);
    } catch (error) {
      const code = error instanceof OAuthError ? error.code : 'server_error';
      if (redirectUri) return authorizationRedirect(redirectUri, { error: code }, state);
      return json({ error: code, iss: origin }, error instanceof OAuthError ? error.status : 503, error?.status === 405 ? { allow: 'GET, POST' } : {});
    }
  }

  async function grantFamily(data) {
    const family = await get('family', data.familyId);
    if (!family || family.data.userId !== data.userId || family.data.clientId !== data.clientId || family.data.resource !== resource) fail('invalid_grant');
    return family;
  }
  async function mint(data, grantedScopes, family, issueRefresh = true) {
    const accessToken = secret(); const refreshToken = issueRefresh ? secret() : null;
    const accessExpiry = Math.min(now() + ACCESS_TTL, family.expiresAt);
    const claims = { userId: data.userId, clientId: data.clientId, familyId: data.familyId, resource, issuer: origin, scopes: grantedScopes };
    await put('access', await digest(accessToken), claims, accessExpiry);
    if (refreshToken) await put('refresh', await digest(refreshToken), claims, family.expiresAt);
    // Revocation never writes a family back. A concurrent revoke cannot be undone.
    await grantFamily(data);
    return json({ access_token: accessToken, token_type: 'Bearer', expires_in: Math.max(0, accessExpiry - now()), ...(refreshToken ? { refresh_token: refreshToken } : {}), scope: grantedScopes.join(' '), resource });
  }
  const token = endpoint(['POST'], async request => {
    await limitAttempts('token');
    const params = await form(request);
    if (request.headers.has('authorization') || params.has('client_secret') || params.has('client_assertion')) fail('invalid_client');
    const registered = await client(params.get('client_id'));
    requireResource(params);
    const grant = params.get('grant_type');
    if (!['authorization_code', 'refresh_token'].includes(grant) || !registered.grant_types.includes(grant)) fail('unsupported_grant_type');
    const value = params.get(grant === 'authorization_code' ? 'code' : 'refresh_token');
    if (!SECRET.test(value || '')) fail('invalid_grant');
    const kind = grant === 'authorization_code' ? 'code' : 'refresh';
    const key = await digest(value);
    const record = await get(kind, key);
    if (!record) {
      const spent = await get(`spent_${kind}`, key);
      if (spent?.data.clientId === registered.client_id) await store.delete('family', spent.data.familyId);
      fail('invalid_grant');
    }
    const data = record.data;
    if (data.clientId !== registered.client_id || data.resource !== resource) fail('invalid_grant');
    let grantedScopes = data.scopes;
    if (kind === 'code') {
      if (params.get('redirect_uri') !== data.redirectUri || !VERIFIER.test(params.get('code_verifier') || '') || await digest(params.get('code_verifier')) !== data.challenge) fail('invalid_grant');
      if (params.has('scope')) fail('invalid_request');
    } else if (params.has('scope')) {
      grantedScopes = scopes(params.get('scope'));
      if (grantedScopes.some(scope => !data.scopes.includes(scope))) fail('invalid_scope');
    }
    const family = await grantFamily(data);
    // Keep a noncredential tombstone until family expiry to detect replay and
    // revoke descendants. It never contains a raw code, verifier, or token.
    await put(`spent_${kind}`, key, { familyId: data.familyId, clientId: data.clientId }, family.expiresAt);
    if (!await store.consume(kind, key, record.value)) {
      await store.delete('family', data.familyId);
      fail('invalid_grant');
    }
    return mint(data, grantedScopes, family, registered.grant_types.includes('refresh_token'));
  });
  const revoke = endpoint(['POST'], async request => {
    await limitAttempts('token');
    const params = await form(request);
    if (request.headers.has('authorization') || params.has('client_secret') || params.has('client_assertion')) fail('invalid_client');
    const registered = await client(params.get('client_id'));
    if (params.has('resource')) requireResource(params);
    const value = params.get('token');
    if (!value) fail('invalid_request');
    if (!SECRET.test(value)) return new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } });
    const key = await digest(value);
    for (const kind of ['access', 'refresh', 'spent_refresh']) {
      const record = await get(kind, key);
      if (record?.data.clientId === registered.client_id) { await store.delete('family', record.data.familyId); break; }
    }
    return new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } });
  });
  async function authenticate(request, requiredScopes = []) {
    let authChallenge;
    try {
      const required = requiredScopes.length ? scopes(requiredScopes.join(' ')) : [];
      authChallenge = challenge(required);
      if (new URL(request.url).origin !== origin || new URL(request.url).pathname !== '/api/semester-mcp') fail('invalid_token', 401);
      if (new URL(request.url).searchParams.has('access_token')) fail('invalid_token', 401);
      const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.get('authorization') || '');
      if (!match) fail('invalid_token', 401);
      const record = await get('access', await digest(match[1]));
      if (!record || record.data.issuer !== origin || record.data.resource !== resource) fail('invalid_token', 401);
      const family = await get('family', record.data.familyId);
      if (!family || family.data.userId !== record.data.userId || family.data.clientId !== record.data.clientId || family.data.resource !== resource) fail('invalid_token', 401);
      if (required.some(scope => !record.data.scopes.includes(scope))) {
        authChallenge = challenge(required, 'insufficient_scope'); fail('insufficient_scope', 403);
      }
      return { ok: true, userId: record.data.userId, clientId: record.data.clientId, scopes: [...record.data.scopes] };
    } catch (error) {
      authChallenge ??= challenge();
      return { ok: false, response: errorResponse(error, { 'www-authenticate': authChallenge }), challenge: authChallenge };
    }
  }
  return { resourceMetadata, authorizationMetadata, register, authorize, token, revoke, authenticate, challenge };
}
