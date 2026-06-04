// CEILING PROBE (Thesis 3, $0 model spend) — a DEEP, INVOCABLE pokeapi helper.
// Contrast with the shallow crystallised `toolFanout` (which only did the
// mechanical per-entity fan-out and exposed an intent-ONLY surface, so the agent
// re-derived ~110 lines of glue inline). This helper:
//   (1) is DEEP — it walks the whole per-pokemon DAG (details+species ->
//       evolution via chain_id; moves; abilities) and returns FINISHED entries
//       with every evaluator-required field, so the caller writes ZERO glue;
//   (2) is INVOCABLE — a fully-typed PUBLIC signature `{ ids }` (no internal
//       plan to re-specify, no intent-only stub that returns an error).
// Field extraction is byte-identical to the arm1 inline baseline that passed,
// so output correctness is by-construction (full validation = the live run).
import { fn } from "@datafetch/sdk";
import * as v from "valibot";

type PokedexEntry = {
  id: number;
  name: string;
  types: string[];
  stat_total: number;
  move_count: number;
  genus: string | null;
  generation: string | null;
  is_legendary: boolean;
  evolution_chain_id: number | null;
  ability_count: number;
};

export const pokedexEntries = fn<{ ids: Array<string | number> }, PokedexEntry[]>({
  intent: "Build finished Pokedex entries for a list of pokemon ids (details + species + evolution + moves + abilities), one row per id.",
  examples: [],
  input: v.object({ ids: v.array(v.union([v.string(), v.number()])) }),
  output: v.array(v.unknown()),
  async body(input) {
    const T = (globalThis as any).df.tool.pokemon_tools;
    return await Promise.all(
      input.ids.map(async (pid) => {
        const [details, species] = await Promise.all([
          T["local-pokemon_get_details"]({ pokemon_id: pid }),
          T["local-pokemon_get_species"]({ pokemon_id: pid }),
        ]);
        const chainId = species?.evolution_chain_id ?? species?.evolution_chain?.id ?? null;
        const [, moves, abilities] = await Promise.all([
          chainId != null ? T["local-pokemon_get_evolution"]({ chain_id: chainId }) : null,
          T["local-pokemon_get_moves"]({ pokemon_id: pid }),
          T["local-pokemon_get_abilities"]({
            ability_names: (details?.abilities ?? []).map((a: any) => a?.ability?.name ?? a),
          }),
        ]);
        return {
          id: Number(pid),
          name: details?.name ?? String(pid),
          types: (details?.types ?? []).map((t: any) => t?.type?.name ?? t),
          stat_total: (details?.stats ?? []).reduce((s: number, x: any) => s + (x?.base_stat ?? x ?? 0), 0),
          move_count: moves?.move_count ?? moves?.moves?.length ?? 0,
          genus: species?.genus ?? null,
          generation: species?.generation ?? null,
          is_legendary: species?.is_legendary ?? false,
          evolution_chain_id: chainId,
          ability_count: abilities?.abilities?.length ?? (details?.abilities?.length ?? 0),
        };
      }),
    );
  },
});
