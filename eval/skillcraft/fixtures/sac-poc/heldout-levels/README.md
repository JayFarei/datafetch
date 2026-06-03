# SaC PoC — synthetic new-argument held-out levels (tracked source of truth)

The SkillCraft vendor dataset (`eval/skillcraft/vendor/`) is gitignored (blanket
`*` in `eval/skillcraft/vendor/.gitignore`), so synthetic held-out levels can't be
tracked in place. These are the TRACKED source of truth for the SaC PoC's R4
new-argument requirement (Blocker B): each `<family>/h1x/` is a phase-2 reuse level
whose entities are DISJOINT from the e1..m2 learning levels, so the arm5a
memoization floor cannot cache-hit it.

## Install into the vendor tree before running (the runner reads from vendor)

```sh
for fam in eval/skillcraft/fixtures/sac-poc/heldout-levels/*/; do
  f=$(basename "$fam")
  [ -d "$fam/h1x" ] && cp -R "$fam/h1x" "eval/skillcraft/vendor/skillcraft/tasks/scaled_tasks/$f/"
done
```

Then run phase-2 on it: `run-sac-poc.sh --reuse-level h1x ...`.

## Levels

- `pokeapi-pokedex/h1x`: entities {1,4,7,133,143} (Bulbasaur/Charmander/Squirtle/
  Eevee/Snorlax), disjoint from the phase-1 set {25,6,445,94}. Evaluator is h1's
  `main.py` with `EXPECTED_IDS` swapped. pokeapi is a live open-universe API, so the
  new ids return real data. Verified 2026-06-03: arm5a phase-2 gets 0 cache hits
  (R4 holds), arm4 reuses the learned `toolFanout` on the new ids.
