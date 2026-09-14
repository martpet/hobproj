import { getAaguidIcon, getAaguidName } from "@features/passkeys/helpers.ts";
import { Passkey } from "../types.ts";

interface PasskeyIconProps {
  passkey: Passkey;
}

export function PasskeyIcon({ passkey }: PasskeyIconProps) {
  const icon = getAaguidIcon(passkey.aaguid);
  const aaguidName = getAaguidName(passkey.aaguid);

  if (!icon) {
    return null;
  }

  return (
    <picture>
      <source
        srcset={icon.dark}
        media="(prefers-color-scheme: dark)"
      />
      <img
        src={icon.light}
        width="18"
        height="18"
        title={aaguidName}
        alt="icon"
      />
    </picture>
  );
}
