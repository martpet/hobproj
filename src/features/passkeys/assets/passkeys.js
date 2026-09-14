import {
  apiFetch,
  showAlert,
  showDialog,
  toggleButtonLoading,
  toggleFormBuisy,
} from "util";

// All client-side passkey flows live here; the per-page scripts
// (signup-form.js, login-button.js, delete-account-form.js,
// passkeys-table.js) only bind DOM events to these functions.

// Must match STEP_UP_REAUTH_HEADER in
// sessions/handlers/login/finish.ts — client assets can't import server
// modules, so the name is duplicated rather than shared.
const STEP_UP_REAUTH_HEADER = "X-Step-Up-Reauth";

// ---------------------------------------------------------------------------
// Flows

export async function signupWithPasskey(form) {
  toggleFormBuisy(form);

  const onReset = () => toggleFormBuisy(form);

  try {
    const finish = await runRegistrationCeremony({
      startPath: "/signup/start",
      finishPath: "/signup/finish",
      json: { username: form.username.value },
    });

    // Routed to the field itself rather than a generic alert; `detail`
    // already has the username baked in (see respondUsernameTaken).
    // Must match the code in respondUsernameTaken ("USERNAME_TAKEN") —
    // features/account/responses/username-taken.ts.
    if (finish.code === "USERNAME_TAKEN") {
      onReset();
      form.username.setCustomValidity(finish.detail);
      form.username.reportValidity();
      return;
    }

    if (!finish.ok) {
      handlePasskeyFailure(finish, { onReset });
      return;
    }

    // Reload rather than navigate to "/": the server redirects an
    // authenticated /signup there anyway, and a reload skips WebKit's disk
    // cache, which may otherwise serve the anonymous "/" stored before signup.
    // Same root cause as https://bugs.webkit.org/show_bug.cgi?id=323342 (see
    // cacheNoStoreOnCookieChange in shared/header/cache-control.ts): WebKit's
    // `Vary: Cookie` check reads the cookie jar instead of the request's
    // Cookie header, and the jar can lag behind the Set-Cookie just received.
    location.reload();
  } catch (error) {
    handlePasskeyFailure(error, { onReset });
  }
}

// Same flow for the public "Sign In" button and the "Reauthenticate" one in
// the session-expiry banner; the server decides which it is. `buttons` is
// the whole group, so all of them disable while one is loading.
export async function loginWithPasskey(buttons, clickedButton) {
  setButtonsBusy(true);

  const onReset = () => setButtonsBusy(false);

  try {
    const finish = await runAuthenticationCeremony();

    if (!finish.ok) {
      handlePasskeyFailure(finish, { onReset });
      return;
    }

    // Reload (not navigate): the current URL is fine, it just needs to be
    // re-rendered as the logged-in user. See signupWithPasskey for why reload
    // rather than `location.assign` matters on WebKit.
    location.reload();
  } catch (error) {
    handlePasskeyFailure(error, { onReset });
  }

  function setButtonsBusy(force) {
    for (const button of buttons) {
      toggleButtonLoading(button, force && button === clickedButton);
      button.toggleAttribute("disabled", force);
    }
  }
}

// Sending a WebAuthn signal on success is why this exists as a JS
// enhancement at all — DeleteAccountDialog's form still works with plain
// POST/no JS, just without notifying the credential manager.
export async function deleteAccount(form) {
  toggleFormBuisy(form);

  const dialogMessage =
    "You'll be asked to use a passkey before your account is permanently deleted.";

  try {
    const accountDelete = await withReauth(
      () => apiFetch(form.action, { method: "POST" }),
      { dialogMessage },
    );

    if (!accountDelete.ok) {
      handleFailure(accountDelete);
      return;
    }

    // Sequential on purpose: browsers may serialise credential-manager calls,
    // and each one is best-effort anyway (see trySendWebAuthnSignal).
    for (const signal of accountDelete.value.signals) {
      await trySendWebAuthnSignal(signal);
    }

    location.assign("/");
  } catch (error) {
    handleFailure(error);
  }

  function handleFailure(failure) {
    // Session vanished mid-flow (revoked elsewhere, expired, or never
    // existed); reloading shows the logged-out page with whatever flash the
    // server set. A plain HTTP status check rather than a `code`, since it's
    // a generic "not authenticated" outcome rather than a domain-specific one.
    if (failure.status === 401) {
      location.reload();
      return;
    }

    handlePasskeyFailure(failure, { onReset: () => toggleFormBuisy(form) });
  }
}

