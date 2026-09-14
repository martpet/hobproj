import { IS_DEV } from "@shared/constants.ts";
import { respondRedirect } from "@shared/responses/redirect.ts";
import { Middleware } from "@shared/types.ts";
import { DAY, SECOND } from "@std/datetime";
import { HEADER } from "@std/http/unstable-header";

// Two years with `preload` meets the requirements for the browser preload
// list (hstspreload.org). Only sent over HTTPS, as the spec requires.
const HSTS_MAX_AGE = (DAY * 365 * 2) / SECOND;
const HSTS_VALUE = `max-age=${HSTS_MAX_AGE}; includeSubDomains; preload`;

// `c.url.protocol` reflects `X-Forwarded-Proto` (see `buildContext`), so this
// works behind the reverse proxy that terminates TLS.
export const httpsMid: Middleware = (next) => async (c) => {
  if (IS_DEV) {
    return next(c);
  }

  if (c.url.protocol !== "https:") {
    const url = new URL(c.url);
    url.protocol = "https:";
    return respondRedirect(url.href, "PermanentRedirect");
  }

  const res = await next(c);
  res.headers.set(HEADER.StrictTransportSecurity, HSTS_VALUE);
  return res;
};
