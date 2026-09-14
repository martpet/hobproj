import { User } from "@features/users/types.ts";
import {
  DELETE_ACCOUNT_DIALOG,
  DeleteAccountDialog,
} from "./DeleteAccountDialog.tsx";

interface DeleteAccountButtonProps {
  user: User;
}

export function DeleteAccountButton({ user }: DeleteAccountButtonProps) {
  return (
    <>
      <button
        command="show-modal"
        commandfor={DELETE_ACCOUNT_DIALOG}
      >
        Delete your account
      </button>

      <DeleteAccountDialog user={user} />
    </>
  );
}
