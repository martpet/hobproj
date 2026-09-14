import { Context } from "@shared/context.ts";
import { Page } from "@shared/jsx/Page.tsx";

interface ServerErrorPageProps {
  detail?: string;
}

export function ServerErrorPage({ detail }: ServerErrorPageProps, c: Context) {
  c.head.title = "Server error";

  return (
    <Page>
      <h1>{c.head.title}</h1>
      {detail && <pre>{detail}</pre>}
    </Page>
  );
}
