// SingleSource — "One source of truth, many uses."
// Five sources send grey snippets into their own row of one central hub; the hub publishes a new
// version and sends accent signals to three tools (a chart, a chat and a gauge), each of which
// responds in its own way. Seamless 7s loop.
//
//   node build.mjs <outDir>

import path from 'node:path';
import { Scene, Path, ease, easeFn, clamp, mix } from '../../../../../.claude/skills/zoe/scripts/lottie-kit.mjs';

const OUT = process.argv[2] || path.join(import.meta.dirname, 'out');

// ── 1. Tokens ────────────────────────────────────────────────────────────────
const THEMES = {
  light: {
    dot: '#d6d3cd', route: '#e4e1db', card: '#ffffff', cardStroke: '#e2dfd9', bar: '#ebe8e3', glyph: '#c2bdb4', ink: '#57534e',
    shadow: '#1c1917', shadowOpacity: 6, snippet: '#8a847c',
    hub: '#1c1917', hubRow: '#3a3633', hubGlyph: '#78716c', hubTitle: '#a8a29e',
    accent: '#0f9b77', accentSoft: 14,
  },
  dark: {
    dot: '#2b2a28', route: '#272624', card: '#171615', cardStroke: '#2d2c2a', bar: '#262523', glyph: '#4a4743', ink: '#a8a29e',
    shadow: '#000000', shadowOpacity: 35, snippet: '#8a847c',
    hub: '#f4f3f1', hubRow: '#dcd8d1', hubGlyph: '#a8a29e', hubTitle: '#78716c',
    accent: '#2ec4a0', accentSoft: 16,
  },
};

const W = 800, H = 480, FPS = 60, LOOP = 7;
const G = 20;
const SRC = { w: 96, h: 48, r: 10, x: 92 };            // 44px left margin
const HUB = { w: 160, h: 212, r: 16, c: [372, 240] };  // equal gaps to both columns
const DST = { w: 152, h: 104, r: 14, x: 680 };         // 44px right margin
const ROUTE_W = 1.5, SIG_R = 3.5, HALO_R = 7.5, TRAIL_LAG = 12;
const SNIP = { w: 14, h: 8 };
const IN_SPEED = 3.0, OUT_SPEED = 3.4;

// ── 2. Layout ────────────────────────────────────────────────────────────────
const hubLeft = HUB.c[0] - HUB.w / 2, hubRight = HUB.c[0] + HUB.w / 2;
const ROW_Y = [...Array(5).keys()].map((i) => -40 + 30 * i);           // hub-local row centres
const ROW_W = [64, 82, 56, 74, 68];                                       // row bar lengths (varied, not random)

const SOURCES = [...Array(5).keys()].map((k) => {
  const c = [SRC.x, 80 + 80 * k];
  const end = [hubLeft + 24, HUB.c[1] + ROW_Y[k]];                         // ends under the hub, at its row
  const route = Path.connector(c, end, { axis: 'x', bend: 0.5 });
  return { k, c, route, len: route.length() };
});

const TOOLS = ['chart', 'chat', 'gauge'].map((id, j) => {
  const c = [DST.x, 112 + 128 * j];
  const start = [hubRight - 24, HUB.c[1] + (j - 1) * 44];
  const end = [c[0] - DST.w / 2 + 24, c[1]];
  const route = Path.connector(start, end, { axis: 'x', bend: 0.5 });
  return { id, j, c, route, len: route.length() };
});

// ── 3. Timing ────────────────────────────────────────────────────────────────
const travelEase = easeFn(ease.inOut);
// local frame when a travelling body's leading edge crosses x = threshold
const crossX = (route, travel, threshold, dir = 1) => {
  for (let lf = 0; lf <= travel; lf += 0.25) if (dir * route.pointAt(travelEase(lf / travel))[0] >= dir * threshold) return lf;
  return travel;
};

