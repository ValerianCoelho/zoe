#!/usr/bin/env node
// scaffold.mjs — package built Lottie JSON into a drop-in component folder.
//
//   node scaffold.mjs --name PacketRouting --dest components/motion --from <build-out-dir> \
//        --label "Requests from many sources routed into one core" [--decorative] \
//        [--framework react|web] [--source path/to/build.mjs] [--poster 120] \
//        [--description "..."] [--player path/to/LottieMotion.tsx]
//
// Produces <dest>/<Name>/
//   react: index.tsx (typed wrapper) · light.json · dark.json · source/build.mjs
//   web:   light.json · dark.json · source/build.mjs (usage snippet is printed)
//
// The player (LottieMotion.tsx for react, lottie-motion.js for web) is SHARED by all animations:
// the scaffolder reuses the nearest existing one found in <dest> or any parent folder up to the
// package root, and only creates <dest>/<player> from the template if none exists. --player overrides.
//
// Never overwrites a folder that has files the scaffolder didn't create unless --force is given.

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
const flag = (n) => args.includes(`--${n}`);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const TPL = path.join(HERE, '..', 'templates');

const name = opt('name');
const dest = opt('dest');
const from = opt('from');
if (!name || !dest || !from) { console.error('usage: node scaffold.mjs --name PascalName --dest <dir> --from <dir with light.json [dark.json]> [--label "..."|--decorative]'); process.exit(1); }
if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) { console.error('--name must be PascalCase'); process.exit(1); }
const framework = opt('framework', 'react');
if (!['react', 'web'].includes(framework)) { console.error('--framework must be react or web'); process.exit(1); }
const label = flag('decorative') ? null : opt('label');
if (!label && !flag('decorative')) { console.error('Pass --label "<what the animation shows>" (accessibility) or --decorative'); process.exit(1); }

const lightPath = path.join(from, 'light.json'), darkPath = path.join(from, 'dark.json');
if (!fs.existsSync(lightPath)) { console.error(`missing ${lightPath}`); process.exit(1); }
const light = JSON.parse(fs.readFileSync(lightPath, 'utf8'));
const dark = fs.existsSync(darkPath) ? JSON.parse(fs.readFileSync(darkPath, 'utf8')) : null;
const W = light.w, H = light.h, FPS = light.fr, FRAMES = light.op - light.ip;
const seconds = +(FRAMES / FPS).toFixed(2);
const description = opt('description', light.meta?.concept || label || name);
const poster = +opt('poster', Math.round(FRAMES * 0.4));

// package root (for the player search boundary and the dependency hint)
let pkgDir = path.resolve(dest);
while (pkgDir !== path.dirname(pkgDir) && !fs.existsSync(path.join(pkgDir, 'package.json'))) pkgDir = path.dirname(pkgDir);
if (!fs.existsSync(path.join(pkgDir, 'package.json'))) pkgDir = path.resolve(dest);

const out = path.join(dest, name);
// files from older scaffolder versions are listed so re-scaffolding cleans them up
const LEGACY = ['LottieMotion.tsx', 'lottie-motion.js', 'README.md', 'preview.html'];
const MANAGED = new Set(['index.tsx', 'light.json', 'dark.json', 'source', ...LEGACY]);
if (fs.existsSync(out) && !flag('force')) {
  const foreign = fs.readdirSync(out).filter((f) => !MANAGED.has(f));
  if (foreign.length) { console.error(`${out} contains files not created by the scaffolder (${foreign.join(', ')}). Use --force to proceed.`); process.exit(1); }
}
fs.mkdirSync(out, { recursive: true });
const written = [];
const write = (f, s) => { fs.writeFileSync(path.join(out, f), s); written.push(path.join(out, f)); };
const fill = (s, map) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in map ? map[k] : `{{${k}}}`));
for (const f of LEGACY) if (fs.existsSync(path.join(out, f))) fs.rmSync(path.join(out, f));

// ── shared player ──
const playerFile = framework === 'react' ? 'LottieMotion.tsx' : 'lottie-motion.js';
let player = opt('player');
if (!player) {
  for (let d = path.resolve(dest); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, playerFile))) { player = path.join(d, playerFile); break; }
    if (d === pkgDir || d === path.dirname(d)) break;
  }
}
player = path.resolve(player || path.join(dest, playerFile));
let playerCreated = false;
if (!fs.existsSync(player)) {
  fs.mkdirSync(path.dirname(player), { recursive: true });
  fs.copyFileSync(path.join(TPL, framework === 'react' ? 'react' : 'web', playerFile), player);
  playerCreated = true;
}
const relFrom = (dir, file) => { let r = path.relative(dir, file).replace(/\\/g, '/'); return r.startsWith('.') ? r : './' + r; };

// ── animation data ──
write('light.json', JSON.stringify(light));
if (dark) write('dark.json', JSON.stringify(dark));
else if (fs.existsSync(path.join(out, 'dark.json'))) fs.rmSync(path.join(out, 'dark.json'));

const loopNote = light.markers?.some((m) => m.cm === 'loop') ? ' (intro + loop)' : '';
let usage;
if (framework === 'react') {
  write('index.tsx', fill(fs.readFileSync(path.join(TPL, 'react', 'Component.tsx.tmpl'), 'utf8'), {
    NAME: name, W, H, SECONDS: seconds, LOOP_NOTE: loopNote, POSTER: poster,
    PLAYER_IMPORT: relFrom(path.resolve(out), player).replace(/\.tsx$/, ''),
    DESCRIPTION: description.replace(/\*\//g, ''),
    DARK_LOADER: dark ? "const dark = () => import('./dark.json');" : '',
    DARK_PROP: dark ? '\n      dark={dark}' : '',
    LABEL_PROP: label ? `\n      label=${JSON.stringify(label)}` : '',
  }).replace(/\n\n\n/g, '\n\n'));
  usage = `import ${name} from '@/${path.relative(pkgDir, path.resolve(out)).replace(/\\/g, '/')}';  <${name} />`;
} else {
  const rel = (f) => relFrom(pkgDir, f);
  usage = `<script type="module" src="${rel(player)}"></script> <lottie-motion light="${rel(path.join(out, 'light.json'))}"${dark ? ` dark="${rel(path.join(out, 'dark.json'))}"` : ''} ratio="${W}/${H}"${label ? ` label="${label}"` : ''} poster="${poster}"></lottie-motion>`;
}

// ── build source (kept so the animation can be edited and regenerated) ──
const src = opt('source');
if (src) {
  fs.mkdirSync(path.join(out, 'source'), { recursive: true });
  // re-point the kit import so the copied script still resolves it from its new location
  const rel = relFrom(path.join(out, 'source'), path.join(HERE, 'lottie-kit.mjs'));
  const code = fs.readFileSync(src, 'utf8').replace(/(['"])[^'"]*lottie-kit\.mjs\1/g, `'${rel}'`);
  write(path.join('source', 'build.mjs'), code);
}

// dependency hint
let needsDep = false;
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  needsDep = !({ ...pkg.dependencies, ...pkg.devDependencies })['lottie-web'];
} catch {}
const kb = (o) => +(JSON.stringify(o).length / 1024).toFixed(1);
console.log(JSON.stringify({
  component: out, files: written, player: { path: player, created: playerCreated }, usage,
  composition: { w: W, h: H, fps: FPS, seconds, poster }, sizeKB: { light: kb(light), dark: dark ? kb(dark) : null },
  needsDependency: needsDep ? "lottie-web (install with the project's package manager)" : null,
}, null, 2));
