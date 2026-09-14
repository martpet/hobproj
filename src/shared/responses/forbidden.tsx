import { Context } from "@shared/context.ts";
import { ForbiddenPage } from "@shared/jsx/pages/Forbidden.tsx";
import { respondPageOrProblemDetails } from "@shared/responses/page-or-problem-details.tsx";
import { ProblemDetailsOpts } from "@shared/responses/problem-details.ts";
import { STATUS_CODE } from "@std/http";

// `code`/`detail`/`extensions` are documented on respondProblemDetails;
// unlike that helper, this one renders an HTML error page for browser
// navigations instead (see respondPageOrProblemDetails).
export function respondForbidden(
  c: Context,
  opts?: Omit<ProblemDetailsOpts, "status">,
) {
  return respondPageOrProblemDetails(
    c,
    <ForbiddenPage detail={opts?.detail} />,
    { ...opts, status: STATUS_CODE["Forbidden"] },
  );
}
