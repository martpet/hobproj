import { flashMid } from "@features/flash/middleware.ts";
import { sessionMid } from "@features/sessions/middleware.ts";
import { cacheMid } from "@middleware/cache/middleware.ts";
import { csrfMid } from "@middleware/csrf.ts";
import { errorMid } from "@middleware/error.tsx";
import { httpsMid } from "@middleware/https.ts";
import { jsxMid } from "@middleware/jsx.ts";
import { secureHeadersMid } from "@middleware/secure-headers.ts";
import { telemetryMid } from "@middleware/telemetry.ts";
import { trailingSlashMid } from "@middleware/trailing-slash.ts";
import { buildContext } from "@shared/context.ts";
import { getRequiredEnv } from "@shared/environment.ts";
import { router } from "@shared/router.ts";
import { routes } from "./routes.ts";

// Outermost first. Order matters:
// - `errorMid` wraps everything so any throw becomes a 500 page.
// - `httpsMid`/`secureHeadersMid` run before the cache so redirects are never
//   cached and stored responses already carry the security headers.
// - `csrfMid` rejects before the cache so a forged POST can't evict entries.
// - `cacheMid` sits above `sessionMid`: hits skip the KV lookup entirely,
//   while `cacheControlMid` (its inner layer) still sees the resolved session.
// - `trailingSlashMid` needs the router's 404 but must stay under the cache
//   so the redirect itself is cacheable.
// - `flashMid` is last because it clears the cookie only on HTML responses,
//   which it can only know once the handler has run.
const middlewares = [
  errorMid,
  httpsMid,
  secureHeadersMid,
  csrfMid,
  cacheMid,
  trailingSlashMid,
  sessionMid,
  flashMid,
  telemetryMid,
];

// `reduceRight` so the first entry ends up outermost. `jsxMid` sits between
// the chain and the router, turning returned VNodes into HTML responses so
// every middleware above it only ever sees a `Response`.
const requestHandler = middlewares.reduceRight(
  (a, b) => b(a),
  jsxMid(router(routes)),
);

// Every environment must set APP_PORT explicitly. In local development, it
// must match the port in APP_ORIGIN so the server and passkey origin align.
const port = Number(getRequiredEnv("APP_PORT"));

// Every env var this process needs is read at module-load time by the imports
// above, never by request-handling code. Revoking here shrinks
// the blast radius if a dependency is compromised. Doesn't affect OTel:
// Deno's native integration reads OTEL_* config outside the JS permission
// sandbox.
await Deno.permissions.revoke({ name: "env" });

const server = Deno.serve({ port }, (req, info) => {
  const context = buildContext(req, info);
  return requestHandler(context);
});

// On deploy, systemd sends SIGTERM to the outgoing instance. `shutdown()`
// stops accepting new connections but lets in-flight requests finish, so
// requests already being handled aren't cut off mid-response.
Deno.addSignalListener("SIGTERM", async () => {
  await server.shutdown();
  Deno.exit(0);
});
