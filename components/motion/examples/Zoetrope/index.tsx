'use client';

import LottieMotion, { type LottieMotionProps } from '../../LottieMotion';

// Loaders live at module scope: stable identities (no reloads on re-render) and separate chunks,
// so only the active theme's JSON is ever downloaded.
const light = () => import('./light.json');
const dark = () => import('./dark.json');

export type ZoetropeProps = Omit<LottieMotionProps, 'light' | 'dark' | 'width' | 'height'>;

/**
 * Still frames, set spinning, come to life
 * Composition 640×480 · 6.2s. Size it with the parent (it fills the width, keeps its aspect ratio).
 */
export default function Zoetrope(props: ZoetropeProps) {
  return (
    <LottieMotion
      light={light}
      dark={dark}
      width={640}
      height={480}
      label="A zoetrope: when its drum spins, the strip of still drawings inside comes to life as a bouncing ball"
      posterFrame={12}
      {...props}
    />
  );
}
