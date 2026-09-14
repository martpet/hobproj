import { Middleware } from "@shared/types.ts";
import { ifNoneMatch, STATUS_CODE, STATUS_TEXT } from "@std/http";
import { HEADER } from "@std/http/unstable-header";
import { CACHEABLE_METHODS } from "./constants.ts";

// Answers a GET/HEAD whose `If-None-Match` matches the response's `ETag` with
// an empty 304 (RFC 9110 §13.1.2, §15.4.5), keeping the header fields the
// client needs to refresh its stored copy. Wraps `serverCacheMid`, so the server
// cache still receives and stores the full 200 and the check also covers
// entries served from it.
export const conditionalMid: Middleware = (next) => async (c) => {
  const res = await next(c);

  if (!CACHEABLE_METHODS.has(c.method) || res.status !== STATUS_CODE.OK) {
    return res;
  }

  const etag = res.headers.get(HEADER.ETag);

  if (ifNoneMatch(c.req.headers.get(HEADER.IfNoneMatch), etag ?? undefined)) {
    return res;
  }

  await res.body?.cancel();

  const status = STATUS_CODE.NotModified;
  const headers = new Headers(res.headers);

  headers.delete(HEADER.ContentLength);

  return new Response(null, {
    status,
    statusText: STATUS_TEXT[status],
    headers,
  });
};
