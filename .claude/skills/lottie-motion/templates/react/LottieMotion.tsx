'use client';

// LottieMotion — production player for section animations.
//  • lazy: lottie-web (light, SVG-only build) and the animation JSON load only on the client, in their own chunks
//  • no layout shift: the box reserves the composition's aspect ratio before anything loads
//  • plays only while on screen; pauses off-screen and in background tabs
//  • theme-aware: swaps light/dark data (html.dark / [data-theme] / prefers-color-scheme), keeping the current frame
//  • respects prefers-reduced-motion: shows a single, composed poster frame instead of playing
//  • markers: if the data has "intro" + "loop" markers, plays the intro once, then loops the loop segment
//  • accessible: role="img" + aria-label when a label is given, otherwise aria-hidden (decorative)

import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react';

type Data = Record<string, unknown>;
type Source = Data | (() => Promise<{ default: Data } | Data>);
type Theme = 'auto' | 'light' | 'dark';

export type LottieMotionProps = {
  /** Animation data (object) or a loader, e.g. () => import('./light.json') — loaders keep JSON out of the main bundle. */
  light: Source;
  dark?: Source;
  /** Composition size (px) — sets the aspect ratio. */
  width: number;
  height: number;
  theme?: Theme;
  loop?: boolean;
  speed?: number;
  /** 'inView' (default) plays while visible · 'hover' plays while hovered · 'once' plays once when first seen. */
  trigger?: 'inView' | 'hover' | 'once';
  /** Frame shown for reduced motion and before playback starts. */
  posterFrame?: number;
  /** Accessible description. Omit for purely decorative animations. */
  label?: string;
  className?: string;
  style?: CSSProperties;
};

type Player = {
  play(): void; pause(): void; destroy(): void; setSpeed(s: number): void;
  goToAndStop(v: number, isFrame?: boolean): void; goToAndPlay(v: number, isFrame?: boolean): void;
  playSegments(s: [number, number] | [number, number][], force?: boolean): void;
  addEventListener(name: string, cb: () => void): void;
  setSubframe(v: boolean): void; loop: boolean | number; currentFrame: number; isLoaded: boolean;
};

const resolve = async (src: Source): Promise<Data> => {
  if (typeof src !== 'function') return src;
  const mod = await src();
  return ((mod as { default?: Data }).default ?? mod) as Data;
};

function readTheme(): 'light' | 'dark' {
  const el = document.documentElement;
  const attr = el.getAttribute('data-theme') || el.getAttribute('data-mode');
  if (el.classList.contains('dark') || attr === 'dark') return 'dark';
  if (el.classList.contains('light') || attr === 'light') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Theme + reduced-motion are external browser state → useSyncExternalStore (SSR snapshot: light, motion on).
function subscribeTheme(cb: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-mode'] });
  return () => { mq.removeEventListener('change', cb); mo.disconnect(); };
}
function useResolvedTheme(theme: Theme): 'light' | 'dark' {
  const page = useSyncExternalStore(subscribeTheme, readTheme, () => 'light' as const);
  return theme === 'auto' ? page : theme;
}

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const usePrefersReducedMotion = () =>
  useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, () => false);

type Marker = { tm: number; cm: string; dr: number };

export default function LottieMotion({
  light, dark, width, height, theme = 'auto', loop = true, speed = 1, trigger = 'inView',
  posterFrame = 0, label, className, style,
}: LottieMotionProps) {
  const box = useRef<HTMLDivElement>(null);
  const anim = useRef<Player | null>(null);
  const frame = useRef<number | null>(null);
  const visible = useRef(false);
  const playedOnce = useRef(false);
  const resolvedTheme = useResolvedTheme(theme);
  const reduced = usePrefersReducedMotion();
  const source = resolvedTheme === 'dark' && dark ? dark : light;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let cancelled = false;
    let io: IntersectionObserver | null = null;
    const cleanups: (() => void)[] = [];

    (async () => {
      const [{ default: lottie }, data] = await Promise.all([
        import('lottie-web/build/player/lottie_light'),
        resolve(source),
      ]);
      if (cancelled) return;

      const markers = ((data as { markers?: Marker[] }).markers ?? []);
      const intro = markers.find((m) => m.cm === 'intro');
      const loopSeg = markers.find((m) => m.cm === 'loop');

      const a = lottie.loadAnimation({
        container: el, renderer: 'svg', loop: false, autoplay: false, animationData: data,
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: false, hideOnTransparent: true },
      }) as unknown as Player;
      anim.current = a;
      a.setSpeed(speed);

      // Playback: [intro once] → loop segment (or the whole timeline) while allowed.
      const introRange: [number, number] | null = intro ? [intro.tm, intro.tm + intro.dr] : null;
      const loopRange: [number, number] = loopSeg ? [loopSeg.tm, loopSeg.tm + loopSeg.dr] : [0, (data as { op: number }).op];
      const resumeFrame = frame.current;
      let phase: 'idle' | 'intro' | 'loop' = 'idle';

      const enterLoop = () => {
        phase = 'loop';
        a.loop = loop && trigger !== 'once';
        if (loopSeg) a.playSegments(loopRange, true); else a.play();
      };
      a.addEventListener('complete', () => { if (phase === 'intro') enterLoop(); });

      const play = () => {
        if (reduced) return;
        if (phase !== 'idle') { a.play(); return; }
        if (trigger === 'once' && playedOnce.current) return;
        playedOnce.current = true;
        // resuming after a theme swap: continue where we were (without replaying the intro)
        if (resumeFrame !== null && !introRange) { phase = 'loop'; a.loop = loop && trigger !== 'once'; a.goToAndPlay(resumeFrame, true); return; }
        if (introRange && resumeFrame === null) { phase = 'intro'; a.loop = false; a.playSegments(introRange, true); return; }
        enterLoop();
      };
      const pause = () => a.pause();

      a.addEventListener('DOMLoaded', () => {
        a.goToAndStop(reduced || resumeFrame === null ? posterFrame : resumeFrame, true);
        if (trigger !== 'hover' && visible.current) play();
      });

      if (trigger === 'hover') {
        const enter = () => play(), leave = () => pause();
        el.addEventListener('pointerenter', enter); el.addEventListener('pointerleave', leave);
        cleanups.push(() => { el.removeEventListener('pointerenter', enter); el.removeEventListener('pointerleave', leave); });
      } else {
        io = new IntersectionObserver(([entry]) => {
          visible.current = entry.isIntersecting;
          if (!a.isLoaded) return;
          if (entry.isIntersecting) play(); else pause();
        }, { threshold: 0.2 });
        io.observe(el);
      }
    })();

    return () => {
      cancelled = true;
      io?.disconnect();
      cleanups.forEach((c) => c());
      if (anim.current) { frame.current = anim.current.currentFrame; anim.current.destroy(); anim.current = null; }
    };
    // re-create when the data source (theme) or playback policy changes; keeps the current frame
  }, [source, reduced, loop, trigger, posterFrame, speed]);

  return (
    <div
      ref={box}
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ position: 'relative', width: '100%', aspectRatio: `${width} / ${height}`, ...style }}
    />
  );
}
