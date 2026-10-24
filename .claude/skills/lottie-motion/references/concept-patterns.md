# Concept patterns: metaphors that read in two seconds

Use these as starting points for ideation, not as a menu. The best result usually combines a structure from one pattern with a detail from another, adapted to what is specific about the product. Each pattern lists the **storyboard**, the **craft details** that make it feel designed, and the **traps**.

---

### 1. Routing / many → one (aggregation, ingestion, API gateway)
- **Story**: sources at the periphery emit packets that travel routed lines into a core, and the core acknowledges each arrival.
- **Craft**: orthogonal routes with filleted corners on a grid; packets emerge from under nodes and slide under the hub; comet trails lag in time; arrivals on an even beat from alternating sides; the hub shows a bump, a pulse ring and a lit cell. *(See examples/packet-routing.)*
- **Traps**: routes crossing each other (use ports offset by about 28px); simultaneous arrivals; packets disappearing in mid-air.

### 2. Distribution / one → many (fan-out, load balancing, broadcast)
- **Story**: a stack or a source releases items that fan out to destinations, which fill evenly.
- **Craft**: the source "deals" items with a decaying stagger; each item travels a `Path.smooth` arc (not a straight line) with a slight rotation that settles via spring; destinations show fill level or a count. For load balancing, the next item goes to the emptiest bin (show that logic).
- **Traps**: identical arcs (vary the curvature by destination angle); cards overlapping mid-flight (analyse with `noOverlap`); everyone landing at once.

### 3. Sync / replication (multi-device, real-time collaboration)
- **Story**: a change made in one place appears in the others.
- **Craft**: 2–3 identical frames (device or card skeletons); a change happens in one (a bar grows, a chip toggles) and a signal travels along a connector to the others, which update on arrival with the same micro-animation, slightly delayed. Cursor-like pointers for collaboration.
- **Traps**: updates that land before the signal arrives; too many devices; real UI detail (keep skeletal).

### 4. Transformation / pipeline (processing, ETL, AI enrichment)
- **Story**: raw input enters a processor and leaves structured or enriched.
- **Craft**: input items are irregular (different widths, muted), the processor is a clear gate (slot or ring), and output items are aligned, accent-tagged and snapped to a grid. The processor shows work (scanning line, rotating segment, filling cells) only while an item is inside. Use matte or occlusion so the change happens *inside* the box.
- **Traps**: the change happening in the open (no causality); generic "AI sparkle".

### 5. Filtering / search / matching
- **Story**: many items pass by and only the matching ones are pulled forward and highlighted.
- **Craft**: a grid or stream of neutral cards. A lens, slot or scanning line passes over them; matches lift (scale 1.04 plus a shadow step plus the accent border) while non-matches dim to 40%. End on the result set neatly re-arranged.
- **Traps**: re-flow without spring settling; low contrast between matched and unmatched.

### 6. Security / protection (encryption, permissions, isolation)
- **Story**: data moves through a boundary and is transformed or protected, while threats are deflected.
- **Craft**: a shield is too literal, so prefer a **boundary** (a rounded container with a double border) where items crossing it change form (bars become dots for encryption) via a matte at the boundary line. An unauthorized item approaches, meets the boundary, and gets a subtle reject (small recoil with a spring, then a fade). Locks drawn with the scene's own strokes only.
- **Traps**: red alarms and padlock clip-art; too many attackers (one is enough).

### 7. Growth / analytics / performance
- **Story**: a metric improves because of something.
- **Craft**: a chart *drawn* by trim (line) or grown bars (staggered with `ease.out`); the cause is shown first (a change, a toggle) and the effect follows. Grid lines whisper. A counter chip follows the line head. Keep it to one series.
- **Traps**: stock-chart randomness (use a designed curve via `Path.smooth` on chosen points); an ever-rising line that needs a reset (fade it out and redraw in the rest beat, or show a sliding window).

### 8. Automation / workflow (triggers, steps, integrations)
- **Story**: a trigger sets off a sequence of steps.
- **Craft**: nodes connected by `Path.connector` S-curves; a token travels and each node "runs" (a ring spinner for 300–500ms, then a check stroke drawn by trim) before passing it on. Branches: the token splits into two on `Path.smooth` curves. The final node completes with an emphasis bump.
- **Traps**: too many nodes (keep 3–5); checkmarks popping (draw them); identical durations per step (vary them slightly).

### 9. Hub-and-spoke / integrations
- **Story**: your product sits at the centre and connects tools.
- **Craft**: abstract tool tiles (not logos unless provided as SVG) placed on an ellipse; spokes drawn on with trim, staggered from the centre; data pulses travel both ways at different times; the tiles' borders light up on contact. An orbit, if any, is very slow (≥ 40s per revolution, so it barely moves within the loop) or absent.
- **Traps**: rotating the whole wheel (dizzying); a perfectly symmetric layout (slightly vary radii).

### 10. Global / edge network / latency
- **Story**: requests get served from the nearest point.
- **Craft**: an abstract world, such as a dotted landmass hint (sparse dots on a grid) or simply a horizon arc; edge points as rings; a request arcs to the nearest edge with a short arc (`Path.arc` or a cable with negative sag) rather than the far origin. Show the far path faintly to contrast long and short.
- **Traps**: a detailed globe (heavy and cliché); arcs crossing labels.

### 11. Storage / versioning / history
- **Story**: changes stack up as versions you can return to.
- **Craft**: cards stacked in z with perspective-free offsets (y −6px, scale −4% per depth). A new version slides in on top while older ones step back. A "restore" moment pulls one forward with a spring.
- **Traps**: z-order changes (Lottie can't reorder layers mid-animation; duplicate the layer and swap visibility while it is occluded).

### 12. Speed / performance comparison
- **Story**: ours is faster than theirs.
- **Craft**: two lanes with the same task. The neutral lane progresses steadily; the accent lane finishes early and does a subtle completion response. Then hold, and reset during an occluded or faded rest.
- **Traps**: mocking competitors; numbers inside the animation.

### 13. Queue / ordering / rate limiting
- **Story**: items line up and are processed in order at a steady rate.
- **Craft**: items advance one slot per beat (each `inOut` with a short stagger from the front, so the line ripples). The processing slot takes one item per beat, and excess items wait with a subtle idle bob (2px, `smooth`, out of phase).
- **Traps**: the whole queue moving rigidly; an irregular beat.

### 14. Notifications / events / webhooks
- **Story**: something happens here, and over there something reacts instantly.
- **Craft**: a source event (a chip flips state), then a signal travels with a comet trail, then the destination shows a stacked notification sliding in from under a header, with older ones stepping down (stagger). Keep the stack at 3 or fewer; the oldest exits via occlusion.
- **Traps**: bell icons; unbounded stacks.

---

## Picking between candidates

- Prefer the metaphor that **shows causality** (A causes B) over one that merely shows things existing.
- Prefer **one strong structure** with crafted details over a complex scene.
- If two candidates tie, choose the one whose poster frame reads best statically.
- If the product has a distinctive mechanic (for example "ranks by relevance" or "deduplicates"), make *that mechanic* the hero beat. Specificity beats prettiness.
