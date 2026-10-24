// lottie-kit — build Lottie animations from code, with computed motion and analysis.
//
// The kit is a tiny scene graph (Scene → Layer → Group → shapes/styles) whose every
// property is a Prop that can be keyframed by hand, tweened with an easing, or *baked*
// from any math function (physics, arc-length path following, springs…). Baked motion
// is fitted with cubic Hermite segments that Lottie reproduces exactly, so it stays
// smooth (C1-continuous) and compact.
//
// The same evaluator that exports the JSON also powers scene.analyze(): collisions,
// clearances, velocity kinks, pops, loop seams, out-of-bounds and a choreography timeline.
//
// See ../references/kit-api.md for the full API guide.

import fs from 'node:fs';
import path from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Numbers & vectors
// ─────────────────────────────────────────────────────────────────────────────

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a0, a1, b0, b1) => lerp(b0, b1, invLerp(a0, a1, v));
export const smoothstep = (a, b, v) => { const t = clamp(invLerp(a, b, v)); return t * t * (3 - 2 * t); };
export const deg = (rad) => (rad * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, s) => [a[0] * s, a[1] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1],
  cross: (a, b) => a[0] * b[1] - a[1] * b[0],
  len: (a) => Math.hypot(a[0], a[1]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
  norm: (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; },
  lerp: (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)],
  perp: (a) => [-a[1], a[0]],
  angle: (a) => Math.atan2(a[1], a[0]),
  rotate: (a, r, o = [0, 0]) => {
    const c = Math.cos(r), s = Math.sin(r), x = a[0] - o[0], y = a[1] - o[1];
    return [o[0] + x * c - y * s, o[1] + x * s + y * c];
  },
  polar: (r, angleRad, o = [0, 0]) => [o[0] + r * Math.cos(angleRad), o[1] + r * Math.sin(angleRad)],
};

// Deterministic PRNG so builds are reproducible (never use Math.random in a scene).
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  next.range = (a, b) => a + (b - a) * next();
  next.int = (a, b) => Math.floor(a + (b - a + 1) * next());
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.jitter = (v, amt) => v + (next() * 2 - 1) * amt;
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// Color (sRGB in, OKLab for mixing)
// ─────────────────────────────────────────────────────────────────────────────

export function hex(input) {
  if (Array.isArray(input)) return input.length >= 4 ? input.slice(0, 4) : [...input, 1];
  let h = String(input).trim().replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) throw new Error(`Bad color: ${input}`);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
}
export const toHex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('');

const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function toOklab([r, g, b]) {
  r = srgbToLin(r); g = srgbToLin(g); b = srgbToLin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    clamp(linToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp(linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp(linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}
/** Perceptual mix of two colors (OKLab). Returns hex string. */
export function mix(a, b, t) {
  const A = toOklab(hex(a)), B = toOklab(hex(b));
  return toHex(fromOklab([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]));
}
/** WCAG relative-luminance contrast ratio. */
export function contrast(a, b) {
  const lum = (c) => { const [r, g, bl] = hex(c).map(srgbToLin); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ─────────────────────────────────────────────────────────────────────────────
// Easing
// ─────────────────────────────────────────────────────────────────────────────

export class CubicBezier {
  constructor(x1, y1, x2, y2, name = null) {
    if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) throw new Error('Bezier x handles must be in [0,1]');
    Object.assign(this, { x1, y1, x2, y2, name });
    this.cx = 3 * x1; this.bx = 3 * (x2 - x1) - this.cx; this.ax = 1 - this.cx - this.bx;
    this.cy = 3 * y1; this.by = 3 * (y2 - y1) - this.cy; this.ay = 1 - this.cy - this.by;
  }
  _x(t) { return ((this.ax * t + this.bx) * t + this.cx) * t; }
  _y(t) { return ((this.ay * t + this.by) * t + this.cy) * t; }
  _dx(t) { return (3 * this.ax * t + 2 * this.bx) * t + this.cx; }
  _solve(x) {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = this._x(t) - x;
      if (Math.abs(e) < 1e-7) return t;
      const d = this._dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 40; i++) { const v = this._x(t); if (Math.abs(v - x) < 1e-7) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return t;
  }
  at(p) {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    if (this.x1 === this.y1 && this.x2 === this.y2) return p;
    return this._y(this._solve(p));
  }
  /** Normalised slope (dy/dx) at the start and end of the curve. */
  get startSlope() { return this.x1 === 0 ? (this.y1 === 0 ? (this.x2 === 0 ? Infinity : this.y2 / this.x2) : Infinity) : this.y1 / this.x1; }
  get endSlope() { return this.x2 === 1 ? (this.y2 === 1 ? (this.x1 === 1 ? Infinity : (1 - this.y1) / (1 - this.x1)) : Infinity) : (1 - this.y2) / (1 - this.x2); }
  toString() { return this.name || `bezier(${this.x1},${this.y1},${this.x2},${this.y2})`; }
}

const bz = (x1, y1, x2, y2, n) => new CubicBezier(x1, y1, x2, y2, n);
export const HOLD = Object.freeze({ hold: true, toString: () => 'hold' });

/**
 * Curated easing set. Pick by intent, not by habit:
 *  out        — arrivals/entrances: fast start, long soft settle (expo-out family)
 *  outSoft    — gentler arrival for small/light elements
 *  inOut      — point-to-point moves between two rests
 *  smooth     — ambient/looping drifts (sine in-out), low acceleration
 *  in         — departures/exits: accelerate away (pair with out on the next element)
 *  anticipate — tiny pull-back before a move (use rarely, on the hero only)
 *  overshoot  — springy arrival (use rarely; prefer prop.spring for real physics)
 *  cubic      — smoothstep; a gentle in-out that bakes to a single keyframe segment (use for many small repeated tweens)
 *  linear     — ONLY for constant continuous motion (rotation, marching dashes, conveyor loops)
 */
export const ease = {
  linear: bz(0, 0, 1, 1, 'linear'),
  out: bz(0.16, 1, 0.3, 1, 'out'),
  outSoft: bz(0.25, 1, 0.5, 1, 'outSoft'),
  outQuad: bz(0.5, 1, 0.89, 1, 'outQuad'),
  inOut: bz(0.65, 0, 0.35, 1, 'inOut'),
  inOutStrong: bz(0.83, 0, 0.17, 1, 'inOutStrong'),
  smooth: bz(0.45, 0, 0.55, 1, 'smooth'),
  // smoothstep (3p²−2p³): an exact cubic Hermite, so anything baked with it costs one segment
  cubic: bz(1 / 3, 0, 2 / 3, 1, 'cubic'),
  in: bz(0.32, 0, 0.67, 0, 'in'),
  inStrong: bz(0.64, 0, 0.78, 0, 'inStrong'),
  standard: bz(0.2, 0, 0, 1, 'standard'),
  anticipate: bz(0.36, 0, 0.66, -0.56, 'anticipate'),
  overshoot: bz(0.34, 1.56, 0.64, 1, 'overshoot'),
  hold: HOLD,
  bezier: (x1, y1, x2, y2) => bz(x1, y1, x2, y2),
};

/** Turn any easing (CubicBezier or function) into a plain p→value function. */
export const easeFn = (e) => (typeof e === 'function' ? e : e === HOLD ? (p) => (p >= 1 ? 1 : 0) : (p) => e.at(p));

/**
 * Analytic damped spring. Returns { at(tSeconds) → progress (0→1, may overshoot), duration (settle seconds) }.
 * stiffness/damping/mass follow the usual (React Spring / Framer) conventions.
 */
export function spring({ stiffness = 170, damping = 26, mass = 1, velocity = 0, restDelta = 0.001 } = {}) {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const v0 = -velocity; // displacement x(t) = 1 - progress; x(0)=1
  let x;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    x = (t) => Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0 - v0) / wd) * Math.sin(wd * t));
  } else if (zeta === 1) {
    x = (t) => Math.exp(-w0 * t) * (1 + (w0 - v0) * t);
  } else {
    const r1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1)), r2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
    const c2 = (-v0 - r1) / (r2 - r1), c1 = 1 - c2;
    x = (t) => c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
  }
  let duration = 0;
  for (let t = 0; t < 10; t += 1 / 240) {
    const settled = [0, 0.05, 0.1, 0.2].every((dt) => Math.abs(x(t + dt)) < restDelta);
    if (settled) { duration = t; break; }
    duration = t;
  }
  return { at: (t) => (t >= duration ? 1 : 1 - x(t)), duration, zeta };
}

/**
 * Stagger offsets for n items. Non-uniform staggers read as more natural than equal spacing.
 *  each: base gap in frames · from: 'start'|'end'|'center'|'edges'|index
 *  ease: distributes the total spread (e.g. ease.out → tight at first then relaxing)
 */
export function stagger(n, { each = 4, from = 'start', ease: e = null } = {}) {
  const idx = [...Array(n).keys()];
  const origin = from === 'start' ? 0 : from === 'end' ? n - 1 : from === 'center' ? (n - 1) / 2 : isNum(from) ? from : null;
  const d = idx.map((i) => (from === 'edges' ? Math.min(i, n - 1 - i) : Math.abs(i - origin)));
  const max = Math.max(...d, 1);
  return d.map((di) => Math.round(e ? easeFn(e)(di / max) * max * each : di * each));
}

/**
 * Perceptually consistent duration (frames) for a move of `distance` px.
 * Short hops feel fast, long travels don't feel sluggish (√-scaling, like real objects).
 */
export function durationFor(distance, { fps = 60, base = 0.28, per100 = 0.1, min = 0.18, max = 1.4 } = {}) {
  const s = clamp(base + per100 * Math.sqrt(Math.max(0, distance) / 100) * 1.6, min, max);
  return Math.round(s * fps);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bezier paths
// ─────────────────────────────────────────────────────────────────────────────

const K = 0.5522847498; // circle kappa

function cubicPt(p0, c0, c1, p1, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * c0[0] + 3 * u * t * t * c1[0] + t * t * t * p1[0],
    u * u * u * p0[1] + 3 * u * u * t * c0[1] + 3 * u * t * t * c1[1] + t * t * t * p1[1],
  ];
}
function cubicD(p0, c0, c1, p1, t) {
  const u = 1 - t;
  return [
    3 * u * u * (c0[0] - p0[0]) + 6 * u * t * (c1[0] - c0[0]) + 3 * t * t * (p1[0] - c1[0]),
    3 * u * u * (c0[1] - p0[1]) + 6 * u * t * (c1[1] - c0[1]) + 3 * t * t * (p1[1] - c1[1]),
  ];
}

