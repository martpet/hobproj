import { DEPLOYMENT_ID, IS_DEV } from "@shared/constants.ts";
import { ScriptKey, SCRIPTS_REGISTRY } from "@shared/asset/registry.ts";

export const ASSET_VERSION = DEPLOYMENT_ID;
export const VERSION_PARAM = "v";

// Cache-busting via `?v=<deployment id>`; `handleAsset` marks such requests
// immutable for a year. Without a SHA (local dev) paths are left bare, except
// for the dev-only bust below.
//
// In dev, Safari's ES module map can hang onto a module script across a
// plain reload even though `handleAsset` sends `no-store` — the module cache
// lives above the HTTP cache and isn't reliably invalidated by it. A
// per-render timestamp gives every reload a distinct URL, so there's nothing
// for the module map to reuse. Chromium/Firefox refetch correctly on
// `no-store` alone, so this only needs to run for dev, not production.
export function versionAssetPath(path: string) {
  if (ASSET_VERSION) {
    return `${path}?${VERSION_PARAM}=${ASSET_VERSION}`;
  }

  return IS_DEV ? `${path}?t=${Date.now()}` : path;
}

// Normalizes a registry entry (bare path string, or `{ path, ... }`) to its
// served path. Use this instead of reading `SCRIPTS_REGISTRY[key]` directly.
export function resolveScriptPath(key: ScriptKey): string {
  const entry = SCRIPTS_REGISTRY[key];
  return typeof entry === "string" ? entry : entry.path;
}
