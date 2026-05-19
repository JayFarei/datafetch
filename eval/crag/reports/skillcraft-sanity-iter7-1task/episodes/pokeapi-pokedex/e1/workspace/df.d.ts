declare const df: {
  tool: {
  pokemon_tools: {
    [name: string]: (input: any) => Promise<any>;
    /**
     * Get Pokemon details including types, abilities, stats, and sprite.
     * 
     * **Input:** pokemon_id (int | str) - Pokemon ID number or name (e.g., 25 or 'pikachu')
     * 
     * **Returns:** dict:
     * {
     *   "success": bool,
     *   "pokemon": {
     *     "id": int, "name": str,
     *     "height": int, "height_meters": float,
     *     "weight": int, "weight_kg": float,
     *     "base_experience": int,
     *     "types": [str],  // e.g., ["electric"]
     *     "abilities": [{"name": str, "is_hidden": bool}],
     *     "stats": {"hp": int, "attack": int, "defense": int, "special-attack": int, "special-defense": int, "speed": int},
     *     "stat_total": int,
     *     "sprite_url": str,
     *     "moves_count": int
     *   }
     * }
     */
    "local-pokemon_get_details"(input: { "pokemon_id": string }): Promise<any>;
    /**
     * Get Pokemon species information including genus, generation, legendary status, and evolution chain ID.
     * 
     * **Input:** pokemon_id (int | str) - Pokemon ID number or name (e.g., 25 or 'pikachu')
     * 
     * **Returns:** dict:
     * {
     *   "success": bool,
     *   "species": {
     *     "id": int, "name": str,
     *     "genus": str,  // e.g., "Mouse Pokémon"
     *     "generation": str,  // e.g., "generation-i"
     *     "is_legendary": bool, "is_mythical": bool, "is_baby": bool,
     *     "color": str, "shape": str, "habitat": str,
     *     "capture_rate": int, "base_happiness": int, "gender_rate": int,
     *     "evolution_chain_id": int,  // Use this for pokemon_get_evolution
     *     "evolves_from_species": str | null
     *   }
     * }
     */
    "local-pokemon_get_species"(input: { "pokemon_id": string }): Promise<any>;
    /**
     * Get evolution chain data.
     * 
     * **Input:** chain_id (int) - Evolution chain ID (from pokemon_get_species)
     * 
     * **Returns:** dict:
     * {
     *   "success": bool,
     *   "evolution_chain": {
     *     "id": int,
     *     "stages_count": int,
     *     "total_pokemon": int,
     *     "chain": [{
     *       "species_name": str,       // e.g., "pikachu" - use this to match by name
     *       "species_id": int,         // e.g., 25 - use this to match pokemon.id from get_details
     *       "stage": int,              // 1=base, 2=first evo, 3=final evo
     *       "evolves_from": str | null,
     *       "evolution_trigger": str | null,  // e.g., "level 16", "use thunder-stone"
     *       "min_level": int | null
     *     }]
     *   }
     * }
     * 
     * **TIP:** To find current Pokemon in chain, match `chain[].species_id` with `pokemon.id` from get_details (NOT the input parameter).
     */
    "local-pokemon_get_evolution"(input: { "chain_id": number }): Promise<any>;
    /**
     * Get Pokemon move counts by learning method (summary only, not full move lists).
     * 
     * **Input:** pokemon_id (int | str) - Pokemon ID number or name (e.g., 25 or 'pikachu')
     * 
     * **Returns:** dict:
     * {
     *   "success": bool,
     *   "pokemon_name": str,
     *   "pokemon_id": int,
     *   "moves_summary": {
     *     "total_unique_moves": int,
     *     "level_up_count": int,
     *     "machine_count": int,  // TM/HM moves
     *     "tutor_count": int,
     *     "egg_count": int,
     *     "other_count": int
     *   }
     * }
     */
    "local-pokemon_get_moves"(input: { "pokemon_id": string }): Promise<any>;
    /**
     * Get ability information.
     * 
     * **Input:** ability_names (list[str]) - List of ability names (e.g., ['static', 'lightning-rod'])
     * 
     * **Returns:** dict:
     * {
     *   "success": bool,
     *   "abilities": [{
     *     "name": str,
     *     "id": int,
     *     "short_effect": str,  // e.g., "Has a 30% chance of paralyzing attacking Pokemon on contact."
     *     "is_main_series": bool,
     *     "generation": str,
     *     "pokemon_count": int  // Number of Pokemon with this ability
     *   }]
     * }
     */
    "local-pokemon_get_abilities"(input: { "ability_names": unknown[] }): Promise<any>;
  };
  };
  lib: {
    /**
     * Cold-start seed helper for configurable per-entity tool fan-out. Use it only when no learned helper fits.
     */
    "per_entity"(input: { entityIds: Array<string | number>; toolBundle: string; toolNames: string[]; paramName: string; paramByTool?: Record<string, string>; extraInput?: Record<string, unknown> }): Promise<{ value: any; cost?: any; provenance?: any; escalations?: number }>;
  };
  answer(input: {
    status: "answered" | "partial" | "unsupported";
    value?: unknown;
    evidence?: unknown[];
    derivation?: unknown[];
    reason?: string;
  }): unknown;
};
