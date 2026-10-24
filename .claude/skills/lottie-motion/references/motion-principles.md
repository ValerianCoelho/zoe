# Motion principles for UI concept animation

Motion explains the concept. Every movement answers *what is happening and why*. If removing a motion doesn't hurt comprehension, it is decoration: make it ambient (slow and low contrast) or cut it.

## Easing intents (kit `ease.*`)

| Intent | Easing | Use for |
|---|---|---|
| Arrive or enter | `out` (expo-out), `outSoft` | Things coming to rest; responses to an impact |
| Gentle arrive (small or light) | `outQuad` | Chips, dots and fades, with a low initial jump (no pop on frame 1) |
| Point-to-point | `inOut` | Anything leaving a rest and arriving at a rest |
| Ambient drift | `smooth` (sine) | Breathing, bobbing, slow pans |
| Depart or exit | `in` | Leaving the frame or falling into something (it ends at speed, so cover the end with occlusion or a fade) |
| Constant process | `linear` | Rotation, marching dashes, conveyors. Never for a move between rests |
| Physical settle | `prop.spring()` | Snapping into place and cards landing. Aim for a damping ratio ζ of 0.6–0.85: at `stiffness` 170 that is `damping` 16–22; at 300 it is 21–29 (ζ = damping / (2√(stiffness·mass))). `spring(cfg).zeta` reports it. |
| Anticipation | `anticipate` | Rarely, on the hero before a big move |

Expo-out moves about 50% of its distance in the first 10% of its time. On short durations that reads as a pop. For an element appearing (scale from 0), use `outQuad` or `outSoft` over 10–16 frames. The analyser's `pop` check catches this.

## Timing (at 60fps)

- **Micro feedback** (bump, flash): 6–10 frames up, 20–30 down. A fast attack with a slow release reads as a reaction.
- **Small moves (< 100px)**: 18–30 frames. **Medium (100–300px)**: 30–50. **Long travel**: base it on speed, not duration: 2.5–4 px/frame cruise for packets.
- Use `durationFor(distance)` for hops (√-scaling), and `travel = length / speed × 1.3` for an in-out move (the ease peaks above its average speed).
- **Read time.** After a meaningful change (a state flips, a result appears), hold 0.5–1s before the next beat. Without rests, concepts blur together.
- **Loop length**: 4–8s. Shorter loops feel frantic and repetitive; longer ones lose the visitor before the payoff.

## Choreography

1. **One hero at a time.** At any moment there is one primary motion. Others are secondary (smaller, slower, lower contrast) or at rest. Check the analyser's timeline, which should be a staircase or a call-and-response, not a wall of █.
2. **Overlap, don't queue.** The next beat starts while the previous one is settling (offset by 20–40% of its duration). Strict sequencing feels like a slideshow; total overlap feels chaotic.
3. **Stagger with decay.** Use `stagger(n, { each, ease: ease.out })` so the first items go quickly and later ones relax, or `from: 'center'` for radial reveals. Equal gaps look mechanical. Typical `each` is 3–6 frames.
4. **Beat grid.** For repeating events (arrivals, ticks), schedule them on an even beat (`F / count`) so the loop has a steady pulse. Then offset by alternating sides or directions so the eye travels.
5. **Cause → effect latency.** The response starts on the frame of contact (±1). Late responses break causality; early ones read as prediction.
6. **Directional logic.** Flows have a consistent direction (left→right, or periphery→core). Things don't reverse unless reversing is the concept.

## Continuity and physics

- **Velocity is continuous** unless something hits something. The analyser flags velocity kinks (an abrupt start or stop, or a direction snap). Fix them by easing into or out of rests, routing direction changes through curves (`Path.rounded` fillets, `Path.smooth`), or baking the motion from one smooth function.
- **Constant speed along paths.** Paths are arc-length parametrised (`pointAt(u)`), so speed follows your easing exactly, even through tight fillets. Never interpolate x and y separately for a curved route.
- **Mass consistency.** Bigger things move slower, settle longer and overshoot less. Same-size things share timings.
- **Follow-through.** Attached parts lag by 2–4 frames (a trail, a tag, a shadow) and settle after the body. Derive the lag in *time* from the same progress function.
- **Squash and stretch** only for organic subjects, and at most ±6%. UI objects keep their shape.
- **Springs** for landing and settling. Bake them with `prop.spring(t0, from, to, cfg)`, which is analytic and exact, never hand-keyed wobbles.

## Entrances and exits

- Prefer **occlusion** (slide out from under a node, slide under a hub), **trim-on** (a line draws itself), **scale from an anchor** (grow out of a port), and **mask reveals**, in that order. A bare opacity fade in mid-air is the weakest option.
- Exits mirror entrances but run faster (about 70% of the duration) with an `in` ease.
- Cuts (instant jumps) happen only while invisible: hidden under an occluder, at 0 opacity, at scale 0, or trim-collapsed. The analyser enforces this with its `cut` check.

## Loops

- **Seamless by construction**: use `s.cycle(prop, starts, duration, fn)`. Trips crossing the loop point are split across the seam, so frame 0 equals frame op exactly, in value and velocity.
- Avoid a global reset moment (everything returns home at once). Instead give each element its own phase on the beat grid, so the loop has no visible start.
- If a build-up intro is essential, use markers: `s.marker('intro', 0, a)` and `s.marker('loop', a, op)`. The loop segment itself must be seamless from `a` to `op`.
- Constant motions (dash offsets, rotations) must change by a whole multiple of their period over the loop: dash offset by `k × (dash + gap)`, rotation by `k × 360°`.

## Smoothness at the pixel level

- Use 60fps with `bake` tolerance ≤ 0.12px for positions. The Hermite fit keeps curves C1-continuous, so there is no faceting.
- Hairlines of 1–1.5px on slow-moving elements shimmer. Make slow-moving lines ≥ 1.5px, or keep them static.
- Avoid animating stroke width and border radius on many elements at once (costly and wobbly). Scale a group instead.
- Do not scale things whose strokes should stay crisp, such as a ring pulse expanding 150%. Either accept the stroke growth or animate the rect `size` instead of the layer scale.
- Don't move dozens of layers continuously. Loop budget: about 25 animated layers at once is comfortable for lottie-web SVG.

## Reduced motion

Pick a poster frame where the concept reads statically: the hero mid-action, cause and effect visible. The player shows it instead of playing. Never rely on motion alone for meaning that the surrounding copy doesn't also carry.
