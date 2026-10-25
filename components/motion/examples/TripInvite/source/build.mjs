// TripInvite — "Bring everyone in."
// The owner taps Invite, a link chip pops out, and four friends fly in one by one, landing in the
// trip card's dashed "invited" slots with a hello bump. Intro plays once, then a calm idle loop
// (a hello wave along the avatar stack). Uses the showcase's warm neutrals and orange, and real animal avatars.
//
//   node build.mjs <outDir>

import fs from 'node:fs';
import path from 'node:path';
import { Scene, Path, ease, easeFn, clamp, mix, smoothstep, parseSvg } from '../../../../../.claude/skills/zoe/scripts/lottie-kit.mjs';

const OUT = process.argv[2] || path.join(import.meta.dirname, 'out');
// the five animals used, bundled here so this script rebuilds on its own
const AVATAR_DIR = path.join(import.meta.dirname, 'avatars');

// ── 1. Tokens ────────────────────────────────────────────────────────────────
const THEMES = {
  light: {
    surface: '#ffffff', line: '#e7e4df', lineStrong: '#d6d2cb', ink: '#1c1917', ink2: '#57534e', ink3: '#a8a29e',
    brand: '#ff5a1f', brandSoft: '#fff0e9', brandInk: '#c2410c', positive: '#0f9b77', cover: '#ffe4d6',
    shadow: '#1c1917', shadowNear: 5, shadowFar: 5, flyShadow: 14,
  },
  dark: {
    surface: '#171615', line: '#2d2c2a', lineStrong: '#3d3b38', ink: '#f4f3f1', ink2: '#a8a29e', ink3: '#78716c',
    brand: '#ff6a33', brandSoft: mix('#171615', '#ff6a33', 0.16), brandInk: '#ffb08a', positive: '#2ec4a0', cover: mix('#171615', '#ff6a33', 0.24),
    shadow: '#000000', shadowNear: 40, shadowFar: 30, flyShadow: 45,
  },
};
const TINT = { sky: '#D7EAFB', peach: '#FDE2D2', mint: '#D5F1E4', rose: '#FADCE3', butter: '#FAEDC4' };
const art = (animal) => parseSvg(fs.readFileSync(path.join(AVATAR_DIR, `${animal}.svg`), 'utf8'));

// ── 2. Layout ────────────────────────────────────────────────────────────────
const W = 640, H = 440, FPS = 60;
const INTRO_END = 240, LOOP_END = 420;
const CARD = { w: 336, h: 176, r: 24, c: [320, 256], s: 115 }; // drawn at app size, shown 15% larger
const AV = 36, RING = 2.5, FLY_SCALE = 48 / 36 * 100;
const SLOT_Y = 46, slotX = (i) => -130 + 28 * i;                 // card-local; 8px overlap like AvatarStack
const INVITE = { at: [106, 46], w: 92, h: 34 };
const CHIP = { w: 196, h: 44, at: [84, -128] };                    // card-local final position (above the card)

// Arrivals: off-canvas start, a bend point, and the slot. Each final approach comes steeply into its
// own slot from above or below, so a friend never flies across someone already seated.
const toLocal = ([x, y]) => [((x - CARD.c[0]) * 100) / CARD.s, ((y - CARD.c[1]) * 100) / CARD.s];
const FRIENDS = [
  { animal: 'fox', tint: 'peach', from: [-50, 40], bend: [176, 176] },
  { animal: 'panda', tint: 'mint', from: [-50, 430], bend: [214, 418] },
  { animal: 'cat', tint: 'rose', from: [330, 500], bend: [284, 412] },
  { animal: 'tiger', tint: 'butter', from: [180, -50], bend: [278, 200] },
].map((f, i) => {
  const slot = [slotX(i + 1), SLOT_Y];
  const route = Path.smooth([toLocal(f.from), toLocal(f.bend), slot], { tension: 1 });
  return { ...f, i: i + 1, slot, route };
});

// ── 3. Timing ────────────────────────────────────────────────────────────────
const T_PRESS = 34, T_CHIP = 40, T_CHECK = 62;
const FLIGHT = 46, DOCKS = [106, 134, 158, 180];              // decaying gaps: 28, 24, 22
FRIENDS.forEach((f, k) => { f.dock = DOCKS[k]; f.start = f.dock - FLIGHT; });
const T_PULSE = 200; // the pulse ends exactly at the intro→loop marker
const WAVE = INTRO_END + 70;                                    // idle hello wave inside the loop

const flyEase = easeFn(ease.inOut);
// hello bump: damped wobble after landing (an impact response, so it starts at speed)
const bump = (t) => (t < 0 ? 0 : 9 * Math.exp(-t / 7) * Math.sin(t / 3.2));
const BUMP_LEN = 34;