const IN_ORDER = [2, 0, 4, 1, 3];       // arrivals alternate top/bottom so the eye scans the hub
for (const s of SOURCES) {
  s.travel = Math.round((s.len / IN_SPEED) * 1.3);
  s.emitLf = crossX(s.route, s.travel, SRC.x + SRC.w / 2 + SNIP.w / 2);
  s.hitLf = crossX(s.route, s.travel, hubLeft - SNIP.w / 2);
  s.arrive = 30 + 24 * IN_ORDER.indexOf(s.k);
  s.start = Math.round(s.arrive - s.hitLf);
  s.arrive = Math.round(s.start + s.hitLf);
}
const PUBLISH = Math.max(...SOURCES.map((s) => s.arrive)) + 24;
for (const p of TOOLS) {
  p.travel = Math.round((p.len / OUT_SPEED) * 1.3);
  p.start = PUBLISH + 10 + 12 * p.j;
  p.emitLf = crossX(p.route, p.travel, hubRight + HALO_R);
  p.hitLf = crossX(p.route, p.travel, DST.x - DST.w / 2 - HALO_R);
  p.arrive = Math.round(p.start + p.hitLf);
}
const EXIT = 372; // reply bubble + ring leave before the loop restarts

// ── helpers ──────────────────────────────────────────────────────────────────
// Update sweep: an accent pill draws over a bar, holds a beat, then erases from the left.
// Rests collapsed (start = end) so cuts are invisible.
function sweep(s, g, t0, { draw = 16, gap = 6, erase = 18 } = {}) {
  const d = draw + gap + erase;
  // ease.cubic (smoothstep) is an exact Hermite segment, so each sweep bakes to a handful of keys
  s.cycle(g.trim.end, [t0], d, (lf) => 100 * easeFn(ease.cubic)(clamp(lf / draw)));
  s.cycle(g.trim.start, [t0], d, (lf) => 100 * easeFn(ease.cubic)(clamp((lf - draw - gap) / erase)));
}
// pill-shaped stroke from x0 to x1 (round caps inset so it matches a rect of height h)
const pillLine = (x0, x1, y, h) => Path.line([[x0 + h / 2, y], [x1 - h / 2, y]]);
// fast attack, slow release colour response
const flash = (base, accent, lf, up = 6, hold = 14, down = 60) =>
  mix(base, accent, lf < up ? easeFn(ease.outQuad)(lf / up) : 1 - easeFn(ease.cubic)(clamp((lf - up - hold) / down)));

