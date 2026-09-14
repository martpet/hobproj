import { versionAssetPath } from "@shared/asset/path.ts";
import { mapEntries } from "@std/collections";

interface ImportMapProps {
  imports: Record<string, string>;
}

export function ImportMap({ imports }: ImportMapProps) {
  const importMapJson = {
    imports: mapEntries(imports, ([k, v]) => [k, versionAssetPath(v)]),
  };

  return (
    <script
      type="importmap"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(importMapJson, null, 2),
      }}
    />
  );
}
