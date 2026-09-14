import { DAY } from "@std/datetime";

// How long a deleted account's WebAuthn userHandle is remembered, so a later
// failed login attempt can report "account deleted" instead of "not found".
export const DELETED_ACCOUNT_TOMBSTONE_TTL = DAY * 30;
