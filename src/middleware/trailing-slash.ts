import { respondRedirect } from "@shared/responses/redirect.ts";
import { Middleware } from "@shared/types.ts";
import { STATUS_CODE } from "@std/http";

// Redirects `/foo/` → `/foo`, but only when `/foo/` itself 404s, so a route
// that deliberately ends in a slash keeps working. Runs the handler first
// for the same reason.
export const trailingSlashMid: Middleware = (next) => async (c) => {
  const res = await next(c);

  if (
    c.url.pathname.endsWith("/") &&
    c.url.pathname !== "/" &&
    res.status === STATUS_CODE.NotFound
  ) {
    const url = new URL(c.url);

    url.pathname = url.pathname.slice(0, -1);

    return respondRedirect(url.href, "PermanentRedirect");
  }

  return res;
};
