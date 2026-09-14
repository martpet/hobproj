import { CloseButton } from "@shared/jsx/CloseButton.tsx";
import { AlertType } from "@shared/types.ts";
import { HTMLAttributes } from "preact";

export interface AlertProps extends HTMLAttributes<HTMLDialogElement> {
  type: AlertType;
}

export function Alert(
  { type, children, class: className, ...props }: AlertProps,
) {
  const alertClasses = ["alert", type, className]
    .filter(Boolean)
    .join(" ");

  return (
    <dialog
      open
      class={alertClasses}
      {...props}
      data-js-target="persistent-dialog"
    >
      {children}
      {props.id && (
        <CloseButton
          commandfor={props.id}
          command="close"
        />
      )}
    </dialog>
  );
}