/**
 * A bezier path with ABSOLUTE control points. Vertex = { p, in, out, corner }.
 * `corner: true` marks an intentional sharp vertex (the smoothness check skips it).
 */
export class BezierPath {
  constructor(vertices = [], closed = false) {
    this.vertices = vertices.map((v) => ({ p: [...v.p], in: [...(v.in || v.p)], out: [...(v.out || v.p)], corner: !!v.corner }));
    this.closed = closed;
    this._lut = null;
  }
  clone() { return new BezierPath(this.vertices, this.closed); }
  get segments() {
    const vs = this.vertices, n = vs.length, out = [];
    for (let i = 0; i < (this.closed ? n : n - 1); i++) {
      const a = vs[i], b = vs[(i + 1) % n];
      out.push([a.p, a.out, b.in, b.p]);
    }
    return out;
  }
  _buildLut(steps = 48) {
    const pts = [], lens = [], segIdx = [], segT = [];
    let L = 0, prev = null;
    this.segments.forEach((s, si) => {
      for (let k = si === 0 ? 0 : 1; k <= steps; k++) {
        const t = k / steps, p = cubicPt(...s, t);
        if (prev) L += V.dist(prev, p);
        pts.push(p); lens.push(L); segIdx.push(si); segT.push(t); prev = p;
      }
    });
    this._lut = { pts, lens, segIdx, segT, L };
    return this._lut;
  }
  get lut() { return this._lut || this._buildLut(); }
  length() { return this.lut.L; }
  _locate(u) {
    const { lens, L, segIdx, segT } = this.lut;
    const d = clamp(u) * L;
    let lo = 0, hi = lens.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (lens[m] < d) lo = m; else hi = m; }
    const f = lens[hi] === lens[lo] ? 0 : (d - lens[lo]) / (lens[hi] - lens[lo]);
    let si = segIdx[hi], t0 = segIdx[lo] === si ? segT[lo] : 0;
    return { si, t: lerp(t0, segT[hi], f) };
  }
  /** Point at normalised ARC LENGTH u∈[0,1] (constant speed parametrisation). */
  pointAt(u) { const { si, t } = this._locate(u); return cubicPt(...this.segments[si], t); }
  /** Unit tangent at arc length u. */
  tangentAt(u) {
    const { si, t } = this._locate(u), s = this.segments[si];
    let d = cubicD(...s, t);
    if (V.len(d) < 1e-6) d = V.sub(cubicPt(...s, Math.min(1, t + 0.01)), cubicPt(...s, Math.max(0, t - 0.01)));
    return V.norm(d);
  }
  angleAt(u) { return deg(V.angle(this.tangentAt(u))); }
  sample(n = 64) { return [...Array(n + 1).keys()].map((i) => this.pointAt(i / n)); }
  bounds() {
    const ps = this.lut.pts; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of ps) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  map(fn) { return new BezierPath(this.vertices.map((v) => ({ p: fn(v.p), in: fn(v.in), out: fn(v.out), corner: v.corner })), this.closed); }
  translate(dx, dy) { return this.map((p) => [p[0] + dx, p[1] + dy]); }
  scale(sx, sy = sx, o = [0, 0]) { return this.map((p) => [o[0] + (p[0] - o[0]) * sx, o[1] + (p[1] - o[1]) * sy]); }
  rotate(degrees, o = [0, 0]) { return this.map((p) => V.rotate(p, rad(degrees), o)); }
  reverse() {
    const vs = [...this.vertices].reverse().map((v) => ({ p: v.p, in: v.out, out: v.in, corner: v.corner }));
    return new BezierPath(vs, this.closed);
  }
  /** Sub-path between arc-length fractions (approximate, resampled smooth). */
  slice(u0, u1, n = 24) { return Path.smooth([...Array(n + 1).keys()].map((i) => this.pointAt(lerp(u0, u1, i / n))), { tension: 1 }); }
  /** Vertices whose in/out handles are not collinear (visible kinks), excluding declared corners. */
  kinks(maxDeg = 3) {
    const res = [];
    this.vertices.forEach((v, i) => {
      if (v.corner) return;
      if (!this.closed && (i === 0 || i === this.vertices.length - 1)) return;
      const a = V.sub(v.p, v.in), b = V.sub(v.out, v.p);
      if (V.len(a) < 1e-6 || V.len(b) < 1e-6) { res.push({ index: i, at: v.p, angle: null, reason: 'zero-length handle on smooth vertex (reads as a sharp joint)' }); return; }
      const ang = Math.abs(deg(Math.atan2(V.cross(a, b), V.dot(a, b))));
      if (ang > maxDeg) res.push({ index: i, at: v.p, angle: +ang.toFixed(1), reason: 'handles not collinear' });
    });
    return res;
  }
  /** Lottie shape value: tangents are RELATIVE to their vertex. */
  toLottie(precision = 3) {
    const r = (n) => +n.toFixed(precision);
    return {
      i: this.vertices.map((v) => [r(v.in[0] - v.p[0]), r(v.in[1] - v.p[1])]),
      o: this.vertices.map((v) => [r(v.out[0] - v.p[0]), r(v.out[1] - v.p[1])]),
      v: this.vertices.map((v) => [r(v.p[0]), r(v.p[1])]),
      c: this.closed,
    };
  }
}

/** Path constructors. All coordinates absolute (layer space). */
export const Path = {
  /** Straight segments (every vertex is a corner). */
  line(points, closed = false) {
    return new BezierPath(points.map((p) => ({ p, corner: true })), closed);
  },
  /**
   * Smooth curve THROUGH points (centripetal-ish Catmull-Rom → cubic bezier).
   * tension: 1 = classic Catmull-Rom; lower = tighter; higher = looser/rounder.
   * Use this for anything that must look organic/bendy — never polylines.
   */
  smooth(points, { closed = false, tension = 1 } = {}) {
    const n = points.length;
    const get = (i) => (closed ? points[(i + n) % n] : points[clamp(i, 0, n - 1)]);
    const vs = points.map((p, i) => {
      const prev = get(i - 1), next = get(i + 1);
      const d1 = V.dist(prev, p) || 1, d2 = V.dist(p, next) || 1;
      const tan = V.norm(V.sub(next, prev));
      const isEnd = !closed && (i === 0 || i === n - 1);
      const inLen = isEnd && i === 0 ? 0 : (d1 / 3) * tension;
      const outLen = isEnd && i === n - 1 ? 0 : (d2 / 3) * tension;
      return { p, in: V.sub(p, V.mul(tan, inLen)), out: V.add(p, V.mul(tan, outLen)) };
    });
    if (!closed && n >= 2) { // natural end tangents pointing at the neighbour handle
      vs[0].out = V.lerp(points[0], vs[1].in, 0.5);
      vs[n - 1].in = V.lerp(points[n - 1], vs[n - 2].out, 0.5);
    }
    return new BezierPath(vs, closed);
  },
  /** Polyline with circular-arc filleted corners — clean orthogonal routing (circuit/grid lines). */
  rounded(points, radius = 12, closed = false) {
    const n = points.length, vs = [];
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const isEnd = !closed && (i === 0 || i === n - 1);
      if (isEnd) { vs.push({ p, corner: true }); continue; }
      const a = points[(i - 1 + n) % n], b = points[(i + 1) % n];
      const da = V.norm(V.sub(a, p)), db = V.norm(V.sub(b, p));
      const theta = Math.acos(clamp(V.dot(da, db), -1, 1));
      if (theta > Math.PI - 1e-3) { vs.push({ p, corner: true }); continue; } // collinear
      const r = Math.min(radius, (V.dist(a, p) / 2) * Math.tan(theta / 2), (V.dist(b, p) / 2) * Math.tan(theta / 2));
      const t = r / Math.tan(theta / 2);
      const p1 = V.add(p, V.mul(da, t)), p2 = V.add(p, V.mul(db, t));
      const h = (4 / 3) * Math.tan((Math.PI - theta) / 4) * r;
      vs.push({ p: p1, in: p1, out: V.add(p1, V.mul(da, -h)), corner: true });
      vs.push({ p: p2, in: V.add(p2, V.mul(db, -h)), out: p2, corner: true });
    }
    // fillet joints are tangent-continuous by construction; they are flagged corner so the kink check skips them
    return new BezierPath(vs, closed);
  },
  circle(c, r) {
    const k = r * K, [x, y] = c;
    return new BezierPath([
      { p: [x, y - r], in: [x - k, y - r], out: [x + k, y - r] },
      { p: [x + r, y], in: [x + r, y - k], out: [x + r, y + k] },
      { p: [x, y + r], in: [x + k, y + r], out: [x - k, y + r] },
      { p: [x - r, y], in: [x - r, y + k], out: [x - r, y - k] },
    ], true);
  },
  /** Circular arc from a0 to a1 degrees (0° = +x, clockwise on screen). Exact cubic approximation per ≤90°. */
  arc(c, r, a0, a1) {
    const segs = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90)), step = (a1 - a0) / segs;
    const h = (4 / 3) * Math.tan(rad(step) / 4) * r;
    const vs = [];
    for (let i = 0; i <= segs; i++) {
      const a = rad(a0 + step * i), p = V.polar(r, a, c), t = [-Math.sin(a), Math.cos(a)];
      vs.push({ p, in: V.sub(p, V.mul(t, h)), out: V.add(p, V.mul(t, h)) });
    }
    return new BezierPath(vs, false);
  },
  rect(x, y, w, h, r = 0) {
    if (!r) return Path.line([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true);
    return Path.rounded([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], r, true);
  },
  /** Hanging cable between two points (sag in px, downward positive). Smooth, never stick-like. */
  cable(a, b, sag = 20) {
    const mid = V.add(V.lerp(a, b, 0.5), [0, sag]);
    const c0 = V.add(V.lerp(a, b, 1 / 3), [0, sag * 1.333]), c1 = V.add(V.lerp(a, b, 2 / 3), [0, sag * 1.333]);
    return new BezierPath([{ p: a, out: c0 }, { p: b, in: c1 }], false);
  },
  /** S-curve connector between two ports, leaving/entering along an axis ('x' or 'y'). */
  connector(a, b, { axis = 'x', bend = 0.5 } = {}) {
    if (axis === 'x') { const dx = (b[0] - a[0]) * bend; return new BezierPath([{ p: a, out: [a[0] + dx, a[1]] }, { p: b, in: [b[0] - dx, b[1]] }]); }
    const dy = (b[1] - a[1]) * bend; return new BezierPath([{ p: a, out: [a[0], a[1] + dy] }, { p: b, in: [b[0], b[1] - dy] }]);
  },
  /** Parse SVG path data (M L H V C S Q T Z, absolute + relative). Arcs (A) are not supported. */
  svg(d) {
    const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
    const paths = []; let cur = null, i = 0, cmd = null, pos = [0, 0], start = [0, 0], lastCtrl = null, lastCmd = '';
    const num = () => parseFloat(toks[i++]);
    const push = (p, cin, cout) => { cur.vertices.push({ p, in: cin || p, out: cout || p }); };
    const setOut = (c) => { cur.vertices[cur.vertices.length - 1].out = c; };
    while (i < toks.length) {
      if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), o = rel ? pos : [0, 0];
      if (C === 'M') { cur = new BezierPath([], false); paths.push(cur); pos = [o[0] + num(), o[1] + num()]; start = pos; push(pos); cmd = rel ? 'l' : 'L'; }
      else if (C === 'L') { pos = [o[0] + num(), o[1] + num()]; push(pos); }
      else if (C === 'H') { pos = [(rel ? pos[0] : 0) + num(), pos[1]]; push(pos); }
      else if (C === 'V') { pos = [pos[0], (rel ? pos[1] : 0) + num()]; push(pos); }
      else if (C === 'C' || C === 'S') {
        let c0;
        if (C === 'C') c0 = [o[0] + num(), o[1] + num()];
        else c0 = lastCtrl && /[CS]/.test(lastCmd) ? V.sub(V.mul(pos, 2), lastCtrl) : pos;
        const c1 = [o[0] + num(), o[1] + num()], p = [o[0] + num(), o[1] + num()];
        setOut(c0); push(p, c1); pos = p; lastCtrl = c1;
      } else if (C === 'Q' || C === 'T') {
        let q;
        if (C === 'Q') q = [o[0] + num(), o[1] + num()];
        else q = lastCtrl && /[QT]/.test(lastCmd) ? V.sub(V.mul(pos, 2), lastCtrl) : pos;
        const p = [o[0] + num(), o[1] + num()];
        setOut(V.lerp(pos, q, 2 / 3)); push(p, V.lerp(p, q, 2 / 3)); pos = p; lastCtrl = q;
      } else if (C === 'Z') {
        cur.closed = true; pos = start;
        const vs = cur.vertices, l = vs[vs.length - 1];
        if (vs.length > 1 && V.dist(l.p, vs[0].p) < 1e-6) { vs[0].in = l.in; vs.pop(); }
      } else throw new Error(`Unsupported SVG command ${cmd}`);
      lastCmd = C;
    }
    paths.forEach((p) => p.vertices.forEach((v) => { if (V.dist(v.in, v.p) < 1e-9 || V.dist(v.out, v.p) < 1e-9) v.corner = true; }));
    return paths.length === 1 ? paths[0] : paths;
  },
};

