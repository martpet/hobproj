import { Context } from "@shared/context.ts";
import { requestAcceptsHtml } from "@shared/header/negotiation.ts";
import { render } from "@shared/render.ts";
import {
  ProblemDetailsOpts,
  respondProblemDetails,
} from "@shared/responses/problem-details.ts";
import { VNode } from "preact";

// Shared by the respond* helpers that render an HTML error page for browser
// navigations, but fall back to a Problem Details (RFC 9457) JSON response
// otherwise (see respondProblemDetails for the `code`/`detail`/`extensions`/
// `status`/`headers` shape). `page` is the only addition on top of
// respondProblemDetails.
export function respondPageOrProblemDetails(
  c: Context,
  page: VNode,
  opts: ProblemDetailsOpts,
) {
  if (requestAcceptsHtml(c)) {
    return render(c, page, {
      status: opts.status,
      headers: opts.headers,
    });
  }

  return respondProblemDetails(opts);
}
