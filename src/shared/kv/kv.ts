import { getEnv } from "@shared/environment.ts";
import { createDefineCollection } from "./collection.ts";

// The one place the database is opened. Reads and writes belong in a
// collection, which derives the keys and traces the call; direct use of this
// handle is for `atomic()`, when several collections have to commit together.
export const kv = await Deno.openKv(getEnv("KV_PATH"));

export const defineCollection = createDefineCollection(kv);
