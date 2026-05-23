import { existsSync, rmSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import kleur from "kleur";

import { CONFIG_DIR } from "../config.js";
import { err } from "../render.js";

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

export async function uninstallCmd(opts: { yes?: boolean }): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    console.log(
      kleur.dim(`nothing to remove — no japonette state at ${CONFIG_DIR}`),
    );
    printNextStep();
    return;
  }

  console.log("This will delete everything under " + kleur.cyan(CONFIG_DIR) + ":");
  console.log(kleur.dim("  config.json    — your default campus"));
  console.log(kleur.dim("  token.json     — your OAuth access + refresh tokens"));
  console.log(kleur.dim("  campuses.json  — cached campus list"));
  console.log(kleur.dim("  friends.json   — your local friends watchlist"));
  console.log("");

  if (!opts.yes && !(await confirm("Continue? [y/N] "))) {
    console.log(kleur.dim("aborted"));
    return;
  }

  try {
    rmSync(CONFIG_DIR, { recursive: true, force: true });
  } catch (e) {
    err(`could not remove ${CONFIG_DIR}: ${(e as Error).message}`);
    process.exit(1);
  }

  console.log(kleur.green("✓") + " removed " + CONFIG_DIR);
  printNextStep();
}

function printNextStep(): void {
  console.log("");
  console.log("To remove the CLI binary as well:");
  console.log("  " + kleur.cyan("npm uninstall -g japonette"));
  console.log(
    kleur.dim(
      "(skip if you only used `npx japonette` — npx doesn't install anything globally)",
    ),
  );
}
