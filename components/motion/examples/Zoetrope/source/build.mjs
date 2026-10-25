// Zoetrope — "Still frames, set spinning, come to life."
// The device the repo is named after, seen from slightly above. Still drawings of a bouncing ball line
// the inside of the drum. The drum winds back, is flicked into a spin, and the ball comes alive in place:
// its phase IS the drum angle (one drawing per slit, as the real device works), so it bounces faster
// the faster the drum turns, while the stills blur. The drum coasts to a stop on the frame it started
// from. Seamless loop.
//
//   node build.mjs <outDir>

import path from 'node:path';
import { Scene, Path, BezierPath, HOLD, clamp, smoothstep } from '../../../../../.claude/skills/zoe/scripts/lottie-kit.mjs';

const OUT = process.argv[2] || path.join(import.meta.dirname, 'out');

// ── 1. Tokens ────────────────────────────────────────────────────────────────
// body: outside of the drum and the stand · top: lit horizontal faces (rim, bead, base) · inner: inside
// the drum, in shadow · paper: the strip of drawings · slit: a cut-out, so it shows the page behind
const THEMES = {
  light: {
    body: '#292524', top: '#57534e', inner: '#1c1917', paper: '#f5f3ef', slit: '#f5f3ef',
    drawing: '#b8b1a7', drawingShadow: '#d9d3ca', floor: '#1c1917', floorOpacity: 7,
    accent: '#ff5a1f',
  },
  dark: {
    body: '#b8b3ad', top: '#dedad5', inner: '#151413', paper: '#33302c', slit: '#0c0c0b',
    drawing: '#7a746c', drawingShadow: '#4a4641', floor: '#000000', floorOpacity: 45,
    accent: '#ff6a33',
  },
};

// ── 2. Layout ────────────────────────────────────────────────────────────────
const W = 640, H = 480, FPS = 60;
const K = 0.4;                                  // horizontal circles project to ellipses of this ratio
const C = [320, 128];                           // centre of the drum's top rim
const DRUM = { R: 168, wall: 6, h: 120 };       // radius, wall thickness, projected wall height
const RI = DRUM.R - DRUM.wall;                  // inner radius: the paper strip lines this surface
const SLIT = { n: 12, w: 12, h: 66, top: 12 };  // capsules, `top` px below the rim
const BEAD = 9;                                 // a turned bead runs this far above the drum's bottom edge
const STRIP = { top: 6, bottom: 88 };           // the paper band, as depth below the back rim
const STEM = { R: 8 };
const FOOT = { R: 15, h: 6 };                   // collar where the stem meets the base
const BASE = { R: 88, h: 10, y: 368 };          // y: centre of the base's top face
const BALL = { r: 9, hop: 46, ground: 80, shadow: 24 }; // ground: depth below the back rim
const DRAWINGS = 12, PER_HOP = 6;               // one drawing per slit, two hops around the drum
const HOP_DEG = (360 / DRAWINGS) * PER_HOP;     // the drum turns this far per bounce

const rad = (d) => (d * Math.PI) / 180;
const frac = (x) => x - Math.floor(x);
// a point at angle a (0 = front, increasing turns the front to the right) on a horizontal circle of radius r
const rimX = (r, a) => C[0] + r * Math.sin(a);
const rimY = (r, a) => C[1] + r * K * Math.cos(a);
const ellipse = (c, r) => Path.circle(c, r).scale(1, K, c);
// front face of a vertical cylinder: bottom front arc (left → right), straight side, top front arc back
function cylinderSide(c, r, h) {
  const b = [c[0], c[1] + h];
  const bottom = Path.arc(b, r, 180, 0).scale(1, K, b).vertices;
  const top = Path.arc(c, r, 0, 180).scale(1, K, c).vertices;
  const vs = [...bottom, ...top];
  for (const i of [0, bottom.length - 1, bottom.length, vs.length - 1]) vs[i].corner = true;
  vs[0].in = vs[0].p; vs[bottom.length - 1].out = vs[bottom.length - 1].p;
  vs[bottom.length].in = vs[bottom.length].p; vs[vs.length - 1].out = vs[vs.length - 1].p;
  return new BezierPath(vs, true);
}
const backArc = (c, r) => Path.arc(c, r, 180, 360).scale(1, K, c);
const frontArc = (c, r) => Path.arc(c, r, 180, 0).scale(1, K, c);
// a horizontal band on the inside of the back wall, from depth d0 to d1 below the rim
function band(c, r, d0, d1) {
  const top = backArc([c[0], c[1] + d0], r).vertices;
  const bottom = backArc([c[0], c[1] + d1], r).reverse().vertices;
  const vs = [...top, ...bottom];
  for (const i of [0, top.length - 1, top.length, vs.length - 1]) vs[i].corner = true;
  vs[0].in = vs[0].p; vs[top.length - 1].out = vs[top.length - 1].p;
  vs[top.length].in = vs[top.length].p; vs[vs.length - 1].out = vs[vs.length - 1].p;
  return new BezierPath(vs, true);
}

