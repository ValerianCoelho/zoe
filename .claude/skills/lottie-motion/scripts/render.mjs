#!/usr/bin/env node
// render.mjs — render a Lottie JSON with the real lottie-web player (headless Chrome)
// and produce review artefacts you can LOOK at with the Read tool.
//
//   node render.mjs <anim.json> [options]
//
//   --out <dir>          output directory (default: <json dir>/_review/<json name>)
//   --bg <color>         backdrop colour (default #ffffff). Use the real page bg of the target section.
//   --sheet <n>          contact sheet with n evenly spaced frames (default 12, 0 = skip)
//   --onion <n>          onion-skin overlay of n frames → motion trails (default 30, 0 = skip)
//   --strip <a-b>        consecutive frames a..b in one image (frame-by-frame inspection of a moment)
//   --frames <list>      individual PNGs, e.g. 0,45,90 (combine with --scale 2 / --crop)
//   --crop <x,y,w,h>     crop (in composition px) applied to --frames and --strip
//   --scale <s>          render scale for --frames/--strip (default 2)
//   --no-motion          skip the pixel-diff motion analysis
//   --renderer <svg|canvas>  (default svg — what the production component uses)
//   --video              also write preview.mp4 if ffmpeg is installed
//
// Prints a JSON summary (files written + motion analysis) to stdout.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith('--')) { console.error('usage: node render.mjs <anim.json> [--out dir] [--bg #fff] [--sheet 12] [--onion 30] [--strip a-b] [--frames 0,30] [--crop x,y,w,h] [--scale 2] [--video]'); process.exit(1); }
const file = path.resolve(args[0]);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i < 0 ? def : args[i + 1]; };
const flag = (name) => args.includes(`--${name}`);

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const outDir = path.resolve(opt('out', path.join(path.dirname(file), '_review', path.basename(file, '.json'))));
fs.mkdirSync(outDir, { recursive: true });
const cfg = {
  bg: opt('bg', '#ffffff'),
  sheet: +opt('sheet', 12),
  onion: +opt('onion', 30),
  strip: opt('strip', null),
  frames: opt('frames', null),
  crop: opt('crop', null),
  scale: +opt('scale', 2),
  motion: !flag('no-motion'),
  renderer: opt('renderer', 'svg'),
  video: flag('video'),
};

let puppeteer;
try { puppeteer = (await import('puppeteer')).default; } catch { console.error('puppeteer missing — run: npm install --prefix "' + path.dirname(new URL(import.meta.url).pathname) + '"'); process.exit(1); }

async function launch() {
  try { return await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--force-device-scale-factor=1'] }); }
  catch (e) {
    const candidates = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
    const exe = candidates.find((c) => fs.existsSync(c));
    if (!exe) throw e;
    return puppeteer.launch({ headless: true, executablePath: exe, args: ['--no-sandbox'] });
  }
}

const browser = await launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[page error]', e.message));
await page.setContent('<!doctype html><html><body style="margin:0"><div id="c"></div></body></html>');
await page.addScriptTag({ path: require.resolve('lottie-web/build/player/lottie.min.js') });

const W = data.w, H = data.h, F = data.op - data.ip, FPS = data.fr;
const written = [];
const save = (name, dataUrl) => { const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(dataUrl.split(',')[1], 'base64')); written.push(p); return p; };

// In-page renderer: draws any frame into a canvas at a given scale.
await page.evaluate(async (data, renderer) => {
  const c = document.getElementById('c');
  c.style.width = data.w + 'px'; c.style.height = data.h + 'px';
  window.anim = lottie.loadAnimation({ container: c, renderer, loop: false, autoplay: false, animationData: data, rendererSettings: { preserveAspectRatio: 'xMidYMid meet', clearCanvas: true } });
  await new Promise((r) => (window.anim.isLoaded ? r() : window.anim.addEventListener('DOMLoaded', r)));
  window.drawFrame = async (f, ctx, dx, dy, dw, dh, crop) => {
    window.anim.goToAndStop(f, true);
    const sx = crop ? crop[0] : 0, sy = crop ? crop[1] : 0, sw = crop ? crop[2] : data.w, sh = crop ? crop[3] : data.h;
    if (renderer === 'canvas') {
      const cv = c.querySelector('canvas');
      const k = cv.width / data.w;
      ctx.drawImage(cv, sx * k, sy * k, sw * k, sh * k, dx, dy, dw, dh);
      return;
    }
    const svg = c.querySelector('svg').cloneNode(true);
    const scale = dw / sw;
    svg.setAttribute('width', data.w * scale); svg.setAttribute('height', data.h * scale);
    svg.style.width = ''; svg.style.height = '';
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    await img.decode();
    ctx.drawImage(img, sx * scale, sy * scale, sw * scale, sh * scale, dx, dy, dw, dh);
  };
  window.mk = (w, h) => { const cv = document.createElement('canvas'); cv.width = Math.round(w); cv.height = Math.round(h); return cv; };
}, data, cfg.renderer);

