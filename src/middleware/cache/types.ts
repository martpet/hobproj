// The app cache reports itself via the standard `Cache-Status` header
// (RFC 9211), e.g. `Cache-Status: Hobproj; hit; ttl=120`. Any cache in front
// (CDN, browser) appends its own entry to the same header.
//
// - `hit`                served from the app cache.
// - `fwd=method`         request method is not cacheable.
// - `fwd=bypass`         cache disabled, or a session cookie on the request.
// - `fwd=miss; stored`   nothing cached; the origin response was stored.
// - `fwd=stale; stored`  cached entry was stale; origin response was stored.
// - `fwd=miss|stale`     forwarded but the response was not storable; the
//                        `detail` parameter says why.
export type CacheStatus =
  | { hit: true; ttl?: number }
  | {
    fwd: "method" | "bypass" | "miss" | "stale";
    stored?: true;
    detail?: string;
  };