/** Linear blend of two paths with identical vertex counts (for morph baking). */
export function lerpPath(a, b, t) {
  if (a.vertices.length !== b.vertices.length) throw new Error('lerpPath: vertex counts differ');
  return new BezierPath(a.vertices.map((v, i) => {
    const w = b.vertices[i];
    return { p: V.lerp(v.p, w.p, t), in: V.lerp(v.in, w.in, t), out: V.lerp(v.out, w.out, t), corner: v.corner && w.corner };
  }), a.closed);
}

// ─────────────────────────────────────────────────────────────────────────────
// Props (animatable values)
// ─────────────────────────────────────────────────────────────────────────────

const flat = (v, kind) => (kind === 'shape' ? null : Array.isArray(v) ? v : [v]);
const unflat = (arr, kind) => (kind === 'scalar' ? arr[0] : arr);
const clone = (v) => (v instanceof BezierPath ? v.clone() : Array.isArray(v) ? [...v] : v);

function shapeLerp(a, b, t) { return lerpPath(a, b, t); }

let PROP_ID = 0;
export class Prop {
  /** kind: 'scalar' | 'vec' | 'color' | 'shape' */
  constructor(value, kind, name = '') {
    this.kind = kind; this.name = name; this.id = ++PROP_ID;
    this.static = kind === 'color' ? hex(value).slice(0, 3) : clone(value);
    this.keys = []; // { t, v, ease } — ease applies to the segment LEAVING this key
  }
  get animated() { return this.keys.length > 0; }
  /** Suppress analysis issue types for this prop when the behaviour is intentional, e.g. allow('kink') for an impact response. */
  allow(...types) { this.allowed = new Set([...(this.allowed || []), ...types]); return this; }
  _norm(v) { return this.kind === 'color' ? hex(v).slice(0, 3) : clone(v); }
  set(v) { this.static = this._norm(v); this.keys = []; return this; }
  _insert(t, v, segEase) {
    if (!isNum(t)) throw new Error(`${this.name}: keyframe time must be a number`);
    const i = this.keys.findIndex((k) => Math.abs(k.t - t) < 1e-6);
    if (i >= 0) { this.keys[i].v = v; if (segEase !== undefined) this.keys[i].ease = segEase; return this.keys[i]; }
    const k = { t, v, ease: segEase ?? ease.inOut };
    this.keys.push(k); this.keys.sort((a, b) => a.t - b.t);
    return k;
  }
  /** Place a key (value) at frame t. */
  from(t, v) { this._insert(t, this._norm(v)); return this; }
  /**
   * Animate to `v` arriving at frame t, using easing `e` for the segment that ends here.
   * If there is no earlier key, the current static value is keyed at frame 0 first.
   */
  to(t, v, e = ease.inOut) {
    if (!this.keys.length || this.keys[0].t >= t) this._insert(Math.min(0, t), clone(this.static));
    const prev = [...this.keys].reverse().find((k) => k.t < t);
    if (prev) prev.ease = e;
    this._insert(t, this._norm(v), ease.inOut);
    return this;
  }
  /** Keep the current value until frame t (a rest). */
  hold(t) { const last = [...this.keys].reverse().find((k) => k.t < t); return this.to(t, last ? clone(last.v) : clone(this.static), ease.linear); }
  /** Jump (no interpolation) to v at frame t. */
  cut(t, v) {
    const prev = [...this.keys].reverse().find((k) => k.t < t);
    if (prev) prev.ease = HOLD; else this._insert(Math.min(0, t - 1), clone(this.static), HOLD);
    this._insert(t, this._norm(v), ease.inOut);
    return this;
  }
  tween(t0, t1, v0, v1, e = ease.inOut) { return this.from(t0, v0).to(t1, v1, e); }
  /** Physically based spring from v0 (at t0) to v1. Returns the frame at which it settles. */
  spring(t0, v0, v1, cfg = {}, fps = 60) {
    const s = spring(cfg), dur = Math.max(1, Math.ceil(s.duration * fps));
    const A = this._norm(v0), B = this._norm(v1);
    this.bake(t0, t0 + dur, (f) => this._lerpVal(A, B, s.at((f - t0) / fps)), { tol: 0.05 });
    return t0 + dur;
  }
  _lerpVal(a, b, t) {
    if (this.kind === 'shape') return shapeLerp(a, b, t);
    if (this.kind === 'scalar') return lerp(a, b, t);
    return a.map((x, i) => lerp(x, b[i], t));
  }
  /**
   * Replace keys in [t0,t1] with a curve fitted to fn(frame) (fn receives fractional frames).
   * Numeric props → cubic Hermite segments (C1-continuous, exact in Lottie) within `tol` units.
   * Shape props  → piecewise-linear keys within `tol` px per vertex.
   */
  bake(t0, t1, fn, { tol = 0.12, minStep = 1 } = {}) {
    t0 = Math.round(t0); t1 = Math.round(t1);
    if (t1 <= t0) throw new Error(`${this.name}: bake range empty`);
    const get = (f) => this._norm(fn(f));
    this.keys = this.keys.filter((k) => k.t < t0 - 1e-6 || k.t > t1 + 1e-6);
    const before = [...this.keys].reverse().find((k) => k.t < t0);
    if (before && before.ease !== HOLD) { /* leave its ease — it now targets the baked start */ }
    const fitted = this.kind === 'shape' ? fitLinear(get, t0, t1, tol, minStep) : fitHermite(get, t0, t1, tol, this.kind === 'scalar' ? 1 : null);
    fitted.forEach((k) => this._insert(k.t, k.v, k.ease));
    return this;
  }
  /** Value at (fractional) frame f. */
  at(f) {
    const ks = this.keys;
    if (!ks.length) return clone(this.static);
    if (f <= ks[0].t) return clone(ks[0].v);
    if (f >= ks[ks.length - 1].t) return clone(ks[ks.length - 1].v);
    let i = 0; while (i < ks.length - 2 && ks[i + 1].t <= f) i++;
    const a = ks[i], b = ks[i + 1], p = (f - a.t) / (b.t - a.t);
    if (a.ease === HOLD) return clone(a.v);
    if (this.kind === 'shape') { const e = Array.isArray(a.ease) ? a.ease[0] : a.ease; return shapeLerp(a.v, b.v, e.at(p)); }
    const A = flat(a.v), B = flat(b.v);
    const out = A.map((x, d) => { const e = Array.isArray(a.ease) ? a.ease[d] ?? a.ease[0] : a.ease; return x + (B[d] - x) * e.at(p); });
    return unflat(out, this.kind);
  }
  /** Numerical velocity (units/frame) as a vector of dims. */
  vel(f, side = 0, h = 0.02) {
    if (this.kind === 'shape') return [0];
    const A = flat(this.at(side > 0 ? f : f - h)), B = flat(this.at(side < 0 ? f : f + h));
    const dt = side === 0 ? 2 * h : h;
    return A.map((x, d) => (B[d] - x) / dt);
  }
  /** Lottie JSON. opts.dims pads vectors (e.g. 3 for transform position/anchor/scale). */
  toLottie({ dims = null, precision = 3 } = {}) {
    const r = (n) => +(+n).toFixed(precision);
    const pad = (arr) => { const a = arr.map(r); while (dims && a.length < dims) a.push(dims === 3 && a.length === 2 && this.name.endsWith('scale') ? 100 : 0); return a; };
    const enc = (v) => {
      if (this.kind === 'shape') return v.toLottie(precision);
      if (this.kind === 'color') return [...v.map((c) => +c.toFixed(4)), 1];
      if (this.kind === 'scalar') return r(v);
      return pad(v);
    };
    if (!this.animated) return { a: 0, k: enc(this.static) };
    const n = this.kind === 'shape' ? 1 : this.kind === 'scalar' ? 1 : this.kind === 'color' ? 4 : Math.max(dims || 0, flat(this.static).length);
    const ek = (e, key) => {
      const es = Array.isArray(e) ? e : [e];
      const pick = (d) => es[d] ?? es[0];
      const arr = (f) => [...Array(n).keys()].map((d) => +f(pick(d)).toFixed(4));
      return { o: { x: arr((b) => b.x1), y: arr((b) => b.y1) }, i: { x: arr((b) => b.x2), y: arr((b) => b.y2) } };
    };
    const k = this.keys.map((key, idx) => {
      const s = this.kind === 'shape' ? [enc(key.v)] : this.kind === 'scalar' ? [enc(key.v)] : enc(key.v);
      if (idx === this.keys.length - 1) return { t: r(key.t), s };
      if (key.ease === HOLD) return { t: r(key.t), s, h: 1 };
      return { t: r(key.t), s, ...ek(key.ease, key) };
    });
    return { a: 1, k };
  }
  /** Split a vec2 prop into two scalar props (for separated-dimension position). */
  split() {
    return [0, 1].map((d) => {
      const p = new Prop(flat(this.static)[d], 'scalar', `${this.name}.${'xy'[d]}`);
      p.keys = this.keys.map((k) => ({ t: k.t, v: k.v[d], ease: k.ease === HOLD ? HOLD : Array.isArray(k.ease) ? k.ease[d] ?? k.ease[0] : k.ease }));
      return p;
    });
  }
}

