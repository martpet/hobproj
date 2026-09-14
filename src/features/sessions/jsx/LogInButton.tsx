import { Context } from "@shared/context.ts";
import { ButtonHTMLAttributes } from "preact";
import { PropsWithChildren } from "preact/compat";

type LogInButtonProps = ButtonHTMLAttributes & PropsWithChildren;

export function LogInButton(
  { children, ...attr }: LogInButtonProps,
  c: Context,
) {
  c.head.modules.add("login-button");

  return (
    <button {...attr} data-js-action="login-with-passkey">
      {children || "Sign in"}
    </button>
  );
}
