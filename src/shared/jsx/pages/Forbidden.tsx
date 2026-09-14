import { Context } from "@shared/context.ts";
import { Page } from "@shared/jsx/Page.tsx";

interface ForbiddenPageProps {
  detail?: string;
}

export function ForbiddenPage({ detail }: ForbiddenPageProps, c: Context) {
  c.head.title = "Forbidden";

  return (
    <Page>
      <h1>{c.head.title}</h1>
      {detail && <p>{detail}</p>}
    </Page>
  );
}
