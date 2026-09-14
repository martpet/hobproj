export type ScriptKey = keyof typeof SCRIPTS_REGISTRY;

export interface ScriptEntry {
  path: string;
  // Bare specifiers this module statically imports. Resolved (transitively)
  // by `Assets` into `<link rel="modulepreload">` tags and importmap entries.
  import?: string | readonly string[];
  // Bare specifiers this module imports dynamically (`import()`). Resolved
  // (transitively) into importmap entries only, not modulepreloads.
  dynamic?: string | readonly string[];
}

// Bare specifier → served path (plus optional static/dynamic import deps).
// Keys double as import-map names, so browser code imports them as-is
// (`import { apiFetch } from "util"`). Components only register the modules
// they render (`c.head.modules.add(...)`); `Assets` derives the
// modulepreloads and importmap from this registry.
export const SCRIPTS_REGISTRY = {
  "util": "/assets/util.js",
  "simplewebauthn": "/passkeys/assets/simplewebauthn.js",
  "passkeys": {
    path: "/passkeys/assets/passkeys.js",
    import: "util",
    dynamic: "simplewebauthn",
  },
  "signup-form": {
    path: "/account/assets/signup-form.js",
    import: "passkeys",
  },
  "delete-account-form": {
    path: "/account/assets/delete-account-form.js",
    import: "passkeys",
  },
  "login-button": {
    path: "/session/assets/login-button.js",
    import: "passkeys",
  },
  "passkeys-table": {
    path: "/passkeys/assets/passkeys-table.js",
    import: "passkeys",
  },
} as const satisfies Record<string, string | ScriptEntry>;