// Hermite fit: with x-handles at 1/3 and 2/3 a Lottie cubic-bezier easing becomes an exact
// cubic Hermite in time, so endpoint values AND slopes can be matched per dimension.
function fitHermite(get, t0, t1, tol, scalar) {
  const f = (t) => { const v = get(t); return Array.isArray(v) ? v : [v]; };
  const deriv = (t, lo, hi) => {
    const h = 0.01, a = Math.max(lo, t - h), b = Math.min(hi, t + h);
    const A = f(a), B = f(b); return A.map((x, d) => (B[d] - x) / (b - a));
  };
  const keys = [];
  const seg = (a, b) => {
    const va = f(a), vb = f(b), da = deriv(a, t0, t1), db = deriv(b, t0, t1), T = b - a;
    const eases = [], dims = va.length;
    let ok = true;
    for (let d = 0; d < dims && ok; d++) {
      const D = vb[d] - va[d];
      if (Math.abs(D) < 1e-7) {
        if (Math.abs(da[d]) * T > tol || Math.abs(db[d]) * T > tol) ok = false;
        eases.push(ease.linear); continue;
      }
      const y1 = (da[d] * T) / (3 * D), y2 = 1 - (db[d] * T) / (3 * D);
      if (Math.abs(y1) > 12 || Math.abs(y2) > 12) { ok = false; break; }
      eases.push(new CubicBezier(1 / 3, y1, 2 / 3, y2));
    }
    let worst = 0, worstT = (a + b) / 2;
    if (ok) {
      const steps = Math.max(4, Math.ceil(T * 2));
      for (let s = 1; s < steps; s++) {
        const t = a + (T * s) / steps, p = (t - a) / T, v = f(t);
        for (let d = 0; d < dims; d++) {
          const e = eases[d], approx = va[d] + (vb[d] - va[d]) * e._y(p); // x(t)=t exactly
          const err = Math.abs(approx - v[d]);
          if (err > worst) { worst = err; worstT = t; }
        }
      }
    }
    if ((!ok || worst > tol) && T > 1) {
      let m = Math.round(worstT); if (m <= a || m >= b) m = Math.round((a + b) / 2);
      if (m <= a || m >= b) m = a + 1;
      seg(a, m); seg(m, b); return;
    }
    if (!ok) eases.splice(0, eases.length, ...va.map(() => ease.linear));
    keys.push({ t: a, v: scalar ? va[0] : va, ease: eases });
  };
  seg(t0, t1);
  const end = f(t1);
  keys.push({ t: t1, v: scalar ? end[0] : end, ease: ease.inOut });
  return keys;
}

