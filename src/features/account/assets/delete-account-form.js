import { deleteAccount } from "passkeys";

const form = document.querySelector('[data-js-action="delete-account"]');

form.addEventListener("submit", (event) => {
  event.preventDefault();
  deleteAccount(form);
});
