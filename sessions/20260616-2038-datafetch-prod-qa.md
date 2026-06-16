# datafetch.ai production QA — 2026-06-16

Live site https://datafetch.ai/ visual + interaction QA via agent-browser 0.25.0 (Chrome/CDP).

## Verdict: 7/7 PASS, zero defects.

1. PASS — HTTPS, no console errors, no page errors, no failed network requests. 4 agent SVGs (claude-code/codex/pi/opencode) all 200. og-image.png referenced in OG/twitter meta, returns 200 (90KB PNG; not loaded on-page by design — crawler asset). Grain = BODY::before data-URI SVG noise; scanline = BODY::after repeating-linear-gradient.
2. PASS — Hero: H1 "YOUR QUERIES / YOUR INTERFACE.", dark bg rgb(10,10,10), cream ink rgb(216,214,204), JetBrains Mono. VFS tree (.vfs-tree) full mount: AGENTS.md/CORE, df.d.ts, db/IMMUTABLE (filings.ts, chunks.ts), lib/TENANT (rangeTableMetric.ts INHERITED, skills/range.md), scripts/answer.ts THIS INTENT, result/answer.md SEALED.
3. PASS — CTA #cta-copy-prompt default state = 4 agent logos (16x16) + "Copy Prompt". On click: gains is-done class, default fades to opacity 0, success state (clock svg + "Coming soon") to opacity 1 by ~750ms, holds to ~2.25s, reverts to "Copy Prompt" by ~2.75s. Clipboard instrumented (writeText + execCommand): ZERO writes. No console output, no errors thrown.
4. PASS — "VIEW README.MD" href = https://github.com/JayFarei/datafetch#readme (exact).
5. PASS — #theme-toggle (aria "Toggle color theme"). Dark→Light: data-theme light, bg rgb(236,232,220) paper, ink rgb(26,24,21), toggle label flips LIGHT↔DARK. Palette inverts, layout intact.
6. PASS — Second screen: 5 loop tabs INIT/MOUNT/WRITE/COMMIT/OPTIMISE (/01–/05, interactive .loop-tab buttons). Eval box: SKILLCRAFT 126, 94.4% PASS RATE (119/126), 3,027 tok/task (172x under vanilla, Sonnet 4.6 prompt-cached), 0.8% runtime errors, HARD TIER +7.9pp. Footer: "©2026 OPENMAKE" + GitHub & X svg icons (links: github.com/JayFarei/datafetch, x.com/jayfarei, openmake.ai).
7. PASS — Desktop 1440px and mobile 390px both no horizontal overflow (docW==winW). Mobile: VFS tree, loop tabs (abbrev + scroll), eval stats stack to single column, fully readable. Footer intact on mobile.

## Screenshots
- 01-desktop-hero.png, 02b-cta-immediately.png (Coming soon state), 03-light-theme.png
- 04-second-screen.png, 04b-loop-section.png
- 05-mobile-hero.png, 06-mobile-bottom.png, 06b-mobile-eval.png
(in /tmp/datafetch-qa/)

## Visual bugs: none found.
