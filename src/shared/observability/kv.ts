import {
  commonAttributes,
  MetricAttributes,
  withSpan,
} from "@shared/observability/core.ts";
// Maps a key prefix constant (e.g. "user_by_username") to the domain entity
// used for tracing (e.g. "user"). This is the "what is this key for?"
// lookup, independent of the exact Deno KV operation being performed.
// Populated once per prefix via `defineCollection` (see @shared/kv/collection.ts).
const entityByPrefix = new Map<string, string>();

// Maps the same key prefix to the name of the lookup it serves (e.g.
// "by_username"), which a verb turns into a meaningful operation string like
// `get_by_username`, without relying on brittle parsing of the prefix itself.
const lookupByPrefix = new Map<string, string>();

export function registerKvEntity(
  prefix: string,
  entity: string,
  lookup: string,
): void {
  entityByPrefix.set(prefix, entity);
  lookupByPrefix.set(prefix, lookup);
}

function entityFromKeyPrefix(prefix: unknown): string {
  if (typeof prefix !== "string") return "unknown";
  return entityByPrefix.get(prefix) ?? "unknown";
}

function operationFromLookup(verb: string, prefix: unknown): string {
  if (typeof prefix !== "string") return verb;
  const lookup = lookupByPrefix.get(prefix);
  if (!lookup) return verb;
  return `${verb}_${lookup}`;
}

function kvSpanAttributes(
  entity: string,
  collection: string,
  operation: string,
): MetricAttributes {
  return {
    ...commonAttributes,
    "db.system.name": "denokv",
    "db.collection.name": collection,
    "db.operation.name": operation,
    "hobproj.entity": entity,
  };
}

// Wraps a KV read with a tracing span, so collections don't have to pair
// every call with `withSpan`, or repeat what's already implied by the key:
// both the "entity" and "operation" attributes are derived from the key's
// prefix (registered via `registerKvEntity`).
export async function withKvSpan<T>(
  verb: string,
  key: Deno.KvKey | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  const prefix = key?.[0];
  const entity = entityFromKeyPrefix(prefix);
  return await withSpan(
    `kv.${verb} ${entity}`,
    kvSpanAttributes(
      entity,
      typeof prefix === "string" ? prefix : "unknown",
      operationFromLookup(verb, prefix),
    ),
    operation,
  );
}
