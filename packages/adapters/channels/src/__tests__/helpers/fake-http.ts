// Shared test helper: an offline, fetch-like `http` fake.
//
// SPEC §4 / DESIGN §2: every backend receives an injected `http` so tests never
// hit the network. The real fetch-like contract the framework relies on is
// `(url, opts) => Promise<{ ok, status, json(), text(), headers, body }>`.
//
// Two response shapes are intentionally supported at once so a SINGLE fake can
// drive every backend:
//   - github.ts / jira.ts read `await res.json()` (and may read res.ok/status).
//   - examples/custom-backend.js reads `res.body.items` / `res.body.id` and
//     checks `res.status >= 200 && res.status < 300`.
// So each response object carries a parsed `body` AND `json()`/`text()`.
//
// `fakeHttp(routes)` builds the fake from a list of route matchers. Each call is
// recorded on `http.calls` (an array of { url, method, opts }) so tests can
// assert request URLs/params, methods, and bodies. Routes are matched in order;
// the first match wins.

export interface FakeResponse {
  ok: boolean;
  status: number;
  body: any;
  json: () => Promise<any>;
  text: () => Promise<string>;
  headers: { get(name: string): string | undefined };
}

export interface ResponseSpec {
  status?: number;
  body?: any;
  headers?: Record<string, string>;
}

export interface Route {
  match: (url: string, opts: any) => boolean;
  response: ResponseSpec | ((url: string, opts: any) => ResponseSpec);
}

export interface FakeHttp {
  (url: string | URL, opts?: any): Promise<FakeResponse>;
  calls: Array<{ url: string; method: string; opts: any }>;
}

/**
 * Build a fetch-like fake from declarative routes.
 */
export function fakeHttp(routes: Route[] = []): FakeHttp {
  const calls: Array<{ url: string; method: string; opts: any }> = [];

  const http = (async (url: string | URL, opts: any = {}) => {
    const u = String(url);
    const method = (opts.method || 'GET').toUpperCase();
    calls.push({ url: u, method, opts });

    const route = routes.find((r) => r.match(u, opts));
    if (!route) {
      // Surface unmatched requests loudly so a test can't silently pass on a
      // wrong URL — return a 404 with an explanatory body.
      return makeResponse({
        status: 404,
        body: { message: `fakeHttp: no route for ${method} ${u}` }
      });
    }
    const spec = typeof route.response === 'function' ? route.response(u, opts) : route.response;
    return makeResponse(spec || {});
  }) as FakeHttp;

  http.calls = calls;
  return http;
}

/**
 * Construct a single fetch-like response object that satisfies both the
 * `res.json()` consumers and the `res.body` consumers.
 */
export function makeResponse(spec: ResponseSpec = {}): FakeResponse {
  const status = spec.status ?? 200;
  const body = spec.body ?? null;
  const headerMap = new Map(
    Object.entries(spec.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    body,
    async json() {
      return body;
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
    headers: {
      get(name: string) {
        return headerMap.get(String(name).toLowerCase());
      }
    }
  };
}

/**
 * Convenience matcher: true when the request URL contains `substr`.
 */
export function urlIncludes(substr: string): (url: string) => boolean {
  return (url: string) => String(url).includes(substr);
}

/**
 * Convenience matcher: method + url-substring.
 */
export function methodAndUrl(method: string, substr: string): (url: string, opts?: any) => boolean {
  const m = method.toUpperCase();
  return (url: string, opts: any = {}) =>
    (opts.method || 'GET').toUpperCase() === m && String(url).includes(substr);
}