// ── helpers ──────────────────────────────────────────────────────────────────
function linkGlyph(g, at, s, color, width = 1.75) {
  // two rounded links at 45°, the familiar "link" mark
  const k = s / 16;
  const a = Path.rect(-7 * k, -3.5 * k, 9 * k, 7 * k, 3.5 * k).rotate(-45).translate(at[0] - 2.2 * k, at[1] + 2.2 * k);
  const b = Path.rect(-2 * k, -3.5 * k, 9 * k, 7 * k, 3.5 * k).rotate(-45).translate(at[0] + 2.2 * k, at[1] - 2.2 * k);
  g.path(a, { stroke: color, strokeWidth: width, name: 'link-a' });
  g.path(b, { stroke: color, strokeWidth: width, name: 'link-b' });
}
function avatar(owner, animal, tint, T, name) {
  const g = owner.group(name);
  g.circle({ name: 'ring', r: AV / 2 + RING, fill: T.surface });
  g.circle({ name: 'tint', r: AV / 2, fill: TINT[tint] });
  g.svg(art(animal), { name: 'animal', size: AV * 0.66, at: [0, AV * 0.04] });
  return g;
}

// ── 4. Build ─────────────────────────────────────────────────────────────────
function build(theme) {
  const T = THEMES[theme];
  const s = new Scene({ name: 'trip-invite', width: W, height: H, fps: FPS, frames: LOOP_END, loop: true });
  s.marker('intro', 0, INTRO_END).marker('loop', INTRO_END, LOOP_END);

  // trip card (rises in), everything else is parented to it
  const card = s.layer('card', { position: [CARD.c[0], CARD.c[1] + 14], opacity: 0, scale: CARD.s });
  card.position.to(24, CARD.c, ease.outSoft);
  card.opacity.to(18, 100, ease.outQuad);
  card.rect({ name: 'shadow-far', w: CARD.w - 8, h: CARD.h, r: CARD.r, at: [0, 8], fill: T.shadow, fillOpacity: T.shadowFar });
  card.rect({ name: 'shadow-near', w: CARD.w, h: CARD.h, r: CARD.r, at: [0, 2], fill: T.shadow, fillOpacity: T.shadowNear });
  card.rect({ name: 'body', w: CARD.w, h: CARD.h, r: CARD.r, fill: T.surface, stroke: T.line, strokeWidth: 1 });
  // cover tile with a small mountain mark
  const cover = card.group('cover', { position: [-128, -40] });
  cover.rect({ name: 'tile', w: 56, h: 56, r: 16, fill: T.cover });
  cover.path(Path.rounded([[-15, 11], [-4, -7], [7, 11]], 2.5, true), { name: 'peak-1', fill: T.brandInk });
  cover.path(Path.rounded([[0, 11], [8, -1], [16, 11]], 2.5, true), { name: 'peak-2', fill: T.brandInk, fillOpacity: 55 });
  cover.circle({ name: 'sun', r: 3.5, at: [9, -11], fill: T.brandInk, fillOpacity: 55 });
  card.rect({ name: 'title', x: -88, y: -55, w: 132, h: 10, r: 5, fill: T.ink2 });
  card.rect({ name: 'dates', x: -88, y: -34, w: 84, h: 7, r: 3.5, fill: T.lineStrong });
  card.path(Path.line([[-144, 4], [144, 4]]), { name: 'divider', stroke: T.line, strokeWidth: 1 });
  // invited slots (dashed) — each dissolves as its friend lands
  FRIENDS.forEach((f) => {
    const d = card.circle({ name: `invited-${f.i}`, r: AV / 2 - 1, at: f.slot, stroke: T.lineStrong, strokeWidth: 1.5, dash: [3, 3.6] });
    d.opacity.from(f.dock - 6, 100).to(f.dock + 4, 0, ease.outQuad);
  });
  // owner (koala) already in the trip
  const owner = avatar(card, 'koala', 'sky', T, 'owner');
  owner.position.set([slotX(0), SLOT_Y]);
  // Invite pill: pressed, then it launches the link
  const invite = card.group('invite', { position: INVITE.at });
  invite.rect({ name: 'pill', w: INVITE.w, h: INVITE.h, r: INVITE.h / 2, fill: T.brandSoft });
  linkGlyph(invite, [-26, 0], 15, T.brand);
  invite.rect({ name: 'label', w: 36, h: 6, r: 3, at: [10, 0], fill: T.brand });
  // press down, then spring back at speed (a release, so allow kink)
  invite.scale.from(T_PRESS - 4, [100, 100]).to(T_PRESS + 3, [94, 94], ease.cubic).to(T_PRESS + 18, [100, 100], ease.outSoft).allow('kink');

  // link chip: pops out of the Invite button, shows "copied", and stays (it balances the frame and keeps "one link" in view)
  const chip = s.layer('link-chip', { parent: card, position: INVITE.at, scale: 40, opacity: 0 });
  chip.rect({ name: 'shadow', w: CHIP.w, h: CHIP.h, r: CHIP.h / 2, at: [0, 3], fill: T.shadow, fillOpacity: T.shadowNear * 1.4 });
  chip.rect({ name: 'pill', w: CHIP.w, h: CHIP.h, r: CHIP.h / 2, fill: T.surface, stroke: T.line, strokeWidth: 1 });
  chip.circle({ name: 'icon-bg', r: 15, at: [-76, 0], fill: T.brandSoft });
  linkGlyph(chip, [-76, 0], 15, T.brand);
  chip.rect({ name: 'url', x: -52, y: -3, w: 92, h: 6, r: 3, fill: T.ink3 });
  const tick = chip.circle({ name: 'done', r: 11, at: [76, 0], fill: T.positive, scale: 0 });
  tick.scale.from(T_CHECK, [0, 0]).to(T_CHECK + 10, [100, 100], ease.outSoft).allow('kink'); // pops in as confirmation
  const check = chip.path(Path.line([[70.5, 0.5], [74.5, 4.5], [81.5, -3.5]]), { name: 'check', stroke: '#ffffff', strokeWidth: 2, trim: { start: 0, end: 0 } });
  check.trim.end.from(T_CHECK + 4, 0).to(T_CHECK + 16, 100, ease.inOut);
  // the chip pops out as a direct response to the press, so it leaves at speed (allow kink)
  chip.position.from(T_CHIP, INVITE.at).to(T_CHIP + 26, CHIP.at, ease.outSoft).allow('kink');
  chip.scale.from(T_CHIP, [40, 40]).to(T_CHIP + 22, [100, 100], ease.outSoft).allow('kink');
  chip.opacity.from(T_CHIP, 0).to(T_CHIP + 8, 100, ease.outQuad);
  chip.body({ group: 'pill' });

  // arriving friends (parented to the card so the card's pulse carries them)
  const flyers = FRIENDS.map((f) => {
    const L = s.layer(`friend-${f.animal}`, { parent: card, position: f.route.pointAt(0), scale: FLY_SCALE });
    const sh = L.circle({ name: 'shadow', r: AV / 2, at: [0, 9], fill: T.shadow, fillOpacity: T.flyShadow });
    avatar(L, f.animal, f.tint, T, 'avatar');
    const u = (fr) => flyEase(clamp((fr - f.start) / FLIGHT));
    L.position.bake(f.start, f.dock, (fr) => f.route.pointAt(u(fr)), { tol: 0.08 });
    L.scale.bake(f.start, f.dock + BUMP_LEN, (fr) => {
      const fly = FLY_SCALE - (FLY_SCALE - 100) * smoothstep(0.5, 1, u(fr));
      const v = fr <= f.dock ? fly : 100 + bump(fr - f.dock);
      return [v, v];
    }, { tol: 0.1 }).allow('kink'); // the landing bump is an impact response
    // airborne shadow: present while flying, gone once seated
    sh.opacity.from(f.dock - 14, 100).to(f.dock, 0, ease.inOut);
    L.body({ shape: 'circle', r: AV / 2 + RING, name: f.animal });
    f.layer = L;
    return L;
  });

  // full trip: the card answers with a soft confirm pulse
  const S = CARD.s, P = CARD.s * 1.015;
  card.scale.from(T_PULSE, [S, S]).to(T_PULSE + 10, [P, P], ease.outQuad).to(T_PULSE + 40, [S, S], ease.inOut).allow('kink');

  // idle loop: a hello wave along the stack (koala first), once per loop
  const hop = (prop, t0, base) => prop.from(t0, base).to(t0 + 8, [base[0], base[1] - 4], ease.cubic).to(t0 + 22, base, ease.cubic);
  hop(owner.position, WAVE, [slotX(0), SLOT_Y]);
  FRIENDS.forEach((f, k) => hop(f.layer.position, WAVE + 5 * (k + 1), f.slot));

  // ── 5. Analysis rules ──
  const adjacent = FRIENDS.slice(1).map((f, k) => [FRIENDS[k].layer, f.layer]);
  s.noOverlap(flyers, { clearance: 4, ignore: adjacent }); // seated neighbours overlap by design (stack)
  s.noOverlap([...flyers, chip], { clearance: 8, name: 'flights vs chip', ignore: [...adjacent, ...flyers.flatMap((a) => flyers.map((b) => [a, b]))] });
  s.keepInside([card, chip], { padding: 24 });
  s.meta = { concept: 'Share one link and everyone is in', theme };
  return s;
}

for (const theme of ['light', 'dark']) {
  const s = build(theme);
  const stats = s.save(path.join(OUT, `${theme}.json`));
  console.log(`${theme}: ${(stats.bytes / 1024).toFixed(1)}KB · ${stats.layers} layers · ${stats.keyframes} keyframes`);
  if (theme === 'light') s.analyze().print();
}
