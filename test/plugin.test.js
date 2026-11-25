import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {API, ORIGIN, CLIENT_ID, CredentialStore, beginDevice, finishDevice, form, tokens, models} from '../src/oauth.js';
import plugin, {createServer, guardedFetch, MARKER, PROVIDER} from '../src/index.js';

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json', ...headers}});
const pair = {access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', token_type: 'Bearer', expires_in: 3600};
const card = {id: 'pro', display_name: 'Pro by Cenmax AI', owned_by: 'Cenmax AI', context_window: 128000, max_output_tokens: 4096, capabilities: {tools: true, vision: false}};
const storeStub = {accessToken: async () => 'synthetic-access'};

test('package exposes documented Kilo server plugin shape', async () => {
  assert.equal(plugin.id, 'cenmax-ai'); assert.equal(typeof plugin.server, 'function');
  const hooks = await createServer({storeFactory: () => storeStub})({});
  assert.equal(hooks.auth.provider, PROVIDER); assert.equal(hooks.auth.methods[0].type, 'oauth');
  assert.equal(typeof hooks.config, 'function'); assert.equal(typeof hooks.auth.loader, 'function');
});
test('device authorization is pinned and presents a locally constructed approval query', async () => {
  const flow = await beginDevice(async (url, options) => {
    assert.equal(url, ORIGIN + '/oauth/device/code'); assert.equal(options.redirect, 'error');
    assert.equal(options.body.get('client_id'), CLIENT_ID); assert.equal(options.body.get('scope'), 'chat');
    return json({device_code: 'synthetic-device', user_code: 'ABCD-EFGH', expires_in: 600, interval: 5,
      verification_uri_complete: ORIGIN + '/oauth/device?spoof=hidden'});
  }, () => 0);
  assert.equal(flow.url, ORIGIN + '/oauth/device?user_code=ABCD-EFGH');
  assert.equal(flow.deadline, 600000);
});
test('foreign or malformed approval URLs fail before native host can display them', async () => {
  for (const url of ['https://evil.invalid/oauth/device', ORIGIN + '/other', ORIGIN + '/oauth/device#hidden']) {
    await assert.rejects(beginDevice(async () => json({device_code: 'x', user_code: 'ABCD', expires_in: 600, verification_uri: url})));
  }
});
test('device polling honors pending, slowdown and expiry without raw errors', async () => {
  let now = 0; let calls = 0; const delays = [];
  const result = await finishDevice({device: 'synthetic-device', interval: 5, deadline: 600000}, {
    now: () => now, sleep: async ms => {now += ms; delays.push(ms);}, fetcher: async () => {
      calls++; if (calls === 1) return json({error: 'authorization_pending'}, 400);
      if (calls === 2) return json({error: 'slow_down'}, 400); return json(pair);
    }});
  assert.deepEqual(delays, [5000, 5000, 10000]); assert.equal(result.accessToken, pair.access_token);
  let expiredCalls = 0;
  await assert.rejects(finishDevice({device: 'x', interval: 5, deadline: 0}, {now: () => 1, fetcher: async () => {expiredCalls++;}}));
  assert.equal(expiredCalls, 0);
});
test('token shape, endpoint and error bodies are constrained', async () => {
  assert.throws(() => tokens({...pair, access_token: 'a\r\nb'}));
  await assert.rejects(form('https://evil.invalid', {}, async () => {throw new Error('unexpected dispatch');}));
  await assert.rejects(form('/oauth/token', {}, async () => json({error: 'invalid_grant', error_description: 'synthetic-private-detail'}, 400)),
    error => !error.message.includes('synthetic-private-detail'));
});
test('successful revocation accepts actual empty-array and empty-body service responses', async () => {
  for (const response of [json([]), new Response(null, {status:204}), new Response('', {status:200})]) {
    assert.deepEqual(await form('/oauth/revoke', {token:'synthetic-token'}, async()=>response), {});
  }
  await assert.rejects(form('/oauth/revoke', {token:'synthetic-token'}, async()=>new Response('x'.repeat(1024*1024+1), {status:200})));
});
test('native OAuth callback stores real tokens privately and returns only inert host marker', async () => {
  let saved; let writes = 0;
  const hooks = await createServer({storeFactory: () => ({locked: action => action(), write: async data => {saved = data; writes++;}}),
    begin: async () => ({url: ORIGIN + '/oauth/device?user_code=ABCD', code: 'ABCD'}),
    finish: async () => tokens(pair)})({});
  const authorization = await hooks.auth.methods[0].authorize();
  assert.equal(authorization.method, 'auto');
  assert.deepEqual(await authorization.callback(), {type: 'success', key: MARKER});
  assert.equal(saved.accessToken, pair.access_token); assert.equal(writes, 1);
  assert.deepEqual(await authorization.callback(), {type: 'failed'}); assert.equal(writes, 1);
});
test('catalogue is entitled, public and replaces stale models with conservative capability flags', async () => {
  let rows = [card, {id: 'private/model', owned_by: 'Other'}];
  const hooks = await createServer({storeFactory: () => storeStub, fetcher: async () => json({data: rows})})({});
  const config = {provider: {[PROVIDER]: {models: {old: {}}}}};
  await hooks.config(config);
  assert.deepEqual(Object.keys(config.provider[PROVIDER].models), ['pro']);
  assert.equal(config.provider[PROVIDER].models.pro.tool_call, true);
  assert.equal(config.provider[PROVIDER].models.pro.attachment, false);
  assert.equal(config.provider[PROVIDER].models.pro.reasoning, false);
  rows = []; await hooks.config(config); assert.deepEqual(config.provider[PROVIDER].models, {});
});
test('catalogue failure offers no fallback model or reusable credential in config', async () => {
  const hooks = await createServer({storeFactory: () => ({accessToken: async () => {throw new Error('secret');}})})({});
  const config = {}; await hooks.config(config);
  assert.deepEqual(config.provider[PROVIDER].models, {});
  assert.equal(config.provider[PROVIDER].options.apiKey, undefined);
});
test('loader accepts only native sign-in marker and returns fixed guarded transport', async () => {
  const hooks = await createServer({storeFactory: () => storeStub})({});
  await assert.rejects(hooks.auth.loader(async () => ({type: 'api', key: 'other-key'})));
  const options = await hooks.auth.loader(async () => ({type: 'api', key: MARKER}));
  assert.equal(options.baseURL, API); assert.equal(options.apiKey, MARKER); assert.equal(typeof options.fetch, 'function');
});
test('guard rejects destination overrides before touching credentials', async () => {
  let reads = 0; const transport = guardedFetch({accessToken: async () => {reads++; return 'x';}});
  for (const url of ['https://evil.invalid/v1/chat/completions', API + '/chat/completions?redirect=x', API + '/anything']) {
    await assert.rejects(transport(url, {method: 'POST', body: JSON.stringify({model: 'pro', messages: []})}));
  }
  assert.equal(reads, 0);
});
test('guard forwards text/tool streams with actual OAuth while dropping caller credentials and response debug headers', async () => {
  let forwarded;
  const transport = guardedFetch(storeStub, async (url, options) => {
    forwarded = {url, options};
    return new Response('data: {"model":"pro","choices":[{"delta":{"tool_calls":[{"id":"call_1"}]}}]}\n\ndata: [DONE]\n\n',
      {headers: {'Content-Type': 'text/event-stream', 'x-debug-private': 'synthetic-secret'}});
  });
  const response = await transport(API + '/chat/completions', {method: 'POST', headers: {Authorization: 'Bearer caller-secret', 'x-untrusted': 'x'},
    body: JSON.stringify({model: 'pro', messages: [], stream: true})});
  assert.match(await response.text(), /tool_calls/);
  assert.equal(forwarded.options.headers.Authorization, 'Bearer synthetic-access');
  assert.equal(forwarded.options.headers['x-untrusted'], undefined); assert.equal(forwarded.options.redirect, 'error');
  assert.equal(response.headers.get('x-debug-private'), null);
});
test('non-success transport response is neutral and never returns raw service diagnostics', async () => {
  const response = await guardedFetch(storeStub, async () => json({secret: 'synthetic-private-error'}, 503))(API + '/models');
  assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /synthetic-private-error/);
});
test('successful transport streams are byte-bounded and cancel excessive responses', async () => {
  let cancelled = false;
  const oversized = new ReadableStream({
    start(controller) {
      const chunk = new Uint8Array(1024 * 1024);
      for (let index=0; index<33; index++) controller.enqueue(chunk);
    },
    cancel() {cancelled=true;},
  });
  const response = await guardedFetch(storeStub, async () => new Response(oversized, {headers:{'Content-Type':'text/event-stream'}}))(API+'/models');
  await assert.rejects(response.arrayBuffer(),/Cenmax AI/); assert.equal(cancelled,true);
});
test('credential store serializes refresh across store instances and invalidates uncertain rotation', async () => {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'cenmax-kilo-test-'));
  let calls = 0; const fetcher = async () => {calls++; return json(pair);};
  const first = new CredentialStore('default', {root, fetcher}); const second = new CredentialStore('default', {root, fetcher});
  try {
    await first.locked(() => first.write({accessToken: 'old', refreshToken: 'old-refresh', expiresAt: 0}));
    assert.deepEqual(await Promise.all([first.accessToken(), second.accessToken()]), ['synthetic-access', 'synthetic-access']); assert.equal(calls, 1);
    assert.equal((await fs.stat(first.file)).mode & 0o777, 0o600);
    await first.locked(() => first.write({accessToken: 'old', refreshToken: 'different-refresh', expiresAt: 0}));
    let failures = 0; first.fetcher = async () => {failures++; throw new Error('network-secret');};
    await assert.rejects(first.accessToken()); await assert.rejects(first.accessToken()); assert.equal(failures, 1);
  } finally {await fs.rm(root, {recursive: true, force: true});}
});
test('credential file symlink and broad permissions are refused', async () => {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'cenmax-kilo-test-'));
  const store = new CredentialStore('default', {root});
  try {
    const target = path.join(root, 'target'); await fs.writeFile(target, '{}', {mode: 0o600}); await fs.symlink(target, store.file);
    await assert.rejects(store.read()); await fs.unlink(store.file);
    await fs.writeFile(store.file, '{}', {mode: 0o644}); await assert.rejects(store.read());
  } finally {await fs.rm(root, {recursive: true, force: true});}
});
test('pre-dispatch refresh fence prevents replay after a process dies before persisting replacements', async () => {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'cenmax-kilo-test-'));
  let calls = 0;
  try {
    const original = new CredentialStore('default', {root});
    await original.locked(async () => {
      await original.write({accessToken: 'old', refreshToken: 'spent-refresh', expiresAt: 0});
      await original.claimRefresh('spent-refresh');
    });
    const restarted = new CredentialStore('default', {root, fetcher: async () => {calls++; return json(pair);}});
    await assert.rejects(restarted.accessToken(), /renewed/); assert.equal(calls, 0);
    await assert.rejects(restarted.read(), /Sign in/);
    const files = await fs.readdir(root);
    assert.ok(files.some(name => name.endsWith('.spent')));
    assert.ok(!files.some(name => name.includes('spent-refresh')));
  } finally {await fs.rm(root, {recursive: true, force: true});}
});
test('unsupported plugin options cannot change service destination or store through configuration', async () => {
  await assert.rejects(createServer()({}, {baseURL: 'https://evil.invalid'}));
  await assert.rejects(createServer()({}, {connection: '../../escape'}));
});
