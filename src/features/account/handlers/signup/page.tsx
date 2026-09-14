import { Context } from "@shared/context.ts";
import { respondRedirect } from "@shared/responses/redirect.ts";
import { SignUpPage } from "../../jsx/SignUpPage.tsx";

export function handleSignUpPage(c: Context) {
  if (c.user) {
    return respondRedirect("/");
  }

  return <SignUpPage />;
}
