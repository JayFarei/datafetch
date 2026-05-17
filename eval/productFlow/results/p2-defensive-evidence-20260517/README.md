# P2 — Cross-eval product-flow proof (jsonplaceholder)

Defensive-evidence bundle. The goal is to show that the datafetch substrate's
cold-to-warm helper learning generalises beyond SkillCraft — specifically that
on a real-HTTP tool bundle (`jsonplaceholder.typicode.com`):

1. an agent's cold episode (e1) crystallises ≥ 1 learned helper into
   `<baseDir>/lib/<tenantId>/`;
2. a later warm episode discovers that helper through the substrate's
   `df.d.ts` / `apropos` / `man` surface, NOT by the helper being named
   in the prompt;
3. the warm episode calls the helper through `df.lib.<name>`;
4. the substrate-on arm spends fewer effective tokens than a matched
   substrate-off control with the same prompts and the same Claude
   backend.

## Files in this bundle

| file | what it shows |
| --- | --- |
| `cold-prompt.md` | the e1 prompt Claude received (substrate-on arm) |
| `warm-prompt-similar.md` | the e2 prompt — must not name any helper |
| `warm-prompt-multihop.md` | the e3 prompt — must not name any helper |
| `learned-helper.ts` | crystallised helper file from `<baseDir>/lib/<tenantId>/` |
| `df.d.ts.before` | empty-lib state (before e1) |
| `df.d.ts.after` | post-crystallisation state (after e1) |
| `apropos-output.txt` | what `datafetch apropos '<warm intent words>'` returns |
| `man-output.txt` | what `datafetch man <helper-name>` returns |
| `trajectory-arm-on-e{1,2,3}.json` | substrate-on trajectories |
| `trajectory-arm-off-e{1,2,3}.json` | substrate-off trajectories |
| `comparison.md` | headline 5-claim verdict + per-episode table |
| `harness-validation.txt` | helper-name-leak checks the harness performed before each warm call |

## How to replay

From the repo root of branch `goal4-p2-product-flow-cross-eval`:

```bash
# 1) start both arms in parallel (or sequentially)
CLAUDE_CLI=claude-p pnpm tsx src/eval/productFlow/runProductFlowMicroEval.ts \
  --arm substrate-on \
  --out-dir eval/productFlow/results/p2-substrate-on-20260517

CLAUDE_CLI=claude-p pnpm tsx src/eval/productFlow/runProductFlowMicroEval.ts \
  --arm substrate-off \
  --out-dir eval/productFlow/results/p2-substrate-off-20260517

# 2) emit comparison.md into this bundle directory
pnpm tsx src/eval/productFlow/compareArms.ts \
  --on eval/productFlow/results/p2-substrate-on-20260517 \
  --off eval/productFlow/results/p2-substrate-off-20260517 \
  --bundle-dir eval/productFlow/results/p2-defensive-evidence-20260517
```

## Why this exists

Codex called this "the single strongest defensive-evidence move": one archived,
replayable non-SkillCraft product-flow run with a matched no-substrate control.
The previous novel-tenant smoke under `src/observer/__smoke__/novel-tenant.ts`
proves substrate mechanics but is too rigged to count as transferability
evidence (stub 5-book dataset, pre-seeded summariser, same snippet run twice,
warm snippet directly names the helper). This bundle removes all four
riggings — real HTTP API, no pre-seeded helper for this tenant, three
distinct prompts with distinct intents, and warm prompts that mention the
discovery surface but never name a helper.
