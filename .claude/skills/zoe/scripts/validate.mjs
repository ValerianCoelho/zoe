#!/usr/bin/env node
// validate.mjs — structural + portability lint for any Lottie JSON.
//   node validate.mjs <anim.json> [more.json …]
// Exit code 1 if any error.

import fs from 'node:fs';

let failed = false;
for (const file of process.argv.slice(2)) {
  const raw = fs.readFileSync(file, 'utf8');
  const j = JSON.parse(raw);
  const out = [];
  const E = (m) => out.push(['✖', m]), W = (m) => out.push(['▲', m]), I = (m) => out.push(['·', m]);

  for (const k of ['v', 'fr', 'ip', 'op', 'w', 'h', 'layers']) if (j[k] === undefined) E(`missing root field "${k}"`);
  if (![24, 25, 30, 48, 50, 60].includes(j.fr)) W(`unusual frame rate ${j.fr}`);
  if (j.fr < 50) I(`${j.fr}fps — 60fps is smoother for UI motion on modern displays (lottie-web interpolates sub-frames, but baked/hold keys snap per frame)`);

  const kb = raw.length / 1024;
  if (kb > 500) E(`file is ${kb.toFixed(0)}KB — too heavy for a section animation (aim < 120KB)`);
  else if (kb > 150) W(`file is ${kb.toFixed(0)}KB (aim < 120KB; reduce bake tolerance / frame count / duplicated layers)`);
  else I(`file size ${kb.toFixed(1)}KB`);

  const inds = new Set(j.layers.map((l) => l.ind));
  let keyframes = 0, expressions = 0, effects = 0, merges = 0, longFloats = 0, shapeLayers = 0;
  const walk = (o, ctx) => {
    if (Array.isArray(o)) return o.forEach((x) => walk(x, ctx));
    if (!o || typeof o !== 'object') { if (typeof o === 'number' && /\.\d{5,}/.test(String(o))) longFloats++; return; }
    if (typeof o.x === 'string') expressions++;
    if (o.ty === 'mm') merges++;
    if (o.a === 1 && Array.isArray(o.k)) {
      keyframes += o.k.length;
      const ts = o.k.map((k) => k.t);
      if (ts.some((t, i) => i && t <= ts[i - 1])) E(`${ctx}: keyframe times not strictly increasing`);
      if (ts.some((t) => t > j.op + 1)) W(`${ctx}: keyframes beyond op (${j.op}) are never shown`);
      const shapes = o.k.filter((k) => k.s && k.s[0] && k.s[0].v);
      if (shapes.length > 1) { const n = shapes[0].s[0].v.length; if (shapes.some((k) => k.s[0].v.length !== n)) E(`${ctx}: path morph keyframes have different vertex counts`); }
    }
    for (const [k, v] of Object.entries(o)) walk(v, ctx);
  };
  j.layers.forEach((l, i) => {
    const ctx = `layer "${l.nm}"`;
    if (l.ty === 4) shapeLayers++;
    if (l.ty === 5) W(`${ctx}: text layer — needs fonts; prefer shapes or HTML overlay`);
    if (l.ty === 2) W(`${ctx}: image layer — raster in a vector animation; blurs when scaled`);
    if (l.ddd === 1) W(`${ctx}: 3D layer — limited support across players`);
    if (l.ef?.length) effects += l.ef.length;
    if (l.parent !== undefined && !inds.has(l.parent)) E(`${ctx}: parent ${l.parent} does not exist`);
    if (l.tt && !(j.layers[i - 1]?.td || l.tp)) E(`${ctx}: track matte target without a matte source directly above it`);
    walk(l.ks, ctx); walk(l.shapes, ctx);
  });
  if (expressions) E(`${expressions} expression(s) — not supported by lottie_light / dotLottie / mobile players`);
  if (effects) W(`${effects} layer effect(s) — poorly supported outside lottie-web svg`);
  if (merges) W(`${merges} merge-path(s) — not supported by lottie-web`);
  if (longFloats > 200) I(`${longFloats} numbers with ≥5 decimals — round to shrink the file`);
  I(`${j.layers.length} layers (${shapeLayers} shape) · ${keyframes} keyframes · ${j.op - j.ip} frames @ ${j.fr}fps = ${((j.op - j.ip) / j.fr).toFixed(2)}s · ${j.w}×${j.h}`);
  if (j.markers?.length) I(`markers: ${j.markers.map((m) => `${m.cm}[${m.tm}→${m.tm + (m.dr || 0)}]`).join(', ')}`);

  console.log(`\n${file}`);
  out.forEach(([s, m]) => console.log(` ${s} ${m}`));
  if (out.some(([s]) => s === '✖')) failed = true;
}
process.exit(failed ? 1 : 0);
