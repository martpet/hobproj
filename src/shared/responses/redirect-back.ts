import { Context } from "@shared/context.ts";
import { respondRedirect } from "@shared/responses/redirect.ts";
import { HEADER } from "@std/http/unstable-header";

export function redirectBack(c: Context) {
  const referer = c.req.headers.get(HEADER.Referer);

  // Only trust a same-origin referer; anything else could send the user to
  // an attacker-controlled page after a legitimate action.
  const location = referer && new URL(referer).origin === c.url.origin
    ? referer
    : "/";

  return respondRedirect(location);
}
