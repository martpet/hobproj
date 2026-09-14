import { render } from "@shared/render.ts";
import { Middleware } from "@shared/types.ts";
import { VNode } from "preact";

// Lets route handlers return JSX directly. Sits innermost (see `main.ts`) so
// the other middleware never has to deal with VNodes.
export const jsxMid: Middleware<VNode | Response> = (next) => async (c) => {
  const resMaybe = await next(c);

  if (resMaybe instanceof Response) {
    return resMaybe;
  }

  return render(c, resMaybe);
};
