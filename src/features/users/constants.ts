// Mirrored client-side via the input's `pattern` attribute, so keep it free
// of features the HTML pattern engine (`v` flag) rejects.
export const USERNAME_PATTERN_REGEX =
  /^[a-zA-Z0-9][a-zA-Z0-9_\-]{1,28}[a-zA-Z0-9]$/;

export const USERNAME_PATTERN_DESCRIPTION =
  "3-30 letters, numbers, underscores, or hyphens. Cannot start or end with a symbol";
