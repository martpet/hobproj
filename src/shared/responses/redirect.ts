import { STATUS_CODE } from "@std/http";

type RedirectStatusCodeKey =
  | "MultipleChoices"
  | "MovedPermanently"
  | "Found"
  | "SeeOther"
  | "TemporaryRedirect"
  | "PermanentRedirect";

export function respondRedirect(
  location: string,
  redirectStatusKey: RedirectStatusCodeKey = "Found",
) {
  const status = STATUS_CODE[redirectStatusKey];

  return new Response(null, { status, headers: { location } });
}
