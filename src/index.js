import {API, CredentialStore, beginDevice, finishDevice, models, PublicError} from './oauth.js';

export const PROVIDER = 'cenmax-ai';
export const MARKER = 'cenmax-ai-oauth-managed';

const failure = () => new PublicError('Cenmax AI request failed. Check your connection or sign in again.');

export function guardedFetch(store, fetcher = fetch) {
  return async (input, init) => {
    let request;
    try { request = new Request(input, init); } catch { throw failure(); }
    const url = new URL(request.url);
    if (url.origin !== new URL(API).origin || url.username || url.password || url.search || url.hash ||
      !((request.method === 'POST' && url.pathname === '/app/v1/chat/completions') ||
        (request.method === 'GET' && url.pathname === '/app/v1/models'))) throw failure();
    let body;
    if (request.method === 'POST') {
      const reader = request.body?.getReader();
      if (!reader) throw failure();
      const chunks = []; let size = 0;
      try {
        for (;;) {
          const next = await reader.read(); if (next.done) break;
          size += next.value.length; if (size > 8 * 1024 * 1024) throw failure();
          chunks.push(Buffer.from(next.value));
        }
        body = Buffer.concat(chunks).toString('utf8');
        const payload = JSON.parse(body);
        if (!payload || typeof payload !== 'object' || !/^[a-z][a-z0-9_-]{0,63}$/.test(payload.model) || !Array.isArray(payload.messages)) throw failure();
      } catch { await reader.cancel().catch(() => {}); throw failure(); }
    }
    const headers = {'Accept': 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${await store.accessToken()}`};
    let response;
    try {
      response = await fetcher(url.href, {method: request.method, headers,
        body,
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(300_000)]), redirect: 'error'});
    } catch { throw failure(); }
    if (!response.ok) {
      await response.body?.cancel();
      return new Response(JSON.stringify({error: {type: 'cenmax_error', message: 'Cenmax AI request could not complete. Check your account and retry.'}}),
        {status: [400,401,403,413,429].includes(response.status) ? response.status : 502,
          headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
    }
    if (response.redirected || (response.url && new URL(response.url).origin !== new URL(API).origin)) { await response.body?.cancel(); throw failure(); }
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json') && !type.includes('text/event-stream')) { await response.body?.cancel(); throw failure(); }
    const reader = response.body?.getReader();
    if (!reader) throw failure();
    let received = 0;
    const output = new ReadableStream({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) { controller.close(); return; }
          received += next.value.byteLength;
          if (received > 32 * 1024 * 1024) throw failure();
          controller.enqueue(next.value);
        } catch { await reader.cancel().catch(() => {}); controller.error(failure()); }
      },
      cancel(reason) { return reader.cancel(reason); },
    });
    return new Response(output, {status: response.status, headers: {'Content-Type': type, 'Cache-Control': 'no-store'}});
  };
}

export function createServer({storeFactory = connection => new CredentialStore(connection), fetcher = fetch,
  begin = beginDevice, finish = finishDevice} = {}) {
  return async (_input, options = {}) => {
    if (Object.keys(options).some(key => key !== 'connection')) throw new PublicError('Unsupported Cenmax AI plugin option.');
    const connection = options.connection ?? 'default';
    if (typeof connection !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(connection)) throw failure();
    const store = storeFactory(connection);
    return {
      async config(config) {
        let available = [];
        try { available = await models(store, fetcher); }
        catch (error) { if (!(error instanceof PublicError)) throw failure(); }
        // Replace this provider's previous catalogue rather than merging stale account models.
        config.provider ??= {};
        config.provider[PROVIDER] = {name: 'Cenmax AI', npm: '@ai-sdk/openai-compatible', env: [],
          options: {baseURL: API}, models: Object.fromEntries(available.map(model => [model.id, {
            name: model.label, tool_call: model.tools, reasoning: model.reasoning, attachment: model.vision,
            modalities: {input: model.vision ? ['text', 'image'] : ['text'], output: ['text']},
            ...(model.context && model.output ? {limit: {context: model.context, output: model.output}} : {}),
            cost: {input: 0, output: 0},
          }]))};
      },
      auth: {
        provider: PROVIDER,
        async loader(getAuth) {
          const auth = await getAuth();
          if (auth?.type !== 'api' || auth.key !== MARKER) throw new PublicError('Sign in with Cenmax AI in Kilo first.');
          return {baseURL: API, apiKey: MARKER, fetch: guardedFetch(store, fetcher)};
        },
        methods: [{type: 'oauth', label: 'Sign in with Cenmax AI',
          async authorize() {
            const flow = await begin(fetcher);
            let used = false;
            return {url: flow.url, instructions: `Approve code ${flow.code} on the Cenmax AI page.`, method: 'auto',
              async callback() {
                if (used) return {type: 'failed'};
                used = true;
                try {
                  const tokens = await finish(flow, {fetcher});
                  await store.locked(() => store.write(tokens));
                  // The host persists only this inert marker. Reusable OAuth credentials stay in the private store.
                  return {type: 'success', key: MARKER};
                } catch { return {type: 'failed'}; }
              }};
          }}],
      },
    };
  };
}

export const server = createServer();
export default {id: 'cenmax-ai', server};
