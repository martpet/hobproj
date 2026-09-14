import { Context } from "@shared/context.ts";
import { Page } from "@shared/jsx/Page.tsx";

export function NotFoundPage(_props: unknown, c: Context) {
  c.head.title = "Page not found";

  return (
    <Page>
      <h1>{c.head.title}</h1>
    </Page>
  );
}