export async function addPasskey(button) {
  toggleButtonLoading(button, true);

  const onReset = () => toggleButtonLoading(button, false);
  // A dismissed prompt here is ambiguous: the user may have cancelled, or
  // the authenticator refused because it already holds a passkey for this
  // account (excludeCredentials). Browsers report it as NotAllowedError or
  // InvalidStateError, so explain instead of staying silent like the other
  // flows.
  const dismissedMsg =
    "No passkey was added. If this authenticator already has one for this account, only one is kept per authenticator — try another device or password manager.";

  try {
    const finish = await withReauth(() =>
      runRegistrationCeremony({
        startPath: "/passkeys/add/start",
        finishPath: "/passkeys/add/finish",
      }),
    );

    if (!finish.ok) {
      handlePasskeyFailure(finish, { onReset, dismissedMsg });
      return;
    }

    // The PASSKEY_ADDED flash rides on the finish response and shows once the
    // reload re-renders the page.
    location.reload();
  } catch (error) {
    handlePasskeyFailure(error, { onReset, dismissedMsg });
  }
}

// Sending a WebAuthn signal on success is why this exists as a JS
// enhancement at all — DeletePasskeyDialog's form still works with plain
// POST/no JS, just without notifying the credential manager (see
// deleteAccount).
export async function deletePasskey(form) {
  toggleFormBuisy(form);

  const onReset = () => toggleFormBuisy(form);

  try {
    const deleted = await withReauth(() =>
      apiFetch(form.action, { method: "POST" }),
    );

    // Session gone mid-flow; reloading re-renders as logged out (see
    // deleteAccount).
    if (deleted.status === 401) {
      location.reload();
      return;
    }

    if (!deleted.ok) {
      // `detail` covers the last-passkey conflict; nothing else is expected.
      handlePasskeyFailure(deleted, { onReset });
      return;
    }

    await trySendWebAuthnSignal(deleted.value.signal);

    // The PASSKEY_DELETED flash rides on the response and shows after reload.
    location.reload();
  } catch (error) {
    handlePasskeyFailure(error, { onReset });
  }
}

// ---------------------------------------------------------------------------
// Shared internals

// Runs a passkey registration ceremony against a start/finish endpoint pair.
// Returns the finish result, or the start result if the start failed (the
// ceremony is skipped — no prompt for a rejected start). May reject (e.g.
// NotAllowedError if the user cancels, or the authenticator refuses because
// of excludeCredentials).
async function runRegistrationCeremony({ startPath, finishPath, json }) {
  // Start the ceremony and load the WebAuthn library in parallel; the library
  // is only imported on demand since most page views never need it.
  const [start, { startRegistration }] = await Promise.all([
    apiFetch(startPath, { method: "POST", json }),
    import("simplewebauthn"),
  ]);

  if (!start.ok) {
    return start;
  }

  const regResponseJson = await startRegistration({
    optionsJSON: start.value,
  });

  return apiFetch(finishPath, {
    method: "POST",
    json: regResponseJson,
  });
}

// Runs a passkey authentication ceremony against the login endpoints. When
// already authenticated, the server treats this as a reauth and refreshes
// the session. May reject (e.g. NotAllowedError if the user cancels).
//
// `stepUp` marks a reauth the user didn't explicitly ask for — the mid-flow
// hop `withReauth` does for another action entirely (e.g. deleting a
// passkey) — so the server skips the REAUTHENTICATED flash. Otherwise it
// would ride the reload that follows and could outlive it: if that action
// then fails or is cancelled, nothing overwrites the flash and the user sees
// a stray "Successfully reauthenticated" on some later, unrelated page.
async function runAuthenticationCeremony({ stepUp = false } = {}) {
  const [start, { startAuthentication }] = await Promise.all([
    apiFetch("/login/start", { method: "POST" }),
    import("simplewebauthn"),
  ]);

  if (!start.ok) {
    return start;
  }

  const authResponseJson = await startAuthentication({
    optionsJSON: start.value,
  });

  const finish = await apiFetch("/login/finish", {
    method: "POST",
    json: authResponseJson,
    headers: stepUp ? { [STEP_UP_REAUTH_HEADER]: "1" } : undefined,
  });

  // Present on both outcomes: unknownCredential on a rejected passkey,
  // allAcceptedCredentials after a successful login.
  if (finish.value?.signal) {
    await trySendWebAuthnSignal(finish.value.signal);
  }

  return finish;
}

