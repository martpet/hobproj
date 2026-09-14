import { APP_ORIGIN, WEBSITE_TITLE } from "@shared/constants.ts";
import { MINUTE } from "@std/datetime";

export const WEBAUTHN_TIMEOUT = 5 * MINUTE;

// `preferred` rather than `required`: platform authenticators verify anyway,
// while some security keys have no PIN/biometric and would otherwise fail.
export const WEBAUTHN_USER_VERIFICATION = "preferred";
export const WEBAUTHN_RP_NAME = WEBSITE_TITLE;
export const WEBAUTHN_ORIGIN = APP_ORIGIN;

// Passkeys are bound to the RP ID; changing the hostname orphans them all.
export const WEBAUTHN_RP_ID = new URL(WEBAUTHN_ORIGIN).hostname;

export const PASSKEY_NAME_MAX_LENGTH = 50;