// ── contact sheet ──
if (cfg.sheet > 0) {
  const url = await page.evaluate(async (n, F, FPS, W, H, bg) => {
    const cols = n <= 4 ? n : n <= 9 ? 3 : 4, rows = Math.ceil(n / cols);
    const cw = Math.min(480, W), ch = (cw * H) / W, gap = 12, lab = 22;
    const cv = mk(cols * cw + (cols + 1) * gap, rows * (ch + lab) + (rows + 1) * gap), ctx = cv.getContext('2d');
    ctx.fillStyle = '#8a8a8a'; ctx.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < n; i++) {
      const f = Math.round((i * F) / n), x = gap + (i % cols) * (cw + gap), y = gap + Math.floor(i / cols) * (ch + lab + gap);
      ctx.fillStyle = bg; ctx.fillRect(x, y, cw, ch);
      await drawFrame(f, ctx, x, y, cw, ch);
      ctx.fillStyle = '#111'; ctx.fillRect(x, y + ch, cw, lab);
      ctx.fillStyle = '#fff'; ctx.font = '12px ui-monospace, Menlo, monospace'; ctx.fillText(`f${f}  ·  ${(f / FPS).toFixed(2)}s`, x + 8, y + ch + 15);
    }
    return cv.toDataURL('image/png');
  }, cfg.sheet, F, FPS, W, H, cfg.bg);
  save('sheet.png', url);
}

// ── onion skin ──
if (cfg.onion > 0) {
  const url = await page.evaluate(async (n, F, W, H, bg) => {
    const k = Math.min(1, 1200 / W), cv = mk(W * k, H * k), ctx = cv.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);
    const tmp = mk(cv.width, cv.height), t = tmp.getContext('2d');
    for (let i = 0; i < n; i++) {
      t.clearRect(0, 0, tmp.width, tmp.height);
      await drawFrame(Math.round((i * F) / n), t, 0, 0, tmp.width, tmp.height);
      ctx.globalAlpha = Math.min(1, 2.2 / n); ctx.drawImage(tmp, 0, 0);
    }
    ctx.globalAlpha = 1;
    return cv.toDataURL('image/png');
  }, cfg.onion, F, W, H, cfg.bg);
  save('onion.png', url);
}

const crop = cfg.crop ? cfg.crop.split(',').map(Number) : null;

// ── strip of consecutive frames ──
if (cfg.strip) {
  const [a, b] = cfg.strip.split('-').map(Number);
  const url = await page.evaluate(async (a, b, W, H, bg, crop, scale) => {
    const sw = crop ? crop[2] : W, sh = crop ? crop[3] : H;
    const n = b - a + 1, cols = Math.min(n, Math.max(1, Math.floor(1800 / (sw * scale)))), rows = Math.ceil(n / cols);
    const cw = sw * scale, ch = sh * scale, gap = 8, lab = 18;
    const cv = mk(cols * cw + (cols + 1) * gap, rows * (ch + lab) + (rows + 1) * gap), ctx = cv.getContext('2d');
    ctx.fillStyle = '#8a8a8a'; ctx.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < n; i++) {
      const x = gap + (i % cols) * (cw + gap), y = gap + Math.floor(i / cols) * (ch + lab + gap);
      ctx.fillStyle = bg; ctx.fillRect(x, y, cw, ch);
      await drawFrame(a + i, ctx, x, y, cw, ch, crop);
      ctx.fillStyle = '#111'; ctx.fillRect(x, y + ch, cw, lab); ctx.fillStyle = '#fff'; ctx.font = '11px ui-monospace, Menlo, monospace'; ctx.fillText(`f${a + i}`, x + 6, y + ch + 13);
    }
    return cv.toDataURL('image/png');
  }, a, b, W, H, cfg.bg, crop, cfg.scale);
  save(`strip_${a}-${b}.png`, url);
}

// ── individual frames ──
if (cfg.frames) {
  for (const f of cfg.frames.split(',').map(Number)) {
    const url = await page.evaluate(async (f, W, H, bg, crop, scale) => {
      const sw = crop ? crop[2] : W, sh = crop ? crop[3] : H, cv = mk(sw * scale, sh * scale), ctx = cv.getContext('2d');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);
      await drawFrame(f, ctx, 0, 0, cv.width, cv.height, crop);
      return cv.toDataURL('image/png');
    }, f, W, H, cfg.bg, crop, cfg.scale);
    save(`frame_${String(f).padStart(4, '0')}${crop ? '_crop' : ''}.png`, url);
  }
}

