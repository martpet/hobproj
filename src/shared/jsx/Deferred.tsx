import { Context } from "@shared/context.ts";
import { PropsWithChildren, Suspense } from "preact/compat";

// Keyed by request context so the "already suspended once" state is
// per-request and garbage-collected with the context.
const renderedOnce = new WeakSet<Context>();

// Postpones rendering its children until the rest of the tree has rendered
// once. `renderToStringAsync` renders depth-first, so anything in `<head>`
// is emitted before body components run — but components register their
// scripts on `c.head` *while* rendering. Suspending here lets `<Assets />`
// see the fully populated sets on the second pass.
export function Deferred(props: PropsWithChildren) {
  return (
    <Suspense fallback={null}>
      <RenderOnceReady>{props.children}</RenderOnceReady>
    </Suspense>
  );
}

function RenderOnceReady(props: PropsWithChildren, c: Context) {
  // Throwing a promise is how a component suspends. An already-resolved one
  // means Suspense retries as soon as the current render pass completes.
  if (!renderedOnce.has(c)) {
    renderedOnce.add(c);
    throw Promise.resolve();
  }

  return props.children;
}
