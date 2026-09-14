import type { EnvName } from "@shared/environment.ts";
import { getHtmlCacheTag } from "@shared/cache-tag.ts";

interface PurgeCloudflareCacheOptions {
  readonly zoneId?: string;
  readonly apiToken?: string;
}

// Purges Cloudflare's cache for this environment's HTML tag, leaving other
// environments' cached HTML (and all static assets) untouched, since
// prod/staging share one Cloudflare zone. A missing token disables purging
// entirely (feature flag) rather than failing the deploy.
export async function purgeCloudflareCache(
  envName: EnvName,
  { zoneId, apiToken }: PurgeCloudflareCacheOptions,
) {
  if (!apiToken) {
    console.log(
      "ℹ️  cloudflare_api_token secret not set, skipping cache purge.",
    );
    return;
  }

  if (!zoneId) {
    throw new Error(
      "cloudflare_api_token secret is set but cloudflare_zone_id is missing.",
    );
  }

  const tag = getHtmlCacheTag(envName);

  if (!tag) {
    console.log(`ℹ️  No cache tag for '${envName}', skipping cache purge.`);
    return;
  }

  console.log(`🧹 Purging Cloudflare cache tag "${tag}"...`);

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tags: [tag] }),
    },
  );

  const body = await res.json();

  if (!res.ok || !body.success) {
    throw new Error(
      `Cloudflare purge failed: ${res.status} ${JSON.stringify(body.errors)}`,
    );
  }

  console.log("✅ Cloudflare cache purged.");
}
