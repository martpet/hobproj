import { registerKvEntity, withKvSpan } from "@shared/observability/kv.ts";
import { toSnakeCase } from "@std/text";
import { ulid } from "@std/ulid";

/** Properties of `T` that can be used as a key part. */
export type KvKeyProp<T> = {
  [K in keyof T]: T[K] extends Deno.KvKeyPart ? K : never;
}[keyof T];

// A single property, or several combined into one compound key. Either way
// the leading property names the index: `["userId", "id"]` is read with
// `listByUserId` and stored under `session_by_user_id`.
export type KvIndex<T> = KvKeyProp<T> | readonly KvKeyProp<T>[];

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
    ) => Deno.KvKey;
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
    ): T;
    delete(value: T): Promise<void>;
    /** `delete`, queued on a commit the caller owns. */
    stageDelete(atomic: Deno.AtomicOperation, value: T): void;
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

      function key(lead: PropertyKey, ...parts: Deno.KvKeyPart[]): Deno.KvKey {
        return [indexes.get(lead)!.prefix, ...parts];
      }

      // Every index holds the whole value, so a write touches all of them.
      function keysOf(value: T): Deno.KvKey[] {
        return indexes.values().map(({ prefix, props }) => [
          prefix,
          ...props.map((prop) => value[prop as keyof T] as Deno.KvKeyPart),
        ]).toArray();
      }

      // The collection owns its primary key, so a value that arrives without
      // one is named here rather than by the caller.
      function withKey(value: KvInput<T, Key>): T {
        if ((value as Record<PropertyKey, unknown>)[primary] != null) {
          return value as T;
        }
        return { ...value, [primary]: ulid() } as T;
      }

      function stageSet(
        atomic: Deno.AtomicOperation,
        value: KvInput<T, Key>,
        options?: KvSetOptions<T>,
      ) {
        const next = withKey(value);
        const keys = keysOf(next);

        // An index built on a changing property (a session's `lastActive`)
        // leaves the old key behind, pointing at a stale copy of the value.
        if (options?.previous) {
          keysOf(options.previous).forEach((previousKey, position) => {
            const nextKey = keys[position];
            if (nextKey && !sameKey(previousKey, nextKey)) {
              atomic.delete(previousKey);
            }
          });
        }

        const ttl = options?.expireIn ??
          (typeof expireIn === "function" ? expireIn(next) : expireIn);

        for (const nextKey of keys) {
          atomic.set(
            nextKey,
            next,
            ttl === undefined ? undefined : {
              expireIn: ttl,
            },
          );
        }

        return next;
      }

      function stageDelete(atomic: Deno.AtomicOperation, value: T) {
        for (const staleKey of keysOf(value)) {
          atomic.delete(staleKey);
        }
      }

      const collection: Record<string, unknown> = {
        stageSet,
        stageDelete,
        set: async (value: KvInput<T, Key>, options?: KvSetOptions<T>) => {
          const atomic = kv.atomic();
          const next = stageSet(atomic, value, options);
          await atomic.commit();
          return next;
        },
        delete: async (value: T) => {
          const atomic = kv.atomic();
          stageDelete(atomic, value);
          await atomic.commit();
        },
      };

      for (const lead of indexes.keys()) {
        const lookup = title(String(lead));

        const getEntry = (...parts: Deno.KvKeyPart[]) => {
          const entryKey = key(lead, ...parts);
          return withKvSpan("get", entryKey, () => kv.get<T>(entryKey));
        };

        const listEntries = (part: Deno.KvKeyPart) => {
          const prefix = key(lead, part);
          return withKvSpan(
            "list",
            prefix,
            () => Array.fromAsync(kv.list<T>({ prefix })),
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
