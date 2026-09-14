import { loginWithPasskey } from "passkeys";

const loginButtons = document.querySelectorAll(
  '[data-js-action="login-with-passkey"]',
);

for (const button of loginButtons) {
  button.addEventListener("click", () => loginWithPasskey(loginButtons, button));
}
