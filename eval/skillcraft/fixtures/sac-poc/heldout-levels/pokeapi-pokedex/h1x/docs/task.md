# Task: Pokemon Pokedex (5 Pokemon × 5 APIs) - H1X

Generate Pokedex entries for **5 Pokemon** using 5 API endpoints per Pokemon.

## Objective

For each of the following **5 Pokemon**, collect:
1. **Details**: basic info, types, stats
2. **Species**: genus, generation, legendary status
3. **Evolution**: evolution chain info
4. **Moves**: move list counts
5. **Abilities**: ability info

Calculate **summary statistics** across all Pokemon.

## Pokemon to Analyze

| # | ID | Name | Type |
|---|-----|------|------|
| 1 | 1 | Bulbasaur | Grass/Poison |
| 2 | 4 | Charmander | Fire |
| 3 | 7 | Squirtle | Water |
| 4 | 133 | Eevee | Normal |
| 5 | 143 | Snorlax | Normal |

## ⚠️ IMPORTANT: Tool Order Constraint

**`pokemon_get_species` MUST be called BEFORE `pokemon_get_evolution`** for each Pokemon.
The evolution endpoint requires the evolution_chain_id from species data.

## Required Output

Save results to `pokedex_entries.json`:

```json
{
  "pokemon": [
    {"id": 1, "name": "bulbasaur", "types": ["grass", "poison"], "stat_total": 318}
  ],
  "summary": {"total_pokemon": 5, "avg_base_stat_total": 400},
  "analysis_date": "2024-01-15"
}
```

## Tools Available

- `local-pokemon_get_details`: Details
- `local-pokemon_get_species`: Species
- `local-pokemon_get_evolution`: Evolution
- `local-pokemon_get_moves`: Moves
- `local-pokemon_get_abilities`: Abilities

**File System:** `filesystem-write_file`, `filesystem-read_file`
**Completion:** `local-claim_done` (REQUIRED)

## Workflow

For each Pokemon (IDs: 1, 4, 7, 133, 143):
1. `local-pokemon_get_details`
2. `local-pokemon_get_species`
3. `local-pokemon_get_evolution`
4. `local-pokemon_get_moves`
5. `local-pokemon_get_abilities`

## Summary Requirements

**⚠️ CRITICAL**: Output ONLY summary statistics for moves, NOT full move lists!

## Important

1. Process ALL 5 Pokemon completely
2. Summarize move data - counts only
3. Call `local-claim_done` to complete
