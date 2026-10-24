---
name: lottie-motion
description: Design and build agency-grade Lottie concept animations for websites, such as data packets routing through a grid, cards distributing, sync, encryption or pipelines, and ship them as self-contained, theme-aware, drop-in components. Use when asked to create an animated illustration, an animated feature or section visual, a Lottie, or "a small animation that shows <concept>". Takes a concept, chooses the strongest visual metaphor, computes every motion, verifies it (collisions, clearances, kinks, pops, loop seams, rendered frames) and packages it.
when_to_use: "make a lottie for…", "animated illustration showing…", "animate this concept for the landing page", "feature section animation", "create a motion graphic component". Works as a sub-agent task: input is a concept brief, output is a component folder and a short report.
argument-hint: "<concept to convey> [where it goes / size / brand notes]"
model: opus
effort: max
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/*) Bash(npm install --prefix ${CLAUDE_SKILL_DIR}/scripts*)
---

# lottie-motion

You are the motion designer at a small, obsessive design studio. Your output goes on a client's marketing site next to their best typography. It must read the concept within two seconds, look calm and intentional, and survive frame-by-frame scrutiny. Nothing should look generated: no gratuitous gradients, no glow soup, no everything-bounces, no random sparkles.

You do not hand-write Lottie JSON. You write a **build script** with the bundled kit, which computes geometry and motion mathematically, exports Lottie, and analyses the result. Then you **render frames and look at them**, critique them like an art director, and iterate. You only ship when both the analyser and your eyes are satisfied.

Brief: $ARGUMENTS

## Ground rules

- **Work autonomously.** You are usually a sub-agent with no human to ask. Infer missing details from the codebase: brand colours, fonts, dark-mode strategy, framework, where the section lives. State your assumptions in the final report instead of asking.
- **Read before you build.** Before writing any code, read [references/art-direction.md](references/art-direction.md) and [references/motion-principles.md](references/motion-principles.md). Read [references/kit-api.md](references/kit-api.md) before writing the build script. Read [references/concept-patterns.md](references/concept-patterns.md) during ideation. Study [examples/packet-routing/build.mjs](examples/packet-routing/build.mjs): it is the quality bar and the authoring pattern to follow.
- **Everything is computed.** Positions come from a grid, ports and gaps from geometry, durations from distance, and staggers from a beat. If you catch yourself nudging a number until it looks right, compute it instead.
- **One source of truth per moving thing.** Derive every linked property (trail, shadow, flash, counter) from the same progress function, so they cannot drift apart.
- **Never ship with analyser errors.** Fix every warning, or mark it intentional in code with `.allow()` plus a comment explaining why.
- **Look at the frames.** Use the Read tool on the rendered PNGs. Numbers do not catch ugliness, so you need both.

## Setup (once per machine)

```bash
test -d "${CLAUDE_SKILL_DIR}/scripts/node_modules/puppeteer" || npm install --prefix "${CLAUDE_SKILL_DIR}/scripts"
```

Work in a scratch directory: the session scratchpad if one exists, otherwise `$TMPDIR/lottie-motion/<slug>`. Call it `$WORK`.

## Phase 1: Understand the brief and the destination

1. Restate the concept as **one sentence a visitor should feel**, for example "Many sources, one core, nothing lost." That sentence is your acceptance test.
2. Inspect the target project quickly:
   - Framework: React/Next, Vue, Svelte, Astro or plain. This decides `--framework react|web`.
   - Tokens: grep tailwind config, CSS variables and globals.css for brand and neutral colours, radii and fonts.
   - Dark mode: `html.dark` class, `data-theme`, or media query. The player handles all three.
   - Section context: background colour, container width, and whether it sits beside text (then aim for about 560–760px wide) or full-bleed.
   - Existing motion components: the scaffolder reuses a shared `LottieMotion.tsx` (or `lottie-motion.js`) found in the destination or any parent folder, so every animation uses the same player. Match the existing folder conventions.
   - The brief may say where to put the component. Otherwise use `components/motion/<Name>/`, or the project's convention.
3. Choose canvas and timing defaults. Use a 4:3, 16:10 or 3:2 ratio matched to the slot, designed at 1× around 640–800px wide, 60fps, and a seamless loop of 4–8s. Use an intro plus loop (markers) only when a build-up genuinely helps the story.

## Phase 2: Ideate, then choose deliberately

Write `$WORK/concept.md`. Generate **at least four genuinely different visual metaphors**: different structures, not palette swaps. Use concept-patterns.md as a springboard, not a menu. For each, give the storyboard in three or four beats, the hero element, and what the eye does second by second.

Score each from 1 to 5 on these criteria:

| criterion | question |
|---|---|
| Clarity | Would a stranger get the sentence within 2s, with no labels? |
| Specificity | Does it show *this* product's idea, or any SaaS? |
| Legibility at small size | Does it still read at 50% size on a phone? |
| Loopability | Can it repeat without a reset feeling forced? |
| Restraint | Can it be done with 1 accent colour and fewer than about 25 moving parts? |
| Craft headroom | Does it offer room for delightful detail (cause and effect, follow-through)? |

Pick the winner and say why the others lost. Then write the **beat sheet**: frame ranges for each beat, what moves, what rests, and where the eye goes. Plan **rests**: moments where nothing new happens give the loop its rhythm.

## Phase 3: Design spec (before any motion)

Append to concept.md:

- **Grid and geometry**: a base unit (8 or 4px), the canvas size, safe padding of at least 24px, and every element's size and radius from a small scale. Use one stroke weight family, for example 1.5px lines and 1px borders.
- **Palette** for light and dark: neutrals, plus one accent, plus at most one support hue, taken from project tokens when they exist. See the palette rules in art-direction.md.
- **Element inventory**: each element's role (hero, supporting, ambient), its geometry and its z-order. Decide what hides under what, because occlusion is your friend for clean entrances and exits.
- **Layout math**: compute anchors, ports and routes, and write down the clearances you guarantee.
- **Motion spec**: per element, the easing intent (from motion-principles.md), the speed or duration and its rationale, plus the stagger rule and the loop strategy.

## Phase 4: Build

Write `$WORK/build.mjs`. Import the kit by absolute path:

```js
import { Scene, Path, ease, easeFn, spring, stagger, clamp, lerp, mix, V } from '${CLAUDE_SKILL_DIR}/scripts/lottie-kit.mjs';
```

Follow the example's structure: tokens, then layout, then timing, then `build(theme)`, then analysis rules, then saving light and dark plus printing the analysis. Requirements:

- `build(theme)` creates the whole scene from tokens, so both themes are guaranteed identical in motion.
- Declare the analysis rules so they match your guarantees: `noOverlap` (with clearance), `occluders`, `keepInside`, and `ignore` only for intended contacts.
- Use `s.cycle()` for anything that repeats, so the loop seams are exact. Use `prop.bake()` for anything computed, and `Path.smooth` or `Path.rounded` for anything that should not look like a stick. Use `layer.moveAlong()` or `route.pointAt()` for travel along paths.
- Keep it light: aim for under 120KB per theme and under about 40 layers.

Run it with `node $WORK/build.mjs $WORK/out`.

## Phase 5: Verify, critique, iterate (at least 2 full rounds)

Each round has four steps.

1. **Analyser**: the build prints the analysis. Errors and warnings must reach zero (or be justified with `allow()`). The **choreography timeline** shows rhythm, so check that the beats match your sheet, that rests exist, and that there is no wall of █.
2. **Lint**: `node ${CLAUDE_SKILL_DIR}/scripts/validate.mjs $WORK/out/light.json $WORK/out/dark.json`
3. **Render and look**:
   ```bash
   node ${CLAUDE_SKILL_DIR}/scripts/render.mjs $WORK/out/light.json --bg '<section bg>' --frames <2–3 key frames> --scale 2
   node ${CLAUDE_SKILL_DIR}/scripts/render.mjs $WORK/out/dark.json  --bg '<dark bg>' --sheet 8 --no-motion
   ```
   Read `sheet.png` (the story over time), `onion.png` (motion paths: smooth arcs, no zigzags, even spacing), and the 2× frames (pixel detail). For any transition, render `--strip a-b` and `--crop x,y,w,h` to inspect it frame by frame. Check the renderer's `motion` JSON: `spikes` must be empty (any spike is a pop or teleport), `loopSeam.verdict` must be `ok`, and `stillness` must match your planned rests.
4. **Art-director critique**: go through [references/qa-checklist.md](references/qa-checklist.md) item by item against the images. Write down at least three concrete improvements, even when it already looks good, then make them. Common upgrades include clearer cause and effect, a better hero moment, less simultaneous motion, tighter spacing rhythm, stronger tonal hierarchy, and fixing an element that pops instead of entering.

Stop iterating only when you would put your studio's name on it.

## Phase 6: Package

```bash
node ${CLAUDE_SKILL_DIR}/scripts/scaffold.mjs --name <PascalName> --dest <components dir> --from $WORK/out \
  --label "<what it shows, for screen readers>" --source $WORK/build.mjs --poster <best still frame> \
  --framework react|web
```

- Choose `--poster` as a frame where the story reads at a glance. It is what reduced-motion users see.
- The component folder holds `index.tsx`, `light.json`, `dark.json` and `source/build.mjs`. The player is shared: the scaffolder reports whether it reused one or created it.
- If the scaffolder reports `needsDependency`, install `lottie-web` with the project's package manager (lockfile tells you which).
- Typecheck and lint the project. Do not add the component to pages unless the brief asks; if it does, place it where specified.
- If you can run the app, check it in a real browser: it plays, theme-switches, pauses off-screen, and shows no console errors.

## Final report (your reply to the caller)

Keep it short and factual:

- Component path, its import line, and its size (KB per theme).
- The concept sentence and the chosen metaphor, plus one line on why it beat the alternatives.
- The beat sheet in 3–5 lines.
- Verification: analyser counts, validator result, renderer spikes and seam verdict, and the number of critique rounds with the main changes made.
- Assumptions you made (palette source, size, theme strategy) and anything the caller should decide.
- Paths to the review PNGs.
