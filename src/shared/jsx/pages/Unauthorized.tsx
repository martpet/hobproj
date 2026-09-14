import { LogInButton } from "@features/sessions/jsx/LogInButton.tsx";
import { Context } from "@shared/context.ts";
import { Page } from "@shared/jsx/Page.tsx";

interface UnauthorizedPageProps {
  heading?: string;
}

export function UnauthorizedPage(
  { heading }: UnauthorizedPageProps,
  c: Context,
) {
  c.head.title = heading || "Unauthorized";

  return (
    <Page>
      <h1>{c.head.title}</h1>
      <LogInButton />
    </Page>
  );
}
