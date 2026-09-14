import { signupWithPasskey } from "passkeys";

const form = document.querySelector(
  '[data-js-action="signup-with-passkey"]',
);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  signupWithPasskey(form);
});

// Clear the "taken" message as soon as the user edits the field, otherwise
// the browser keeps blocking submission with the stale custom validity.
form.username.addEventListener("input", () => {
  form.username.setCustomValidity("");
});
