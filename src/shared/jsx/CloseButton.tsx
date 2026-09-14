import { ButtonHTMLAttributes } from "preact";

export function CloseButton(props: ButtonHTMLAttributes) {
  return <button {...props} class="close">x</button>;
}