function fitLinear(get, t0, t1, tol, minStep) {
  const maxErr = (a, b) => {
    const A = get(a), B = get(b); let w = 0, wt = (a + b) / 2;
    for (let t = a + 0.5; t < b; t += 0.5) {
      const p = (t - a) / (b - a), L = lerpPath(A, B, p), R = get(t);
      L.vertices.forEach((v, i) => {
        const r = R.vertices[i];
        const e = Math.max(V.dist(v.p, r.p), V.dist(v.in, r.in), V.dist(v.out, r.out));
        if (e > w) { w = e; wt = t; }
      });
    }
    return [w, wt];
  };
  const out = [];
  const seg = (a, b) => {
    const [e, wt] = maxErr(a, b);
    if (e > tol && b - a > minStep) { let m = Math.round(wt); if (m <= a || m >= b) m = Math.round((a + b) / 2); seg(a, m); seg(m, b); return; }
    out.push({ t: a, v: get(a), ease: ease.linear });
  };
  seg(t0, t1);
  out.push({ t: t1, v: get(t1), ease: ease.linear });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2D affine matrices (for analysis)
// ─────────────────────────────────────────────────────────────────────────────

const M = {
  id: () => [1, 0, 0, 1, 0, 0],
  mul: (A, B) => [
    A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
  ],
  apply: (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]],
  // Lottie/AE: T(position) · R(rotation) · S(scale) · T(-anchor)
  trs: (p, a, s, rDeg) => {
    const r = rad(rDeg), c = Math.cos(r), sn = Math.sin(r), sx = s[0] / 100, sy = s[1] / 100;
    const m = [c * sx, sn * sx, -sn * sy, c * sy, 0, 0];
    const t = M.apply(m, [-a[0], -a[1]]);
    return [m[0], m[1], m[2], m[3], p[0] + t[0], p[1] + t[1]];
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Shape items
// ─────────────────────────────────────────────────────────────────────────────

class Transformable {
  _initTransform({ position = [0, 0], anchor = [0, 0], scale = [100, 100], rotation = 0, opacity = 100 } = {}, prefix = '') {
    const sc = isNum(scale) ? [scale, scale] : scale;
    this.position = new Prop(position, 'vec', `${prefix}position`);
    this.anchor = new Prop(anchor, 'vec', `${prefix}anchor`);
    this.scale = new Prop(sc, 'vec', `${prefix}scale`);
    this.rotation = new Prop(rotation, 'scalar', `${prefix}rotation`);
    this.opacity = new Prop(opacity, 'scalar', `${prefix}opacity`);
  }
  localMatrix(f) { return M.trs(this.position.at(f), this.anchor.at(f), this.scale.at(f), this.rotation.at(f)); }
  props() { return [this.position, this.anchor, this.scale, this.rotation, this.opacity]; }
}

/** A shape group. Holds geometry + styles + modifiers and its own transform. */
export class Group extends Transformable {
  constructor(owner, name, opts = {}) {
    super();
    this.owner = owner; this.name = name; this.items = []; this.kind = 'group';
    this._initTransform(opts, `${name}.`);
    this.scene = owner.scene;
  }
  get layer() { return this.owner instanceof Layer ? this.owner : this.owner.layer; }
  worldMatrix(f) { return M.mul(this.owner.worldMatrix(f), this.localMatrix(f)); }
  worldOpacity(f) { return (this.opacity.at(f) / 100) * this.owner.worldOpacity(f); }
  _add(item) { this.items.push(item); return item; }
  // ── raw building blocks (order matters: geometry, then modifiers, then stroke/fill) ──
  addRect({ size, at = [0, 0], radius = 0 }) { return this._add({ ty: 'rc', size: new Prop(size, 'vec', `${this.name}.size`), at: new Prop(at, 'vec', `${this.name}.rectPos`), radius: new Prop(radius, 'scalar', `${this.name}.radius`) }); }
  addEllipse({ size, at = [0, 0] }) { return this._add({ ty: 'el', size: new Prop(size, 'vec', `${this.name}.size`), at: new Prop(at, 'vec', `${this.name}.ellipsePos`) }); }
  addPath(p) { return this._add({ ty: 'sh', shape: new Prop(p, 'shape', `${this.name}.path`) }); }
  addTrim({ start = 0, end = 100, offset = 0, individually = false } = {}) {
    return this._add({ ty: 'tm', start: new Prop(start, 'scalar', `${this.name}.trimStart`), end: new Prop(end, 'scalar', `${this.name}.trimEnd`), offset: new Prop(offset, 'scalar', `${this.name}.trimOffset`), m: individually ? 2 : 1 });
  }
  addRoundCorners(r) { return this._add({ ty: 'rd', radius: new Prop(r, 'scalar', `${this.name}.roundCorners`) }); }
  addStroke({ color, width = 1.5, opacity = 100, cap = 'round', join = 'round', dash = null, dashOffset = 0 }) {
    const c = hex(color);
    return this._add({
      ty: 'st', color: new Prop(c, 'color', `${this.name}.strokeColor`), opacity: new Prop(opacity * c[3], 'scalar', `${this.name}.strokeOpacity`),
      width: new Prop(width, 'scalar', `${this.name}.strokeWidth`), cap, join,
      dash: dash ? { dash: dash[0], gap: dash[1], offset: new Prop(dashOffset, 'scalar', `${this.name}.dashOffset`) } : null,
    });
  }
  addFill({ color, opacity = 100, rule = 'nonzero' }) {
    const c = hex(color);
    return this._add({ ty: 'fl', color: new Prop(c, 'color', `${this.name}.fillColor`), opacity: new Prop(opacity * c[3], 'scalar', `${this.name}.fillOpacity`), rule });
  }
  /** stops: [[offset0..1, color, alpha0..1?], …] · type 'linear'|'radial' · from/to in group space */
  addGradient({ stops, from, to, type = 'linear', opacity = 100, stroke = null }) {
    const item = {
      ty: stroke ? 'gs' : 'gf', stops: stops.map(([o, c, a]) => [o, hex(c), a ?? hex(c)[3]]), type,
      from: new Prop(from, 'vec', `${this.name}.gradFrom`), to: new Prop(to, 'vec', `${this.name}.gradTo`),
      opacity: new Prop(opacity, 'scalar', `${this.name}.gradOpacity`),
    };
    if (stroke) Object.assign(item, {
      width: new Prop(stroke.width ?? 1.5, 'scalar', `${this.name}.strokeWidth`), cap: stroke.cap || 'round', join: stroke.join || 'round',
      dash: stroke.dash ? { dash: stroke.dash[0], gap: stroke.dash[1], offset: new Prop(stroke.dashOffset ?? 0, 'scalar', `${this.name}.dashOffset`) } : null,
    });
    return this._add(item);
  }
  /** Nested group. */
  group(name, opts = {}) { return this._add(new Group(this, name, opts)); }
  /** Register this group as a collision body for analysis. */
  body(opts = {}) { return this.scene.body(this, opts); }
}

const STYLE_KEYS = ['fill', 'stroke', 'strokeWidth', 'strokeOpacity', 'fillOpacity', 'cap', 'join', 'dash', 'dashOffset', 'trim', 'gradient'];

/** Shared high-level shape helpers for Layer and Group. Each returns a Group handle. */
const ShapeHelpers = {
  _styled(name, opts, addGeometry) {
    const tOpts = {};
    for (const k of ['position', 'anchor', 'scale', 'rotation', 'opacity']) if (opts[k] !== undefined) tOpts[k] = opts[k];
    const g = this.group(name || `shape${this.scene._uid()}`, tOpts);
    g.geo = addGeometry(g);
    if (opts.trim) g.trim = g.addTrim(opts.trim === true ? {} : opts.trim);
    if (opts.stroke) g.strokeItem = g.addStroke({ color: opts.stroke, width: opts.strokeWidth ?? 1.5, opacity: opts.strokeOpacity ?? 100, cap: opts.cap, join: opts.join, dash: opts.dash, dashOffset: opts.dashOffset });
    if (opts.gradient) g.gradientItem = g.addGradient(opts.gradient);
    if (opts.fill) g.fillItem = g.addFill({ color: opts.fill, opacity: opts.fillOpacity ?? 100 });
    return g;
  },
  /** Rounded rect centred on `at` (default [0,0]), or positioned by its top-left corner when x/y are given. */
  rect(opts) {
    const { w, h, r = 0, at, x, y, name } = opts;
    const c = at || (x !== undefined || y !== undefined ? [(x ?? 0) + w / 2, (y ?? 0) + h / 2] : [0, 0]);
    return this._styled(name, opts, (g) => g.addRect({ size: [w, h], at: c, radius: r }));
  },
  circle(opts) { const { r, at = [0, 0], name } = opts; return this._styled(name, opts, (g) => g.addEllipse({ size: [2 * r, 2 * r], at })); },
  ellipse(opts) { const { w, h, at = [0, 0], name } = opts; return this._styled(name, opts, (g) => g.addEllipse({ size: [w, h], at })); },
  /** path: BezierPath (use Path.*). */
  path(p, opts = {}) { return this._styled(opts.name, opts, (g) => g.addPath(p)); },
};
Object.assign(Group.prototype, ShapeHelpers);

// ─────────────────────────────────────────────────────────────────────────────
// Layers
// ─────────────────────────────────────────────────────────────────────────────

export class Layer extends Transformable {
  constructor(scene, name, opts = {}) {
    super();
    this.scene = scene; this.name = name; this.items = []; this.kind = opts.null ? 'null' : 'shape';
    this.parent = opts.parent || null;
    this.inFrame = opts.in ?? 0; this.outFrame = opts.out ?? null;
    this.matte = null; // { source: Layer, mode }
    this.isMatteSource = false;
    this.hidden = false;
    this._initTransform(opts, `${name}.`);
  }
  get layer() { return this; }
  worldMatrix(f) { const m = this.localMatrix(f); return this.parent ? M.mul(this.parent.worldMatrix(f), m) : m; }
  /** Parenting does NOT inherit opacity in Lottie — only the layer's own opacity counts. */
  worldOpacity(f) { const inRange = f >= this.inFrame && f < (this.outFrame ?? this.scene.frames); return inRange ? this.opacity.at(f) / 100 : 0; }
  group(name, opts = {}) { const g = new Group(this, name, opts); this.items.push(g); return g; }
  /** Use `source` layer as this layer's alpha matte ('alpha' | 'alphaInverted' | 'luma' | 'lumaInverted'). */
  matteWith(source, mode = 'alpha') { this.matte = { source, mode }; source.isMatteSource = true; return this; }
  /**
   * Bake position (and optionally rotation) so the layer travels along `path` between frames t0→t1.
   * Arc-length parametrised: on-screen speed follows `ease` exactly. orient: rotate to face travel.
   */
  moveAlong(p, t0, t1, { ease: e = ease.inOut, from = 0, to = 1, orient = false, angleOffset = 0, tol = 0.1 } = {}) {
    const fn = easeFn(e);
    const u = (f) => lerp(from, to, fn(clamp((f - t0) / (t1 - t0))));
    this.position.bake(t0, t1, (f) => p.pointAt(u(f)), { tol });
    if (orient) {
      let last = null;
      this.rotation.bake(t0, t1, (f) => {
        let a = p.angleAt(u(f)) + angleOffset;
        if (last !== null) { while (a - last > 180) a -= 360; while (a - last < -180) a += 360; }
        last = a; return a;
      }, { tol: 0.2 });
    }
    return this;
  }
  /** Register this layer (or a group inside it) as a collision body for analysis. */
  body(opts = {}) { return this.scene.body(this, opts); }
}
Object.assign(Layer.prototype, ShapeHelpers);

// ─────────────────────────────────────────────────────────────────────────────
// Scene
// ─────────────────────────────────────────────────────────────────────────────

export class Scene {
  /**
   * @param {object} o
   *  name, width, height, fps (default 60), duration (seconds) | frames, loop (default true)
   */
  constructor({ name = 'animation', width = 800, height = 600, fps = 60, duration = null, frames = null, loop = true } = {}) {
    Object.assign(this, { name, width, height, fps, loop });
    this.frames = frames ?? Math.round((duration ?? 4) * fps);
    this.layers = []; // bottom → top paint order (later = on top)
    this.markers = [];
    this.bodies = [];
    this.rules = { noOverlap: [], inside: [], occluders: [] };
    this.meta = {};
    this._n = 0;
  }
  _uid() { return ++this._n; }
  /** seconds → frames (rounded). */
  s(sec) { return Math.round(sec * this.fps); }
  get center() { return [this.width / 2, this.height / 2]; }
  /** New shape layer (painted above existing layers). */
  layer(name, opts = {}) { const l = new Layer(this, name, opts); this.layers.push(l); return l; }
  /** Null (invisible) layer for parenting / rigging. */
  null(name, opts = {}) { return this.layer(name, { ...opts, null: true }); }
  /** Named marker. The bundled player understands 'intro' (plays once) + 'loop' (repeats). */
  marker(name, start, end) { this.markers.push({ name, start, end }); return this; }

  /**
   * Seamless looping bake. Runs fn(localFrame, tripIndex) for `duration` frames starting at each
   * of `starts` (frames, any value — wrapped modulo the loop). Trips that cross the loop point are
   * split across the seam so frame 0 and frame op match exactly. Between trips the prop rests at
   * fn(duration) and is CUT back to fn(0) at the next trip start — keep the element invisible then.
   */
  cycle(prop, starts, duration, fn, opts = {}) {
    const F = this.frames, mod = (x) => ((x % F) + F) % F;
    const pieces = [];
    [].concat(starts).forEach((s0, ti) => {
      const s = Math.round(mod(s0)), e = s + Math.round(duration);
      if (e <= F) pieces.push({ a: s, b: e, off: s, ti });
      else { pieces.push({ a: s, b: F, off: s, ti }); pieces.push({ a: 0, b: e - F, off: s - F, ti }); }
    });
    pieces.sort((p, q) => p.a - q.a);
    prop.keys = [];
    const endVal = (ti) => fn(duration, ti);
    let cursor = 0, lastTi = pieces[pieces.length - 1].ti;
    for (const pc of pieces) {
      if (pc.a > cursor) {
        const k = prop._insert(cursor, prop._norm(endVal(lastTi)), HOLD);
        k.ease = HOLD;
      }
      prop.bake(pc.a, pc.b, (f) => fn(clamp(f - pc.off, 0, duration), pc.ti), opts);
      cursor = pc.b; lastTi = pc.ti;
    }
    if (cursor < F) {
      const k = prop.keys[prop.keys.length - 1]; k.ease = ease.linear;
      prop._insert(F, prop._norm(endVal(lastTi)), ease.linear);
    }
    return prop;
  }

  // ── analysis declarations ──
  /**
   * Register a collision body. target: Layer or Group.
   * shape: 'auto' (derive from the first rect/ellipse/path of the target group — or of the layer's group
   *        named `group`, else its first group) | 'circle' | 'rect'
   * r (circle radius) · w,h (rect) · at (local centre) · pad (inflate px) · name
   */
  body(target, { shape = 'auto', r, w, h, at = [0, 0], pad = 0, name, group = null } = {}) {
    const b = { target, shape, r, w, h, at, pad, group, name: name || target.name };
    this.bodies.push(b);
    return b;
  }
  /** Bodies in `items` must never overlap and must keep `clearance` px between them. */
  noOverlap(items, { clearance = 0, name = null, ignore = [] } = {}) {
    const bodies = items.map((it) => this.bodies.find((b) => b === it || b.target === it) || this.body(it));
    this.rules.noOverlap.push({ bodies, clearance, name: name || bodies.map((b) => b.name).slice(0, 3).join(',') + (bodies.length > 3 ? '…' : ''), ignore });
    return this;
  }
  /**
   * Opaque elements that can hide things beneath them (e.g. a packet sliding under a node).
   * While a layer's body is fully inside an occluder painted above it, analysis treats it as invisible,
   * so cuts/pops/kinks that happen under cover are not reported.
   */
  occluders(items) {
    for (const it of items) this.rules.occluders.push(this.bodies.find((b) => b === it || b.target === it) || this.body(it));
    return this;
  }
  /** Bodies must stay within the canvas inset by `padding` px while visible. */
  keepInside(items = null, { padding = 0 } = {}) {
    this.rules.inside.push({ items, padding });
    return this;
  }

  // ── export ──
  toJSON({ precision = 3 } = {}) {
    // Lottie: layers[0] is TOP. Our list is bottom→top, so reverse; matte sources sit directly above targets.
    const order = [];
    const top = [...this.layers].reverse();
    for (const l of top) {
      if (l.isMatteSource) continue;
      if (l.matte) order.push(l.matte.source);
      order.push(l);
    }
    const ind = new Map(order.map((l, i) => [l, i + 1]));
    const layers = order.map((l) => exportLayer(l, ind, this, precision));
    const json = {
      v: '5.12.2', fr: this.fps, ip: 0, op: this.frames, w: this.width, h: this.height, nm: this.name, ddd: 0,
      assets: [], layers,
      markers: this.markers.map((m) => ({ tm: m.start, cm: m.name, dr: m.end - m.start })),
      meta: { g: 'lottie-motion kit', ...this.meta },
    };
    return json;
  }
  /** Write JSON (minified) to file; returns stats. */
  save(file, opts = {}) {
    const json = this.toJSON(opts);
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    const str = JSON.stringify(json);
    fs.writeFileSync(file, str);
    const kf = countKeyframes(json);
    return { file, bytes: str.length, layers: json.layers.length, keyframes: kf };
  }

  // ── analysis ──
  analyze(opts = {}) { return analyzeScene(this, opts); }
}

const CAP = { butt: 1, round: 2, square: 3 };
const JOIN = { miter: 1, round: 2, bevel: 3 };
const MATTE = { alpha: 1, alphaInverted: 2, luma: 3, lumaInverted: 4 };

function exportTransform(t, { layer = false, precision }) {
  const tr = {};
  const dims = layer ? 3 : null;
  if (layer && t.position.animated) {
    const [x, y] = t.position.split();
    tr.p = { s: true, x: x.toLottie({ precision }), y: y.toLottie({ precision }) };
  } else tr.p = t.position.toLottie({ dims, precision });
  tr.a = t.anchor.toLottie({ dims, precision });
  tr.s = t.scale.toLottie({ dims, precision });
  tr.r = t.rotation.toLottie({ precision });
  tr.o = t.opacity.toLottie({ precision });
  return tr; // skew (sk/sa) is never used, so it is omitted (players default it to 0)
}

// The kit uses painter's order (added later = drawn on top). Lottie draws earlier array entries on top,
// so child groups are reversed. Primitives keep their order: geometry → modifiers → stroke → fill
// (stroke listed before fill = stroke drawn over fill, as intended).
const paintOrder = (items) => [...items.filter((i) => i instanceof Group).reverse(), ...items.filter((i) => !(i instanceof Group))];

const dashJSON = (d, P) => [{ n: 'd', nm: 'dash', v: { a: 0, k: d.dash } }, { n: 'g', nm: 'gap', v: { a: 0, k: d.gap } }, { n: 'o', nm: 'offset', v: P(d.offset) }];

function exportItem(it, precision) {
  const P = (p, o) => p.toLottie({ precision, ...o });
  if (it instanceof Group) {
    const its = paintOrder(it.items).map((x) => exportItem(x, precision));
    its.push({ ty: 'tr', ...exportTransform(it, { precision }) });
    return { ty: 'gr', nm: it.name, it: its, np: its.length - 1, cix: 2, bm: 0 };
  }
  switch (it.ty) {
    case 'rc': return { ty: 'rc', d: 1, s: P(it.size), p: P(it.at), r: P(it.radius) };
    case 'el': return { ty: 'el', d: 1, s: P(it.size), p: P(it.at) };
    case 'sh': return { ty: 'sh', d: 1, ks: P(it.shape) };
    case 'tm': return { ty: 'tm', s: P(it.start), e: P(it.end), o: P(it.offset), m: it.m };
    case 'rd': return { ty: 'rd', r: P(it.radius) };
    case 'fl': return { ty: 'fl', c: P(it.color), o: P(it.opacity), r: it.rule === 'evenodd' ? 2 : 1, bm: 0 };
    case 'st': {
      const o = { ty: 'st', c: P(it.color), o: P(it.opacity), w: P(it.width), lc: CAP[it.cap || 'round'], lj: JOIN[it.join || 'round'], ml: 4, bm: 0 };
      if (it.dash) o.d = dashJSON(it.dash, P);
      return o;
    }
    case 'gf': case 'gs': {
      const k = [];
      it.stops.forEach(([o, c]) => k.push(o, ...c.slice(0, 3).map((v) => +v.toFixed(4))));
      it.stops.forEach(([o, , a]) => k.push(o, +a.toFixed(4)));
      const o = { ty: it.ty, o: P(it.opacity), r: 1, bm: 0, g: { p: it.stops.length, k: { a: 0, k } }, s: P(it.from), e: P(it.to), t: it.type === 'radial' ? 2 : 1 };
      if (it.type === 'radial') Object.assign(o, { h: { a: 0, k: 0 }, a: { a: 0, k: 0 } });
      if (it.ty === 'gs') Object.assign(o, { w: P(it.width), lc: CAP[it.cap], lj: JOIN[it.join], ml: 4 });
      if (it.ty === 'gs' && it.dash) o.d = dashJSON(it.dash, P);
      return o;
    }
    default: throw new Error(`Unknown item ${it.ty}`);
  }
}

function exportLayer(l, ind, scene, precision) {
  const out = {
    ddd: 0, ind: ind.get(l), ty: l.kind === 'null' ? 3 : 4, nm: l.name, sr: 1,
    ks: exportTransform(l, { layer: true, precision }), ao: 0,
    ip: l.inFrame, op: l.outFrame ?? scene.frames, st: 0, bm: 0,
  };
  if (l.parent) {
    if (!ind.has(l.parent)) throw new Error(`Layer ${l.name}: parent ${l.parent.name} is not in the scene`);
    out.parent = ind.get(l.parent);
  }
  if (l.kind !== 'null') out.shapes = paintOrder(l.items).map((it) => exportItem(it, precision));
  if (l.isMatteSource) out.td = 1;
  if (l.matte) out.tt = MATTE[l.matte.mode];
  if (l.hidden) out.hd = true;
  return out;
}

function countKeyframes(json) {
  let n = 0;
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === 'object') { if (o.a === 1 && Array.isArray(o.k)) n += o.k.length; Object.values(o).forEach(walk); }
  };
  walk(json.layers);
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis
// ─────────────────────────────────────────────────────────────────────────────

function geomOf(b, f) {
  const t = b.target;
  // explicit shapes are in the target's local space
  if (b.shape === 'circle') return { kind: 'circle', c: b.at, r: (b.r ?? 4) + b.pad };
  if (b.shape === 'rect') return { kind: 'rect', c: b.at, w: b.w + 2 * b.pad, h: b.h + 2 * b.pad, r: 0 };
  // auto: first geometry in the group (or in the layer's first group)
  const holder = t instanceof Group ? t : b.group ? t.items.find((i) => i instanceof Group && i.name === b.group) : t.items.find((i) => i instanceof Group);
  if (!holder) throw new Error(`body ${b.name}: cannot derive geometry; pass shape:'circle'|'rect'`);
  const geo = holder.items.find((i) => i.ty === 'rc' || i.ty === 'el' || i.ty === 'sh');
  const local = holder === t ? M.id() : holder.localMatrix(f);
  if (geo.ty === 'rc') { const s = geo.size.at(f); return { kind: 'rect', c: geo.at.at(f), w: s[0] + 2 * b.pad, h: s[1] + 2 * b.pad, r: geo.radius.at(f), local }; }
  if (geo.ty === 'el') { const s = geo.size.at(f); return { kind: 'ellipse', c: geo.at.at(f), w: s[0] + 2 * b.pad, h: s[1] + 2 * b.pad, local }; }
  return { kind: 'path', path: geo.shape.at(f), local };
}

function polyOf(b, f) {
  const g = geomOf(b, f);
  const world = M.mul(b.target.worldMatrix(f), g.local || M.id());
  let pts, closed = true;
  if (g.kind === 'circle' || g.kind === 'ellipse') {
    const rx = g.kind === 'circle' ? g.r : g.w / 2, ry = g.kind === 'circle' ? g.r : g.h / 2;
    pts = [...Array(24).keys()].map((i) => { const a = (i / 24) * Math.PI * 2; return [g.c[0] + rx * Math.cos(a), g.c[1] + ry * Math.sin(a)]; });
  } else if (g.kind === 'rect') {
    const x0 = g.c[0] - g.w / 2, y0 = g.c[1] - g.h / 2, r = Math.min(g.r || 0, g.w / 2, g.h / 2);
    if (r > 0.5) pts = Path.rect(x0, y0, g.w, g.h, r).sample(32);
    else pts = [[x0, y0], [x0 + g.w, y0], [x0 + g.w, y0 + g.h], [x0, y0 + g.h]];
  } else { pts = g.path.sample(48); closed = g.path.closed; }
  pts = pts.map((p) => M.apply(world, p));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const opacity = (b.target instanceof Group ? b.target.worldOpacity(f) : b.target.worldOpacity(f));
  const sc = b.target.worldMatrix(f), det = Math.abs(sc[0] * sc[3] - sc[1] * sc[2]);
  return { pts, closed, box: [x0, y0, x1, y1], visible: opacity > 0.02 && det > 1e-4, opacity };
}

function segDist(p, q, a, b) {
  // min distance between segments pq and ab (0 if intersecting)
  const d = (u, v, w) => { const l2 = (w[0] - v[0]) ** 2 + (w[1] - v[1]) ** 2; const t = l2 ? clamp(((u[0] - v[0]) * (w[0] - v[0]) + (u[1] - v[1]) * (w[1] - v[1])) / l2) : 0; return Math.hypot(u[0] - v[0] - t * (w[0] - v[0]), u[1] - v[1] - t * (w[1] - v[1])); };
  const o = (a1, b1, c1) => Math.sign((b1[0] - a1[0]) * (c1[1] - a1[1]) - (b1[1] - a1[1]) * (c1[0] - a1[0]));
  if (o(p, q, a) !== o(p, q, b) && o(a, b, p) !== o(a, b, q)) return 0;
  return Math.min(d(p, a, b), d(q, a, b), d(a, p, q), d(b, p, q));
}
function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function polyDistance(A, B) {
  if (A.closed && B.pts.some((p) => inside(p, A.pts))) return -1;
  if (B.closed && A.pts.some((p) => inside(p, B.pts))) return -1;
  let m = Infinity;
  const ea = A.closed ? A.pts.length : A.pts.length - 1, eb = B.closed ? B.pts.length : B.pts.length - 1;
  for (let i = 0; i < ea; i++) {
    const p = A.pts[i], q = A.pts[(i + 1) % A.pts.length];
    for (let j = 0; j < eb; j++) {
      const d = segDist(p, q, B.pts[j], B.pts[(j + 1) % B.pts.length]);
      if (d === 0) return -1;
      if (d < m) m = d;
    }
  }
  return m;
}

function allProps(scene) {
  const out = [];
  const visit = (owner, label) => {
    owner.props().forEach((p) => out.push({ p, owner: label, node: owner }));
    owner.items?.forEach((it) => {
      if (it instanceof Group) visit(it, `${label} › ${it.name}`);
      else Object.values(it).forEach((v) => { if (v instanceof Prop) out.push({ p: v, owner: label, node: owner, item: it }); else if (v && v.offset instanceof Prop) out.push({ p: v.offset, owner: label, node: owner, item: it }); });
    });
  };
  scene.layers.forEach((l) => visit(l, l.name));
  return out;
}

// Velocity thresholds below which a discontinuity is invisible (units/frame @60fps)
const VEL_EPS = { position: 0.35, anchor: 0.35, scale: 0.25, rotation: 0.25, opacity: 1.5, size: 0.35, default: 0.5 };
const epsFor = (name) => { const k = Object.keys(VEL_EPS).find((n) => name.toLowerCase().endsWith(n)); return VEL_EPS[k] ?? VEL_EPS.default; };

function analyzeScene(scene, { step = 0.5, timelineWidth = 72, maxRows = 40 } = {}) {
  const F = scene.frames, fpsScale = 60 / scene.fps;
  const issues = [];
  const add = (severity, type, msg, data = {}) => issues.push({ severity, type, msg, ...data });

  // 1. velocity discontinuities at keyframes (kinks / abrupt starts & stops)
  const polyCache = new Map();
  const poly = (b, f) => { const k = `${scene.bodies.indexOf(b)}@${f}`; if (!polyCache.has(k)) polyCache.set(k, polyOf(b, f)); return polyCache.get(k); };
  const z = (node) => scene.layers.indexOf(node.layer);
  const occluded = (node, f) => {
    if (!scene.rules.occluders.length) return false;
    const own = scene.bodies.filter((b) => b.target === node || b.target === node.layer);
    if (!own.length) return false;
    return own.every((b) => {
      const P = poly(b, f);
      return scene.rules.occluders.some((o) => {
        if (z(o.target) <= z(node)) return false;
        const O = poly(o, f);
        return O.visible && O.opacity > 0.95 && O.closed && P.pts.every((pt) => inside(pt, O.pts));
      });
    });
  };
  const presence = (node, f) => {
    const m = node.worldMatrix(f), det = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    const p = node.worldOpacity(f) * Math.min(1, det);
    return p > 0 && occluded(node, f) ? 0 : p;
  };
  const trimCollapsed = (item, f) => item?.ty === 'tm' && Math.abs(item.end.at(f) - item.start.at(f)) < 0.05;
  const seen = (node, f) => node.layer.isMatteSource || [f - 1, f - 0.25, f, f + 0.25, f + 1].some((x) => presence(node, clamp(x, 0, F - 1e-6)) > 0.02);
  for (const { p, owner, node, item } of allProps(scene)) {
    if (!p.animated || p.kind === 'shape') continue;
    // cuts (hold → jump) are only acceptable while the element is invisible
    p.keys.forEach((k, i) => {
      if (k.ease !== HOLD || i === p.keys.length - 1) return;
      const t = p.keys[i + 1].t;
      const a = [].concat(p.at(t - 0.01)), b = [].concat(p.at(t));
      const jump = p.kind === 'color' ? Math.max(...a.map((x, d) => Math.abs(x - b[d]))) > 0.02 : Math.max(...a.map((x, d) => Math.abs(x - b[d]))) > epsFor(p.name);
      const hiddenTrim = trimCollapsed(item, t - 0.01) && trimCollapsed(item, t);
      if (jump && !hiddenTrim && !p.allowed?.has('cut') && (presence(node, Math.max(0, t - 0.5)) > 0.02 && presence(node, t) > 0.02)) add('warn', 'cut', `${owner} · ${p.name} @f${t}: value jumps while visible (hold/cut) — animate it or hide the element first`, { frame: t });
    });
    if (p.kind === 'color' || p.allowed?.has('kink')) continue;
    const eps = epsFor(p.name) / fpsScale;
    p.keys.forEach((k, i) => {
      if (i === 0 || i === p.keys.length - 1) return;
      if (p.keys[i - 1].ease === HOLD) return; // arriving from a cut: handled above
      if (!seen(node, k.t)) return;
      const vin = p.vel(k.t, -1), vout = k.ease === HOLD ? vin.map(() => 0) : p.vel(k.t, +1);
      const sin = Math.hypot(...vin), sout = Math.hypot(...vout);
      if (Math.max(sin, sout) < eps) return;
      const dv = Math.hypot(...vin.map((x, d) => x - vout[d]));
      if (dv < Math.max(eps, 0.2 * Math.max(sin, sout))) return;
      let kind = 'velocity jump';
      if (sout < eps * 0.5) kind = 'abrupt stop (arrives at speed, then halts — use an ease-out/settle into this key)';
      else if (sin < eps * 0.5) kind = 'abrupt start (leaves a rest at full speed — ease out of the rest)';
      else if (vin.length >= 2) {
        const ang = Math.abs(deg(Math.atan2(V.cross(vin, vout), V.dot(vin, vout))));
        if (ang > 20) kind = `direction snap ${ang.toFixed(0)}° (route through a curve or bake along a smooth path)`;
      }
      add(p.name.endsWith('opacity') ? 'info' : 'warn', 'kink', `${owner} · ${p.name} @f${+k.t.toFixed(2)}: ${kind} [in ${sin.toFixed(2)} → out ${sout.toFixed(2)} u/f]`, { frame: k.t });
    });
    // abrupt start at the first key / stop at the last key (inside the timeline)
    const first = p.keys[0], last = p.keys[p.keys.length - 1];
    if (p.name.endsWith('opacity')) continue; // fades legitimately start/end at speed
    if (first.t > 0.5 && seen(node, first.t)) { const s = Math.hypot(...p.vel(first.t, +1)); if (s > eps * 2.5) add('warn', 'kink', `${owner} · ${p.name} @f${first.t}: starts moving at full speed from rest (ease the first segment)`, { frame: first.t }); }
    if (last.t < F - 0.5 && seen(node, last.t)) { const s = Math.hypot(...p.vel(last.t, -1)); if (s > eps * 2.5) add('warn', 'kink', `${owner} · ${p.name} @f${last.t}: slams to a stop at its final key (ease into it)`, { frame: last.t }); }
  }

  // 2. loop seam: every prop must match value (and roughly velocity) at the loop boundaries
  //    (frame 0 / op, or the 'loop' marker's start / end when an intro + loop structure is used)
  const loopMarker = scene.markers.find((m) => m.name === 'loop');
  const S0 = loopMarker ? loopMarker.start : 0, S1 = loopMarker ? loopMarker.end : F;
  if (scene.loop) {
    for (const { p, owner } of allProps(scene)) {
      if (!p.animated || p.kind === 'shape' || p.allowed?.has('loop-seam')) continue;
      const a = [].concat(p.at(S0)), b = [].concat(p.at(S1));
      const diff = Math.max(...a.map((x, i) => Math.abs(x - b[i])));
      const tol = p.kind === 'color' ? 0.01 : p.name.endsWith('rotation') ? 0.05 : 0.05;
      const isRot = p.name.endsWith('rotation') && Math.abs(Math.round(diff / 360) * 360 - diff) < 0.05 && diff > 1;
      const isDash = p.name.endsWith('dashOffset') || p.name.endsWith('trimOffset');
      if (diff > tol && !isRot && !isDash) add('error', 'loop-seam', `${owner} · ${p.name}: value at f${S0} (${a.map((x) => +x.toFixed(2))}) ≠ value at f${S1} (${b.map((x) => +x.toFixed(2))}) → visible pop when the loop restarts`);
      else if (diff > tol && isDash) add('info', 'loop-seam', `${owner} · ${p.name}: offset changes by ${diff.toFixed(2)} over the loop — make sure it is a whole multiple of the dash period / 360°`);
      const v0 = p.vel(S0, +1), v1 = p.vel(S1, -1), dv = Math.hypot(...v0.map((x, d) => x - v1[d]));
      const eps = epsFor(p.name) / fpsScale;
      if (dv > eps * 1.5 && diff <= tol) add('warn', 'loop-seam', `${owner} · ${p.name}: speed differs across the loop point (out ${Math.hypot(...v1).toFixed(2)} → in ${Math.hypot(...v0).toFixed(2)} u/f) → hitch on restart`);
    }
    // shape props: compare vertices
    for (const { p, owner } of allProps(scene)) {
      if (!p.animated || p.kind !== 'shape') continue;
      const A = p.at(S0), B = p.at(S1);
      const d = Math.max(...A.vertices.map((v, i) => V.dist(v.p, B.vertices[i].p)));
      if (d > 0.1) add('error', 'loop-seam', `${owner} · ${p.name}: path at f${S0} differs from f${S1} by ${d.toFixed(2)}px`);
    }
  }

  // 3. pops: layers appearing/disappearing within one frame at high presence
  for (const l of scene.layers) {
    if (l.kind === 'null' || l.isMatteSource) continue;
    let prev = null;
    for (let f = 0; f < F; f += 1) {
      const pres = presence(l, f);
      // emerging from / vanishing under an occluder is visually continuous — not a pop
      if (prev !== null && Math.abs(pres - prev) > 0.45 && !occluded(l, f) && !occluded(l, f - 1)) add('warn', 'pop', `${l.name} @f${f}: presence jumps ${prev.toFixed(2)} → ${pres.toFixed(2)} in one frame (fade/scale it in instead)`, { frame: f });
      prev = pres;
    }
    if (scene.loop && Math.abs(presence(l, S1 - 1) - presence(l, S0)) > 0.45 && !occluded(l, S1 - 1) && !occluded(l, S0)) add('warn', 'pop', `${l.name}: presence differs across the loop point (f${S1 - 1} → f${S0})`);
  }

  // 4. collisions / clearance
  const clearanceReport = [];
  for (const rule of scene.rules.noOverlap) {
    const B = rule.bodies;
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j];
      if (rule.ignore.some(([x, y]) => (x === a.target && y === b.target) || (x === b.target && y === a.target))) continue;
      let minD = Infinity, minF = 0, bad = [];
      for (let f = 0; f <= F; f += step) {
        const A = poly(a, f), Bp = poly(b, f);
        if (!A.visible || !Bp.visible) continue;
        if (occluded(a.target, f) || occluded(b.target, f)) continue;
        const gap = rule.clearance + 1;
        if (A.box[0] - gap > Bp.box[2] || Bp.box[0] - gap > A.box[2] || A.box[1] - gap > Bp.box[3] || Bp.box[1] - gap > A.box[3]) continue;
        const d = polyDistance(A, Bp);
        if (d < minD) { minD = d; minF = f; }
        if (d < rule.clearance) bad.push(f);
      }
      if (bad.length) {
        const ranges = toRanges(bad, step);
        add(minD < 0 ? 'error' : 'warn', minD < 0 ? 'overlap' : 'clearance', `${a.name} ↔ ${b.name}: ${minD < 0 ? 'OVERLAP' : `gap ${minD.toFixed(1)}px < ${rule.clearance}px`} during ${ranges} (worst @f${minF})`, { frame: minF });
      }
      if (minD < Infinity) clearanceReport.push({ pair: `${a.name} ↔ ${b.name}`, min: minD < 0 ? 'overlap' : +minD.toFixed(1), at: minF });
    }
  }

  // 5. bounds
  for (const rule of scene.rules.inside) {
    const bodies = rule.items ? rule.items.map((it) => scene.bodies.find((b) => b === it || b.target === it) || scene.body(it)) : scene.bodies;
    for (const b of bodies) {
      const out = [];
      for (let f = 0; f <= F; f += 1) {
        const P = poly(b, f); if (!P.visible || P.opacity < 0.1) continue;
        const [x0, y0, x1, y1] = P.box, pd = rule.padding;
        if (x0 < pd - 0.01 || y0 < pd - 0.01 || x1 > scene.width - pd + 0.01 || y1 > scene.height - pd + 0.01) out.push(f);
      }
      if (out.length) add('warn', 'bounds', `${b.name}: outside the ${rule.padding}px safe area during ${toRanges(out, 1)}`);
    }
  }

  // 6. jitter: rapid direction reversals of body centres
  for (const b of scene.bodies) {
    let prevV = null, flips = [];
    for (let f = 1; f <= F; f++) {
      const c0 = M.apply(b.target.worldMatrix(f - 1), [0, 0]), c1 = M.apply(b.target.worldMatrix(f), [0, 0]);
      const v = V.sub(c1, c0), s = V.len(v);
      if (prevV && s > 0.05 && V.len(prevV) > 0.05 && V.dot(v, prevV) < -0.5 * s * V.len(prevV)) flips.push(f);
      if (s > 0.05) prevV = v;
    }
    for (let i = 2; i < flips.length; i++) if (flips[i] - flips[i - 2] <= 8) { add('warn', 'jitter', `${b.name}: ${3}+ direction reversals within 8 frames around f${flips[i]} (reads as jitter)`, { frame: flips[i] }); break; }
  }

  // 7. timeline
  const timeline = buildTimeline(scene, timelineWidth, maxRows);
  const order = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  const counts = { error: issues.filter((i) => i.severity === 'error').length, warn: issues.filter((i) => i.severity === 'warn').length, info: issues.filter((i) => i.severity === 'info').length };
  return { counts, issues, clearance: clearanceReport.sort((a, b) => (a.min === 'overlap' ? -1 : b.min === 'overlap' ? 1 : a.min - b.min)), timeline, print() { printReport(scene, this); return this; } };
}

