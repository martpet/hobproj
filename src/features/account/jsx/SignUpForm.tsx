import {
  USERNAME_PATTERN_DESCRIPTION,
  USERNAME_PATTERN_REGEX,
} from "@features/users/constants.ts";
import { Context } from "@shared/context.ts";

export function SignUpForm(_props: unknown, c: Context) {
  c.head.modules.add("signup-form");

  return (
    <form data-js-action="signup-with-passkey">
      <label for="username">Username:</label>
      <input
        id="username"
        required
        pattern={USERNAME_PATTERN_REGEX.source}
        title={USERNAME_PATTERN_DESCRIPTION}
        autocomplete="off"
        autocapitalize="off"
        spellcheck={false}
      />
      <p>
        <button type="submit">Create</button>
      </p>
    </form>
  );
}
