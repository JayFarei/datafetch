# Substrate documentation

Public-facing technical docs about what datafetch is and how it works. Audience: people evaluating or extending the substrate.

For internal in-flight experimentation notes see [`../../experiments/`](../../experiments/). For the executable eval harness + per-eval writeups see [`../../eval/`](../../eval/). For strategic / market / research material see the rest of [`../`](../).

## Substrate concepts

- [How datafetch works](./how-it-works.md) — runtime model, workspace layout, command flow, artifacts.
- [How datafetch improves over time](./improvement-loop.md) — the learning loop from committed visible code to reusable typed interfaces.
- [Architecture](./architecture.md) — substrate components, primitives, and their boundaries.
- [Intent-shape interface](./intent-shape-interface.md) — the data-shape → intent-shape interface pivot that underpins the helper authoring loop.

## Evaluating the substrate

- [Benchmarking](./benchmarking.md) — what an ML engineer should look for in a credible agentic-search benchmark.

For SkillCraft-specific definitions (R1-R9 rubric, the proof-of-thesis writeup), see [`../../eval/skillcraft/`](../../eval/skillcraft/).

## Release

- [Release plan](./release-plan.md) — two-track plan for open-source prototype + client-grade deployment.
