# Art direction: making it look made by a studio

The difference between "AI-generated" and "agency" is almost never the idea. It is **restraint, consistency and intent at the pixel level**. Every rule below exists because breaking it is a visible tell.

## The tells to avoid (and what to do instead)

| Tell | Why it reads cheap | Do instead |
|---|---|---|
| Purple→blue gradients, neon glows, lens flares | The default look of generators and templates | Flat fills; one accent colour; depth from tone and soft offset shadows |
| Everything moves at once | No hierarchy; the eye has nowhere to land | One hero motion at a time; supporting motion follows it; ambient motion is barely perceptible |
| Everything bounces or overshoots | Cartoony and noisy; overshoot loses meaning | Overshoot at most once per loop, on the hero, for a reason (impact or arrival) |
| Linear easing on moves | Robotic, with hard starts and stops | Use the easing intents in motion-principles.md; linear only for constant processes |
| Uniform timing (all 0.5s, equal staggers) | Mechanical | Duration scales with distance; staggers decay; rhythm has rests |
| Random sparkles, confetti, floating particles | Decoration without meaning | Every element must carry part of the concept or be deliberately ambient (≤ 15% contrast) |
| Generic icons (cloud, gear, lightning, rocket) | Clip-art semantics | Abstract, geometric stand-ins (rows of bars = document, 3×3 cells = processor, ring = endpoint) drawn in the scene's own stroke language |
| Stick lines (straight polylines for organic things) | Looks unfinished | `Path.smooth` for organic, `Path.rounded` (filleted corners) for routed lines, `Path.cable`/`connector` for links |
| Mixed stroke weights and radii | Visual noise; feels assembled from parts | One stroke family (e.g. 1.5px lines, 1px borders); radii from a scale (e.g. 4/8/12/18) applied by element size |
| Busy backgrounds or gradient blobs | Competes with the concept | Transparent, or a whisper: dot or line grid at ≤ 15% contrast with a radial fade |
| Centred, symmetrical everything | Static; reads as a diagram | Asymmetric balance; a clear focal point slightly off-centre if the story allows |
| Text inside the animation | Can't be translated or read by screen readers; blurry at scale | Abstract text as rounded bars; real copy lives in the HTML around it |
| Drop shadows with large blur and high opacity | 2012 skeuomorphism | A 1–3px y-offset shape at 4–8% (light) or 25–40% (dark), no blur, or none at all |

## Palette

- **Neutrals carry the drawing; the accent carries the story.** Typically 4–6 neutrals (background-adjacent fill, border, line, muted glyph, ink) plus **one** accent. Use a second hue only if the concept needs two states (for example success or error). Even then, desaturate one.
- Take the accent from the project's brand tokens when they exist. Use the brand's neutrals too, whether warm (stone) or cool (zinc or slate). Never mix warm and cool greys.
- The accent marks **what the visitor should track**, and only that: the packet, the active card, the signal. If the accent is everywhere, it marks nothing.
- Use contrast to build hierarchy: hero ink ≥ 7:1 against the background; supporting lines 1.2–1.6:1 (whisper level); glyphs and inactive elements about 2:1. Check this with `contrast()` from the kit.
- **Dark theme is a redesign, not an inversion.** Lift surfaces by luminance steps (bg → +4% → +8%), cut line contrast, raise shadow opacity (shadows read weaker on dark), and nudge the accent brighter by about 5% L. Fills that were white become the elevated surface colour. The hero may flip (a dark hub on light becomes a light hub on dark) to keep it the brightest or darkest point.
- Mix colours with `mix()` (OKLab), never with RGB lerps, which go muddy in between.

## Geometry and composition

- **Grid first.** Pick a base unit (4 or 8px; 20px works for routed diagrams) and snap every anchor to it. Optical exceptions must be deliberate, such as half-pixel offsets for odd-width hairlines.
- **Scale ratios.** Pick element sizes from a short scale so relationships read: hub 64, node 36, packet 7 (about 1.8× steps).
- **Radius by size.** Small chips use r=4–6, cards 10–14, and large containers 16–24. Nested shapes use `outer r = inner r + padding` (concentric corners).
- **Breathing room.** Keep ≥ 24px from canvas edges and ≥ 12px between parallel routes. Elements that pass each other need visible air: the analyser's `clearance` enforces this.
- **Density.** Aim for 5–12 primary objects. If you need 30 identical things, make them small and quiet, and let one of them be the hero.
- **Focal point.** There should be one place the eye returns to between beats, usually the destination or the transformer.
- **Depth without effects.** Use z-order plus occlusion (things slide under other things), plus tonal steps, plus a subtle offset shadow. Use parallax only if the concept is spatial.

## Detail that signals craft

- **Cause and effect.** Every arrival triggers a response on the receiver (a bump, a ring, a lit cell, a counter tick), and every departure is acknowledged by the sender. This makes it feel like a *system* rather than moving shapes.
- **Entrances and exits are physical.** Things emerge from somewhere: from under a node, out of a slot, or drawn on by a trim path. They never fade in from nothing in the middle of empty space.
- **Trails and comets** (trim paths that follow the head) give speed and direction without motion blur. Make the tail lag in *time*, not distance, so it stretches with speed.
- **Rest states look designed.** Any paused frame should be a good illustration, because that is your poster frame for reduced motion and the first frame visitors see.
- **Micro-variation.** In a crowd of identical things, vary timing slightly with a seeded `rng`, never `Math.random`, so the build stays reproducible. Do not vary geometry.

## Backgrounds

The page owns the background colour. The animation is transparent by default. If an ambient backdrop helps (a grid hinting at structure), use one of these:

- Dot grid: dashed rows with round caps (`dash: [0.001, G]`) and a radial alpha gradient stroke, two shapes total. This is the example's technique.
- Line grid: hairlines at ≤ 1.2:1 contrast, fading out radially.
- Never: gradient blobs, noise, starfields, or animated backgrounds that move independently of the story.
