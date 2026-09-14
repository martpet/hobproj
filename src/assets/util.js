// Thin `fetch` wrapper normalising every response into
// `{ ok, status, value?, code?, detail? }` so callers can branch on `status`
// for generic HTTP-level outcomes (e.g. 401), on `code` for domain-specific
// ones (e.g. "USERNAME_TAKEN"), and show `detail` (if present) as a
// ready-made, human-readable message — without caring whether the server
// sent JSON or a plain-text body. Network failures still reject like
// `fetch` does.
export async function apiFetch(path, { json, ...init } = {}) {
  init.headers = new Headers(init.headers);

  if (json) {
    init.body = JSON.stringify(json);
    init.headers.set("content-type", "application/json");
  }
  const res = await fetch(path, init);
  const contType = res.headers.get("content-type");
  const isProblemJson = contType?.includes("application/problem+json");
  const isJson = isProblemJson || contType?.includes("application/json");
  const result = { ok: res.ok, status: res.status };

  // Errors are served as Problem Details (RFC 9457, see respondForbidden and
  // friends): `code` is the machine-readable extension member to branch on,
  // `detail` is the human-readable explanation to display as-is (RFC 9457
  // §3.1 — never parse `detail` for information). The whole object still
  // goes on `value` because the extra data (e.g. a WebAuthn signal) is
  // useful even on failure.
  if (isJson) {
    const resJson = await res.json();
    result.value = resJson;
    if (isProblemJson) {
      result.code = resJson.code;
      result.detail = resJson.detail;
    }
  } else {
    const resText = await res.text();
    if (!res.ok) {
      // No structured Problem Details available (e.g. an infra-level error
      // page); the raw text is the best-effort message.
      result.detail = resText;
    } else {
      result.value = resText;
    }
  }
  return result;
}

export function toggleButtonLoading(button, force) {
  button.toggleAttribute("disabled", force);
  button.classList.toggle("loading", force);
}

// Disables the whole form during a request. Submit buttons get the spinner;
// other fields are merely disabled. `force` works like `classList.toggle`.
export function toggleFormBuisy(form, force) {
  for (const element of form.elements) {
    if (element.type === "submit") {
      toggleButtonLoading(element, force);
    } else {
      element.toggleAttribute("disabled", force);
    }
  }
}

// Builds the dialog with createElement/textContent rather than an innerHTML
// template literal, since message may be server-provided (e.g. RFC 9457 detail)
// and must never be interpreted as markup. The Sanitizer API
// (Element.setHTML()) could allow a template literal here too, but it
// sanitizes markup rather than escaping plain text, and isn't yet supported
// everywhere.
export function showAlert(message, type = "danger") {
  const dialog = document.createElement("dialog");
  dialog.id = `alert-${crypto.randomUUID()}`;
  dialog.className = `alert ${type}`;
  dialog.dataset.jsTarget = "persistent-dialog";
  dialog.textContent = message;

  const closeButton = document.createElement("button");
  closeButton.className = "close";
  closeButton.textContent = "x";
  closeButton.commandForElement = dialog;
  closeButton.command = "close";
  dialog.append(closeButton);

  (
    document.querySelector('[data-js-target="alerts"]') ?? document.body
  ).append(dialog);

  dialog.show();
}

export function showDialog({
  title,
  content,
  actions,
  modal = true,
  hideOthers = true,
} = {}) {
  const dialog = document.createElement("dialog");

  if (title) {
    const h2 = document.createElement("h2");
    if (typeof title === "string") {
      h2.textContent = title;
    } else {
      h2.append(title);
    }
    dialog.append(h2);
  }

  if (content) {
    if (typeof content === "string") {
      const p = document.createElement("p");
      p.textContent = content;
      dialog.append(p);
    } else if (Array.isArray(content)) {
      dialog.append(...content);
    } else {
      dialog.append(content);
    }
  }

  if (actions) {
    const footer = document.createElement("footer");
    footer.className = "actions";
    if (Array.isArray(actions)) {
      footer.append(...actions);
    } else if (typeof actions === "string") {
      footer.textContent = actions;
    } else {
      footer.append(actions);
    }
    dialog.append(footer);
  }

  const hiddenDialogs = [];
  if (hideOthers) {
    const others = document.querySelectorAll(
      'dialog:not([data-js-target="persistent-dialog"])',
    );
    for (const d of others) {
      if (d !== dialog && !d.hidden) {
        d.hidden = true;
        hiddenDialogs.push(d);
      }
    }
  }

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    for (const d of hiddenDialogs) {
      d.hidden = false;
    }
  };

  dialog.addEventListener("close", restore, { once: true });
  const originalRemove = dialog.remove.bind(dialog);
  dialog.remove = () => {
    restore();
    originalRemove();
  };

  document.body.append(dialog);

  if (modal) {
    dialog.showModal();
  } else {
    dialog.show();
  }

  return dialog;
}
