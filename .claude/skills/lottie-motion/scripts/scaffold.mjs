#!/usr/bin/env node
// scaffold.mjs — package built Lottie JSON into a self-contained, drop-in component folder.
//
//   node scaffold.mjs --name PacketRouting --dest components/motion --from <build-out-dir> \
//        --label "Requests from many sources routed into one core" [--decorative] \
//        [--framework react|web] [--source path/to/build.mjs] [--poster 120] \
//        [--description "..."] [--bg-light #fafaf9] [--bg-dark #0c0c0b]
//
// Produces <dest>/<Name>/
//   react: index.tsx (typed wrapper) · LottieMotion.tsx (player) · light.json · dark.json
//   web:   lottie-motion.js (custom element) · light.json · dark.json · usage snippet in README
//   both:  README.md (usage, props, rebuild) · preview.html (standalone review page) · source/build.mjs
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

const out = path.join(dest, name);
const MANAGED = new Set(['index.tsx', 'LottieMotion.tsx', 'lottie-motion.js', 'light.json', 'dark.json', 'README.md', 'preview.html', 'source']);
if (fs.existsSync(out) && !flag('force')) {
  const foreign = fs.readdirSync(out).filter((f) => !MANAGED.has(f));
  if (foreign.length) { console.error(`${out} contains files not created by the scaffolder (${foreign.join(', ')}). Use --force to proceed.`); process.exit(1); }
}
fs.mkdirSync(out, { recursive: true });
const write = (f, s) => { fs.writeFileSync(path.join(out, f), s); written.push(path.join(out, f)); };
const written = [];
const fill = (s, map) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in map ? map[k] : `{{${k}}}`));

write('light.json', JSON.stringify(light));
if (dark) write('dark.json', JSON.stringify(dark));
else if (fs.existsSync(path.join(out, 'dark.json'))) fs.rmSync(path.join(out, 'dark.json'));

const loopNote = light.markers?.some((m) => m.cm === 'loop') ? ' (intro + loop)' : '';
if (framework === 'react') {
  fs.copyFileSync(path.join(TPL, 'react', 'LottieMotion.tsx'), path.join(out, 'LottieMotion.tsx')); written.push(path.join(out, 'LottieMotion.tsx'));
  write('index.tsx', fill(fs.readFileSync(path.join(TPL, 'react', 'Component.tsx.tmpl'), 'utf8'), {
    NAME: name, W, H, SECONDS: seconds, LOOP_NOTE: loopNote, POSTER: poster,
    DESCRIPTION: description.replace(/\*\//g, ''),
    DARK_LOADER: dark ? "const dark = () => import('./dark.json');" : '',
    DARK_PROP: dark ? '\n      dark={dark}' : '',
    LABEL_PROP: label ? `\n      label=${JSON.stringify(label)}` : '',
  }).replace(/\n\n\n/g, '\n\n'));
} else if (framework === 'web') {
  fs.copyFileSync(path.join(TPL, 'web', 'lottie-motion.js'), path.join(out, 'lottie-motion.js')); written.push(path.join(out, 'lottie-motion.js'));
} else { console.error('--framework must be react or web'); process.exit(1); }

const variants = [{ name: 'light', bg: opt('bg-light', '#fafaf9'), data: light }];
if (dark) variants.push({ name: 'dark', bg: opt('bg-dark', '#0c0c0b'), data: dark });
write('preview.html', fill(fs.readFileSync(path.join(TPL, 'preview.html.tmpl'), 'utf8'), {
  NAME: name, DESCRIPTION: description, W, H, FPS, FRAMES: FRAMES - 1, VARIANTS_JSON: JSON.stringify(variants),
}));

const src = opt('source');
if (src) {
  fs.mkdirSync(path.join(out, 'source'), { recursive: true });
  // re-point the kit import so the copied script still resolves it from its new location
  let rel = path.relative(path.join(out, 'source'), path.join(HERE, 'lottie-kit.mjs')).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  const code = fs.readFileSync(src, 'utf8').replace(/(['"])[^'"]*lottie-kit\.mjs\1/g, `'${rel}'`);
  write(path.join('source', 'build.mjs'), code);
}

const kb = (o) => (JSON.stringify(o).length / 1024).toFixed(1);
const usage = framework === 'react'
  ? `\`\`\`tsx\nimport ${name} from '${'@/' + path.relative(process.cwd(), out).replace(/\\/g, '/')}';\n\n<${name} className="max-w-[${W}px]" />\n\`\`\``
  : `\`\`\`html\n<script type="module" src="./${name}/lottie-motion.js"></script>\n<lottie-motion light="./${name}/light.json"${dark ? ` dark="./${name}/dark.json"` : ''} ratio="${W}/${H}"${label ? ` label="${label}"` : ''} poster="${poster}"></lottie-motion>\n\`\`\``;
write('README.md', `# ${name}

${description}

- Composition: ${W}×${H} @ ${FPS}fps · ${seconds}s${loopNote}${light.markers?.length ? '' : ' · seamless loop'}
- Files: light.json (${kb(light)}KB)${dark ? ` · dark.json (${kb(dark)}KB)` : ''} — only the active theme is downloaded
- Accessibility: ${label ? `role="img", aria-label="${label}"` : 'decorative (aria-hidden)'} · reduced motion shows frame ${poster}
- Requires: \`lottie-web\` (uses the light SVG build, ~60KB gz, lazy-loaded)

## Usage

${usage}

${framework === 'react' ? `### Props
| prop | default | |
|---|---|---|
| \`theme\` | \`'auto'\` | \`'auto'\` follows \`html.dark\` / \`[data-theme]\` / OS; or force \`'light'\` / \`'dark'\` |
| \`trigger\` | \`'inView'\` | \`'inView'\` plays while ≥20% visible · \`'hover'\` · \`'once'\` |
| \`loop\` | \`true\` | |
| \`speed\` | \`1\` | |
| \`posterFrame\` | \`${poster}\` | frame shown for reduced motion / before play |
| \`label\` | ${label ? `"${label}"` : '—'} | accessible description; omit for decorative |
| \`className\`, \`style\` | | the component fills its parent's width and keeps a ${W}:${H} ratio |
` : ''}
## Rebuild

${src ? `The animation is generated by \`source/build.mjs\` (lottie-motion kit). Edit tokens/timing there, then:

\`\`\`bash
node source/build.mjs /tmp/${name}   # writes light.json / dark.json + prints the motion analysis
\`\`\`
and re-run the scaffolder (or copy the JSON files here).` : 'Re-generate the JSON with the lottie-motion skill and replace light.json / dark.json.'}

Open \`preview.html\` directly in a browser to scrub frames, check both themes and small sizes.
`);

// dependency hint
let pkgDir = path.resolve(dest);
while (pkgDir !== path.dirname(pkgDir) && !fs.existsSync(path.join(pkgDir, 'package.json'))) pkgDir = path.dirname(pkgDir);
let needsDep = false;
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  needsDep = !({ ...pkg.dependencies, ...pkg.devDependencies })['lottie-web'];
} catch {}
console.log(JSON.stringify({ component: out, files: written, sizeKB: { light: +kb(light), dark: dark ? +kb(dark) : null }, needsDependency: needsDep ? 'lottie-web (install with the project\'s package manager)' : null }, null, 2));
