import { Context } from "@shared/context.ts";
import { UnauthorizedPage } from "@shared/jsx/pages/Unauthorized.tsx";
import { respondPageOrProblemDetails } from "@shared/responses/page-or-problem-details.tsx";
import { STATUS_CODE } from "@std/http";

export function respondUnauthorized(c: Context, heading?: string) {
  return respondPageOrProblemDetails(
    c,
    <UnauthorizedPage heading={heading} />,
    { status: STATUS_CODE["Unauthorized"] },
  );
}
