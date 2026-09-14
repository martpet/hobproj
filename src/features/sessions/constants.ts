import { DAY, MINUTE, WEEK } from "@std/datetime";

// A session ends after a day without requests, or a week after the last
// passkey ceremony, whichever comes first. Reauthenticating restarts both.
export const SESSION_IDLE_TIMEOUT = DAY;
export const SESSION_ABSOLUTE_TIMEOUT = WEEK;

// Minimum gap between KV writes that slide the idle timeout; `lastActive`
// shown in the sessions table is therefore accurate to this granularity.
export const SESSION_ACTIVITY_INTERVAL = MINUTE * 5;

// How far ahead of the absolute timeout the "session expiring" banner shows.
export const SESSION_EXPIRY_WARNING_THRESHOLD = DAY;

// How recently the user must have completed a passkey ceremony (login or
// reauth) for sensitive actions like account deletion to proceed without
// prompting for reauthentication.
export const SENSITIVE_ACTION_MAX_AUTH_AGE = MINUTE * 5;
