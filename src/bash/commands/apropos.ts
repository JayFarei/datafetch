// `apropos <query...>` custom command.
//
// Thin just-bash wrapper over the shared discovery scorer. The CLI's
// `datafetch apropos` calls the same scorer, so a tenant sees the same
// top match whether the agent discovers through the VFS or through the
// outer CLI.

import { defineCommand, type Command } from "just-bash";

import {
  renderAproposMatches,
  searchLibrary,
  type RankedFunction,
} from "../../discovery/librarySearch.js";
import type { LibraryResolver } from "../../sdk/index.js";

// --- Inputs needed at construction -----------------------------------------

export type AproposCommandDeps = {
  baseDir: string;
  resolveTenant: () => string;
  resolveLibrary: () => LibraryResolver | null;
};

// --- Command factory -------------------------------------------------------

export function createAproposCommand(deps: AproposCommandDeps): Command {
  return defineCommand("apropos", async (args, _ctx) => {
    if (args.length === 0) {
      return {
        stdout: "",
        stderr: "apropos what?\n",
        exitCode: 1,
      };
    }

    const query = args.join(" ");
    const resolver = deps.resolveLibrary();
    if (!resolver) {
      return {
        stdout: renderAproposMatches([]),
        stderr: "",
        exitCode: 0,
      };
    }

    const tenant = deps.resolveTenant();
    let scored: RankedFunction[];
    try {
      scored = await searchLibrary({
        baseDir: deps.baseDir,
        tenantId: tenant,
        resolver,
        query,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        stdout: "",
        stderr: `apropos: error listing /lib/: ${msg}\n`,
        exitCode: 1,
      };
    }

    return {
      stdout: renderAproposMatches(scored),
      stderr: "",
      exitCode: 0,
    };
  });
}
