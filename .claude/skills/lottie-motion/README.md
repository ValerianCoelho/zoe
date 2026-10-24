# lottie-motion skill

This skill builds agency-grade concept animations as Lottie and ships them as drop-in website components. The agent works through six phases:

```
concept ─▶ ideation (≥4 metaphors, scored) ─▶ design spec (grid, palette, inventory, layout math)
        ─▶ build script (computed geometry + motion) ─▶ analyse + render + look + critique (×2+)
        ─▶ scaffold component (React or web component) ─▶ report
```

## Install

- **In this repo**: it's already at `.claude/skills/lottie-motion`, with the subagent at `.claude/agents/lottie-motion-designer.md`.
- **Everywhere**: copy `lottie-motion/` to `~/.claude/skills/` and `lottie-motion-designer.md` to `~/.claude/agents/`.
- Toolkit dependencies (headless Chrome for rendering), installed automatically on first use:
  `npm install --prefix ~/.claude/skills/lottie-motion/scripts`
- Health check: `node scripts/selftest.mjs`

## Use

- **Directly**: `/lottie-motion data packets routed from many regions into one core, for the hero's right column`
- **From an orchestrator**: delegate to the `lottie-motion-designer` subagent (Opus, max effort, skill preloaded) with a brief:

  > Concept: "Every deploy is checked before it reaches users." Placement: features section, right of a 3-line paragraph, about 640px wide, bg #fafaf9 / dark #0c0c0b. Constraints: brand accent #4f46e5, loop. Output: components/motion/DeployGate.

  It returns the component path, its import line, the verification results and its assumptions.

## What's inside

| path | role |
|---|---|
| `SKILL.md` | The playbook: phases, gates, commands, report format |
| `references/art-direction.md` | Studio-level visual rules and the "looks generated" tells to avoid |
| `references/motion-principles.md` | Easing intents, timing, choreography, continuity, loops |
| `references/concept-patterns.md` | 14 metaphor patterns with craft details and traps |
| `references/kit-api.md` | Builder API and Lottie gotchas |
| `references/qa-checklist.md` | The art-director pass and hard gates |
| `scripts/lottie-kit.mjs` | Scene graph → Lottie. Hermite-fitted baking, arc-length paths, springs, seamless `cycle`, analysis |
| `scripts/render.mjs` | lottie-web in headless Chrome: contact sheet, onion skin, frame strips and crops, pixel-diff pop/seam detection, optional mp4 |
| `scripts/validate.mjs` | Structural and portability lint for any Lottie JSON |
| `scripts/scaffold.mjs` | Packages JSON into `<Name>/` with a typed wrapper, player, preview.html, README and source |
| `templates/react/LottieMotion.tsx` | Player: lazy, in-view playback, theme swap, reduced motion, intro→loop markers, no layout shift |
| `templates/web/lottie-motion.js` | The same as a framework-agnostic custom element |
| `examples/packet-routing/build.mjs` | Reference scene that sets the quality bar |
