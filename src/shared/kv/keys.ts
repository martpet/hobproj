import { registerKvEntity } from "@shared/observability/kv.ts";

// A property of T that can be stored as a single Deno.Kv key part (string,
// number, etc.) — used to constrain `props` below to real, key-safe fields.
type KvKeyPartProp<T> = {
  [K in keyof T]: T[K] extends Deno.KvKeyPart ? K : never;
}[keyof T];

type KvKeyEntry<T> = {
  // The literal on-disk storage key prefix; also registered for tracing.
  prefix: string;
  // The property (or properties, for a composite key) of T that make up
  // this entry's key parts after the prefix, e.g. "username" or
  // ["userId", "id"]. Type-checked against T, so a typo or a non-key-safe
  // property (e.g. an object) is a compile error.
  props: KvKeyPartProp<T> | readonly KvKeyPartProp<T>[];
};

// Maps a lookup name (e.g. "byId", "byUsername") to the key entry that
// builds it, for one entity's family of KV keys.
type KvKeysMap<T> = Record<string, KvKeyEntry<T>>;

type KvKeys<T, Keys extends KvKeysMap<T>> =
  & {
    [Lookup in keyof Keys]: (
      ...parts: Deno.KvKeyPart[]
    ) => Deno.KvKey;
  }
  & { keys(value: T): Deno.KvKey[] };

// Extracts the actual key part value(s) for `props` (one property name or
// several, for a composite key) from a stored value, e.g.
// `partsFromValue(user, ["userId", "id"])` -> `[user.userId, user.id]`.
function partsFromValue<T>(
  value: T,
  props: KvKeyPartProp<T> | readonly KvKeyPartProp<T>[],
): Deno.KvKeyPart[] {
  const propList = Array.isArray(props) ? props : [props];
  return propList.map((prop) => value[prop as keyof T] as Deno.KvKeyPart);
}

// Defines a related family of KV keys for one entity, e.g. every way a User
// can be looked up. `entity` is passed to `registerKvEntity` for each entry
// so tracing can label KV operations on this key with the right entity (see
// `hobproj.entity` in @shared/observability/kv.ts). Returns one key-builder
// method per entry in `keys` (named after the entry), plus a `.keys(value)`
// that builds every key for a given stored value, for
// `atomic.set`/`atomic.delete` calls that must keep all of an entity's keys
// in sync.
//
//   const userKeys = kvKeys<User>("user")({
//     byId: { prefix: "users_by_id", props: "id" },
//     byUsername: { prefix: "users_by_username", props: "username" },
//   });
//
//   userKeys.byId(id)     // -> ["users_by_id", id]
//   userKeys.keys(user)   // -> [["users_by_id", user.id], ["users_by_username", user.username]]
//
// Curried so `T` can be given explicitly while `Keys` is still inferred
// from the argument (TS can't infer both in a single call).
export function kvKeys<T>(entity: string) {
  return function <Keys extends KvKeysMap<T>>(
    keys: Keys,
  ): KvKeys<T, Keys> {
    const namedEntries = Object.entries(keys) as [string, KvKeyEntry<T>][];
    const result = {} as Record<string, unknown>;

    for (const [name, entry] of namedEntries) {
      registerKvEntity(entry.prefix, entity, name);
      result[name] = (...parts: Deno.KvKeyPart[]): Deno.KvKey => [
        entry.prefix,
        ...parts,
      ];
    }

    result.keys = (value: T): Deno.KvKey[] =>
      namedEntries.map((
        [, entry],
      ) => [entry.prefix, ...partsFromValue(value, entry.props)]);

    return result as KvKeys<T, Keys>;
  };
}
