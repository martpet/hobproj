import { eTag } from "@std/http";
import { HEADER } from "@std/http/unstable-header";
import { ENV_NAME } from "@shared/constants.ts";
import { getHtmlCacheTag } from "@shared/cache-tag.ts";

const HTML_CACHE_TAG = getHtmlCacheTag(ENV_NAME);

// The strong `ETag` lets clients revalidate rendered pages with
// `If-None-Match`; `conditionalMid` answers a matching one with 304.
export async function respondHtml(body: string, init?: ResponseInit) {
  const headers = new Headers(init?.headers);

  headers.set(HEADER.ContentType, "text/html; charset=utf-8");
  headers.set(HEADER.ETag, await eTag(body));

  // Lets a deploy purge only this environment's HTML from Cloudflare's
  // shared zone cache. Cloudflare strips this header before it reaches
  // visitors.
  if (HTML_CACHE_TAG) {
    headers.set("Cache-Tag", HTML_CACHE_TAG);
  }

  return new Response(body, { ...init, headers });
}
