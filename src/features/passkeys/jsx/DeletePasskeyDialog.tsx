import { Dialog } from "@shared/jsx/Dialog.tsx";
import { getPasskeyDisplayName } from "../helpers.ts";
import { Passkey } from "../types.ts";

export const deleteDialogId = (id: string) => `delete-passkey-dialog-${id}`;

interface DeletePasskeyDialogProps {
  passkey: Passkey;
}

export function DeletePasskeyDialog({ passkey }: DeletePasskeyDialogProps) {
  const dialogId = deleteDialogId(passkey.id);
  const formId = `delete-passkey-form-${passkey.id}`;
  const passkeyDisplayName = getPasskeyDisplayName(passkey);

  return (
    <Dialog
      id={dialogId}
      heading="Delete passkey?"
      actions={
        <>
          <button command="close" commandfor={dialogId} autofocus>
            Cancel
          </button>
          <button form={formId} class="danger">
            Delete Passkey
          </button>
        </>
      }
    >
      <p>
        You will no longer be able to sign in with{" "}
        "<em>{passkeyDisplayName}</em>".
      </p>

      {
        /* The action lets passkeys-table.js enhance the native post with the
          WebAuthn signal that drops the key from the credential manager. */
      }
      <form
        id={formId}
        data-js-action="delete-passkey"
        method="POST"
        action={`/passkeys/${passkey.id}/delete`}
      >
      </form>
    </Dialog>
  );
}