// ── 3. Timing ────────────────────────────────────────────────────────────────
const F = 372;
const T = { rest: 24, wind: 16, flick: 36, cruise: 120, coast: 110 };
const t1 = T.rest, t2 = t1 + T.wind, t3 = t2 + T.flick, t4 = t3 + T.cruise, t5 = t4 + T.coast;
const WIND = 6, TURNS = 2;   // whole turns per loop: every slit and drawing returns to its own place
// cruise speed (°/frame), solved so wind-up + flick + cruise + coast add up to exactly TURNS revolutions
const OMEGA = (360 * TURNS + WIND) / (0.75 * T.flick + T.cruise + 0.5 * T.coast);

// Drum angle (degrees): the one source of truth for slits, drawings, the live ball and the blur.
function theta(f) {
  if (f <= t1) return 0;
  if (f <= t2) return -WIND * smoothstep(0, 1, (f - t1) / T.wind);              // wind-up
  let a = -WIND;
  if (f <= t3) { const x = (f - t2) / T.flick; return a + OMEGA * T.flick * (x - (1 - (1 - x) ** 4) / 4); } // flick: ω = 1-(1-x)³
  a += 0.75 * OMEGA * T.flick;
  if (f <= t4) return a + OMEGA * (f - t3);                                       // cruise
  a += OMEGA * T.cruise;
  if (f <= t5) { const x = (f - t4) / T.coast; return a + OMEGA * T.coast * (x - x ** 3 + x ** 4 / 2); } // coast: ω = 1-smoothstep
  return 360 * TURNS;
}
const omega = (f) => (theta(f + 0.05) - theta(f - 0.05)) / 0.1;
const spin = (f) => clamp(omega(f) / OMEGA);                    // 0 at rest → 1 at cruise
const blur = (f) => smoothstep(0.15, 0.7, spin(f));             // persistence of vision

// The bounce, as drawn on the strip: u is the phase within one hop (0 = contact, 0.5 = apex).
const hopHeight = (u) => BALL.hop * 4 * u * (1 - u);
function ballShape(u, intensity) {
  const d = Math.min(u, 1 - u), w = 0.05;
  const contact = d < w ? (1 - (d / w) ** 2) ** 2 : 0;
  const speed = Math.abs(1 - 2 * u);
  const sy = 1 + intensity * (0.07 * speed * speed * (1 - contact) - 0.14 * contact);
  return { sx: 1 / Math.sqrt(sy), sy };
}
const shadowW = (h) => BALL.shadow * (1 - 0.45 * h / BALL.hop);
// what the eye sees through the slits: the drawing at the back centre, i.e. phase = drum angle
const livePhase = (f) => frac(0.5 + theta(f) / HOP_DEG);
const groundY = rimY(RI, Math.PI) + BALL.ground;

// Foreshortened width of a mark on the drum (c = cos of its angle to the viewer): exactly 0 from the
// silhouette back, joined to the true width by a C1 knee (≤0.4px narrower), so marks vanish edge-on
// without a kink.
const EDGE = 0.04;
const facing = (c) => (c >= 2 * EDGE ? c - EDGE : c <= 0 ? 0 : (c * c) / (4 * EDGE));

