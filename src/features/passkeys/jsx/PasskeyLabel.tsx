import { getPasskeyDisplayName } from "../helpers.ts";
import { Passkey } from "../types.ts";
import { PasskeyIcon } from "./PasskeyIcon.tsx";

interface PasskeyLabelProps {
  passkey: Passkey;
}
export function PasskeyLabel({ passkey }: PasskeyLabelProps) {
  return (
    <span class="passkey-label">
      <PasskeyIcon passkey={passkey} />
      {getPasskeyDisplayName(passkey)}
    </span>
  );
}
