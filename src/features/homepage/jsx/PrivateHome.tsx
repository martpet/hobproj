import { DeleteAccountButton } from "@features/account/jsx/DeleteAccountButton.tsx";
import { PasskeysTable } from "@features/passkeys/jsx/PasskeysTable.tsx";
import { Passkey } from "@features/passkeys/types.ts";
import { ActiveSessionsTable } from "@features/sessions/jsx/ActiveSessionsTable.tsx";
import { LogOutButton } from "@features/sessions/jsx/LogOutButton.tsx";
import { Session } from "@features/sessions/types.ts";
import { User } from "@features/users/types.ts";
import { Page } from "@shared/jsx/Page.tsx";

interface PrivateHomeProps {
  user: User;
  sessions: Session[];
  currentSession: Session;
  passkeys: Passkey[];
}

export function PrivateHome(
  { user, sessions, currentSession, passkeys }: PrivateHomeProps,
) {
  return (
    <Page>
      <h1>Welcome {user.username}</h1>

      {
        /* type="submit" is only for Safari's default blue button styling —
          the button already submits by default as the form's only button. */
      }
      <LogOutButton type="submit" />

      <h2>Active sessions</h2>
      <ActiveSessionsTable
        sessions={sessions}
        currentSession={currentSession}
        passkeys={passkeys}
      />

      <h2>Passkeys</h2>
      <PasskeysTable passkeys={passkeys} />

      <h2>Delete account</h2>
      <DeleteAccountButton user={user} />
    </Page>
  );
}
