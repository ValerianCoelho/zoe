// <lottie-motion> — framework-agnostic player (Vue, Svelte, Astro, plain HTML…).
//
//   <script type="module" src="./lottie-motion.js"></script>
//   <lottie-motion light="./light.json" dark="./dark.json" ratio="720/440" label="…" poster="0"></lottie-motion>
//
// Attributes: light (url, required) · dark (url) · ratio ("w/h", avoids layout shift before load)
//   theme: auto|light|dark (default auto) · trigger: inView|hover|once (default inView)
//   loop: "false" to play once · poster: frame for reduced motion · label: accessible description
//
// lottie-web is resolved from a bundler ('lottie-web/build/player/lottie_light') when available,
// otherwise from the CDN ESM build. Set window.LOTTIE_MOTION_SRC to self-host it.

const CDN = 'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/esm/lottie_light.min.js';
let lottiePromise;
const loadLottie = () => (lottiePromise ||= import(/* @vite-ignore */ window.LOTTIE_MOTION_SRC || 'lottie-web/build/player/lottie_light')
  .catch(() => import(/* @vite-ignore */ CDN))
  .then((m) => m.default || m));
const cache = new Map();
const loadJSON = (url) => { if (!cache.has(url)) cache.set(url, fetch(url).then((r) => r.json())); return cache.get(url); };

function readTheme() {
  const el = document.documentElement, attr = el.getAttribute('data-theme') || el.getAttribute('data-mode');
  if (el.classList.contains('dark') || attr === 'dark') return 'dark';
  if (el.classList.contains('light') || attr === 'light') return 'light';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

class LottieMotionElement extends HTMLElement {
  static observedAttributes = ['light', 'dark', 'theme'];
  #anim = null; #io = null; #mo = null; #mq = null; #visible = false; #frame = null; #phase = 'idle'; #played = false; #token = 0;

  connectedCallback() {
    const ratio = this.getAttribute('ratio');
    Object.assign(this.style, { display: 'block', position: 'relative', width: this.style.width || '100%' });
    if (ratio) this.style.aspectRatio = ratio.replace('/', ' / ');
    const label = this.getAttribute('label');
    if (label) { this.setAttribute('role', 'img'); this.setAttribute('aria-label', label); } else this.setAttribute('aria-hidden', 'true');

    this.#io = new IntersectionObserver(([e]) => { this.#visible = e.isIntersecting; if (!this.#anim?.isLoaded) return; e.isIntersecting ? this.#play() : this.#anim.pause(); }, { threshold: 0.2 });
    if (this.trigger !== 'hover') this.#io.observe(this);
    else { this.addEventListener('pointerenter', () => this.#play()); this.addEventListener('pointerleave', () => this.#anim?.pause()); }

    this._update = () => this.#load();
    this.#mq = matchMedia('(prefers-color-scheme: dark)'); this.#mq.addEventListener('change', this._update);
    this.#mo = new MutationObserver(this._update); this.#mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-mode'] });
    this.#load();
  }
  disconnectedCallback() { this.#io?.disconnect(); this.#mo?.disconnect(); this.#mq?.removeEventListener('change', this._update); this._url = null; this.#destroy(); }
  attributeChangedCallback() { if (this.isConnected) this.#load(); }

  get trigger() { return this.getAttribute('trigger') || 'inView'; }
  get reduced() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  get url() {
    const t = this.getAttribute('theme') || 'auto';
    const mode = t === 'auto' ? readTheme() : t;
    return (mode === 'dark' && this.getAttribute('dark')) || this.getAttribute('light');
  }

  #destroy() { if (this.#anim) { this.#frame = this.#anim.currentFrame; this.#anim.destroy(); this.#anim = null; } }

  async #load() {
    const url = this.url;
    if (!url || url === this._url) return;
    this._url = url;
    const token = ++this.#token;
    const [lottie, data] = await Promise.all([loadLottie(), loadJSON(url)]);
    if (token !== this.#token) return;
    this.#destroy();
    if (!this.style.aspectRatio) this.style.aspectRatio = `${data.w} / ${data.h}`;
    const a = this.#anim = lottie.loadAnimation({ container: this, renderer: 'svg', loop: false, autoplay: false, animationData: data, rendererSettings: { preserveAspectRatio: 'xMidYMid meet', hideOnTransparent: true } });
    const markers = data.markers || [], intro = markers.find((m) => m.cm === 'intro'), loopSeg = markers.find((m) => m.cm === 'loop');
    this._intro = intro && [intro.tm, intro.tm + intro.dr];
    this._loop = loopSeg ? [loopSeg.tm, loopSeg.tm + loopSeg.dr] : null;
    a.addEventListener('complete', () => { if (this.#phase === 'intro') this.#enterLoop(); });
    a.addEventListener('DOMLoaded', () => {
      const poster = +(this.getAttribute('poster') || 0);
      a.goToAndStop(this.reduced || this.#frame === null ? poster : this.#frame, true);
      if (this.#frame !== null) this.#phase = 'idle';
      if (this.trigger !== 'hover' && this.#visible) this.#play();
    });
  }
  #enterLoop() {
    const a = this.#anim; this.#phase = 'loop';
    a.loop = this.getAttribute('loop') !== 'false' && this.trigger !== 'once';
    if (this._loop) a.playSegments(this._loop, true); else a.play();
  }
  #play() {
    const a = this.#anim; if (!a || this.reduced) return;
    if (this.#phase !== 'idle') return a.play();
    if (this.trigger === 'once' && this.#played) return;
    this.#played = true;
    if (this._intro && this.#frame === null) { this.#phase = 'intro'; a.loop = false; a.playSegments(this._intro, true); }
    else if (this.#frame !== null && !this._intro) { this.#phase = 'loop'; a.loop = this.getAttribute('loop') !== 'false'; a.goToAndPlay(this.#frame, true); }
    else this.#enterLoop();
  }
}

if (!customElements.get('lottie-motion')) customElements.define('lottie-motion', LottieMotionElement);
export default LottieMotionElement;
