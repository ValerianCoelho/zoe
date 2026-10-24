# lottie-kit API

`scripts/lottie-kit.mjs` is plain ESM with no dependencies. Import it by absolute path. All units are px, frames, degrees, and percent (0–100) for scale, opacity and trim.

```js
import { Scene, Path, BezierPath, lerpPath, ease, easeFn, CubicBezier, spring, stagger, durationFor,
         clamp, lerp, invLerp, remap, smoothstep, V, rng, hex, mix, contrast, toHex } from '.../lottie-kit.mjs';
```

## Mental model

```
Scene ─ layers (painter's order: later = on top)
  Layer (transform: position, anchor, scale[%,%], rotation°, opacity%) ─ parent?  in/out frames
    Group (own transform) ─ geometry (rect/ellipse/path) → modifiers (trim, round corners) → stroke → fill
```

- **Animate at layer level** (move, scale or fade a whole element). Put the element's centre at the layer origin: draw shapes around `[0,0]` and set the layer `position`. Rotation and scale then happen about the centre.
- **Parenting** (`parent: otherLayer`) inherits transforms but **not opacity** (Lottie rule).
- Within a layer and within a group, later-added children paint on top (the kit reverses the order for Lottie on export).

## Scene

```js
const s = new Scene({ name, width, height, fps: 60, duration: 6 /*s*/ /* or frames */, loop: true });
s.frames; s.fps; s.s(1.5) /* seconds→frames */; s.center
s.layer(name, { position, anchor, scale, rotation, opacity, parent, in, out })
s.null(name, opts)                      // invisible rig layer for parenting
s.marker('intro', 0, 90); s.marker('loop', 90, 450)   // the player plays intro once, then loops 'loop'
s.cycle(prop, starts, duration, fn(localFrame, tripIndex), { tol })   // seamless repeating bake (see below)
s.save(file) → { bytes, layers, keyframes };  s.toJSON()
s.analyze().print()                     // → { counts, issues, clearance, timeline }
s.meta = { concept: '…' }               // written into the JSON
```

## Shapes (on Layer or Group; each returns a Group handle)

```js
L.rect({ w, h, r, at:[cx,cy] /*default [0,0]*/ | x,y /*top-left*/, fill, fillOpacity, stroke, strokeWidth, strokeOpacity,
         cap:'round'|'butt'|'square', join, dash:[d,g], dashOffset, trim:{start,end,offset}|true,
         gradient:{…}, position, scale, rotation, opacity, name })
L.circle({ r, at, …same style opts })
L.ellipse({ w, h, at, … })
L.path(bezierPath, { stroke, strokeWidth, fill, trim, dash, … })
```

The handle (Group) exposes animatable props:

- `g.position / anchor / scale / rotation / opacity`: the group transform.
- `g.geo.size`, `g.geo.at`, `g.geo.radius` (rect/ellipse), and `g.geo.shape` (path, for morphs).
- `g.fillItem.color / .opacity` and `g.strokeItem.color / .width / .opacity / .dash.offset`.
- `g.trim.start / .end / .offset`.

Low-level building: `const g = L.group('name')`, then `g.addRect / addEllipse / addPath / addTrim / addRoundCorners / addStroke / addFill / addGradient`. When several paths share one stroke, add all the paths first, then the stroke (this is how the dot grid is drawn).

Gradient: `addGradient({ type:'linear'|'radial', from:[x,y], to:[x,y], stops:[[0,'#hex',alpha],[1,'#hex',alpha]], stroke?:{ width, cap, dash } })`.

## Props (every animatable value)

```js
p.set(v)                              // static value
p.from(t, v).to(t2, v2, ease.inOut)   // ease = curve of the segment ARRIVING at t2
p.to(t, v, e)                         // with no earlier key, keys the static value at frame 0 first
p.hold(t)                             // rest until t
p.cut(t, v)                           // instant jump (only while invisible!)
p.tween(t0, t1, v0, v1, e)
p.bake(t0, t1, f => value, { tol })   // any function of (fractional) frame → C1 Hermite keys within tol
p.spring(t0, from, to, { stiffness, damping, mass, velocity }) → settleFrame
p.at(f); p.vel(f)                     // evaluate (the same maths the analyser uses)
p.allow('kink'|'cut'|'loop-seam')     // mark intentional behaviour (add a comment why!)
```

Value kinds: scalar; vec (`[x,y]`, with scale in percent `[100,100]`); color (`'#hex'`, mixed with `mix()`); shape (`BezierPath`; morph targets need equal vertex counts and are baked piecewise-linearly).

### `s.cycle()`: seamless loops

`s.cycle(prop, [start1, start2…], duration, (lf, i) => value)` runs the function for `duration` frames from each start. Starts are wrapped modulo the loop, so a trip crossing the loop point is split across the seam. Between trips the value rests at `fn(duration)` and is cut back to `fn(0)` at the next start: **design it so the element is invisible at that moment** (occluded, opacity 0, scale 0, or trim collapsed). Use one `cycle` call per property, all driven by the same timing variables.

