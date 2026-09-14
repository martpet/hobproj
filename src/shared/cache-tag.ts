import { EnvName } from "@shared/environment.ts";

// Cloudflare cache tag for rendered HTML, scoped per environment so a
// deploy's purge only evicts its own environment's cache. `dev` never
// serves through Cloudflare, so it has no tag. Shared between the app
// (setting the `Cache-Tag` response header) and the deploy script (purging
// by this exact tag).
export function getHtmlCacheTag(envName: EnvName): string | undefined {
  return envName === "dev" ? undefined : `html-${envName}`;
}
