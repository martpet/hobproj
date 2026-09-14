import {
  ProblemDetailsOpts,
  respondProblemDetails,
} from "@shared/responses/problem-details.ts";
import { STATUS_CODE } from "@std/http";

// `code`/`detail` are documented on respondProblemDetails.
export function respondBadRequest(
  opts?: Omit<ProblemDetailsOpts, "status">,
) {
  return respondProblemDetails({
    ...opts,
    status: STATUS_CODE["BadRequest"],
  });
}
