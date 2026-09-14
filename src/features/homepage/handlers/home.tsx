import { listPasskeysByUserId } from "@features/passkeys/kv.ts";
import { listSessionsByUserId } from "@features/sessions/kv.ts";
import { Context, isAuthenticatedContext } from "@shared/context.ts";
import { PrivateHome } from "../jsx/PrivateHome.tsx";
import { PublicHome } from "../jsx/PublicHome.tsx";

export async function handleHomepage(c: Context) {
  if (!isAuthenticatedContext(c)) {
    return <PublicHome />;
  }

  const [sessions, passkeys] = await Promise.all([
    listSessionsByUserId(c.user.id),
    listPasskeysByUserId(c.user.id),
  ]);

  // Current session first, the rest most recently active first.
  sessions.sort((a, b) => {
    if (a.id === c.session.id) return -1;
    if (b.id === c.session.id) return 1;

    return b.lastActive - a.lastActive;
  });

  // Most recently used first.
  passkeys.sort((a, b) => b.lastUsedAt - a.lastUsedAt);

  return (
    <PrivateHome
      user={c.user}
      sessions={sessions}
      currentSession={c.session}
      passkeys={passkeys}
    />
  );
}
