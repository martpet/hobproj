import { cacheNoStoreOnCookieChange } from "@shared/header/cache-control.ts";
import { responseIsHtml } from "@shared/header/negotiation.ts";
import { Middleware } from "@shared/types.ts";
import { deleteFlashCookie, getFlashCookie, hasFlashCookie } from "./cookie.ts";

// A flash is a one-shot message set on a redirect/mutation response and shown
// on the next page render, carried in a cookie because the app is stateless
// between requests apart from KV.
export const flashMid: Middleware = (next) => async (c) => {
  c.flash = getFlashCookie(c);

  const res = await next(c);

  // Clear the cookie once shown — or immediately if its value is unknown, so
  // a stale cookie doesn't keep being sent. Restricted to GET+HTML so a
  // `fetch()` or an asset request in between doesn't consume it before the
  // page that should display it is rendered.
  if (hasFlashCookie(c) && c.method === "GET" && responseIsHtml(res)) {
    deleteFlashCookie(res.headers);
    cacheNoStoreOnCookieChange(c, res.headers);
  }

  return res;
};
