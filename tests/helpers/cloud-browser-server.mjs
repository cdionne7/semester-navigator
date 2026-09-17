// Synthetic browser bridge only. The production handler still receives its
// canonical HTTPS origin and a harness-supplied identity. Loopback HTTP does not
// establish hosted Sites sign-in, TLS, native mobile, or ChatGPT installation.
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createCloudHarness, CLOUD_ORIGIN } from './cloud-harness.mjs';

export async function createCloudBrowserServer() {
  const harness = await createCloudHarness();
  let identity = 'household';
  let origin;
  const requests = [];
  const server = createServer(async (incoming, outgoing) => {
    try {
      if (incoming.headers.host !== new URL(origin).host) {
        outgoing.writeHead(403); outgoing.end(); return;
      }
      const chunks = []; let size = 0;
      for await (const part of incoming) {
        size += part.length;
        if (size > 4_100_000) { outgoing.writeHead(413); outgoing.end(); return; }
        chunks.push(part);
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) if (typeof value === 'string') headers.set(key, value);
      headers.delete('host'); headers.delete('content-length');
      // Only this test server's actual origin is translated. A foreign Origin
      // remains foreign and the application must reject it normally.
      if (headers.get('origin') === origin) headers.set('origin', CLOUD_ORIGIN);
      const response = await harness.request(incoming.url, {
        identity, method: incoming.method, headers,
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      });
      // Record only route/method/status, never body, auth headers or query data.
      requests.push({ path: new URL(incoming.url, origin).pathname, method: incoming.method, status: response.status });
      const responseHeaders = Object.fromEntries(response.headers);
      delete responseHeaders['content-length'];
      if (responseHeaders.location?.startsWith(CLOUD_ORIGIN)) responseHeaders.location = responseHeaders.location.replace(CLOUD_ORIGIN, origin);
      let content = Buffer.from(await response.arrayBuffer());
      if (/application\/json|text\/html/.test(responseHeaders['content-type'] ?? '')) content = Buffer.from(content.toString('utf8').replaceAll(CLOUD_ORIGIN, origin));
      outgoing.writeHead(response.status, responseHeaders); outgoing.end(content);
    } catch {
      outgoing.writeHead(500, { 'content-type': 'application/json' }); outgoing.end('{"error":"Synthetic browser bridge failed"}');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    harness, origin, requests,
    setIdentity(next) { identity = next; },
    async request(path, { method = 'GET', headers: input = {}, json, form, body } = {}) {
      const headers = new Headers(input);
      if (headers.get('origin') === CLOUD_ORIGIN) headers.set('origin', origin);
      if (json !== undefined) { headers.set('content-type', 'application/json'); body = JSON.stringify(json); }
      if (form !== undefined) { headers.set('content-type', 'application/x-www-form-urlencoded'); body = new URLSearchParams(form).toString(); }
      return fetch(new URL(path, origin), { method, headers, body, redirect: 'manual' });
    },
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); harness.close(); },
  };
}
