import { Context } from "@shared/context.ts";
import { respondHtml } from "@shared/responses/html.ts";
import { VNode } from "preact";
import { renderToStringAsync } from "preact-render-to-string";

// preact-render-to-string wraps every Suspense boundary in `<!--$s-->` /
// `<!--/$s-->` comments for client-side hydration. We never hydrate, and
// `Deferred` puts a boundary inside `<head>`, where a comment before
// `<title>` is harmless but pointless noise.
const SUSPENSE_MARKERS = /<!--\/?\$s-->/g;

// The context is passed as the render "context" argument, which is why
// components receive it as their second parameter, e.g. `(props, c)`.
export async function render(c: Context, vnode: VNode, init?: ResponseInit) {
  const rendered = await renderToStringAsync(vnode, c);
  const html = "<!DOCTYPE html>" + rendered.replaceAll(SUSPENSE_MARKERS, "");

  return respondHtml(html, init);
}
