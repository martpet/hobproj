import { AlertType } from "@shared/types.ts";
import { FLASH } from "./constants.ts";

export type FlashKey = keyof typeof FLASH;

export interface FlashMessage {
  type: AlertType;
  message: string;
}
