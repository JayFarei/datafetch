import { avg, g, num, rowsOf, text, writeJson } from "./datafetch_answer_kit.ts";

process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/eval+crag/eval/skillcraft/results/datafetch/run_20260519_023528/episodes/pokeapi-pokedex/e1/workspace");

const OUTPUT_FILE = "pokedex_entries.json";
const ANALYSIS_DATE = "2024-01-15";

const POKEMON = [
  { id: 25, name: "pikachu" },
  { id: 6, name: "charizard" },
  { id: 445, name: "garchomp" },
];

const toLowerList = (value: unknown) =>
  rowsOf(value)
    .map((item) => String(text(item, "")).trim().toLowerCase())
    .filter(Boolean);

async function main() {
  const pokemonTools = (df.tool as any).pokemon_tools;
  const entries: Array<any> = [];
  let baseStatTotals: number[] = [];

  try {
    for (const pokemon of POKEMON) {
      const detailsResp = await pokemonTools["local-pokemon_get_details"]({ pokemon_id: String(pokemon.id) });
      const details = g(detailsResp, "pokemon") ?? detailsResp?.pokemon ?? {};
      const movesResp = await pokemonTools["local-pokemon_get_moves"]({ pokemon_id: String(pokemon.id) });
      const abilitiesResp = await pokemonTools["local-pokemon_get_abilities"]({
        ability_names: rowsOf(g(details, "abilities"))
          .map((ability: any) => g(ability, "name"))
          .filter(Boolean),
      });

      const types = toLowerList(g(details, "types"));
      const stats = g(details, "stats") ?? {};
      const statTotal = num(g(details, "stat_total"), 0);
      const movesSummary = g(movesResp, "moves_summary") ?? movesResp?.moves_summary ?? {};
      const abilityNames = rowsOf(g(details, "abilities")).map((ability: any) => String(g(ability, "name") ?? "").trim().toLowerCase()).filter(Boolean);
      const abilities = rowsOf(g(abilitiesResp, "abilities")).map((ability: any) => ({
        name: String(g(ability, "name") ?? "").trim().toLowerCase(),
        id: num(g(ability, "id"), 0),
        short_effect: String(g(ability, "short_effect") ?? ""),
        is_main_series: Boolean(g(ability, "is_main_series")),
        generation: String(g(ability, "generation") ?? ""),
        pokemon_count: num(g(ability, "pokemon_count"), 0),
      }));

      entries.push({
        id: num(g(details, "id"), pokemon.id),
        name: String(g(details, "name") ?? pokemon.name).trim().toLowerCase(),
        types,
        stat_total: statTotal,
        stats: {
          hp: num(g(stats, "hp"), 0),
          attack: num(g(stats, "attack"), 0),
          defense: num(g(stats, "defense"), 0),
          "special-attack": num(g(stats, "special-attack"), 0),
          "special-defense": num(g(stats, "special-defense"), 0),
          speed: num(g(stats, "speed"), 0),
        },
        moves: {
          total_unique_moves: num(g(movesSummary, "total_unique_moves"), 0),
          level_up_count: num(g(movesSummary, "level_up_count"), 0),
          machine_count: num(g(movesSummary, "machine_count"), 0),
          tutor_count: num(g(movesSummary, "tutor_count"), 0),
          egg_count: num(g(movesSummary, "egg_count"), 0),
          other_count: num(g(movesSummary, "other_count"), 0),
        },
        abilities: abilities.length ? abilities : abilityNames.map((name) => ({ name })),
      });

      baseStatTotals.push(statTotal);
    }

    const value = {
      pokemon: entries,
      summary: {
        total_pokemon: entries.length,
        avg_base_stat_total: Math.round(avg(baseStatTotals)),
      },
      analysis_date: ANALYSIS_DATE,
    };

    await writeJson(OUTPUT_FILE, value);
    return df.answer({
      status: "answered",
      value,
      evidence: entries,
      derivation: [
        "Fetched details, moves, and abilities for Pokemon IDs 25, 6, and 445.",
        "Computed summary statistics from the three stat_total values.",
      ],
    });
  } catch (error) {
    const partial = {
      pokemon: entries,
      summary: {
        total_pokemon: entries.length,
        avg_base_stat_total: baseStatTotals.length ? Math.round(avg(baseStatTotals)) : 0,
      },
      analysis_date: ANALYSIS_DATE,
    };
    await writeJson(OUTPUT_FILE, partial);
    throw error;
  }
}

return await main();
