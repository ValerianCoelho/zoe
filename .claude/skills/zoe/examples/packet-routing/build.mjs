// Example: "Requests from many sources are routed into one core."
// Packets slide out from under satellite nodes, travel orthogonal routes with filleted corners,
// and slide under the hub, which answers each arrival with a bump, a pulse ring and a lit cell.
//
//   node build.mjs <outDir>
//
// Read this as a reference for HOW a scene is authored with the kit:
//  1. tokens first (palette per theme, geometry constants on a grid)
//  2. layout computed, never eyeballed (ports, routes, gaps)
//  3. timing derived from distance (constant cruise speed) and a beat grid (even arrivals)
//  4. one source of truth per moving thing (progress(n, lf)) so packet, trail, flash, bump stay in sync
//  5. analysis rules declared (no overlaps, clearances, occluders, safe area) and the report printed

import path from 'node:path';
import { Scene, Path, V, ease, easeFn, clamp, mix } from '../../scripts/lottie-kit.mjs';

const OUT = process.argv[2] || path.join(import.meta.dirname, 'out');

// ── 1. Tokens ────────────────────────────────────────────────────────────────
const THEMES = {
  light: {
    dot: '#d6d3cd', route: '#e4e1db', nodeFill: '#ffffff', nodeStroke: '#e2dfd9', glyph: '#bcb7ae',
    shadow: '#1c1917', shadowOpacity: 6, hubFill: '#1c1917', hubCell: '#44403c', accent: '#ff5a1f',
  },
  dark: {
    dot: '#2b2a28', route: '#272624', nodeFill: '#171615', nodeStroke: '#2d2c2a', glyph: '#5a5650',
    shadow: '#000000', shadowOpacity: 35, hubFill: '#f4f3f1', hubCell: '#d4d0c8', accent: '#ff6a33',
  },
};

const W = 720, H = 440, FPS = 60, LOOP = 6; // seconds
const G = 20;                                // layout grid (all anchors snap to it)
const NODE = 36, NODE_R = 10;
const HUB = 64, HUB_R = 18;
const ROUTE_W = 1.5, PACKET_R = 3.5, HALO_R = 7.5, TRAIL_LAG = 14, CORNER = 14;
const SPEED = 3.2;                           // px/frame cruise (≈190px/s): readable, not sluggish

const hubC = [W / 2, H / 2];

// ── 2. Layout ────────────────────────────────────────────────────────────────
// Routes run centre→centre; the first/last stretch is hidden under the boxes, so packets
// genuinely emerge from and disappear into them. Ports offset ±14 keep parallel routes 28px apart.
const NODES = [
  { id: 'n1', c: [100, 100], via: [[220, 100], [220, 206]], port: [hubC[0] - HUB / 2, 206] },
  { id: 'n2', c: [100, 340], via: [[240, 340], [240, 234]], port: [hubC[0] - HUB / 2, 234] },
  { id: 'n3', c: [240, 60], via: [[360, 60]], port: [360, hubC[1] - HUB / 2] },
  { id: 'n4', c: [620, 120], via: [[500, 120], [500, 220]], port: [hubC[0] + HUB / 2, 220] },
  { id: 'n5', c: [540, 360], via: [[360, 360]], port: [360, hubC[1] + HUB / 2] },
];
// continue 20px past the port along the entry direction, so the packet fully disappears under the hub
const hubEnd = (from, port) => V.add(port, V.mul(V.norm(V.sub(port, from)), 20));
for (const n of NODES) {
  n.points = [n.c, ...n.via, n.port, hubEnd(n.via[n.via.length - 1], n.port)];
  n.route = Path.rounded(n.points, CORNER);
  n.len = n.route.length();
}