// A mark only needs keys while it faces the viewer. windows() returns the frame ranges in [t1, t5]
// where it does, padded by 2 zero-width frames; bakeVisible() bakes those, holds while the mark is
// edge-on or behind, and jumps only at zero width. Frame 0 starts from the value it parks at by
// frame F, so the loop seam is exact. The width itself is only fitted between its zero crossings,
// so it is exactly 0 (not just within tolerance) wherever the mark parks or jumps.
function windows(width) {
  const near = (f) => [-2, -1, 0, 1, 2].some((d) => width(clamp(f + d, t1, t5)) > 0);
  const out = [];
  let a = null;
  for (let f = t1; f <= t5; f++) {
    if (near(f) && a === null) a = f;
    if (a !== null && (!near(f) || f === t5)) { out.push([a, near(f) ? f : f - 1]); a = null; }
  }
  return out;
}
function bakeVisible(prop, wins, fn, opts, width = null) {
  prop.keys = [];
  for (const [a, b] of wins) {
    let a1 = a, b1 = b;
    if (width) { // tighten to the frames around the non-zero width, flat zeros outside
      while (a1 < b && width(a1 + 1) === 0) a1++;
      while (b1 > a1 && width(b1 - 1) === 0) b1--;
      prop.from(a, fn(a)).from(b, fn(b));
    }
    if (b1 > a1) prop.bake(a1, b1, fn, opts);
  }
  for (const [, b] of wins) if (b < t5) prop.keys.find((k) => k.t === b).ease = HOLD;
  if (wins[0][0] > t1) prop.from(0, fn(wins[wins.length - 1][1])).keys[0].ease = HOLD;
  return prop;
}

