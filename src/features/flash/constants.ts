import { FlashMessage } from "./types.ts";

// Only the key travels in the cookie; the message text lives here so it can
// be changed without invalidating cookies already in the wild.
export const FLASH = {
  "LOGGED_OUT": {
    type: "success",
    message: "Signed out",
  },
  "SESSION_REVOKED": {
    type: "success",
    message: "Session revoked",
  },
  "SESSION_EXPIRED": {
    type: "warning",
    message: "Your session expired",
  },
  "REAUTHENTICATED": {
    type: "success",
    message: "Successfully reauthenticated",
  },
  "ACCOUNT_DELETED": {
    type: "success",
    message: "Account deleted",
  },
  "PASSKEY_ADDED": {
    type: "success",
    message: "Passkey added",
  },
  "PASSKEY_DELETED": {
    type: "success",
    message: "Passkey deleted",
  },
  "PASSKEY_RENAMED": {
    type: "success",
    message: "Passkey renamed",
  },
  "PASSKEY_LAST_ONE": {
    type: "warning",
    message: "You can't delete your last passkey — delete the account instead",
  },
} as const satisfies Record<string, FlashMessage>;
