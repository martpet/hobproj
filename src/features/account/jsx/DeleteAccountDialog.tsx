import { User } from "@features/users/types.ts";
import { Context } from "@shared/context.ts";
import { Dialog } from "@shared/jsx/Dialog.tsx";

export const DELETE_ACCOUNT_DIALOG = "delete-account-dialog";
const DELETE_ACCOUNT_FORM = "delete-account-form";

interface DeleteAccountDialogProps {
  user: User;
}

export function DeleteAccountDialog(
  { user }: DeleteAccountDialogProps,
  c: Context,
) {
  c.head.modules.add("delete-account-form");

  // `command`/`commandfor` (Invoker Commands API) open/close the dialog with
  // no script; the same applies to `DeleteAccountButton`.
  return (
    <Dialog
      id={DELETE_ACCOUNT_DIALOG}
      heading="Delete account?"
      actions={
        <>
          <button
            command="close"
            commandfor={DELETE_ACCOUNT_DIALOG}
            autofocus
          >
            Cancel
          </button>
          {/* Outside the form so it can share the footer; linked via `form=`. */}
          <button
            form={DELETE_ACCOUNT_FORM}
            class="danger"
          >
            Delete account forever
          </button>
        </>
      }
    >
      <p>This action cannot be undone.</p>

      <form
        id={DELETE_ACCOUNT_FORM}
        data-js-action="delete-account"
        method="POST"
        action="/account/delete"
      >
        <label for="username">Username:</label>
        {/* Type-to-confirm guard via HTML validation only; not sent to server. */}
        <input
          id="username"
          type="text"
          pattern={RegExp.escape(user.username)}
          title="Type your username"
          autocomplete="off"
          required
        />
      </form>
    </Dialog>
  );
}
