import { Context } from "@shared/context.ts";
import { Alert } from "@shared/jsx/Alert.tsx";
import { FLASH } from "../constants.ts";

export function FlashMessage(_props: unknown, c: Context) {
  if (!c.flash) return;

  const { message, type } = FLASH[c.flash];

  return (
    <Alert id="flash-message" type={type}>
      {message}
    </Alert>
  );
}
