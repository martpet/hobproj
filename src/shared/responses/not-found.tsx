import { Context } from "@shared/context.ts";
import { DEFAULT_MAX_AGE } from "@shared/header/cache-control.ts";
import { NotFoundPage } from "@shared/jsx/pages/NotFound.tsx";
import { respondPageOrProblemDetails } from "@shared/responses/page-or-problem-details.tsx";
import { STATUS_CODE } from "@std/http";
import { formatCacheControl } from "@std/http/unstable-cache-control";
import { HEADER } from "@std/http/unstable-header";

// `private` so browsers absorb repeat hits on a dead URL, while shared caches
// (CDN, app cache) don't accumulate an entry for every URL a bot probes.
const CACHE_CONTROL = formatCacheControl({
  private: true,
  maxAge: DEFAULT_MAX_AGE,
});

export function respondNotFound(c: Context) {
  return respondPageOrProblemDetails(
    c,
    <NotFoundPage />,
    {
      status: STATUS_CODE["NotFound"],
      headers: { [HEADER.CacheControl]: CACHE_CONTROL },
    },
  );
}
