import { UserAgent } from "@std/http";

export interface Session {
  id: string;
  cookie: string;
  userId: string;
  // The passkey whose ceremony minted this session (login, reauth or
  // signup); lets the sessions table show which key a session came from.
  passkeyId: string;
  expiresAt: number;
  lastActive: number;
  browser: UserAgent["browser"]["name"];
  os: UserAgent["os"]["name"];
  ip: string;
}
