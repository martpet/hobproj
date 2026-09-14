import { recordException } from "@shared/observability/core.ts";
import { registerKvEntity, withKvSpan } from "@shared/observability/kv.ts";
import { toSnakeCase } from "@std/text";
import { ulid } from "@std/ulid";
import {
  blindIndex,
  decryptValue,
  encryptValue,
  isEncryptionEnabled,
} from "@shared/crypto/encryption.ts";

/** Properties of `T` that can be used as a key part. */
export type KvKeyProp<T> = {
  [K in keyof T]: T[K] extends Deno.KvKeyPart ? K : never;
}[keyof T];

// A single property, or several combined into one compound key. Either way
// the leading property names the index: `["userId", "id"]` is read with
// `listByUserId` and stored under `session_by_user_id`.
export type KvIndex<T> = KvKeyProp<T> | readonly KvKeyProp<T>[];

/**
 * Properties that may be encrypted: string-valued, and never the primary key,
 * which the collection mints itself.
 */
export type KvEncryptedProp<T, Key extends KvKeyProp<T>> = Exclude<
  {
    [K in keyof T]-?: NonNullable<T[K]> extends string ? K : never;
  }[keyof T],
  Key
>;

export interface KvCollectionConfig<
  T,
  Key extends KvKeyProp<T>,
  Indexes extends readonly KvIndex<T>[],
> {
  /** Names the tracing entity and prefixes keys: `<name>_by_<property>`. */
  name: string;
  /** The identity of a value, minted when it is written without one. */
  key: Key;
  /** Further lookups, each named by the property it leads with. */
  indexes?: Indexes;
  /**
   * Properties held as ciphertext rather than plaintext. An encrypted
   * property may still be indexed — its key part becomes a blind index, so
   * `getBy...`/`listBy...` keep taking the plaintext — but only for equality
   * lookups: hashing destroys ordering, so a property an index relies on for
   * range semantics (a `lastActive` leading a sorted index, say) must stay
   * unencrypted.
   */
  encrypt?: readonly KvEncryptedProp<T, Key>[];
  expireIn?: number | ((value: T) => number | undefined);
}

export interface KvSetOptions<T> {
  /** Overrides the collection's `expireIn`. */
  expireIn?: number;
  /** The value being replaced, so its stale index keys can be dropped. */
  previous?: T;
}

/** A value to write, with its key left to the collection to mint. */
export type KvInput<T, Key extends KvKeyProp<T>> =
  & Omit<T, Key>
  & Partial<Pick<T, Key>>;

type KvPart<T, P> = Extract<T[P & keyof T], Deno.KvKeyPart>;

/** The property an index is named after. */
type KvLead<I> = I extends readonly [infer P, ...unknown[]] ? P : I;

/** One argument per property of the index, in the order they are keyed. */
type KvParts<T, I> = I extends readonly [...infer Props]
  ? { -readonly [K in keyof Props]: KvPart<T, Props[K]> }
  : [KvPart<T, I>];

// Keys that don't name an index (a tuple's `length`, say) drop out here,
// because `& string` leaves them without a name to be mapped to.
type KvIndexMap<T, Defs extends readonly KvIndex<T>[]> = {
  [K in Extract<keyof Defs, `${number}`> as KvLead<Defs[K]> & string]: Defs[K];
};

// `by${Capitalize<...>}` is what turns an index on `userId` into the
// `listByUserId` the call sites read as a sentence.
type KvLookups<T, ByName> =
  & {
    [P in keyof ByName as `keyBy${Capitalize<P & string>}`]: (
      ...parts: KvParts<T, ByName[P]>
    ) => Promise<Deno.KvKey>;
  }
  & {
    [P in keyof ByName as `getBy${Capitalize<P & string>}`]: (
      ...parts: KvParts<T, ByName[P]>
    ) => Promise<T | null>;
  }
  & {
    /** The entry behind the lookup, for `atomic().check(...)`. */
    [P in keyof ByName as `getEntryBy${Capitalize<P & string>}`]: (
      ...parts: KvParts<T, ByName[P]>
    ) => Promise<Deno.KvEntryMaybe<T>>;
  }
  & {
    [P in keyof ByName as `listBy${Capitalize<P & string>}`]: (
      part: KvPart<T, P>,
    ) => Promise<T[]>;
  }
  & {
    [P in keyof ByName as `listEntriesBy${Capitalize<P & string>}`]: (
      part: KvPart<T, P>,
    ) => Promise<Deno.KvEntry<T>[]>;
  };

export type KvCollection<
  T,
  Key extends KvKeyProp<T>,
  Indexes extends readonly KvIndex<T>[],