// ── pixel-diff motion analysis (renderer-truth, independent of how the JSON was made) ──
let motion = null;
if (cfg.motion) {
  motion = await page.evaluate(async (F, W, H, bg) => {
    const k = Math.min(1, 400 / W), cv = mk(W * k, H * k), ctx = cv.getContext('2d', { willReadFrequently: true });
    const grab = async (f) => { ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height); await drawFrame(f, ctx, 0, 0, cv.width, cv.height); return ctx.getImageData(0, 0, cv.width, cv.height).data; };
    const diff = (a, b) => { let s = 0, changed = 0; for (let i = 0; i < a.length; i += 4) { const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); s += d; if (d > 24) changed++; } return { mean: s / (a.length / 4) / 3, changed: changed / (a.length / 4) }; };
    const first = await grab(0); let prev = first; const d = [];
    for (let f = 1; f < F; f++) { const cur = await grab(f); d.push({ f, ...diff(prev, cur) }); prev = cur; }
    const seam = diff(prev, first);
    return { diffs: d, seam };
  }, F, W, H, cfg.bg);
  const means = motion.diffs.map((d) => d.mean);
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0; };
  const spikes = [];
  motion.diffs.forEach((d, i) => {
    const win = means.slice(Math.max(0, i - 6), i).concat(means.slice(i + 1, i + 7));
    const m = median(win);
    if (d.mean > 0.6 && d.mean > Math.max(0.15, m) * 3.5) spikes.push({ frame: d.f, change: +d.mean.toFixed(3), neighbourMedian: +m.toFixed(3) });
  });
  const moving = means.map((m) => m > 0.02);
  let longestStill = 0, run = 0; moving.forEach((mv) => { run = mv ? 0 : run + 1; longestStill = Math.max(longestStill, run); });
  const p90 = [...means].sort((a, b) => a - b)[Math.floor(means.length * 0.9)] || 0;
  const seamRatio = motion.seam.mean / Math.max(0.05, median(means.filter((m) => m > 0.02)) || 0.05);
  motion = {
    spikes: spikes.slice(0, 20),
    loopSeam: { change: +motion.seam.mean.toFixed(3), ratioToTypicalFrame: +seamRatio.toFixed(2), verdict: !data.markers?.length && seamRatio > 2.5 && motion.seam.mean > 0.3 ? 'POP at loop restart' : 'ok' },
    stillness: { framesMoving: moving.filter(Boolean).length, framesTotal: moving.length, longestStillRunFrames: longestStill, longestStillRunSec: +(longestStill / FPS).toFixed(2) },
    activity: { p90FrameChange: +p90.toFixed(3) },
    curve: sparkline(means, 72),
  };
}

function sparkline(vals, w) {
  const ch = '▁▂▃▄▅▆▇█', out = [], max = Math.max(...vals, 1e-6);
  for (let i = 0; i < w; i++) {
    const a = Math.floor((i * vals.length) / w), b = Math.max(a + 1, Math.floor(((i + 1) * vals.length) / w));
    const v = Math.max(...vals.slice(a, b));
    out.push(v < 0.02 ? ' ' : ch[Math.min(7, Math.floor((v / max) * 7.999))]);
  }
  return out.join('');
}

// ── optional video ──
if (cfg.video) {
  let ff = null; try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); ff = 'ffmpeg'; } catch {}
  if (!ff) console.error('ffmpeg not found; skipping --video');
  else {
    const fdir = path.join(outDir, '_frames'); fs.mkdirSync(fdir, { recursive: true });
    for (let f = 0; f < F; f++) {
      const url = await page.evaluate(async (f, W, H, bg) => { const cv = mk(W, H), ctx = cv.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); await drawFrame(f, ctx, 0, 0, W, H); return cv.toDataURL('image/png'); }, f, W, H, cfg.bg);
      fs.writeFileSync(path.join(fdir, `${String(f).padStart(5, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
    const mp4 = path.join(outDir, 'preview.mp4');
    execFileSync(ff, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(fdir, '%05d.png'), '-pix_fmt', 'yuv420p', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', mp4]);
    fs.rmSync(fdir, { recursive: true, force: true });
    written.push(mp4);
  }
}

await browser.close();
console.log(JSON.stringify({ outDir, files: written, comp: { w: W, h: H, frames: F, fps: FPS, seconds: +(F / FPS).toFixed(2) }, motion }, null, 2));
