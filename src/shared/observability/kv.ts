import {
  commonAttributes,
  MetricAttributes,
  withSpan,
} from "@shared/observability/core.ts";
import { toSnakeCase } from "@std/text";

// Maps a key prefix constant (e.g. "users_by_username") to the domain entity
// used for tracing (e.g. "user"). This is the "what is this key for?"
// lookup, independent of the exact Deno KV operation being performed.
// Populated once per prefix via `kvKeys` (see @shared/kv/keys.ts).
const entityByPrefix = new Map<string, string>();

// Maps the same key prefix to the lookup name, snake_cased once here at
// registration (e.g. "byUsername" -> "by_username") so `operationFromLookup`
// doesn't have to convert it on every KV call. Combined with a verb to build
// a meaningful operation string like `get_by_username`, without relying on
// brittle parsing of the prefix itself.
const lookupByPrefix = new Map<string, string>();

export function registerKvEntity(
  prefix: string,
  entity: string,
  lookup: string = "unknown",
): void {
  entityByPrefix.set(prefix, entity);
  lookupByPrefix.set(prefix, toSnakeCase(lookup));
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

export interface TracedKv {
  get<T>(
    key: Deno.KvKey,
    options?: { consistency?: Deno.KvConsistencyLevel },
  ): Promise<Deno.KvEntryMaybe<T>>;
  list<T>(
    selector: Deno.KvListSelector,
    options?: Deno.KvListOptions,
  ): Promise<T[]>;
  set<T>(
    key: Deno.KvKey,
    value: T,
    options?: { expireIn?: number },
  ): Promise<Deno.KvCommitResult>;
  delete(key: Deno.KvKey): Promise<void>;
  atomic(): Deno.AtomicOperation;
}

// Wraps a raw Deno.Kv instance's read/write methods with a tracing span, so
// call sites don't have to manually pair every call with `withSpan`, or
// repeat what's already implied by the key: both the "entity" and
// "operation" attributes are derived from the key's prefix (registered via
// `registerKvEntity`).
export function traceKv(rawKv: Deno.Kv): TracedKv {
  return {
    async get<T>(
      key: Deno.KvKey,
      options?: { consistency?: Deno.KvConsistencyLevel },
    ): Promise<Deno.KvEntryMaybe<T>> {
      const entity = entityFromKeyPrefix(key[0]);
      return await withSpan(
        `kv.get ${entity}`,
        kvSpanAttributes(
          entity,
          typeof key[0] === "string" ? key[0] : "unknown",
          operationFromLookup("get", key[0]),
        ),
        () => rawKv.get<T>(key, options),
      );
    },

    async list<T>(
      selector: Deno.KvListSelector,
      options?: Deno.KvListOptions,
    ): Promise<T[]> {
      const prefix = "prefix" in selector ? selector.prefix[0] : undefined;
      const entity = entityFromKeyPrefix(prefix);
      return await withSpan(
        `kv.list ${entity}`,
        kvSpanAttributes(
          entity,
          typeof prefix === "string" ? prefix : "unknown",
          operationFromLookup("list", prefix),
        ),
        () => {
          const iter = rawKv.list<T>(selector, options);
          return Array.fromAsync(iter, (entry) => entry.value);
        },
      );
    },

    async set<T>(
      key: Deno.KvKey,
      value: T,
      options?: { expireIn?: number },
    ): Promise<Deno.KvCommitResult> {
      const entity = entityFromKeyPrefix(key[0]);
      return await withSpan(
        `kv.set ${entity}`,
        kvSpanAttributes(
          entity,
          typeof key[0] === "string" ? key[0] : "unknown",
          operationFromLookup("set", key[0]),
        ),
        () => rawKv.set(key, value, options),
      );
    },

    async delete(key: Deno.KvKey): Promise<void> {
      const entity = entityFromKeyPrefix(key[0]);
      return await withSpan(
        `kv.delete ${entity}`,
        kvSpanAttributes(
          entity,
          typeof key[0] === "string" ? key[0] : "unknown",
          operationFromLookup("delete", key[0]),
        ),
        () => rawKv.delete(key),
      );
    },

    // Atomic operations touch multiple keys/entities at once, so they
    // aren't wrapped in a span here; callers that want tracing can wrap the
    // whole atomic block themselves.
    atomic(): Deno.AtomicOperation {
      return rawKv.atomic();
    },
  };
}