> =
  & KvLookups<T, KvIndexMap<T, readonly [Key, ...Indexes]>>
  & {
    /** Writes every index key in one commit of its own. */
    set(value: KvInput<T, Key>, options?: KvSetOptions<T>): Promise<T>;
    /** `set`, queued on a commit the caller owns. */
    stageSet(
      atomic: Deno.AtomicOperation,
      value: KvInput<T, Key>,
      options?: KvSetOptions<T>,
    ): Promise<T>;
    delete(value: T): Promise<void>;
    /** `delete`, queued on a commit the caller owns. */
    stageDelete(atomic: Deno.AtomicOperation, value: T): Promise<void>;
  };

interface IndexEntry<T> {
  prefix: string;
  props: readonly KvKeyProp<T>[];
}

function title(value: string) {
  return value[0]!.toUpperCase() + value.slice(1);
}

function sameKey(left: Deno.KvKey, right: Deno.KvKey) {
  return left.length === right.length &&
    left.every((part, position) => part === right[position]);
}

// Binds the collection API to a KV handle, so this module stays a pure
// function of its input and the connection is opened in exactly one place.
export function createDefineCollection(kv: Deno.Kv) {
  // Curried so the value type can be given while the index literals stay
  // inferred: that inference is what names `getByUsername` and what lets
  // `set` know which property it may mint.
  return function defineCollection<T>() {
    return function <
      const Key extends KvKeyProp<T>,
      const Indexes extends readonly KvIndex<T>[] = [],
    >(
      config: KvCollectionConfig<T, Key, Indexes>,
    ): KvCollection<T, Key, Indexes> {
      const { name, key: primary, indexes: extra = [], expireIn } = config;

      // Left empty where encryption is switched off (dev without a key), so
      // every field takes the plaintext path below.
      const encrypted = new Set<PropertyKey>(
        isEncryptionEnabled ? config.encrypt ?? [] : [],
      );

      // Pins a value to the field it was written for; see
      // `@shared/crypto/encryption.ts`.
      function scopeOf(prop: PropertyKey) {
        return `${name}:${String(prop)}`;
      }

      // Keyed by the leading property, which is how the lookups are named.
      const indexes = new Map<PropertyKey, IndexEntry<T>>();

      for (const definition of [primary, ...extra]) {
        const props = (Array.isArray(definition)
          ? definition
          : [definition]) as readonly KvKeyProp<T>[];
        const lead = props[0] as KvKeyProp<T>;

        if (indexes.has(lead)) {
          throw new Error(
            `Collection "${name}" indexes "${String(lead)}" twice`,
          );
        }

        const lookup = `by_${toSnakeCase(String(lead))}`;
        const prefix = `${name}_${lookup}`;

        registerKvEntity(prefix, name, lookup);
        indexes.set(lead, { prefix, props });
      }

      // An encrypted property can't be its own key part: ciphertext differs on
      // every write, so a lookup would never find it again. The deterministic
      // blind index stands in for it, on writes and lookups alike.
      function keyPart(prop: KvKeyProp<T> | undefined, part: Deno.KvKeyPart) {
        if (prop === undefined || !encrypted.has(prop)) {
          return Promise.resolve(part);
        }
        return blindIndex(scopeOf(prop), String(part));
      }

      async function key(
        lead: PropertyKey,
        ...parts: Deno.KvKeyPart[]
      ): Promise<Deno.KvKey> {
        const { prefix, props } = indexes.get(lead)!;
        return [
          prefix,
          ...await Promise.all(
            parts.map((part, position) => keyPart(props[position], part)),
          ),
        ];
      }

      // Every index holds the whole value, so a write touches all of them.
      function keysOf(value: T): Promise<Deno.KvKey[]> {
        return Promise.all(
          indexes.values().map(async ({ prefix, props }) => [
            prefix,
            ...await Promise.all(
              props.map((prop) =>
                keyPart(prop, value[prop as keyof T] as Deno.KvKeyPart)
              ),
            ),
          ]).toArray(),
        );
      }

      // The stored shape differs from `T` only in that encrypted properties
      // hold ciphertext; callers never see it, because every read path below
      // runs it back through `decryptFields`.
      async function encryptFields(value: T): Promise<T> {
        if (encrypted.size === 0) return value;

        const stored = { ...value } as Record<PropertyKey, unknown>;

        for (const prop of encrypted) {
          const plaintext = stored[prop];
          if (plaintext == null) continue;
          stored[prop] = await encryptValue(scopeOf(prop), String(plaintext));
        }

        return stored as T;
      }

      // `null` for a value this environment can't read: written under another
      // key, tampered with, or left behind by an earlier format. Callers treat
      // that as a missing record, so a half-readable value never escapes.
      async function decryptFields(
        value: T,
      ): Promise<{ readable: true; value: T } | { readable: false }> {
        if (encrypted.size === 0) return { readable: true, value };

        const plain = { ...value } as Record<PropertyKey, unknown>;

        for (const prop of encrypted) {
          const stored = plain[prop];
          if (stored == null) continue;

          const plaintext = typeof stored === "string"
            ? await decryptValue(scopeOf(prop), stored)
            : null;

          if (plaintext === null) {
            recordException(
              new Error(
                `Cannot decrypt "${String(prop)}" of "${name}"; ` +
                  "treating the record as missing",
              ),
            );
            return { readable: false };
          }

          plain[prop] = plaintext;
        }

        return { readable: true, value: plain as T };
      }

      // Indistinguishable from what KV returns for a key that holds nothing,
      // down to the dropped versionstamp: an `atomic().check()` built on this
      // entry then asserts "nothing here" and the commit fails, rather than
      // overwriting a record this process could not read.
      async function decryptEntry(
        entry: Deno.KvEntryMaybe<T>,
      ): Promise<Deno.KvEntryMaybe<T>> {
        if (entry.versionstamp === null) return entry;

        const decrypted = await decryptFields(entry.value);

        if (!decrypted.readable) {
          return { key: entry.key, value: null, versionstamp: null };
        }

        return {
          key: entry.key,
          value: decrypted.value,
          versionstamp: entry.versionstamp,
        };
      }

      async function decryptEntries(entries: Deno.KvEntry<T>[]) {
        if (encrypted.size === 0) return entries;

        const decrypted: Deno.KvEntry<T>[] = [];

        for (const entry of entries) {
          const value = await decryptFields(entry.value);
          // A `Deno.KvEntry` has nowhere to put "unreadable", so the entry
          // drops out of the list, exactly as a missing one would.
          if (value.readable) decrypted.push({ ...entry, value: value.value });
        }

        return decrypted;
      }

      // The collection owns its primary key, so a value that arrives without
      // one is named here rather than by the caller.
      function withKey(value: KvInput<T, Key>): T {
        if ((value as Record<PropertyKey, unknown>)[primary] != null) {
          return value as T;
        }
        return { ...value, [primary]: ulid() } as T;
      }

      async function stageSet(
        atomic: Deno.AtomicOperation,
        value: KvInput<T, Key>,
        options?: KvSetOptions<T>,
      ) {
        const next = withKey(value);
        const keys = await keysOf(next);

        // An index built on a changing property (a session's `lastActive`)
        // leaves the old key behind, pointing at a stale copy of the value.
        if (options?.previous) {
          (await keysOf(options.previous)).forEach((previousKey, position) => {
            const nextKey = keys[position];
            if (nextKey && !sameKey(previousKey, nextKey)) {
              atomic.delete(previousKey);
            }
          });
        }

        const ttl = options?.expireIn ??
          (typeof expireIn === "function" ? expireIn(next) : expireIn);

        const stored = await encryptFields(next);

        for (const nextKey of keys) {
          atomic.set(
            nextKey,
            stored,
            ttl === undefined ? undefined : {
              expireIn: ttl,
            },
          );
        }

        // The caller keeps the plaintext it handed in; only KV sees
        // ciphertext.
        return next;
      }

      async function stageDelete(atomic: Deno.AtomicOperation, value: T) {
        for (const staleKey of await keysOf(value)) {
          atomic.delete(staleKey);
        }
      }

      const collection: Record<string, unknown> = {
        stageSet,
        stageDelete,
        set: async (value: KvInput<T, Key>, options?: KvSetOptions<T>) => {
          const atomic = kv.atomic();
          const next = await stageSet(atomic, value, options);
          await atomic.commit();
          return next;
        },
        delete: async (value: T) => {
          const atomic = kv.atomic();
          await stageDelete(atomic, value);
          await atomic.commit();
        },
      };

      for (const lead of indexes.keys()) {
        const lookup = title(String(lead));

        // Decryption runs inside the span, so a record that fails to decrypt
        // is recorded against the read that found it.
        const getEntry = async (...parts: Deno.KvKeyPart[]) => {
          const entryKey = await key(lead, ...parts);
          return withKvSpan(
            "get",
            entryKey,
            async () => decryptEntry(await kv.get<T>(entryKey)),
          );
        };

        const listEntries = async (part: Deno.KvKeyPart) => {
          const prefix = await key(lead, part);
          return withKvSpan(
            "list",
            prefix,
            async () =>
              decryptEntries(await Array.fromAsync(kv.list<T>({ prefix }))),
          );
        };

        collection[`keyBy${lookup}`] = (...parts: Deno.KvKeyPart[]) =>
          key(lead, ...parts);
        collection[`getEntryBy${lookup}`] = getEntry;
        collection[`getBy${lookup}`] = async (...parts: Deno.KvKeyPart[]) =>
          (await getEntry(...parts)).value;
        collection[`listEntriesBy${lookup}`] = listEntries;
        collection[`listBy${lookup}`] = async (part: Deno.KvKeyPart) =>
          (await listEntries(part)).map((entry) => entry.value);
      }

      return collection as KvCollection<T, Key, Indexes>;
    };
  };
}
