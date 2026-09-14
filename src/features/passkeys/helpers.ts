import { versionAssetPath } from "@shared/asset/path.ts";
import { AAGUID_NAMES, AAGUIDS_WITHOUT_ICON } from "./aaguid.ts";
import { Passkey } from "./types.ts";

export function getAaguidName(aaguid: string) {
  return AAGUID_NAMES[aaguid];
}

export interface AaguidIcon {
  light: string;
  dark: string;
}

// Light/dark icon URLs for an authenticator, or `undefined` if it has no
// name or no vendored icon.
export function getAaguidIcon(aaguid: string): AaguidIcon | undefined {
  if (!(aaguid in AAGUID_NAMES) || AAGUIDS_WITHOUT_ICON.has(aaguid)) {
    return undefined;
  }

  return {
    light: versionAssetPath(`/passkeys/assets/icons/${aaguid}-light.svg`),
    dark: versionAssetPath(`/passkeys/assets/icons/${aaguid}-dark.svg`),
  };
}

// Default name for a freshly registered passkey: just the authenticator
// name, unqualified. No uniqueness check needed — `getPasskeyDisplayName`
// appends a credId-derived suffix, so passkeys never look identical to the
// user even if they share this default (or a custom name).
export function getDefaultPasskeyName({ aaguid }: Pick<Passkey, "aaguid">) {
  return getAaguidName(aaguid) ?? "Passkey";
}

// The name shown to the user: their name (custom or default) plus a slice of
// the credential id, so passkeys are always distinguishable even when two
// share a name.
export function getPasskeyDisplayName({ name, credId }: Passkey) {
  return `${name} • ${credId.slice(-4)}`;
}
