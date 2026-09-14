import { Context } from "@shared/context.ts";
import { respondForbidden } from "@shared/responses/forbidden.tsx";

// Sensitive actions (deleting a passkey or the account, starting passkey
// registration) require a recently-verified session; client-side scripts
// branch on this `code` to transparently reauthenticate and retry. A no-JS
// request instead lands on the plain Forbidden page, with no way to retry
// from there, hence the explanation.
export function respondReauthRequired(c: Context) {
  return respondForbidden(c, {
    code: "REAUTH_REQUIRED",
    detail:
      "For your security, this action needs a recent passkey sign-in. Please sign in again, then retry.",
  });
}