function toRanges(frames, step) {
  const out = []; let s = frames[0], p = frames[0];
  for (let i = 1; i <= frames.length; i++) {
    const f = frames[i];
    if (f === undefined || f - p > step + 1e-9) { out.push(s === p ? `f${s}` : `f${s}–${p}`); s = f; }
    p = f;
  }
  return out.slice(0, 6).join(', ') + (out.length > 6 ? ` (+${out.length - 6} more)` : '');
}

function buildTimeline(scene, W, maxRows) {
  const F = scene.frames, rows = [];
  const bucket = (i) => [Math.floor((i * F) / W), Math.floor(((i + 1) * F) / W)];
  const layerMoving = (l, f) => {
    const props = [];
    const visit = (o) => { o.props().forEach((p) => props.push(p)); o.items?.forEach((it) => { if (it instanceof Group) visit(it); else Object.values(it).forEach((v) => { if (v instanceof Prop) props.push(v); else if (v?.offset instanceof Prop) props.push(v.offset); }); }); };
    visit(l);
    return props.some((p) => p.animated && p.kind !== 'shape' && Math.hypot(...p.vel(f)) > 0.02) || props.some((p) => p.animated && p.kind === 'shape' && p.keys.some((k, i) => i < p.keys.length - 1 && f >= k.t && f < p.keys[i + 1].t));
  };
  for (const l of [...scene.layers].reverse().slice(0, maxRows)) {
    if (l.isMatteSource) continue;
    let s = '';
    for (let i = 0; i < W; i++) {
      const [a, b] = bucket(i); let mv = false, vis = false;
      for (let f = a; f <= Math.max(a, b - 1); f++) { if (l.kind === 'null' || l.worldOpacity(f) > 0.02) vis = true; if (layerMoving(l, f)) mv = true; }
      s += mv ? '█' : vis ? '·' : ' ';
    }
    rows.push(`${l.name.slice(0, 22).padEnd(22)} │${s}│`);
  }
  const ruler = ' '.repeat(22) + ' │' + [...Array(W).keys()].map((i) => (i % 12 === 0 ? '┼' : '─')).join('') + '│';
  const labels = ' '.repeat(24) + [...Array(Math.ceil(W / 12)).keys()].map((i) => `${(((i * 12) / W) * F / scene.fps).toFixed(1)}s`.padEnd(12)).join('');
  return [ruler, labels, ...rows].join('\n');
}

function printReport(scene, r) {
  const line = '─'.repeat(78);
  console.log(`\n${line}\n ${scene.name} · ${scene.width}×${scene.height} · ${scene.frames}f @ ${scene.fps}fps (${(scene.frames / scene.fps).toFixed(2)}s) · loop=${scene.loop}`);
  console.log(` errors ${r.counts.error} · warnings ${r.counts.warn} · info ${r.counts.info}\n${line}`);
  const show = r.issues.slice(0, 60);
  for (const i of show) console.log(` ${i.severity === 'error' ? '✖' : i.severity === 'warn' ? '▲' : '·'} [${i.type}] ${i.msg}`);
  if (r.issues.length > show.length) console.log(` … ${r.issues.length - show.length} more`);
  if (r.clearance.length) {
    console.log(`${line}\n Tightest clearances (px):`);
    r.clearance.slice(0, 10).forEach((c) => console.log(`   ${String(c.min).padStart(8)}  ${c.pair} @f${c.at}`));
  }
  console.log(`${line}\n Choreography (█ moving · visible-static):\n${r.timeline}\n${line}`);
}

export { M as Matrix };
