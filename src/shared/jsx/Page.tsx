import { FlashMessage } from "@features/flash/jsx/FlashMessage.tsx";
import { SessionExpiryWarning } from "@features/sessions/jsx/SessionExpiryWarning.tsx";
import { WEBSITE_TITLE } from "@shared/constants.ts";
import { Context } from "@shared/context.ts";
import { Assets } from "@shared/jsx/Assets.tsx";
import { Deferred } from "@shared/jsx/Deferred.tsx";
import { Link } from "@shared/jsx/Link.tsx";
import { PropsWithChildren } from "preact/compat";

export function Page({ children }: PropsWithChildren, c: Context) {
  const title = [c.head.title, WEBSITE_TITLE].filter(Boolean).join(" | ");

  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="color-scheme" content="dark light" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <Link href="/assets/logo.png" rel="icon" type="image/png" />
        <Link href="/assets/styles.css" rel="stylesheet" />
        {/* Deferred: body components register scripts while rendering. */}
        <Deferred>
          <Assets />
        </Deferred>
        <title>{title}</title>
      </head>
      <body>
        <div class="alerts" data-js-target="alerts">
          <SessionExpiryWarning />
          <FlashMessage />
        </div>
        {children}
      </body>
    </html>
  );
}
