import { resolveScriptPath } from "@shared/asset/path.ts";
import {
  ScriptEntry,
  ScriptKey,
  SCRIPTS_REGISTRY,
} from "@shared/asset/registry.ts";
import { Context } from "@shared/context.ts";
import { ImportMap } from "@shared/jsx/ImportMap.tsx";
import { Link } from "@shared/jsx/Link.tsx";
import { Script } from "@shared/jsx/Script.tsx";

// Emits the scripts components registered on `c.head` during render. Must be
// rendered inside `<Deferred>` so those sets are complete (see Deferred.tsx).
// Order matters: the import map has to precede any module script that
// resolves a bare specifier through it, or the browser rejects the map.
export function Assets(_props: unknown, c: Context) {
  const { modulepreloads, importmap } = resolveDeps(c.head.modules);

  return (
    <>
      {importmap.size > 0 && (
        <ImportMap
          imports={Object.fromEntries(
            [...importmap].map((key) => [key, resolveScriptPath(key)]),
          )}
        />
      )}
      {[...modulepreloads].map((key) => (
        <Link href={resolveScriptPath(key)} rel="modulepreload" />
      ))}
      {[...c.head.modules].map((key) => (
        <Script src={resolveScriptPath(key)} type="module" />
      ))}
    </>
  );
}

// Walks the registry graph reachable from `modules`, following both static
// `import` and `dynamic` edges. `modulepreloads` only ever gets
// entries reached via static `import` edges; `importmap` gets everything
// reachable regardless of edge type (dynamic imports still need to resolve
// their bare specifier at `import()` time).
function resolveDeps(modules: Set<ScriptKey>) {
  const modulepreloads = new Set<ScriptKey>();
  const importmap = new Set<ScriptKey>();

  function visit(key: ScriptKey, viaStatic: boolean) {
    if (viaStatic) modulepreloads.add(key);
    if (importmap.has(key)) return;
    importmap.add(key);

    const entry: string | ScriptEntry = SCRIPTS_REGISTRY[key];
    if (typeof entry === "string") return;

    for (const dep of toArray(entry.import)) visit(dep as ScriptKey, true);
    for (const dep of toArray(entry.dynamic)) visit(dep as ScriptKey, false);
  }

  for (const key of modules) {
    const entry: string | ScriptEntry = SCRIPTS_REGISTRY[key];
    if (typeof entry === "string") continue;
    for (const dep of toArray(entry.import)) visit(dep as ScriptKey, true);
    for (const dep of toArray(entry.dynamic)) visit(dep as ScriptKey, false);
  }

  return { modulepreloads, importmap };
}

function toArray<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value as T];
}