// ── 4. Build ─────────────────────────────────────────────────────────────────
function build(theme) {
  const P = THEMES[theme];
  const s = new Scene({ name: 'zoetrope', width: W, height: H, fps: FPS, frames: F, loop: true });

  // floor shadow: light from the upper left
  const fr = BASE.R + 12;
  s.layer('floor-shadow').ellipse({ w: 2 * fr, h: 2 * fr * K, at: [C[0] + 10, BASE.y + BASE.h + 4], fill: P.floor, fillOpacity: P.floorOpacity });

  const base = s.layer('base');
  base.path(cylinderSide([C[0], BASE.y], BASE.R, BASE.h), { name: 'side', fill: P.body });
  base.path(ellipse([C[0], BASE.y], BASE.R), { name: 'top', fill: P.top });

  // stand: a foot collar on the base, and the stem from under the drum (hidden by the wall) into it
  const stand = s.layer('stand');
  const footY = BASE.y - FOOT.h;
  stand.path(cylinderSide([C[0], footY], FOOT.R, FOOT.h), { name: 'foot-side', fill: P.body });
  stand.path(ellipse([C[0], footY], FOOT.R), { name: 'foot-top', fill: P.top });
  stand.path(cylinderSide([C[0], C[1] + DRUM.h], STEM.R, footY - C[1] - DRUM.h), { name: 'stem', fill: P.body });

  // inside of the drum, in shadow, lined with the paper strip
  const interior = s.layer('interior');
  interior.path(ellipse(C, RI), { name: 'inner', fill: P.inner });
  interior.path(band(C, RI, STRIP.top, STRIP.bottom), { name: 'strip', fill: P.paper });

  // the strip of still drawings, one per slit, foreshortened on the curved wall
  const strip = s.layer('stills');
  for (let j = 0; j < DRAWINGS; j++) {
    const a = (360 / DRAWINGS) * j;
    const u = frac(0.5 + (180 - a) / HOP_DEG);          // the phase it shows when it reaches the back centre
    const h = hopHeight(u), sh = ballShape(u, 1);
    const g = strip.group(`still${j}`);
    g.ellipse({ name: 'shadow', w: shadowW(h), h: 4, fill: P.drawingShadow });
    g.ellipse({ name: 'ball', w: 2 * BALL.r * sh.sx, h: 2 * BALL.r * sh.sy, at: [0, -h - BALL.r * sh.sy], fill: P.drawing });
    const beta = (f) => rad(theta(f) + a);
    const width = (f) => facing(-Math.cos(beta(f)));    // drawn on the inside: faces us on the back half
    const wins = windows(width);
    bakeVisible(g.position, wins, (f) => [rimX(RI, beta(f)), rimY(RI, beta(f)) + BALL.ground], { tol: 0.5 });
    bakeVisible(g.scale, wins, (f) => [100 * width(f), 100], { tol: 3 }, width);
  }
  strip.opacity.bake(t1, t5, (f) => 100 - 55 * blur(f), { tol: 0.5 });

  // the live ball: always the frame at the viewing point, so at rest it sits exactly on that still
  const live = s.layer('live');
  const shadow = live.ellipse({ name: 'shadow', w: BALL.shadow, h: 4, position: [C[0], groundY], fill: P.drawingShadow });
  const ball = live.circle({ name: 'ball', r: BALL.r, position: [C[0], groundY - BALL.hop - BALL.r], fill: P.accent });
  ball.position.bake(t1, t5, (f) => {
    const u = livePhase(f), sh = ballShape(u, spin(f));
    return [C[0], groundY - hopHeight(u) - BALL.r * sh.sy];
  }, { tol: 0.12 }).allow('kink'); // a bounce reverses the ball's velocity on contact, by definition
  ball.scale.bake(t1, t5, (f) => { const sh = ballShape(livePhase(f), spin(f)); return [100 * sh.sx, 100 * sh.sy]; }, { tol: 0.8 })
    .allow('kink'); // the squash is the impact response: it starts on the contact frame, at speed
  shadow.scale.bake(t1, t5, (f) => { const k = (100 * shadowW(hopHeight(livePhase(f)))) / BALL.shadow; return [k, 100]; }, { tol: 1 })
    .allow('kink'); // follows the ball's height, which turns sharply at contact
  ball.body({ shape: 'circle', r: BALL.r, name: 'live-ball' });

  // the drum's front wall, its slits (only on the half facing us), the rim
  const wall = s.layer('wall');
  wall.path(cylinderSide(C, DRUM.R, DRUM.h), { name: 'wall', fill: P.body });
  wall.path(frontArc([C[0], C[1] + DRUM.h - BEAD], DRUM.R - 0.75), { name: 'bead', stroke: P.top, strokeWidth: 1.5, cap: 'butt' }); // inset: stays inside the silhouette
  const slits = s.layer('slits');
  for (let i = 0; i < SLIT.n; i++) {
    const a = (360 / SLIT.n) * (i + 0.5);               // between the drawings
    const g = slits.rect({ name: `slit${i}`, w: SLIT.w, h: SLIT.h, r: SLIT.w / 2, fill: P.slit });
    const alpha = (f) => rad(theta(f) + a);
    const width = (f) => facing(Math.cos(alpha(f)));
    const wins = windows(width);
    bakeVisible(g.position, wins, (f) => [rimX(DRUM.R, alpha(f)), rimY(DRUM.R, alpha(f)) + SLIT.top + SLIT.h / 2], { tol: 0.3 });
    bakeVisible(g.scale, wins, (f) => [100 * width(f), 100], { tol: 3 }, width);
  }

  const rim = s.layer('rim');
  const ring = rim.group('ring');
  ring.addPath(ellipse(C, DRUM.R));
  ring.addPath(ellipse(C, RI));
  ring.addFill({ color: P.top, rule: 'evenodd' });

  // invisible guides: the opening's edges, so the analyser can prove the ball never touches them
  const guides = s.layer('guides');
  guides.hidden = true;
  const backEdge = guides.path(backArc(C, RI), { name: 'back-edge' });
  const frontEdge = guides.path(frontArc(C, RI), { name: 'front-edge' });

  // ── 5. Analysis rules ──
  s.noOverlap([ball, backEdge, frontEdge], { clearance: 6, name: 'ball vs opening', ignore: [[backEdge, frontEdge]] });
  s.keepInside([wall, rim, base], { padding: 24 });
  s.meta = { concept: 'Still frames, set spinning, come to life', theme };
  return s;
}

for (const theme of ['light', 'dark']) {
  const s = build(theme);
  const stats = s.save(path.join(OUT, `${theme}.json`), { precision: 2 });
  console.log(`${theme}: ${(stats.bytes / 1024).toFixed(1)}KB · ${stats.layers} layers · ${stats.keyframes} keyframes`);
  if (theme === 'light') s.analyze().print();
}
const contacts = [];
for (let f = 1; f < F; f++) if (Math.floor(0.5 + theta(f) / HOP_DEG) > Math.floor(0.5 + theta(f - 1) / HOP_DEG)) contacts.push(f);
console.log({ OMEGA: +OMEGA.toFixed(3), hopFrames: +(HOP_DEG / OMEGA).toFixed(1), beats: { t1, t2, t3, t4, t5 }, contacts });
