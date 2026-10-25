#!/usr/bin/env node
// selftest.mjs — exercises every kit feature, renders a frame, and checks the toolchain end to end.
//   node selftest.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { Scene, Path, lerpPath, ease, spring, stagger, durationFor, rng, mix, contrast } from './lottie-kit.mjs';

const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'lottie-selftest-'));
const s = new Scene({ name: 'selftest', width: 480, height: 320, duration: 4, loop: false }); // a feature tour, not a loop
const R = rng(7);

// stagger + spring cards
const offs = stagger(4, { each: 5, ease: ease.out });
offs.forEach((o, i) => {
  const L = s.layer(`card${i}`, { position: [90 + i * 100, 80], opacity: 0 });
  L.rect({ name: 'box', w: 72, h: 48, r: 10, fill: '#ffffff', stroke: '#e4e4e7', strokeWidth: 1 });
  L.opacity.from(10 + o, 0).to(24 + o, 100, ease.outQuad).hold(200).to(230, 0, ease.in);
  L.position.spring(10 + o, [90 + i * 100, 110], [90 + i * 100, 80 + R.jitter(0, 0)], { stiffness: 220, damping: 20 });
  L.body({ group: 'box' });
});
s.noOverlap(['card0', 'card1', 'card2', 'card3'].map((n) => s.layers.find((l) => l.name === n)), { clearance: 8 });

// moveAlong with orient on a smooth path + trim drawn line + morph
const curve = Path.smooth([[40, 260], [160, 200], [300, 270], [440, 210]]);
if (curve.kinks().length) throw new Error('smooth path has kinks');
const line = s.layer('line');
const drawn = line.path(curve, { stroke: '#a1a1aa', strokeWidth: 1.5, trim: { start: 0, end: 0 } });
drawn.trim.end.from(0, 0).to(90, 100, ease.inOut);
drawn.trim.start.from(200, 0).to(240, 100, ease.inOut);
const dot = s.layer('dot', { position: [40, 260] });
dot.rect({ w: 12, h: 6, r: 3, fill: '#ff5a1f' });
dot.moveAlong(curve, 0, 90, { ease: ease.inOut, orient: true });
dot.opacity.from(90, 100).to(110, 0, ease.outSoft);

// morph: 8-vertex circle → 8-vertex rounded square (equal vertex counts), baked
const circ8 = Path.smooth([...Array(8).keys()].map((i) => [400 + 18 * Math.cos(i * Math.PI / 4 + Math.PI / 8), 80 + 18 * Math.sin(i * Math.PI / 4 + Math.PI / 8)]), { closed: true });
const sq8 = Path.rounded([[382, 62], [418, 62], [418, 98], [382, 98]], 8, true);
if (sq8.vertices.length !== 8) throw new Error('expected 8 vertices');
const morph = s.layer('morph').path(circ8, { fill: '#18181b' });
morph.geo.shape.bake(120, 150, (f) => lerpPath(circ8, sq8, ease.inOut.at((f - 120) / 30)), { tol: 0.2 });

// matte + linear gradient + markers
const reveal = s.layer('reveal-matte', { position: [240, 160] });
reveal.rect({ w: 10, h: 40, fill: '#000' }).geo.size.from(100, [10, 40]).to(160, [200, 40], ease.inOut);
const panel = s.layer('panel', { position: [240, 160] });
panel.rect({ w: 200, h: 40, r: 8, gradient: { from: [-100, 0], to: [100, 0], stops: [[0, '#ff5a1f', 1], [1, mix('#ff5a1f', '#ffffff', 0.6), 1]] } });
panel.matteWith(reveal, 'alpha');
s.marker('intro', 0, 60).marker('loop', 60, 240);

const sp = spring({ stiffness: 170, damping: 18 });
const file = path.join(OUT, 'selftest.json');
const stats = s.save(file);
const r = s.analyze();
const ok = [
  ['spring settles', sp.duration > 0.3 && sp.duration < 2 && sp.zeta < 1],
  ['durationFor monotonic', durationFor(50) < durationFor(400)],
  ['contrast', contrast('#000', '#fff') > 20],
  ['json written', stats.bytes > 1000],
  ['matte exported', JSON.parse(fs.readFileSync(file, 'utf8')).layers.some((l) => l.td === 1)],
];
execFileSync('node', [path.join(import.meta.dirname, 'validate.mjs'), file], { stdio: 'inherit' });
const render = JSON.parse(execFileSync('node', [path.join(import.meta.dirname, 'render.mjs'), file, '--sheet', '6', '--onion', '0', '--no-motion'], { encoding: 'utf8' }));
ok.push(['render', render.files.length === 1 && fs.existsSync(render.files[0])]);
r.print();
ok.forEach(([n, v]) => console.log(`${v ? '✓' : '✖'} ${n}`));
console.log(`sheet: ${render.files[0]}`);
process.exit(ok.every(([, v]) => v) ? 0 : 1);