// ── 4. Build ─────────────────────────────────────────────────────────────────
function build(theme) {
  const T = THEMES[theme];
  const s = new Scene({ name: 'single-source', width: W, height: H, fps: FPS, duration: LOOP, loop: true });

  // backdrop: whisper dot grid, radial fade around the hub
  const grid = s.layer('dot-grid').group('rows');
  for (let y = G; y < H; y += G) grid.addPath(Path.line([[G, y], [W - G, y]]));
  grid.addGradient({
    stroke: { width: 2, cap: 'round', dash: [0.001, G] }, type: 'radial', from: HUB.c, to: [HUB.c[0] + W * 0.55, HUB.c[1]],
    stops: [[0, T.dot, 1], [0.5, T.dot, 0.8], [1, T.dot, 0]],
  });

  const routes = s.layer('routes');
  const inRoutes = SOURCES.map((x) => routes.path(x.route, { name: `in-${x.k}`, stroke: T.route, strokeWidth: ROUTE_W }));
  const outRoutes = TOOLS.map((p) => routes.path(p.route, { name: `out-${p.id}`, stroke: T.route, strokeWidth: ROUTE_W }));

  // inbound snippets (raw data): neutral, oriented along their curve, hidden under cards at both ends
  const snippets = SOURCES.map((x) => {
    const L = s.layer(`snippet-${x.k}`, { position: x.c });
    L.rect({ name: 'pill', w: SNIP.w, h: SNIP.h, r: SNIP.h / 2, fill: T.snippet });
    const u = (lf) => travelEase(clamp(lf / x.travel));
    s.cycle(L.position, [x.start], x.travel, (lf) => x.route.pointAt(u(lf)), { tol: 0.08 });
    s.cycle(L.rotation, [x.start], x.travel, (lf) => x.route.angleAt(u(lf)), { tol: 0.35 });
    L.body({ shape: 'rect', w: SNIP.w, h: SNIP.h, name: `snippet-${x.k}` });
    x.snippet = L;
    return L;
  });

  // outbound signals (the processed result): accent dot + halo + comet trail
  const signals = TOOLS.map((p) => {
    const tr = s.layer(`trail-${p.id}`).path(p.route, { name: 'trail', stroke: T.accent, strokeWidth: ROUTE_W + 0.5, trim: { start: 0, end: 0 } });
    const u = (lf) => travelEase(clamp(lf / p.travel)) * 100;
    s.cycle(tr.trim.end, [p.start], p.travel, (lf) => u(lf));
    s.cycle(tr.trim.start, [p.start], p.travel + TRAIL_LAG, (lf) => u(lf - TRAIL_LAG));
    const L = s.layer(`signal-${p.id}`, { position: p.route.pointAt(0) });
    L.circle({ name: 'halo', r: HALO_R, fill: T.accent, fillOpacity: T.accentSoft });
    L.circle({ name: 'core', r: SIG_R, fill: T.accent });
    s.cycle(L.position, [p.start], p.travel, (lf) => p.route.pointAt(travelEase(clamp(lf / p.travel))), { tol: 0.08 });
    L.body({ shape: 'circle', r: HALO_R, name: `signal-${p.id}` });
    p.signal = L;
    return L;
  });

  // sources: mini pages; their value pill acknowledges each departure
  const sources = SOURCES.map((x) => {
    const L = s.layer(`source-${x.k}`, { position: x.c });
    L.rect({ name: 'shadow', w: SRC.w, h: SRC.h, r: SRC.r, at: [0, 2], fill: T.shadow, fillOpacity: T.shadowOpacity });
    L.rect({ name: 'card', w: SRC.w, h: SRC.h, r: SRC.r, fill: T.card, stroke: T.cardStroke, strokeWidth: 1 });
    L.rect({ name: 'favicon', w: 10, h: 10, r: 3, at: [-30, -10], fill: T.glyph });
    L.rect({ name: 'title', w: 40, h: 4, r: 2, at: [-1, -10], fill: T.bar });
    const pill = L.rect({ name: 'value', w: 40, h: 14, r: 7, at: [-15, 10], stroke: T.glyph, strokeWidth: 1 });
    L.rect({ name: 'value-bar', w: 20, h: 3, r: 1.5, at: [-15, 10], fill: T.glyph });
    s.cycle(pill.strokeItem.color, [x.start + x.emitLf - 8], 70, (lf) => flash(T.glyph, T.ink, lf, 6, 10, 50));
    L.body({ group: 'card' });
    x.layer = L;
    return L;
  });

  // the hub (hero): header with a version chip, five rows, each fed by one source
  const hub = s.layer('hub', { position: HUB.c });
  hub.rect({ name: 'shadow', w: HUB.w, h: HUB.h, r: HUB.r, at: [0, 3], fill: T.shadow, fillOpacity: T.shadowOpacity * 1.5 });
  hub.rect({ name: 'card', w: HUB.w, h: HUB.h, r: HUB.r, fill: T.hub });
  hub.rect({ name: 'title', w: 56, h: 5, r: 2.5, at: [-36, -84], fill: T.hubTitle });
  const chip = hub.rect({ name: 'version', w: 38, h: 14, r: 7, at: [43, -84], stroke: T.hubGlyph, strokeWidth: 1 });
  const chipDot = hub.circle({ name: 'version-dot', r: 2, at: [33, -84], fill: T.hubGlyph });
  hub.rect({ name: 'version-bar', w: 16, h: 3, r: 1.5, at: [47, -84], fill: T.hubGlyph });
  hub.path(Path.line([[-64, -64], [64, -64]]), { name: 'divider', stroke: T.hubRow, strokeWidth: 1 });
  ROW_Y.forEach((y, i) => {
    hub.circle({ name: `row${i}-src`, r: 2.5, at: [-62, y], fill: T.hubGlyph });
    hub.rect({ name: `row${i}-bar`, x: -52, y: y - 3, w: ROW_W[i], h: 6, r: 3, fill: T.hubRow });
    // link glyph ↗ (each row points back to its source)
    hub.path(Path.line([[54, y + 3], [60, y - 3]]), { name: `row${i}-link`, stroke: T.hubGlyph, strokeWidth: 1.25 });
    hub.path(Path.line([[55.5, y - 3], [60, y - 3], [60, y + 1.5]]), { name: `row${i}-link-head`, stroke: T.hubGlyph, strokeWidth: 1.25 });
    const sw = hub.path(pillLine(-52, -52 + ROW_W[i], y, 6), { name: `row${i}-sweep`, stroke: T.accent, strokeWidth: 6, trim: { start: 0, end: 0 } });
    sweep(s, sw, SOURCES[i].arrive);
  });
  hub.body({ group: 'card' });
  // publish: the version chip lights up; the hub answers with a small bump (impact → allow kink)
  s.cycle(chip.strokeItem.color, [PUBLISH], 100, (lf) => flash(T.hubGlyph, T.accent, lf, 6, 30, 60));
  s.cycle(chipDot.fillItem.color, [PUBLISH], 100, (lf) => flash(T.hubGlyph, T.accent, lf, 6, 30, 60));
  s.cycle(hub.scale, [PUBLISH], 40, (lf) => { const k = lf < 10 ? easeFn(ease.outQuad)(lf / 10) : 1 - easeFn(ease.inOut)((lf - 10) / 30); return [100 + 1.5 * k, 100 + 1.5 * k]; }).allow('kink');

  // tools
  const tools = TOOLS.map((p) => {
    const L = s.layer(`tool-${p.id}`, { position: p.c });
    L.rect({ name: 'shadow', w: DST.w, h: DST.h, r: DST.r, at: [0, 2], fill: T.shadow, fillOpacity: T.shadowOpacity });
    L.rect({ name: 'card', w: DST.w, h: DST.h, r: DST.r, fill: T.card, stroke: T.cardStroke, strokeWidth: 1 });
    L.rect({ name: 'title', w: 40, h: 4, r: 2, at: [-42, -34], fill: T.glyph });
    const status = L.circle({ name: 'status', r: 3, at: [59, -34], fill: T.bar });
    s.cycle(status.fillItem.color, [p.arrive], 120, (lf) => flash(T.bar, T.accent, lf, 6, 50, 60));
    L.body({ group: 'card' });
    p.layer = L;
    return L;
  });

  // Chart: comparison bars, one highlighted. On contact each bar is re-checked (staggered sweeps).
  {
    const L = TOOLS[0].layer, widths = [96, 80, 112, 88];
    widths.forEach((w, i) => {
      const y = -10 + 13 * i;
      L.rect({ name: `bar${i}`, x: -62, y: y - 3, w, h: 6, r: 3, fill: i === 2 ? T.ink : T.bar });
      const sw = L.path(pillLine(-62, -62 + w, y, 6), { name: `bar${i}-sweep`, stroke: T.accent, strokeWidth: 6, trim: { start: 0, end: 0 } });
      sweep(s, sw, TOOLS[0].arrive + 8 * i); // a scan down the list
    });
  }

  // Chat: a message bubble; on contact, a reply slides up into the card (clipped by it)
  let bubble;
  {
    const p = TOOLS[1], L = p.layer;
    L.rect({ name: 'message', w: 68, h: 18, r: 9, at: [-28, -12], fill: T.bar });
    L.rect({ name: 'message-line', w: 36, h: 3, r: 1.5, at: [-34, -12], fill: T.glyph });
    const local = [20, 20], hidden = 50;
    const matte = s.layer('chat-matte', { position: p.c });
    matte.rect({ w: DST.w - 2, h: DST.h - 2, r: DST.r - 1, fill: '#000000' });
    bubble = s.layer('chat-reply', { position: [p.c[0] + local[0], p.c[1] + local[1] + hidden] });
    bubble.rect({ name: 'bubble', w: 84, h: 22, r: 11, fill: T.accent, fillOpacity: T.accentSoft, stroke: T.accent, strokeWidth: 1.25 });
    bubble.rect({ name: 'line', w: 44, h: 4, r: 2, at: [-10, 0], fill: T.accent });
    bubble.matteWith(matte, 'alpha');
    const enter = 26, exitLen = 20, life = EXIT - p.arrive + exitLen;
    s.cycle(bubble.position, [p.arrive], life, (lf) => {
      const k = lf < enter ? easeFn(ease.outSoft)(lf / enter) : 1 - easeFn(ease.in)(clamp((lf - (life - exitLen)) / exitLen));
      return [p.c[0] + local[0], p.c[1] + local[1] + hidden * (1 - k)];
    }).allow('kink'); // exits at speed below the card edge, where the matte already hides it
  }

  // Gauge: a ring draws on contact; its bars are re-checked; the ring undraws before the next cycle
  {
    const p = TOOLS[2], L = p.layer, rc = [-38, 8], r = 20;
    L.circle({ name: 'track', r, at: rc, stroke: T.bar, strokeWidth: 4 });
    const arc = L.path(Path.circle(rc, r), { name: 'ring', stroke: T.accent, strokeWidth: 4, trim: { start: 0, end: 0 } });
    const draw = 44, undraw = 26, life = EXIT - p.arrive + undraw;
    s.cycle(arc.trim.end, [p.arrive], life, (lf) => 93 * easeFn(ease.out)(clamp(lf / draw)), { tol: 0.3 });
    s.cycle(arc.trim.start, [p.arrive], life, (lf) => 93 * easeFn(ease.inOut)(clamp((lf - (life - undraw)) / undraw)), { tol: 0.3 });
    [60, 44, 52].forEach((w, i) => {
      const y = -6 + 13 * i;
      L.rect({ name: `metric${i}`, x: -6, y: y - 3, w, h: 6, r: 3, fill: T.bar });
      const sw = L.path(pillLine(-6, -6 + w, y, 6), { name: `metric${i}-sweep`, stroke: T.accent, strokeWidth: 6, trim: { start: 0, end: 0 } });
      sweep(s, sw, p.arrive + 10 + 6 * i);
    });
  }

  // ── 5. Analysis rules ──
  s.occluders([...sources, hub, ...tools]);
  s.noOverlap([...snippets, ...signals, ...sources, hub, ...tools], {
    clearance: 3,
    ignore: [
      ...SOURCES.flatMap((x) => [[x.snippet, x.layer], [x.snippet, hub]]),
      ...TOOLS.flatMap((p) => [[p.signal, hub], [p.signal, p.layer]]),
    ],
  });
  s.noOverlap(inRoutes, { clearance: 10, name: 'inbound spacing' });
  s.noOverlap(outRoutes, { clearance: 10, name: 'outbound spacing' });
  s.noOverlap([...inRoutes, ...outRoutes, ...sources, hub, ...tools], {
    clearance: 6, name: 'routes vs cards',
    ignore: [
      ...inRoutes.flatMap((r, k) => [[r, SOURCES[k].layer], [r, hub], ...inRoutes.map((o) => [r, o]), ...outRoutes.map((o) => [r, o])]),
      ...outRoutes.flatMap((r, j) => [[r, hub], [r, TOOLS[j].layer], ...outRoutes.map((o) => [r, o])]),
    ],
  });
  s.keepInside([...sources, hub, ...tools], { padding: 24 });
  s.meta = { concept: 'One source of truth, many uses', theme };
  return s;
}

for (const theme of ['light', 'dark']) {
  const s = build(theme);
  const stats = s.save(path.join(OUT, `${theme}.json`));
  console.log(`${theme}: ${(stats.bytes / 1024).toFixed(1)}KB · ${stats.layers} layers · ${stats.keyframes} keyframes`);
  if (theme === 'light') s.analyze().print();
}
console.log({ PUBLISH, inbound: SOURCES.map((x) => [x.k, x.start, x.arrive]), outbound: TOOLS.map((p) => [p.id, p.start, p.arrive]) });
