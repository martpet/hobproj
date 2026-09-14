import { Dialog } from "@shared/jsx/Dialog.tsx";
import { PASSKEY_NAME_MAX_LENGTH } from "../constants.ts";
import { getDefaultPasskeyName } from "../helpers.ts";
import { Passkey } from "../types.ts";

export const renameDialogId = (id: string) => `rename-passkey-dialog-${id}`;

interface RenamePasskeyDialogProps {
  passkey: Passkey;
}

export function RenamePasskeyDialog({ passkey }: RenamePasskeyDialogProps) {
  const dialogId = renameDialogId(passkey.id);
  const formId = `rename-passkey-form-${passkey.id}`;
  const inputId = `rename-passkey-name-${passkey.id}`;
  const defaultPasskeyName = getDefaultPasskeyName(passkey);

  return (
    <Dialog
      id={dialogId}
      heading="Rename passkey"
      actions={
        <>
          <button
            command="close"
            commandfor={dialogId}
            autofocus
          >
            Cancel
          </button>
          {/* Outside the form so it can share the footer; linked via `form=`. */}
          <button form={formId}>
            Save
          </button>
        </>
      }
    >
      <form
        id={formId}
        method="POST"
        action={`/passkeys/${passkey.id}/rename`}
      >
        <label for={inputId}>Name:</label>
        <input
          id={inputId}
          name="name"
          type="text"
          value={passkey.name}
          maxlength={PASSKEY_NAME_MAX_LENGTH}
          autocomplete="off"
          autofocus
        />
        {!passkey.name.includes(defaultPasskeyName) && (
          <p>Leave blank to use the default name.</p>
        )}
      </form>
    </Dialog>
  );
}
