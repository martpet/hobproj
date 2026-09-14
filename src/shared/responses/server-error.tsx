import { IS_DEV } from "@shared/constants.ts";
import { Context } from "@shared/context.ts";
import { ServerErrorPage } from "@shared/jsx/pages/ServerError.tsx";
import { respondPageOrProblemDetails } from "@shared/responses/page-or-problem-details.tsx";
import { STATUS_CODE } from "@std/http";

export function respondServerError(c: Context, error: unknown) {
  // Stack traces and error names are dev-only, to avoid leaking internals.
  const isDevError = IS_DEV && error instanceof Error;
  const detail = isDevError ? error.stack : undefined;
  const extensions = isDevError ? { errorName: error.name } : undefined;

  return respondPageOrProblemDetails(
    c,
    <ServerErrorPage detail={detail} />,
    { status: STATUS_CODE["InternalServerError"], detail, extensions },
  );
}
