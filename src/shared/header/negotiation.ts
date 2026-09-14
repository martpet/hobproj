import { Context } from "@shared/context.ts";
import { accepts, acceptsLanguages } from "@std/http";
import { HEADER } from "@std/http/unstable-header";

// Distinguishes browser navigations from our own `fetch()` calls: a
// navigation sends `Accept: text/html,...` while `apiFetch` leaves the
// default `*/*`. JSON is listed first so a wildcard does not look like an
// explicit HTML preference. Handlers use this to pick a redirect/HTML page vs.
// JSON.
export function requestAcceptsHtml(c: Context) {
  return accepts(c.req, "application/json", "text/html") === "text/html";
}

export function responseIsHtml(res: Response) {
  return res.headers.get(HEADER.ContentType)?.startsWith("text/html") ?? false;
}

export function getAcceptLanguage(req: Request) {
  const language = acceptsLanguages(req)[0];
  return language === "*" ? undefined : language;
}
