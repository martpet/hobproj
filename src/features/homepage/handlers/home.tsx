import { passkeys } from "@features/passkeys/collection.ts";
import { sessions } from "@features/sessions/collection.ts";
import { Context, isAuthenticatedContext } from "@shared/context.ts";
import { PrivateHome } from "../jsx/PrivateHome.tsx";
import { PublicHome } from "../jsx/PublicHome.tsx";

export async function handleHomepage(c: Context) {
  if (!isAuthenticatedContext(c)) {
    return <PublicHome />;
  }

  const [userSessions, userPasskeys] = await Promise.all([
    sessions.listByUserId(c.user.id),
    passkeys.listByUserId(c.user.id),
  ]);

  // Current session first, the rest most recently active first.
  userSessions.sort((a, b) => {
    if (a.id === c.session.id) return -1;
    if (b.id === c.session.id) return 1;

    return b.lastActive - a.lastActive;
  });

  // Most recently used first.
  userPasskeys.sort((a, b) => b.lastUsedAt - a.lastUsedAt);

  return (
    <PrivateHome
      user={c.user}
      sessions={userSessions}
      currentSession={c.session}
      passkeys={userPasskeys}
    />
  );
}
