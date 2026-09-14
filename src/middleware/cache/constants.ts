import { STATUS_CODE, StatusCode } from "@std/http";
import { METHOD, Method } from "@std/http/unstable-method";

export const CACHEABLE_METHODS = new Set<Method>([METHOD.Get, METHOD.Head]);

// Statuses that get `Cache-Control`/`Vary` handling for downstream caches.
// 404 is here so its handler-set policy still gets `Vary: Cookie` and turns
// `private` when authenticated.
export const CACHEABLE_STATUS_CODES = new Set<StatusCode>([
  STATUS_CODE.OK,
  STATUS_CODE.NotFound,
]);

// Statuses the app cache stores. Narrower than above: 404s are cheap to
// render and would let URL enumeration grow the app cache unboundedly.
export const STORABLE_STATUS_CODES = new Set<StatusCode>([STATUS_CODE.OK]);
