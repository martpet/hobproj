import { addPasskey, deletePasskey } from "passkeys";

// Binds the passkeys table's actions: "Add a passkey" starts a registration
// ceremony, and each delete form is enhanced to also send the WebAuthn
// signal that drops the key from the credential manager.

const addButton = document.querySelector('[data-js-action="add-passkey"]');

addButton.addEventListener("click", () => addPasskey(addButton));

const deleteForms = document.querySelectorAll(
  '[data-js-action="delete-passkey"]',
);

for (const form of deleteForms) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    deletePasskey(form);
  });
}
