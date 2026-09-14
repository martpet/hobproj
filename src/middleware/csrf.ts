import { respondForbidden } from "@shared/responses/forbidden.tsx";
import { Middleware } from "@shared/types.ts";
import { Method } from "@std/http/unstable-method";

const SAFE_METHODS = new Set<Method>(["GET", "HEAD", "OPTIONS"]);
const ALLOWED_SEC_FETCH = ["same-origin"];

// Third-party callbacks have no way to send our origin.
const SKIP = [
  "^/webhook/",
];

// Header-based CSRF protection (no tokens). A browser always attaches an
// `Origin` to cross-site POSTs and, where supported, a `Sec-Fetch-Site`
// other than `same-origin`, so a request forged from another site can pass
// neither check. Native form posts from our own pages pass via `Origin`,
// `fetch()` via both. Clients that send neither header are rejected.
export const csrfMid: Middleware = (next) => (c) => {
  if (SAFE_METHODS.has(c.method)) {
    return next(c);
  }

  if (SKIP.some((rule) => c.url.pathname.match(rule))) {
    return next(c);
  }

  const origin = c.req.headers.get("origin");
  const secFetch = c.req.headers.get("sec-fetch-site");

  const originOk = origin === c.url.origin;
  const secFetchOk = secFetch && ALLOWED_SEC_FETCH.includes(secFetch);

  if (originOk || secFetchOk) {
    return next(c);
  }

  return respondForbidden(c, {
    detail: "This request could not be verified as coming from this site.",
  });
};
