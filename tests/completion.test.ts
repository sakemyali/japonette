import { describe, expect, it } from "vitest";
import { Command } from "commander";

import { renderCompletion } from "../src/completion.ts";

function buildProgram(): Command {
  const p = new Command();
  p.name("japonette");
  p.command("login").description("x");
  const campus = p.command("campus").description("x");
  campus.command("list").description("x");
  campus.command("set <slug>").description("x");
  const friends = p.command("friends").description("x");
  friends.command("add <login>").description("x");
  friends.command("online").description("x");
  return p;
}

describe("shell completion generation", () => {
  it("bash: registers the function and completes top-level + subcommands", () => {
    const out = renderCompletion(buildProgram(), "bash");
    expect(out).toContain("complete -F _japonette japonette");
    expect(out).toContain("login");
    expect(out).toContain("campus");
    // the campus case offers its subcommands
    expect(out).toMatch(/campus\)[^\n]*list set/);
  });

  it("zsh: emits a #compdef header and subcommand cases", () => {
    const out = renderCompletion(buildProgram(), "zsh");
    expect(out).toContain("#compdef japonette");
    expect(out).toMatch(/friends\)[^\n]*add online/);
  });

  it("fish: emits declarative completes with subcommand guards", () => {
    const out = renderCompletion(buildProgram(), "fish");
    expect(out).toContain("complete -c japonette");
    expect(out).toContain("__fish_seen_subcommand_from friends");
  });

  it("throws on an unsupported shell", () => {
    expect(() => renderCompletion(buildProgram(), "powershell")).toThrow(
      /unsupported shell/,
    );
  });
});
