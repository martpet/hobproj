import { FlashKey } from "@features/flash/types.ts";
import { Session } from "@features/sessions/types.ts";
import { User } from "@features/users/types.ts";
import { ScriptKey } from "@shared/asset/registry.ts";
import { DEFAULT_LOCALE } from "@shared/constants.ts";
import { getAcceptLanguage } from "@shared/header/negotiation.ts";
import { UserAgent } from "@std/http";
import { HEADER } from "@std/http/unstable-header";
import { Method } from "@std/http/unstable-method";
import { SetRequired } from "type-fest";

export interface Context {
  req: Request;
  url: URL;
  method: Method;
  // Named `URLPattern` groups of the matched route (set by `router`), e.g.
  // `file` for `:file`.
  params: Record<string, string | undefined>;
  // Stable, low-cardinality route pattern for observability, e.g. `/users/:id`.
  routeLabel?: string;
  ip: string;
  locale: string;
  ua: UserAgent;
  session?: Session;
  user?: User;
  flash?: FlashKey;
  // Filled in by components as they render (e.g. `c.head.modules.add(...)`)
  // and emitted by `<Assets />`, which `Page` defers until the body is done.
  head: {
    title?: string;
    modules: Set<ScriptKey>;
  };
}

export type AuthenticatedContext = SetRequired<Context, "user" | "session">;

export function buildContext(
  req: Request,
  info: Deno.ServeHandlerInfo<Deno.NetAddr>,
): Context {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto");

  // In production the app sits behind a TLS-terminating reverse proxy, so the
  // socket only ever sees plain HTTP from localhost. The forwarded headers
  // are what `httpsMid` and the session's recorded IP actually need.
  if (proto) {
    url.protocol = `${proto}:`;
  }

  return {
    req,
    url,
    method: req.method as Method,
    params: {},
    // `CF-Connecting-IP` is set by Cloudflare's edge and passed through
    // untouched by `cloudflared`, so it's the real client IP even though
    // the connection only ever reaches this process via loopback (Caddy ->
    // cloudflared -> Cloudflare edge). `X-Forwarded-For` isn't reliable
    // here: Cloudflare doesn't guarantee setting it, and if absent, Caddy's
    // reverse_proxy fills it in from scratch with its own (loopback) peer
    // address.
    ip: req.headers.get("CF-Connecting-IP") ||
      req.headers.get("X-Forwarded-For") ||
      info.remoteAddr.hostname,
    locale: getAcceptLanguage(req) ?? DEFAULT_LOCALE,
    ua: new UserAgent(req.headers.get(HEADER.UserAgent)),
    head: {
      modules: new Set(),
    },
  };
}

export function isAuthenticatedContext(c: Context): c is AuthenticatedContext {
  return c.session !== undefined && c.user !== undefined;
}