// WebAuthn signals are fire-and-forget and unsupported in some browsers, so
// a failure is never surfaced to the user.
async function trySendWebAuthnSignal(opts) {
  try {
    const { sendSignal } = await import("simplewebauthn");
    await sendSignal(opts);
  } catch (error) {
    console.debug(error);
  }
}

// Prompts the user before a silent step-up reauth (see `withReauth`):
// explains why a passkey prompt is about to appear, so it doesn't read as an
// unexplained duplicate of the action's own prompt (e.g. addPasskey's "Save a
// passkey?" one, which follows immediately after). Esc resolves as Cancel
// too, via the native `cancel`/`close` events — no separate listener needed.
// On Continue, the dialog stays open (and its buttons disabled/spinning)
// until the caller removes it once the reauth ceremony is done, so the user
// isn't left looking at a bare page between the two prompts.
function promptReauth(
  message = "You'll be asked to use a passkey again before continuing.",
) {
  return new Promise((resolve) => {
    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";

    const continueButton = document.createElement("button");
    continueButton.textContent = "Continue";
    continueButton.autofocus = true;

    const dialog = showDialog({
      title: "Verify it's you",
      content: message,
      actions: [cancelButton, continueButton],
    });

    cancelButton.addEventListener("click", () => dialog.close());
    continueButton.addEventListener("click", () => {
      cancelButton.disabled = true;
      toggleButtonLoading(continueButton, true);
      resolve({ proceed: true, dialog });
    });
    dialog.addEventListener("close", () => {
      // Only fires for Cancel/Esc — Continue resolves without closing.
      dialog.remove();
      resolve({ proceed: false, dialog: null });
    });
  });
}

// Runs `run`, and on a REAUTH_REQUIRED result prompts the user (see
// promptReauth) and reauthenticates with a passkey (which replaces the
// session, same cookie name) and retries `run` once — the user only sees
// the prompt dialog then the passkey prompt. A failed reauth is returned
// as the result; a declined prompt or cancelled ceremony rejects.
async function withReauth(run, { dialogMessage } = {}) {
  let result = await run();

  // Must match respondReauthRequired's code ("REAUTH_REQUIRED") in
  // features/sessions/responses/reauth-required.ts.
  if (result.code === "REAUTH_REQUIRED") {
    const { proceed, dialog } = await promptReauth(dialogMessage);

    if (!proceed) {
      // AbortError (not NotAllowedError): no WebAuthn ceremony happened, so
      // this must stay distinct from a dismissed prompt — addPasskey's
      // dismissedMsg would otherwise wrongly imply the authenticator refused
      // it. handlePasskeyFailure treats AbortError as a silent no-op always.
      throw new DOMException("The reauth prompt was declined", "AbortError");
    }

    let reauth;

    try {
      reauth = await runAuthenticationCeremony({ stepUp: true });
    } finally {
      // Only explains the reauth prompt, not whatever `run` retries next
      // (e.g. addPasskey's own "Save a passkey?") — close it now rather than
      // leaving it behind that unrelated prompt too.
      dialog.remove();
    }

    if (!reauth.ok) {
      return reauth;
    }

    result = await run();
  }

  return result;
}

// Common failure handling for the flows above. `onReset` undoes whatever
// busy state the flow set. `dismissedMsg` turns a dismissed passkey prompt
// into an explanation instead of silence — for flows where the browser can't
// distinguish a cancel from an authenticator refusal.
function handlePasskeyFailure(failure, { onReset, dismissedMsg } = {}) {
  onReset?.();

  let message;
  if (failure instanceof Error) {
    // AbortError: the user declined our own confirm-reauth dialog (see
    // withReauth/confirmReauth) — not a WebAuthn-level outcome, so it's
    // always silent regardless of dismissedMsg.
    if (failure.name === "AbortError") {
      return;
    }

    // NotAllowedError is a dismissed prompt. On flows with excludeCredentials
    // (only addPasskey, which passes dismissedMsg), the same-authenticator
    // refusal may surface as InvalidStateError instead (Chrome) — same story
    // for the user, same message.
    if (failure.name === "NotAllowedError") {
      if (!dismissedMsg) {
        return;
      }
      message = dismissedMsg;
    } else if (dismissedMsg && failure.name === "InvalidStateError") {
      message = dismissedMsg;
    } else {
      console.error(failure);
      if (!navigator.onLine) {
        message = "Network is offline";
      }
    }
  } else {
    // Server-provided, human-readable explanation (RFC 9457 `detail`).
    message = failure.detail;
  }

  showAlert(message || "Something went wrong");
}
