import { Context } from "@shared/context.ts";
import { NotFoundPage } from "@shared/jsx/pages/NotFound.tsx";
import { respondPageOrProblemDetails } from "@shared/responses/page-or-problem-details.tsx";
import { STATUS_CODE } from "@std/http";
import { HEADER } from "@std/http/unstable-header";
import { Method } from "@std/http/unstable-method";

// Deliberately renders the 404 page: "this path exists but not with that
// method" is not useful to a browser user. The `Allow` header is for clients.
export function respondMethodNotAllowed(
  c: Context,
  allow: Method | Method[],
) {
  return respondPageOrProblemDetails(
    c,
    <NotFoundPage />,
    {
      status: STATUS_CODE["MethodNotAllowed"],
      headers: { [HEADER["Allow"]]: [allow].flat().join() },
    },
  );
}