## Paths (absolute coordinates, layer space)

```js
Path.line(points, closed)                 // straight segments (corners)
Path.smooth(points, { closed, tension })  // curve THROUGH points (Catmull-Rom → bezier). Organic lines.
Path.rounded(points, radius, closed)      // polyline with circular fillets. Circuit/grid routing.
Path.connector(a, b, { axis:'x'|'y', bend:0.5 })   // S-curve between ports
Path.cable(a, b, sag)                     // hanging wire
Path.arc(c, r, a0°, a1°); Path.circle(c, r); Path.rect(x, y, w, h, r)
Path.svg('M… C… Z')                       // import SVG path data (no A arcs)

path.length(); path.pointAt(u) /*u = arc-length fraction 0..1*/; path.tangentAt(u); path.angleAt(u)
path.sample(n); path.bounds(); path.slice(u0,u1); path.reverse(); path.translate/scale/rotate/map
path.kinks()   // smooth vertices whose handles are not collinear (the "stick joint" detector)
lerpPath(a, b, t)
```

Travel: `layer.moveAlong(path, t0, t1, { ease, from:0, to:1, orient, angleOffset })`, or for loops `s.cycle(L.position, [start], dur, lf => path.pointAt(progress(lf)))`. Trim paths are arc-length based too, so `trim.end = u × 100` puts a trail head exactly under a packet at `pointAt(u)`.

## Timing helpers

```js
ease.{linear,out,outSoft,outQuad,inOut,inOutStrong,smooth,cubic,in,inStrong,standard,anticipate,overshoot,hold}
ease.bezier(x1,y1,x2,y2); easeFn(e)(p) → 0..1
spring(cfg) → { at(seconds), duration, zeta }
stagger(n, { each:4, from:'start'|'end'|'center'|'edges'|index, ease }) → frame offsets
durationFor(distancePx, { fps }) → frames (√-scaled)
rng(seed) → () ∈ [0,1); .range(a,b) .int(a,b) .pick(arr) .jitter(v,amt)   // deterministic. Never Math.random.
```

## Analysis

Declare rules, then call `s.analyze().print()`:

```js
L.body({ shape:'circle', r } | { shape:'rect', w, h } | { group:'box' } /*derive from that group's geometry*/  + optional pad, name, at })
groupHandle.body({ … })        // a group inside a layer can be a body too
s.noOverlap([layersOrGroupsOrBodies], { clearance: 4, ignore: [[a,b], …] })
s.occluders([layers])          // opaque things that hide what's beneath (z-order aware)
s.keepInside([layers], { padding: 24 })
```

Checks, with what each one means:

| type | meaning | typical fix |
|---|---|---|
| `overlap` / `clearance` | Bodies intersect, or come closer than the clearance (sampled every 0.5f; ignored while occluded or invisible) | Re-route, re-time (beat grid), or add spacing |
| `kink` | Velocity discontinuity at a key: abrupt start or stop, direction snap, speed jump | Ease into or out of rests; route through curves; bake from one function |
| `cut` | Value jumps while the element is visible | Hide first (occlusion, fade, collapse the trim) or animate it |
| `pop` | Visibility (opacity × scale) jumps by more than 45% within one frame | Longer, softer entrance (`outQuad`), or emerge from under something |
| `loop-seam` | Value or speed differs between frame 0 and frame op | Use `s.cycle`; constant motions change by whole periods |
| `bounds` | Body leaves the safe area | Move it or shrink it |
| `jitter` | Rapid direction reversals | Remove the oscillation; check bake tolerance |

The **timeline** (█ moving, · visible and static) is your choreography X-ray.

## Lottie and player gotchas (the kit handles most of these)

- Players: lottie-web `lottie_light` (SVG, no expressions) is the target. Avoid expressions, layer effects, merge paths, text layers, images and 3D layers.
- Track mattes: `target.matteWith(sourceLayer, 'alpha'|'alphaInverted')`. The source is exported directly above the target and is not visible itself.
- Layer z-order cannot change over time. To swap depth, duplicate the element on two layers and switch which one is visible while it is occluded.
- Ellipse and rect sizes animate cheaply. Path morphs need matching vertex counts.
- Stroke dashes with a gradient stroke work (the dot-grid technique). Dash offset animates marching ants: loop by a whole multiple of (dash + gap).
- `bake`/`cycle` fit motion with cubic Hermite segments. Easing that is itself a cubic Hermite (`ease.cubic`, i.e. smoothstep, or `ease.linear`) costs one segment, while curves like `inOut` or `out` need several. Use `ease.cubic` for many small repeated tweens (sweeps, blinks); it looks almost identical to `inOut` and is a fraction of the size.
- Keep files under 120KB: raise bake `tol` for slow or small things (0.15–0.25), avoid per-frame keys on many layers, and reuse one layer per repeating effect via `cycle` with multiple starts.
