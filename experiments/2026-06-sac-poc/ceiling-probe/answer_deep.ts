// CEILING PROBE — the arm4 phase-2 answer.ts a DEEP+INVOCABLE helper enables.
// The agent writes ONLY the call + the summary aggregation + emit. All the
// per-pokemon DAG glue (parallel details/species, chain_id->evolution, moves,
// abilities, field extraction) lives in df.lib.pokedexEntries. Compare lines/
// chars to the arm1 inline baseline (72 lines / 2539 chars).
import { writeJson } from "./datafetch_answer_kit.ts";

const pokemon = (await df.lib.pokedexEntries({ ids: ["1", "4", "7", "133", "143"] })).value;

const total_moves = pokemon.reduce((s: number, p: any) => s + p.move_count, 0);
const output = {
  pokemon,
  summary: {
    total_pokemon: pokemon.length,
    avg_base_stat_total: Math.round(pokemon.reduce((s: number, p: any) => s + p.stat_total, 0) / pokemon.length),
    total_moves,
    avg_move_count: Math.round(total_moves / pokemon.length),
  },
  analysis_date: "2026-06-03",
};

await writeJson("pokedex_entries.json", output);

df.answer({
  status: "answered",
  value: output,
  evidence: pokemon,
  derivation: ["df.lib.pokedexEntries({ids}) -> aggregate summary"],
});
