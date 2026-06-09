// Shell completion. Commander 12 ships no completion support, so we generate a
// script per shell from the live command tree. Because the tree is read at
// generation time, re-running `japonette completion <shell>` after the command
// surface changes regenerates correct completions — nothing here hard-codes the
// command names.
import { Command } from "commander";

const SHELLS = ["bash", "zsh", "fish"] as const;
type Shell = (typeof SHELLS)[number];

interface CmdSpec {
  name: string;
  subs: string[];
}

// Top-level commands and their immediate subcommands, skipping the auto-added
// `help`/`completion` entries (which don't need their own completion).
function collectSpec(program: Command): CmdSpec[] {
  return program.commands
    .filter((c) => c.name() !== "completion")
    .map((c) => ({
      name: c.name(),
      subs: c.commands.map((s) => s.name()).filter((n) => n !== "help"),
    }));
}

function bash(prog: string, spec: CmdSpec[]): string {
  const top = spec.map((s) => s.name).join(" ");
  const cases = spec
    .filter((s) => s.subs.length > 0)
    .map(
      (s) =>
        `    ${s.name}) COMPREPLY=( $(compgen -W "${s.subs.join(" ")}" -- "$cur") ) ;;`,
    )
    .join("\n");
  return `# bash completion for ${prog}
# install: ${prog} completion bash > /etc/bash_completion.d/${prog}
#      or: eval "$(${prog} completion bash)"
_${prog}() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${top}" -- "$cur") )
    return
  fi
  case "\${COMP_WORDS[1]}" in
${cases}
  esac
}
complete -F _${prog} ${prog}
`;
}

function zsh(prog: string, spec: CmdSpec[]): string {
  const top = spec.map((s) => s.name).join(" ");
  const cases = spec
    .filter((s) => s.subs.length > 0)
    .map((s) => `    ${s.name}) compadd ${s.subs.join(" ")} ;;`)
    .join("\n");
  return `#compdef ${prog}
# install: ${prog} completion zsh > "\${fpath[1]}/_${prog}"
#      or: eval "$(${prog} completion zsh)"
_${prog}() {
  if (( CURRENT == 2 )); then
    compadd ${top}
    return
  fi
  case "\${words[2]}" in
${cases}
  esac
}
compdef _${prog} ${prog}
`;
}

function fish(prog: string, spec: CmdSpec[]): string {
  const lines = [
    `# fish completion for ${prog}`,
    `# install: ${prog} completion fish > ~/.config/fish/completions/${prog}.fish`,
    `complete -c ${prog} -f`,
  ];
  for (const s of spec) {
    lines.push(`complete -c ${prog} -n '__fish_use_subcommand' -a '${s.name}'`);
  }
  for (const s of spec) {
    if (s.subs.length > 0) {
      lines.push(
        `complete -c ${prog} -n '__fish_seen_subcommand_from ${s.name}' -a '${s.subs.join(" ")}'`,
      );
    }
  }
  return lines.join("\n") + "\n";
}

export function renderCompletion(program: Command, shell: string): string {
  const prog = program.name();
  const spec = collectSpec(program);
  switch (shell) {
    case "bash":
      return bash(prog, spec);
    case "zsh":
      return zsh(prog, spec);
    case "fish":
      return fish(prog, spec);
    default:
      throw new Error(
        `unsupported shell: ${shell}. Use one of: ${SHELLS.join(", ")}`,
      );
  }
}

function detectShell(): string | undefined {
  const sh = process.env.SHELL;
  if (!sh) return undefined;
  const base = sh.split("/").pop() ?? "";
  return (SHELLS as readonly string[]).includes(base) ? base : undefined;
}

// Registers `japonette completion [shell]`. Introspects the program at call
// time, so it must be registered on the same program whose commands you want
// completed; ordering relative to other `.command()` calls doesn't matter.
export function registerCompletionCommand(program: Command): void {
  program
    .command("completion [shell]")
    .description("Print a shell completion script (bash, zsh, or fish).")
    .action((shell?: string) => {
      const chosen = (shell ?? detectShell() ?? "").toLowerCase();
      if (!chosen) {
        process.stderr.write(
          "specify a shell: japonette completion <bash|zsh|fish>\n",
        );
        process.exit(1);
      }
      try {
        process.stdout.write(renderCompletion(program, chosen));
      } catch (e) {
        process.stderr.write((e as Error).message + "\n");
        process.exit(1);
      }
    });
}
