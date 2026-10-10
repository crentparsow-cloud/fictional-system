/**
 * Error tracking (10.3), the pure part. Everything Sentry would send passes
 * through scrubEvent first, on the client, the server and the edge runtime.
 *
 * What goes: request bodies, cookies, auth headers, query strings, the
 * reader's email, IP and username, and any field whose name says it holds
 * what a reader wrote (answers, values, notes, reflections, replies). Reader
 * answers are sealed in the database and never belong in a third-party
 * tool. Breadcrumbs keep the method, the status and the path, never the
 * query string or a body.
 */

/** Keys that are dropped wherever they appear in extra, contexts, tags or breadcrumb data. */
export const ANSWER_KEYS: readonly string[] = ["answer", "answers", "value", "values", "note", "notes", "reflection", "reply", "body", "text", "plain", "email"];

/** Request headers that never leave. */
const SECRET_HEADERS = new Set(["authorization", "cookie", "set-cookie", "x-vercel-protection-bypass", "x-forwarded-for", "x-real-ip"]);

export interface ScrubbableRequest {
  data?: unknown;
  cookies?: unknown;
  headers?: Record<string, string>;
  query_string?: unknown;
  url?: string;
}

export interface ScrubbableEvent {
  request?: ScrubbableRequest;
  user?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  breadcrumbs?: ScrubbableBreadcrumb[];
}

export interface ScrubbableBreadcrumb {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/** Remove the query string and fragment from a URL or path. */
export function stripQuery(url: unknown): unknown {
  if (typeof url !== "string") return url;
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

function isAnswerKey(key: string): boolean {
  const k = key.toLowerCase();
  return ANSWER_KEYS.some((a) => k === a || k.endsWith(`_${a}`) || k.endsWith(a.charAt(0).toUpperCase() + a.slice(1)));
}

/** Deep copy with answer-like keys removed. Arrays and primitives pass through. */
export function dropAnswerKeys<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => dropAnswerKeys(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isAnswerKey(k)) continue;
    out[k] = dropAnswerKeys(v, depth + 1);
  }
  return out as T;
}

/** One breadcrumb, kept to what helps a fix. Returns null to drop it. */
export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(crumb: B): B | null {
  if (crumb.category === "console") return null;
  const data = crumb.data ? dropAnswerKeys({ ...crumb.data }) : undefined;
  if (data) {
    if ("url" in data) data.url = stripQuery(data.url);
    delete data.request_body;
    delete data.response_body;
    delete data.response_body_size;
    delete data.request_body_size;
  }
  const out: B = { ...crumb, data };
  if (typeof out.message === "string" && out.message.length > 200) out.message = out.message.slice(0, 200);
  if (!data) delete out.data;
  return out;
}

/** The event Sentry is about to send, with everything personal removed. */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  const out: E = { ...event };
  if (out.request) {
    const req: ScrubbableRequest = { ...out.request };
    delete req.data;
    delete req.cookies;
    delete req.query_string;
    if (typeof req.url === "string") req.url = stripQuery(req.url) as string;
    if (req.headers) {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) if (!SECRET_HEADERS.has(k.toLowerCase())) headers[k] = v;
      req.headers = headers;
    }
    out.request = req;
  }
  if (out.user) {
    // The user id is enough to count how many readers an error reached.
    const id = out.user.id;
    out.user = typeof id === "string" ? { id } : {};
  }
  if (out.extra) out.extra = dropAnswerKeys(out.extra);
  if (out.contexts) out.contexts = dropAnswerKeys(out.contexts);
  if (out.tags) out.tags = dropAnswerKeys(out.tags);
  if (Array.isArray(out.breadcrumbs)) {
    out.breadcrumbs = out.breadcrumbs.map((b) => scrubBreadcrumb(b)).filter((b): b is ScrubbableBreadcrumb => b !== null);
  }
  return out;
}

/** The Sentry options every runtime shares. */
export function sharedSentryOptions(dsn: string, environment: string | undefined) {
  return {
    dsn,
    environment: environment ?? "development",
    sendDefaultPii: false,
    // Errors only on the Developer plan: no performance traces.
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
