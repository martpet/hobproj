import { Passkey } from "../types.ts";
import { deleteDialogId, DeletePasskeyDialog } from "./DeletePasskeyDialog.tsx";
import { renameDialogId, RenamePasskeyDialog } from "./RenamePasskeyDialog.tsx";

interface PasskeyActionsProps {
  passkey: Passkey;
  // The last passkey is the only way into the account, so its delete control
  // is hidden; the server refuses it too, in case of a forged request.
  canDelete: boolean;
}

// The row's Rename/Delete buttons plus their dialogs. `<dialog>` renders in
// the top layer regardless of DOM position, so nesting it in the row's `<td>`
// alongside the buttons is fine. `command`/`commandfor` (Invoker Commands
// API) open and close the dialogs with no script.
export function PasskeyActions({ passkey, canDelete }: PasskeyActionsProps) {
  return (
    <>
      <div class="actions">
        <button command="show-modal" commandfor={renameDialogId(passkey.id)}>
          Rename
        </button>
        {canDelete && (
          <button command="show-modal" commandfor={deleteDialogId(passkey.id)}>
            Delete
          </button>
        )}
      </div>
      <RenamePasskeyDialog passkey={passkey} />
      {canDelete && <DeletePasskeyDialog passkey={passkey} />}
    </>
  );
}
