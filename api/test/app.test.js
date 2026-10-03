// Starts the real Express app (no Supabase needed) and checks the parts that
// do not touch the database: health check, CORS, sign-in check, errors.
const test = require('node:test');
const assert = require('node:assert/strict');

// A closed local port: any call to "Supabase" fails at once.
process.env.SUPABASE_URL = 'http://127.0.0.1:9';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
process.env.CORS_ORIGINS = 'https://pos.example.com';

const { createApp } = require('../src/app');

/** @type {import('node:http').Server} */
let server;
let base = '';

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

test.after(() => server.close());

test('health check answers without signing in', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const body = /** @type {{ ok: boolean }} */ (await res.json());
  assert.equal(body.ok, true);
});

test('data endpoints need a token', async () => {
  const res = await fetch(`${base}/tasks`);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: { message: 'Please sign in.' } });
});

test('a bad token is refused', async () => {
  const res = await fetch(`${base}/dashboard`, { headers: { Authorization: 'Bearer not-a-real-token' } });
  assert.equal(res.status, 401);
});

test('CORS lets only the web app in', async () => {
  const allowed = await fetch(`${base}/`, { method: 'OPTIONS', headers: { Origin: 'https://pos.example.com', 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://pos.example.com');
  assert.match(allowed.headers.get('access-control-allow-headers') || '', /Authorization/);

  const blocked = await fetch(`${base}/`, { headers: { Origin: 'https://evil.example.com' } });
  assert.equal(blocked.headers.get('access-control-allow-origin'), null);
});

test('security headers are set', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('broken JSON gets a clear 400', async () => {
  const res = await fetch(`${base}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal(res.status, 400);
  const body = /** @type {{ error: { message: string } }} */ (await res.json());
  assert.equal(body.error.message, 'The request body is not valid JSON.');
});