// ── 3. Timing ────────────────────────────────────────────────────────────────
const F = LOOP * FPS, BEAT = F / NODES.length;
const ORDER = ['n1', 'n4', 'n2', 'n5', 'n3']; // alternate sides so the eye travels around the hub
const travelEase = easeFn(ease.inOut);
for (const n of NODES) {
  n.travel = Math.round((n.len / SPEED) * 1.3); // ×1.3: an in-out ease peaks above its average speed
  // local frame at which the packet's halo clears the node edge / touches the hub edge
  const atDist = (d) => { for (let lf = 0; lf <= n.travel; lf += 0.25) if (travelEase(lf / n.travel) * n.len >= d) return lf; return n.travel; };
  n.emitLf = atDist(NODE / 2 + HALO_R);
  n.hitLf = atDist(n.len - 20 - HALO_R);
  const arrive = 30 + BEAT * ORDER.indexOf(n.id);
  n.start = Math.round(arrive - n.hitLf);
  n.arrive = Math.round(n.start + n.hitLf);
}
const progress = (n, lf) => travelEase(clamp(lf / n.travel));

// ── 4. Build ─────────────────────────────────────────────────────────────────
function build(theme) {
  const T = THEMES[theme];
  const s = new Scene({ name: 'packet-routing', width: W, height: H, fps: FPS, duration: LOOP, loop: true });

  // Backdrop: dot grid = dashed rows with round caps + radial alpha gradient (1 group, ~2KB).
  const grid = s.layer('dot-grid').group('rows');
  for (let y = G; y < H; y += G) grid.addPath(Path.line([[G, y], [W - G, y]]));
  grid.addGradient({
    stroke: { width: 2, cap: 'round', dash: [0.001, G] }, type: 'radial', from: hubC, to: [hubC[0] + W * 0.5, hubC[1]],
    stops: [[0, T.dot, 1], [0.5, T.dot, 0.85], [1, T.dot, 0]],
  });

  const routes = s.layer('routes');
  const routeShapes = NODES.map((n) => routes.path(n.route, { name: `route-${n.id}`, stroke: T.route, strokeWidth: ROUTE_W }));

  // Trails + packets live BELOW the boxes so they can slide under them.
  const packets = NODES.map((n) => {
    const trail = s.layer(`trail-${n.id}`).path(n.route, { name: 'trail', stroke: T.accent, strokeWidth: ROUTE_W + 0.5, trim: { start: 0, end: 0 } });
    // head = packet; tail = the same motion delayed by TRAIL_LAG frames, so the comet stretches
    // when fast, shortens when slow and drains completely into the hub (no stub left behind)
    s.cycle(trail.trim.end, [n.start], n.travel, (lf) => progress(n, lf) * 100);
    s.cycle(trail.trim.start, [n.start], n.travel + TRAIL_LAG, (lf) => progress(n, lf - TRAIL_LAG) * 100);

    const P = s.layer(`packet-${n.id}`, { position: n.c });
    P.circle({ name: 'halo', r: HALO_R, fill: T.accent, fillOpacity: 16 });
    P.circle({ name: 'core', r: PACKET_R, fill: T.accent });
    s.cycle(P.position, [n.start], n.travel, (lf) => n.route.pointAt(progress(n, lf)), { tol: 0.08 });
    P.body({ shape: 'circle', r: HALO_R, name: `packet-${n.id}` });
    n.packet = P;
    return P;
  });

  // Satellite nodes
  const nodeLayers = NODES.map((n) => {
    const L = s.layer(`node-${n.id}`, { position: n.c });
    L.rect({ name: 'shadow', w: NODE, h: NODE, r: NODE_R, at: [0, 2], fill: T.shadow, fillOpacity: T.shadowOpacity });
    L.rect({ name: 'box', w: NODE, h: NODE, r: NODE_R, fill: T.nodeFill, stroke: T.nodeStroke, strokeWidth: 1 });
    [[0, -5, 14], [-2, 0, 10], [0, 5, 14]].forEach(([x, y, w], i) => L.rect({ name: `glyph${i}`, w, h: 2, r: 1, at: [x, y], fill: T.glyph }));
    // emit: the outline answers the moment the packet clears the edge
    const ring = L.rect({ name: 'emit', w: NODE + 8, h: NODE + 8, r: NODE_R + 4, stroke: T.accent, strokeWidth: 1.25, opacity: 0 });
    s.cycle(ring.opacity, [n.start + n.emitLf - 6], 40, (lf) => (lf < 6 ? 75 * easeFn(ease.outQuad)(lf / 6) : 75 * (1 - easeFn(ease.inOut)((lf - 6) / 34))));
    L.body({ group: 'box' });
    n.layer = L;
    return L;
  });

  // Hub
  const hub = s.layer('hub', { position: hubC });
  hub.rect({ name: 'shadow', w: HUB, h: HUB, r: HUB_R, at: [0, 3], fill: T.shadow, fillOpacity: T.shadowOpacity * 1.5 });
  hub.rect({ name: 'box', w: HUB, h: HUB, r: HUB_R, fill: T.hubFill });
  const cells = [...Array(9).keys()].map((i) => hub.rect({ name: `cell${i}`, w: 6, h: 6, r: 1.5, at: [((i % 3) - 1) * 10, (Math.floor(i / 3) - 1) * 10], fill: T.hubCell }));
  hub.body({ group: 'box' });
  // impact response starts at speed on purpose → allow('kink') documents the intent
  s.cycle(hub.scale, NODES.map((n) => n.arrive), 32, (lf) => { const k = lf < 6 ? easeFn(ease.out)(lf / 6) : 1 - easeFn(ease.inOut)((lf - 6) / 26); return [100 + 4 * k, 100 + 4 * k]; }).allow('kink');

  const pulse = s.layer('pulse', { position: hubC, opacity: 0 });
  pulse.rect({ name: 'ring', w: HUB, h: HUB, r: HUB_R, stroke: T.accent, strokeWidth: 1.5 });
  const arrivals = NODES.map((n) => n.arrive);
  s.cycle(pulse.scale, arrivals, 48, (lf) => { const k = easeFn(ease.out)(lf / 48); return [100 + 50 * k, 100 + 50 * k]; });
  s.cycle(pulse.opacity, arrivals, 48, (lf) => (lf < 4 ? 50 * easeFn(ease.outQuad)(lf / 4) : 50 * (1 - easeFn(ease.outSoft)((lf - 4) / 44))));

  // each arrival lights one cell: quick ease up, long settle back
  const LIT = [4, 0, 8, 2, 6];
  NODES.forEach((n) => {
    const cell = cells[LIT[ORDER.indexOf(n.id)]];
    s.cycle(cell.fillItem.color, [n.arrive], 90, (lf) => mix(T.hubCell, T.accent, lf < 5 ? easeFn(ease.outQuad)(lf / 5) : 1 - easeFn(ease.inOut)(clamp((lf - 20) / 70))));
  });

  // ── 5. Analysis rules ──
  s.occluders([...nodeLayers, hub]);
  s.noOverlap([...packets, ...nodeLayers, hub], { clearance: 4, ignore: NODES.flatMap((n) => [[n.packet, n.layer], [n.packet, hub]]) });
  s.noOverlap(routeShapes, { clearance: 12, name: 'route spacing', ignore: [[routeShapes[0], routeShapes[1]]] }); // n1/n2 converge only under the hub
  s.keepInside([...nodeLayers, hub], { padding: 24 });
  s.meta = { concept: 'Requests from many sources are routed into one core', theme };
  return s;
}

for (const theme of ['light', 'dark']) {
  const s = build(theme);
  const stats = s.save(path.join(OUT, `${theme}.json`));
  console.log(`${theme}: ${(stats.bytes / 1024).toFixed(1)}KB · ${stats.layers} layers · ${stats.keyframes} keyframes`);
  if (theme === 'light') s.analyze().print();
}
