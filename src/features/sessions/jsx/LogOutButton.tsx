import { ButtonHTMLAttributes } from "preact";
import { PropsWithChildren } from "preact/compat";
import { Session } from "../types.ts";

interface LogOutButtonProps extends PropsWithChildren, ButtonHTMLAttributes {
  sessionId?: Session["id"];
}

export function LogOutButton(
  { sessionId, children, ...attr }: LogOutButtonProps,
) {
  return (
    <form method="POST" action="/logout">
      <button {...attr}>
        {children || "Sign out"}
      </button>
      {sessionId && (
        <input
          type="hidden"
          name="sessionId"
          value={sessionId}
        />
      )}
    </form>
  );
}
