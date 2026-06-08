import { describe, expect, it } from "vitest";
import { Command } from "commander";

import { COMMAND_GROUPS, configureGroupedHelp } from "../src/help.ts";

function buildProgram(): { program: Command; campus: Command } {
  const program = new Command();
  program.name("japonette").description("A small CLI for the 42 API.");
  configureGroupedHelp(program);
  const campus = program.command("campus").description("show the default campus");
  campus.command("list").description("list all campuses");
  return { program, campus };
}

describe("grouped root help", () => {
  it("renders the root help by category, not a flat dump", () => {
    const { program } = buildProgram();
    const out = program.helpInformation();
    for (const g of COMMAND_GROUPS) expect(out).toContain(g.title);
    expect(out).toContain("login");
    expect(out).toContain("friends online");
    // commander's default flat listing header should be gone
    expect(out).not.toContain("Commands:");
  });

  it("keeps subcommand help in commander's default format", () => {
    const { campus } = buildProgram();
    const out = campus.helpInformation();
    expect(out).toContain("Usage:");
    // a subcommand must not show the root's category headers
    expect(out).not.toContain("Campus & presence");
  });
});
