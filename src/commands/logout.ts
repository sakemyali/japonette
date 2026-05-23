import kleur from "kleur";

import { deleteToken } from "../config.js";

export function logoutCmd(): void {
  const removed = deleteToken();
  if (removed) {
    console.log(kleur.green("✓") + " logged out");
  } else {
    console.log(kleur.dim("already logged out"));
  }
}
