import { StatusCode } from "@std/http";
import {
  createProblemDetailsResponse,
  ProblemDetails,
  ProblemDetailsExtensions,
} from "@std/http/unstable-problem-details";

export type ProblemDetailsOpts = Pick<ProblemDetails, "detail"> & {
  code?: string;
  extensions?: ProblemDetailsExtensions;
  headers?: HeadersInit;
  status: StatusCode;
};

// Shared by the respond* helpers that always answer with a Problem Details
// (RFC 9457) body, never an HTML page (unlike respondPageOrProblemDetails). `code` is a
// machine-readable error code (e.g. "USERNAME_TAKEN"); see respondForbidden
// for why it's a `code` extension, not the standard `detail` member. `detail`,
// if given, is a human-readable explanation of this occurrence, safe for
// clients to display as-is. `extensions`, if any, are merged in alongside
// `code`.
export function respondProblemDetails(opts: ProblemDetailsOpts) {
  const { code, detail, extensions, headers, status } = opts;

  return createProblemDetailsResponse(
    { ...extensions, status, detail, ...(code && { code }) },
    { headers },
  );
}
