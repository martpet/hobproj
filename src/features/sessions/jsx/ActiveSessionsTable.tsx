import { PasskeyLabel } from "@features/passkeys/jsx/PasskeyLabel.tsx";
import { Passkey } from "@features/passkeys/types.ts";
import { LogOutButton } from "@features/sessions/jsx/LogOutButton.tsx";
import { Context } from "@shared/context.ts";
import { lookupLocation } from "@shared/geoip.ts";
import { dateTimeFormat, relativeTime } from "@shared/intl.ts";
import { MINUTE } from "@std/datetime";
import { decodeTime } from "@std/ulid";
import { Session } from "../types.ts";

interface ActiveSessionsTableProps {
  sessions: Session[];
  currentSession: Session;
  passkeys: Passkey[];
}

export function ActiveSessionsTable(
  { sessions, currentSession, passkeys }: ActiveSessionsTableProps,
  c: Context,
) {
  const dateWithTimeFmt = dateTimeFormat(c);
  const now = Date.now();
  const multipleSessions = sessions.length > 1;
  const passkeyById = new Map(
    passkeys.map((passkey) => [passkey.id, passkey]),
  );
  // With a single passkey every session normally came from it, so the column
  // would be all the same value — unless that passkey was since deleted
  // (still possible for the session that minted it, see `handlePasskeyDelete`),
  // in which case showing "Deleted passkey" is worth the column.
  const showPasskeyColumn = passkeys.length > 1 ||
    sessions.some((session) => !passkeyById.has(session.passkeyId));

  return (
    <table>
      <thead>
        <tr>
          <th>OS</th>
          <th>Browser</th>
          {showPasskeyColumn && <th>Passkey</th>}
          <th>IP address</th>
          <th>Login</th>
          {multipleSessions && <th>Last seen</th>}
          <th>Location</th>
          {multipleSessions && <th></th>}
        </tr>
      </thead>

      {sessions.map((session) => {
        const passkey = passkeyById.get(session.passkeyId);
        const isCurrentSession = session.id === currentSession.id;
        const created = dateWithTimeFmt.format(decodeTime(session.id));
        const idleMs = now - session.lastActive;
        let lastSeen = "now";

        // `lastActive` only updates every `SESSION_ACTIVITY_INTERVAL`, so for
        // the session making this very request it can read minutes old.
        if (!isCurrentSession && idleMs >= MINUTE) {
          lastSeen = relativeTime(c, -idleMs);
        }

        return (
          <tr>
            <td>{session.os}</td>
            <td>{session.browser}</td>
            {showPasskeyColumn && (
              <td>
                {passkey
                  ? <PasskeyLabel passkey={passkey} />
                  : "Deleted passkey"}
              </td>
            )}
            <td>{session.ip}</td>
            <td>{created}</td>
            {multipleSessions && <td>{lastSeen}</td>}
            <td>{lookupLocation(session.ip) ?? "Unknown"}</td>
            {multipleSessions && (
              <td>
                {isCurrentSession
                  ? "Current Session"
                  : (
                    <LogOutButton sessionId={session.id}>
                      Revoke
                    </LogOutButton>
                  )}
              </td>
            )}
          </tr>
        );
      })}
    </table>
  );
}
