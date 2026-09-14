import { ComponentChildren, HTMLAttributes } from "preact";

export interface DialogProps extends HTMLAttributes<HTMLDialogElement> {
  heading?: ComponentChildren;
  actions?: ComponentChildren;
}

export function Dialog({ heading, actions, children, ...props }: DialogProps) {
  return (
    <dialog {...props}>
      {heading && <h2>{heading}</h2>}
      {children}
      {actions && <footer class="actions">{actions}</footer>}
    </dialog>
  );
}
