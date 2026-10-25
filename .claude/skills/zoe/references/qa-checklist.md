# QA checklist: the art-director pass

Go through this against the rendered images (sheet, onion, 2× frames, strips) **and** the analyser and renderer output. For each item, write ✓ or the fix you will make. Treat any ✗ as a blocker.

## Hard gates (automated)
- [ ] The analyser reports 0 errors and 0 warnings. Every `.allow()` has a comment explaining the intent.
- [ ] `validate.mjs` reports no ✖; each theme is under 120KB (150KB at most, with a reason).
- [ ] The renderer's `motion.spikes` is empty and `loopSeam.verdict` is `ok`.
- [ ] Both themes are built from the same `build(theme)` and have identical timing.

## Concept
- [ ] Shown the sheet cold, does the one-sentence concept come through within 2 seconds?
- [ ] Causality is visible: every arrival has a response and every departure has a source.
- [ ] The product's specific mechanic is the hero beat, not generic decoration.
- [ ] The poster frame reads as a complete illustration on its own.

## Composition and pixels (2× frames)
- [ ] All anchors are on the grid; parallel lines are evenly spaced; the safe margin is ≥ 24px.
- [ ] One stroke family and one radius scale; nested corners are concentric.
- [ ] There is a clear focal point and visual weight is balanced (not dead-centre symmetric unless that's the concept).
- [ ] No unintended overlaps, tangencies (lines just kissing shapes) or near-misses below 4px.
- [ ] Curves are smooth: no stick joints (check `path.kinks()`), and fillet radii are consistent.
- [ ] Tonal hierarchy: hero > accent signal > structure > background whisper. The background never competes.
- [ ] Dark theme is a considered redesign (surfaces, shadows, line contrast), not an inversion.
- [ ] Nothing looks clip-art or stock; glyphs share the scene's line language.

## Motion (onion, strips, timeline)
- [ ] Onion trails are smooth arcs or routes with even spacing that matches the intended easing. No zigzags, no clumps.
- [ ] Only one hero motion at a time; secondary motion is visibly subordinate.
- [ ] Rests exist: the eye gets ≥ 0.5s to read each result.
- [ ] Staggers decay or vary; there are no equal-gap mechanical sequences.
- [ ] Entrances emerge from somewhere and exits go somewhere. No mid-air fades of hero elements.
- [ ] Responses land on the contact frame (±1). Check with `--strip` around each contact.
- [ ] Scrub the strip at the loop point (`--strip <op-6>-<op-1>` and `--strip 0-6`): it must be invisible.
- [ ] Speeds are consistent for same-class objects; bigger things move slower.
- [ ] At 0.5× size (small screens), small details don't turn to mush and motion still reads.

## Integration
- [ ] The component typechecks and lints in the target project, and `lottie-web` is a dependency.
- [ ] `label` describes the concept (or `--decorative` if the surrounding copy carries it).
- [ ] The poster frame is chosen deliberately.
- [ ] If the app could be run: it plays in view, pauses off-screen, swaps theme without a flash, and shows no console errors.

## Three improvements
Even when everything passes, list three things that would make it better, then do the ones that improve clarity or craft without adding noise.
